import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { documents, measurements, metricCatalog } from "../db/schema";
import type { PipelineRunInput } from "./pipeline-log";
import { runDocumentImportJob } from "./document-import-job";

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
    CREATE UNIQUE INDEX documents_image_md5_unique ON documents (image_md5);
    CREATE TABLE measurements (
      id text PRIMARY KEY NOT NULL,
      document_id text,
      metric_id text,
      raw_name text NOT NULL,
      value real NOT NULL,
      unit text NOT NULL,
      ref_low real,
      ref_high real,
      flag text DEFAULT 'normal' NOT NULL,
      measured_at text NOT NULL,
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

async function seedMetric(db: ReturnType<typeof makeTestDb>) {
  await db.insert(metricCatalog).values({
    id: "metric-alt",
    standardName: "谷丙转氨酶",
    aliases: JSON.stringify(["ALT"]),
    standardUnit: "U/L",
    category: "liver",
  });
}

describe("document import job", () => {
  it("runs the parse pipeline and stores document plus measurements", async () => {
    const db = makeTestDb();
    await seedMetric(db);
    const logs: PipelineRunInput[] = [];

    const result = await runDocumentImportJob(
      {
        documentId: "doc-1",
        imagePath: "uploads/doc-1.jpeg",
        imageMd5: "md5-1",
        fileName: "report.jpeg",
        inputBytes: 1234,
      },
      {
        db,
        uploadsDir: "/uploads-root",
        makeRunId: () => "run-1",
        makeMeasurementId: () => "measurement-1",
        parseImage: async (imagePath, runId) => {
          assert.equal(imagePath, "/uploads-root/doc-1.jpeg");
          assert.equal(runId, "run-1");
          return {
            markdown: "ALT 42 U/L",
            analysis_text: "ALT 42 U/L",
            json_data: [{ ok: true }],
            mode: "vl",
            run_id: "service-run-1",
            timing: { predict_ms: 100 },
            blocks: [{ type: "table" }],
          };
        },
        runRepairStage: async ({ ocrText }) => ({
          text: ocrText,
          repaired: false,
          skipped: true,
        }),
        extractFromOcr: async (ocrText) => {
          assert.equal(ocrText, "ALT 42 U/L");
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
      }
    );

    assert.deepEqual(result, {
      id: "doc-1",
      measurementCount: 1,
      measuredAt: "2026-06-20",
      duplicate: false,
    });

    const [doc] = await db.select().from(documents).where(eq(documents.id, "doc-1"));
    assert.equal(doc?.imagePath, "uploads/doc-1.jpeg");
    assert.equal(doc?.imageMd5, "md5-1");
    assert.equal(doc?.institution, "新医院");
    assert.equal(doc?.ocrMarkdown, "ALT 42 U/L");

    const rows = await db.select().from(measurements).where(eq(measurements.documentId, "doc-1"));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.metricId, "metric-alt");
    assert.equal(rows[0]?.rawName, "ALT");
    assert.equal(logs.map((log) => `${log.stage}:${log.status}`).join(","), "ocr:success,llm_extract:success");
  });

  it("returns duplicate without parsing when document md5 already exists", async () => {
    const db = makeTestDb();
    await db.insert(documents).values({
      id: "existing-doc",
      imagePath: "uploads/existing.jpeg",
      imageMd5: "md5-1",
      documentType: "blood_test",
      institution: "旧医院",
      measuredAt: "2026-06-01",
    });

    const result = await runDocumentImportJob(
      {
        documentId: "doc-1",
        imagePath: "uploads/doc-1.jpeg",
        imageMd5: "md5-1",
      },
      {
        db,
        parseImage: async () => {
          throw new Error("parse should not run");
        },
      }
    );

    assert.deepEqual(result, {
      id: "existing-doc",
      measurementCount: 0,
      measuredAt: "2026-06-01",
      duplicate: true,
    });
  });

  it("applies report-provided allergy levels before storing extracted measurements", async () => {
    const db = makeTestDb();

    await runDocumentImportJob(
      {
        documentId: "doc-allergy-level",
        imagePath: "uploads/doc-allergy-level.jpeg",
        imageMd5: "md5-allergy-level",
      },
      {
        db,
        uploadsDir: "/uploads-root",
        makeRunId: () => "run-allergy-level",
        makeMeasurementId: () => "measurement-allergy-level",
        parseImage: async () => ({
          markdown: "<table><tr><td>项目名称</td><td>浓度</td><td>级别</td><td>单位</td></tr><tr><td>9. 牛奶</td><td>2.2</td><td>2级</td><td>IU/ml</td></tr></table>",
          analysis_text: "",
          json_data: [],
          mode: "vl",
        }),
        runRepairStage: async ({ ocrText }) => ({ text: ocrText, repaired: false, skipped: true }),
        extractFromOcr: async () => ({
          document_type: "blood_test",
          institution: "中国中医科学院望京医院",
          measured_at: "2021-10-23",
          measurements: [
            {
              raw_name: "9. 牛奶",
              value: 2.2,
              unit: "IU/ml",
              ref_low: null,
              ref_high: null,
              flag: "normal",
            },
          ],
        }),
        recordPipelineRun: async () => undefined,
      }
    );

    const [row] = await db.select().from(measurements).where(eq(measurements.documentId, "doc-allergy-level"));
    assert.equal(row?.rawName, "9. 牛奶");
    assert.equal(row?.refLow, null);
    assert.equal(row?.refHigh, null);
    assert.equal(row?.flag, "high");
  });

  it("uses default run and measurement id generators without losing crypto context", async () => {
    const db = makeTestDb();

    const result = await runDocumentImportJob(
      {
        documentId: "doc-default-ids",
        imagePath: "uploads/doc-default-ids.jpeg",
        imageMd5: "md5-default-ids",
      },
      {
        db,
        uploadsDir: "/uploads-root",
        parseImage: async () => ({
          markdown: "ALT 42 U/L",
          analysis_text: "ALT 42 U/L",
          json_data: [],
          mode: "vl",
        }),
        runRepairStage: async ({ ocrText }) => ({ text: ocrText, repaired: false, skipped: true }),
        extractFromOcr: async () => ({
          document_type: "blood_test",
          institution: null,
          measured_at: "2026-06-20",
          measurements: [
            {
              raw_name: "ALT",
              value: 42,
              unit: "U/L",
              ref_low: null,
              ref_high: null,
              flag: "normal",
            },
          ],
        }),
        recordPipelineRun: async () => undefined,
      }
    );

    assert.equal(result.id, "doc-default-ids");
    const [row] = await db.select().from(measurements).where(eq(measurements.documentId, "doc-default-ids"));
    assert.match(row?.id ?? "", /^[0-9a-f-]{36}$/);
  });

  it("records OCR errors and does not store a document", async () => {
    const db = makeTestDb();
    const logs: PipelineRunInput[] = [];

    await assert.rejects(
      runDocumentImportJob(
        {
          documentId: "doc-1",
          imagePath: "uploads/doc-1.jpeg",
          imageMd5: "md5-1",
        },
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
    assert.equal((await db.select().from(documents)).length, 0);
  });

  it("records LLM errors and does not store a document", async () => {
    const db = makeTestDb();
    const logs: PipelineRunInput[] = [];

    await assert.rejects(
      runDocumentImportJob(
        {
          documentId: "doc-1",
          imagePath: "uploads/doc-1.jpeg",
          imageMd5: "md5-1",
        },
        {
          db,
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
    assert.equal((await db.select().from(documents)).length, 0);
  });
});
