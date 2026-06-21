import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  groupPipelineRunsByRunId,
  readJsonlTail,
  toPipelineRunView,
  type PipelineRunRow,
} from "./pipeline-log-view";

const baseRow: PipelineRunRow = {
  id: "row-1",
  runId: "run-1",
  documentId: "doc-1",
  stage: "ocr",
  status: "success",
  mode: "vl",
  model: "PaddleOCR-VL-1.6",
  inputChars: null,
  outputChars: 128,
  durationMs: 42,
  error: null,
  metadata: "{\"fileName\":\"333.png\",\"correctionCount\":2}",
  createdAt: "2026-06-21T08:00:00.000Z",
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>) {
  const dir = await mkdtemp(path.join(tmpdir(), "health-store-log-view-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("pipeline log view helpers", () => {
  it("parses metadata and extracts concise facts for display", () => {
    const view = toPipelineRunView(baseRow);

    assert.deepEqual(view.metadata, {
      fileName: "333.png",
      correctionCount: 2,
    });
    assert.deepEqual(view.facts, ["文件 333.png", "修正 2 处"]);
  });

  it("keeps malformed metadata visible without throwing", () => {
    const view = toPipelineRunView({
      ...baseRow,
      metadata: "{bad json",
    });

    assert.deepEqual(view.metadata, {
      parseError: "metadata JSON 解析失败",
      raw: "{bad json",
    });
    assert.deepEqual(view.facts, ["metadata JSON 解析失败"]);
  });

  it("groups stages by run id and marks groups with errors", () => {
    const groups = groupPipelineRunsByRunId([
      toPipelineRunView(baseRow),
      toPipelineRunView({
        ...baseRow,
        id: "row-2",
        stage: "llm_repair",
        status: "success",
        createdAt: "2026-06-21T08:00:01.000Z",
      }),
      toPipelineRunView({
        ...baseRow,
        id: "row-3",
        runId: "run-2",
        stage: "llm_extract",
        status: "error",
        error: "LLM failed",
        createdAt: "2026-06-21T08:00:02.000Z",
      }),
    ]);

    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.runId, "run-2");
    assert.equal(groups[0]?.status, "error");
    assert.equal(groups[1]?.runId, "run-1");
    assert.equal(groups[1]?.status, "success");
    assert.deepEqual(groups[1]?.stages.map((stage) => stage.stage), ["llm_repair", "ocr"]);
  });

  it("returns parsed JSONL tail records and tolerates missing files", async () => {
    await withTempDir(async (dir) => {
      const filePath = path.join(dir, "ocr-runs.jsonl");
      await writeFile(
        filePath,
        [
          JSON.stringify({ runId: "run-1", stage: "ocr" }),
          "",
          JSON.stringify({ runId: "run-2", stage: "ocr" }),
          "{bad json",
          JSON.stringify({ runId: "run-3", stage: "ocr" }),
        ].join("\n"),
        "utf8"
      );

      const tail = await readJsonlTail(filePath, 3);
      assert.deepEqual(tail, [
        { runId: "run-2", stage: "ocr" },
        { parseError: "JSONL 解析失败", raw: "{bad json" },
        { runId: "run-3", stage: "ocr" },
      ]);

      assert.deepEqual(await readJsonlTail(path.join(dir, "missing.jsonl"), 3), []);
    });
  });
});
