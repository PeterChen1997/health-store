import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { documents, metricCatalog } from "../db/schema";
import type { PipelineRunInput } from "./pipeline-log";
import { runDocumentReparseJob } from "./document-reparse-job";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE documents (
      id text PRIMARY KEY NOT NULL,
      image_path text NOT NULL,
      image_md5 text,
      document_type text NOT NULL,
      institution text,
      measured_at text NOT NULL,
      ocr_markdown text,
      ocr_json text,
      created_at text DEFAULT (datetime('now')) NOT NULL
    );
    CREATE TABLE metric_catalog (
      id text PRIMARY KEY NOT NULL,
      standard_name text NOT NULL,
      aliases text NOT NULL,
      standard_unit text NOT NULL,
      category text NOT NULL,
      ref_low real,
      ref_high real,
      loinc text,
      description text
    );
  `);

  return drizzle(sqlite, { schema });
}

async function seedDocument(db: ReturnType<typeof makeTestDb>) {
  await db.insert(documents).values({
    id: "doc-1",
    imagePath: "uploads/doc-1.jpeg",
    documentType: "blood_test",
    institution: "旧医院",
    measuredAt: "2026-06-01",
    ocrMarkdown: "old OCR",
  });
  await db.insert(metricCatalog).values({
    id: "metric-alt",
    standardName: "谷丙转氨酶",
    aliases: JSON.stringify(["ALT"]),
    standardUnit: "U/L",
    category: "liver",
  });
}

describe("document reparse job", () => {
  it("runs OCR, repair, extraction, metric resolution, and returns a preview", async () => {
    const db = makeTestDb();
    await seedDocument(db);
    const logs: PipelineRunInput[] = [];

    const preview = await runDocumentReparseJob(
      { documentId: "doc-1" },
      {
        db,
        uploadsDir: "/uploads-root",
        makeRunId: () => "run-1",
        parseImage: async (imagePath, runId) => {
          assert.equal(imagePath, "/uploads-root/doc-1.jpeg");
          assert.equal(runId, "run-1");
          return {
            markdown: "ALT 42 U/L",
            analysis_text: "ALT 42 U/L",
            json_data: [{ ok: true }],
            mode: "vl",
            run_id: "service-run-1",
            timing: { predict_ms: 123 },
            blocks: [{ type: "table" }],
          };
        },
        runRepairStage: async ({ ocrText }) => ({
          text: `${ocrText}\n修正`,
          repaired: true,
          skipped: false,
          result: { corrected_text: `${ocrText}\n修正`, corrections: [], warnings: [], confidence: 1 },
        }),
        extractFromOcr: async (ocrText) => {
          assert.equal(ocrText, "ALT 42 U/L\n修正");
          return {
            document_type: "blood_test",
            institution: "新医院",
            measured_at: "2026-06-20",
            measurements: [
              {
                raw_name: "ALT",
                value: 42,
                unit: "U/L",
                ref_low: 0,
                ref_high: 40,
                flag: "high",
              },
            ],
          };
        },
        recordPipelineRun: async (input) => {
          logs.push(input);
        },
        nowMs: (() => {
          let value = 1000;
          return () => (value += 50);
        })(),
        now: () => new Date("2026-06-21T10:00:00.000Z"),
      }
    );

    assert.equal(preview.id, "doc-1");
    assert.equal(preview.temporary, true);
    assert.equal(preview.document.institution, "新医院");
    assert.equal(preview.document.ocrMarkdown, "ALT 42 U/L");
    assert.equal(preview.document.ocrJson, "[{\"ok\":true}]");
    assert.equal(preview.measurementCount, 1);
    assert.deepEqual(preview.measurements[0], {
      rawName: "ALT",
      value: 42,
      unit: "U/L",
      refLow: 0,
      refHigh: 40,
      flag: "high",
      metricId: "metric-alt",
      standardName: "谷丙转氨酶",
    });
    assert.equal(logs[0]?.stage, "ocr");
    assert.equal(logs[0]?.status, "success");
    assert.equal(logs[1]?.stage, "llm_extract");
    assert.equal(logs[1]?.status, "success");
  });

  it("records OCR errors before rethrowing", async () => {
    const db = makeTestDb();
    await seedDocument(db);
    const logs: PipelineRunInput[] = [];

    await assert.rejects(
      runDocumentReparseJob(
        { documentId: "doc-1" },
        {
          db,
          uploadsDir: "/uploads-root",
          makeRunId: () => "run-ocr-error",
          parseImage: async () => {
            throw new Error("OCR failed");
          },
          recordPipelineRun: async (input) => {
            logs.push(input);
          },
        }
      ),
      /OCR failed/
    );

    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.stage, "ocr");
    assert.equal(logs[0]?.status, "error");
    assert.equal(logs[0]?.documentId, "doc-1");
    assert.equal(logs[0]?.metadata?.imagePath, "uploads/doc-1.jpeg");
  });

  it("uses the default run id generator without losing crypto context", async () => {
    const db = makeTestDb();
    await seedDocument(db);

    const preview = await runDocumentReparseJob(
      { documentId: "doc-1" },
      {
        db,
        uploadsDir: "/uploads-root",
        parseImage: async (_imagePath, runId) => {
          assert.match(runId, /^[0-9a-f-]{36}$/);
          return {
            markdown: "ALT 42 U/L",
            analysis_text: "ALT 42 U/L",
            json_data: [],
            mode: "vl",
          };
        },
        runRepairStage: async ({ ocrText }) => ({ text: ocrText, repaired: false, skipped: true }),
        extractFromOcr: async () => ({
          document_type: "blood_test",
          institution: null,
          measured_at: "2026-06-20",
          measurements: [],
        }),
        recordPipelineRun: async () => undefined,
      }
    );

    assert.equal(preview.id, "doc-1");
  });

  it("records LLM extraction errors before rethrowing", async () => {
    const db = makeTestDb();
    await seedDocument(db);
    const logs: PipelineRunInput[] = [];

    await assert.rejects(
      runDocumentReparseJob(
        { documentId: "doc-1" },
        {
          db,
          uploadsDir: "/uploads-root",
          makeRunId: () => "run-llm-error",
          parseImage: async () => ({
            markdown: "ALT 42 U/L",
            analysis_text: "ALT 42 U/L",
            json_data: [],
            mode: "vl",
          }),
          runRepairStage: async ({ ocrText }) => ({ text: ocrText, repaired: false, skipped: true }),
          extractFromOcr: async () => {
            throw new Error("LLM failed");
          },
          recordPipelineRun: async (input) => {
            logs.push(input);
          },
        }
      ),
      /LLM failed/
    );

    assert.equal(logs.map((log) => log.stage).join(","), "ocr,llm_extract");
    assert.equal(logs[1]?.status, "error");
    assert.equal(logs[1]?.error instanceof Error, true);
    assert.equal(logs[1]?.metadata?.repairSkipped, true);
  });
});
