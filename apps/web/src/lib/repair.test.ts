import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RepairResultSchema,
  isRepairEnabled,
  runRepairStage,
  type RepairResult,
} from "./repair";
import type { PipelineRunInput } from "./pipeline-log";

const sampleRepair: RepairResult = {
  corrected_text: "谷丙转氨酶 | 25 | U/L",
  corrections: [
    {
      before: "谷丙转氨海",
      after: "谷丙转氨酶",
      reason: "明显医学术语 OCR 错字",
    },
  ],
  warnings: ["数值和参考范围未修改"],
  confidence: 0.86,
};

describe("repair OCR stage", () => {
  it("records a successful repair and returns corrected text for extraction", async () => {
    const logs: PipelineRunInput[] = [];
    const result = await runRepairStage({
      runId: "run-1",
      documentId: "doc-1",
      ocrText: "谷丙转氨海 | 25 | U/L",
      env: {
        OPENAI_MODEL: "test-model",
        OPENAI_PROVIDER_NAME: "test-provider",
      },
      nowMs: (() => {
        const values = [1000, 1250];
        return () => values.shift() ?? 1250;
      })(),
      repair: async (text) => {
        assert.equal(text, "谷丙转氨海 | 25 | U/L");
        return sampleRepair;
      },
      recordRun: async (input) => {
        logs.push(input);
      },
    });

    assert.deepEqual(result, {
      text: sampleRepair.corrected_text,
      repaired: true,
      skipped: false,
      result: sampleRepair,
    });
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.stage, "llm_repair");
    assert.equal(logs[0]?.status, "success");
    assert.equal(logs[0]?.inputText, "谷丙转氨海 | 25 | U/L");
    assert.equal(logs[0]?.outputText, sampleRepair.corrected_text);
    assert.equal(logs[0]?.model, "test-model");
    assert.equal(logs[0]?.durationMs, 250);
    assert.deepEqual(logs[0]?.metadata, {
      providerName: "test-provider",
      correctionCount: 1,
      warnings: sampleRepair.warnings,
      confidence: 0.86,
    });
  });

  it("records repair errors and falls back to original OCR text", async () => {
    const logs: PipelineRunInput[] = [];

    const result = await runRepairStage({
      runId: "run-2",
      documentId: "doc-2",
      ocrText: "原始 OCR",
      env: {
        OPENAI_MODEL: "test-model",
        OPENAI_PROVIDER_NAME: "test-provider",
      },
      repair: async () => {
        throw new Error("repair failed");
      },
      recordRun: async (input) => {
        logs.push(input);
      },
    });

    assert.equal(result.text, "原始 OCR");
    assert.equal(result.repaired, false);
    assert.equal(result.skipped, false);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.stage, "llm_repair");
    assert.equal(logs[0]?.status, "error");
    assert.equal(logs[0]?.inputText, "原始 OCR");
    assert.equal(logs[0]?.error instanceof Error, true);
    assert.deepEqual(logs[0]?.metadata, {
      providerName: "test-provider",
    });
  });

  it("skips repair without LLM calls or logs when disabled", async () => {
    let called = false;
    const logs: PipelineRunInput[] = [];

    const result = await runRepairStage({
      runId: "run-3",
      ocrText: "原始 OCR",
      env: { LLM_REPAIR_ENABLED: "false" },
      repair: async () => {
        called = true;
        return sampleRepair;
      },
      recordRun: async (input) => {
        logs.push(input);
      },
    });

    assert.equal(isRepairEnabled({ LLM_REPAIR_ENABLED: "false" }), false);
    assert.equal(called, false);
    assert.deepEqual(result, {
      text: "原始 OCR",
      repaired: false,
      skipped: true,
    });
    assert.equal(logs.length, 0);
  });

  it("validates repair schema and confidence bounds", () => {
    const parsed = RepairResultSchema.parse(sampleRepair);

    assert.equal(parsed.corrections.at(0)?.after, "谷丙转氨酶");
    assert.throws(() =>
      RepairResultSchema.parse({
        ...sampleRepair,
        confidence: 1.2,
      }),
    );
    assert.throws(() =>
      RepairResultSchema.parse({
        ...sampleRepair,
        corrected_text: "",
      }),
    );
  });
});
