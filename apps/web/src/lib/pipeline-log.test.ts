import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  getPipelineLogFileName,
  recordPipelineRun,
  type PipelineRunInsertValues,
} from "./pipeline-log";

async function withTempLogDir<T>(fn: (logDir: string) => Promise<T>) {
  const logDir = await mkdtemp(path.join(tmpdir(), "health-store-pipeline-log-"));
  try {
    return await fn(logDir);
  } finally {
    await rm(logDir, { recursive: true, force: true });
  }
}

async function readJsonl(logDir: string, fileName: string) {
  const content = await readFile(path.join(logDir, fileName), "utf8");
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("pipeline log", () => {
  it("serializes success records with summary metadata and no full text by default", async () => {
    await withTempLogDir(async (logDir) => {
      const inserts: PipelineRunInsertValues[] = [];

      const result = await recordPipelineRun(
        {
          runId: "run-1",
          documentId: "doc-1",
          stage: "ocr",
          status: "success",
          mode: "vl",
          model: "PaddleOCR-VL-1.6",
          inputText: "abc",
          outputText: "abcdef",
          durationMs: 42,
          metadata: { imagePath: "uploads/a.png" },
        },
        {
          env: {},
          logDir,
          now: () => new Date("2026-06-21T08:00:00.000Z"),
          makeId: () => "id-1",
          insertRun: async (values) => {
            inserts.push(values);
          },
        }
      );

      assert.equal(result.skipped, false);
      assert.equal(inserts.length, 1);
      assert.deepEqual(inserts[0], {
        id: "id-1",
        runId: "run-1",
        documentId: "doc-1",
        stage: "ocr",
        status: "success",
        mode: "vl",
        model: "PaddleOCR-VL-1.6",
        inputChars: 3,
        outputChars: 6,
        durationMs: 42,
        error: null,
        metadata: "{\"imagePath\":\"uploads/a.png\"}",
        createdAt: "2026-06-21T08:00:00.000Z",
      });

      const [line] = await readJsonl(logDir, "ocr-runs.jsonl");
      assert.equal(line?.runId, "run-1");
      assert.equal(line?.inputChars, 3);
      assert.equal(line?.outputChars, 6);
      assert.deepEqual(line?.metadata, { imagePath: "uploads/a.png" });
    });
  });

  it("records error text and routes LLM stages to the LLM JSONL file", async () => {
    await withTempLogDir(async (logDir) => {
      const inserts: PipelineRunInsertValues[] = [];

      await recordPipelineRun(
        {
          runId: "run-2",
          stage: "llm_extract",
          status: "error",
          inputChars: 12,
          error: new Error("LLM failed"),
        },
        {
          env: {},
          logDir,
          now: () => new Date("2026-06-21T08:01:00.000Z"),
          makeId: () => "id-2",
          insertRun: async (values) => {
            inserts.push(values);
          },
        }
      );

      assert.equal(getPipelineLogFileName("llm_extract"), "llm-runs.jsonl");
      assert.equal(inserts[0]?.error, "LLM failed");

      const [line] = await readJsonl(logDir, "llm-runs.jsonl");
      assert.equal(line?.stage, "llm_extract");
      assert.equal(line?.error, "LLM failed");
    });
  });

  it("includes full text only when explicitly enabled", async () => {
    await withTempLogDir(async (logDir) => {
      const inserts: PipelineRunInsertValues[] = [];

      await recordPipelineRun(
        {
          runId: "run-3",
          stage: "ocr",
          status: "success",
          inputText: "raw-image-placeholder",
          outputText: "markdown table",
        },
        {
          env: { PIPELINE_LOG_FULL_TEXT: "true" },
          logDir,
          makeId: () => "id-3",
          insertRun: async (values) => {
            inserts.push(values);
          },
        }
      );

      const metadata = JSON.parse(inserts[0]?.metadata ?? "{}") as Record<string, unknown>;
      assert.equal(metadata.inputText, "raw-image-placeholder");
      assert.equal(metadata.outputText, "markdown table");

      const [line] = await readJsonl(logDir, "ocr-runs.jsonl");
      assert.deepEqual(line?.metadata, metadata);
    });
  });

  it("uses the default id generator without losing crypto context", async () => {
    await withTempLogDir(async (logDir) => {
      const inserts: PipelineRunInsertValues[] = [];

      await recordPipelineRun(
        {
          runId: "run-default-id",
          stage: "ocr",
          status: "success",
        },
        {
          env: {},
          logDir,
          insertRun: async (values) => {
            inserts.push(values);
          },
        }
      );

      assert.match(inserts[0]?.id ?? "", /^[0-9a-f-]{36}$/);
    });
  });

  it("skips SQLite and JSONL writes when disabled", async () => {
    await withTempLogDir(async (logDir) => {
      const inserts: PipelineRunInsertValues[] = [];

      const result = await recordPipelineRun(
        {
          runId: "run-4",
          stage: "ocr",
          status: "success",
        },
        {
          env: { PIPELINE_LOG_ENABLED: "false" },
          logDir,
          insertRun: async (values) => {
            inserts.push(values);
          },
        }
      );

      assert.equal(result.skipped, true);
      assert.equal(inserts.length, 0);
      await assert.rejects(readJsonl(logDir, "ocr-runs.jsonl"));
    });
  });
});
