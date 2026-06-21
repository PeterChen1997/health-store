import { z } from "zod";
import { generateStructured } from "./llm";
import { recordPipelineRun, type PipelineRunInput } from "./pipeline-log";

const RepairCorrectionSchema = z.object({
  before: z.string().trim().min(1),
  after: z.string().trim().min(1),
  reason: z.string().trim().min(1),
});

export const RepairResultSchema = z.object({
  corrected_text: z.string().trim().min(1),
  corrections: z.array(RepairCorrectionSchema),
  warnings: z.array(z.string().trim().min(1)),
  confidence: z.number().min(0).max(1),
});

export type RepairResult = z.infer<typeof RepairResultSchema>;
export type RepairStageResult =
  | {
      text: string;
      repaired: true;
      skipped: false;
      result: RepairResult;
    }
  | {
      text: string;
      repaired: false;
      skipped: false;
      error?: unknown;
    }
  | {
      text: string;
      repaired: false;
      skipped: true;
    };

type RepairStageInput = {
  runId: string;
  documentId?: string | null;
  ocrText: string;
  env?: Record<string, string | undefined>;
  repair?: (ocrText: string) => Promise<RepairResult>;
  recordRun?: (input: PipelineRunInput) => Promise<unknown>;
  nowMs?: () => number;
};

export function isRepairEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.LLM_REPAIR_ENABLED !== "false";
}

export async function repairOcrForExtraction(ocrText: string): Promise<RepairResult> {
  return generateStructured(
    RepairResultSchema,
    `你是医疗 OCR 文本纠错专家。下面是一份医疗单据的 OCR Markdown/HTML 文本，可能包含 Markdown 表格或 HTML table。

请在不改变文档结构的前提下，修正明显 OCR 错字，让后续结构化抽取更稳定。

规则：
1. 必须保持原有 Markdown/HTML 表格结构、列顺序、行顺序和指标行数量，不新增、不删除指标行。
2. 可修正明显错误：医学术语、检验项目名、表头、单位、括号、医院名、科室名、姓名字段附近的 OCR 错字。
3. 数值、参考范围、日期、样本编号仅在非常明确时才可修正；不确定时原样保留，并把风险写入 warnings。
4. corrected_text 输出完整纠错后的文本，不要省略未改动内容。
5. corrections 只列出实际修改项；没有修改时返回空数组。
6. confidence 取 0 到 1，表示你对纠错结果不会破坏原始含义和表格结构的信心。

OCR 文本：
${ocrText}`
  );
}

export async function runRepairStage({
  runId,
  documentId = null,
  ocrText,
  env = process.env,
  repair = repairOcrForExtraction,
  recordRun = recordPipelineRun,
  nowMs = Date.now,
}: RepairStageInput): Promise<RepairStageResult> {
  if (!isRepairEnabled(env)) {
    return {
      text: ocrText,
      repaired: false,
      skipped: true,
    };
  }

  const started = nowMs();
  try {
    const result = await repair(ocrText);
    const repairedText = result.corrected_text || ocrText;
    await recordRun({
      runId,
      documentId,
      stage: "llm_repair",
      status: "success",
      model: env.OPENAI_MODEL ?? null,
      inputText: ocrText,
      outputText: result.corrected_text,
      durationMs: nowMs() - started,
      metadata: {
        providerName: env.OPENAI_PROVIDER_NAME ?? "health-store",
        correctionCount: result.corrections.length,
        warnings: result.warnings,
        confidence: result.confidence,
      },
    });

    if (!result.corrected_text) {
      return {
        text: ocrText,
        repaired: false,
        skipped: false,
      };
    }

    return {
      text: repairedText,
      repaired: true,
      skipped: false,
      result,
    };
  } catch (err) {
    await recordRun({
      runId,
      documentId,
      stage: "llm_repair",
      status: "error",
      model: env.OPENAI_MODEL ?? null,
      inputText: ocrText,
      durationMs: nowMs() - started,
      error: err,
      metadata: {
        providerName: env.OPENAI_PROVIDER_NAME ?? "health-store",
      },
    });

    return {
      text: ocrText,
      repaired: false,
      skipped: false,
      error: err,
    };
  }
}
