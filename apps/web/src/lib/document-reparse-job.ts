import path from "path";
import { access } from "fs/promises";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db/index";
import { documents, metricCatalog } from "@/db/schema";
import { getOcrAnalysisText, getOcrModelName, parseImage as defaultParseImage, type OcrResult } from "./ocr-client";
import { extractFromOcr as defaultExtractFromOcr, type ExtractionResult } from "./extract";
import { applyOcrDerivedMeasurementFlags } from "./measurement-flags";
import { recordPipelineRun as defaultRecordPipelineRun, type PipelineRunInput } from "./pipeline-log";
import { buildReparsePreview, type ReparsePreview } from "./reparse-preview";
import { runRepairStage as defaultRunRepairStage, type RepairStageResult } from "./repair";

const DEFAULT_UPLOADS_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "../../data/uploads");

export type DocumentReparseJobInput = {
  documentId: string;
};

export type DocumentReparseJobResult = ReparsePreview & {
  id: string;
};

type MetricResolution = {
  metricId: string | null;
  standardName: string | null;
};

type DocumentReparseJobDeps = {
  db?: typeof defaultDb;
  uploadsDir?: string;
  makeRunId?: () => string;
  parseImage?: (imagePath: string, runId: string) => Promise<OcrResult>;
  runRepairStage?: (input: {
    runId: string;
    documentId?: string | null;
    ocrText: string;
  }) => Promise<RepairStageResult>;
  extractFromOcr?: (ocrText: string) => Promise<ExtractionResult>;
  recordPipelineRun?: (input: PipelineRunInput) => Promise<unknown>;
  resolveMetric?: (rawName: string) => Promise<MetricResolution>;
  nowMs?: () => number;
  now?: () => Date;
};

async function resolveMetricFromDb(
  db: typeof defaultDb,
  rawName: string
): Promise<MetricResolution> {
  const rows = await db
    .select({
      id: metricCatalog.id,
      standardName: metricCatalog.standardName,
      aliases: metricCatalog.aliases,
    })
    .from(metricCatalog);
  const needle = rawName.trim().toUpperCase();

  for (const row of rows) {
    const aliases = JSON.parse(row.aliases) as string[];
    const targets = [row.standardName, ...aliases].map((target) => target.toUpperCase());
    if (targets.some((target) => target === needle || needle.includes(target) || target.includes(needle))) {
      return {
        metricId: row.id,
        standardName: row.standardName,
      };
    }
  }

  return {
    metricId: null,
    standardName: null,
  };
}

export async function runDocumentReparseJob(
  input: DocumentReparseJobInput,
  {
    db = defaultDb,
    uploadsDir = DEFAULT_UPLOADS_DIR,
    makeRunId = () => crypto.randomUUID(),
    parseImage = defaultParseImage,
    runRepairStage = defaultRunRepairStage,
    extractFromOcr = defaultExtractFromOcr,
    recordPipelineRun = defaultRecordPipelineRun,
    resolveMetric,
    nowMs = Date.now,
    now = () => new Date(),
  }: DocumentReparseJobDeps = {}
): Promise<DocumentReparseJobResult> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, input.documentId));
  if (!doc) {
    throw new Error("未找到");
  }

  const filename = path.basename(doc.imagePath);
  const imagePath = path.join(uploadsDir, filename);
  await access(imagePath).catch(() => {
    throw new Error(`图片文件不存在: ${filename}`);
  });
  const runId = makeRunId();

  let ocrMarkdown = "";
  let ocrJson: string | null = null;
  const ocrStarted = nowMs();
  try {
    const ocr = await parseImage(imagePath, runId);
    ocrMarkdown = getOcrAnalysisText(ocr);
    ocrJson = JSON.stringify(ocr.json_data);
    await recordPipelineRun({
      runId,
      documentId: input.documentId,
      stage: "ocr",
      status: "success",
      mode: ocr.mode ?? null,
      model: getOcrModelName(ocr.mode),
      outputText: ocrMarkdown,
      durationMs: nowMs() - ocrStarted,
      metadata: {
        imagePath: doc.imagePath,
        serviceRunId: ocr.run_id ?? runId,
        timing: ocr.timing ?? null,
        blockCount: ocr.blocks?.length ?? null,
      },
    });
  } catch (err) {
    await recordPipelineRun({
      runId,
      documentId: input.documentId,
      stage: "ocr",
      status: "error",
      durationMs: nowMs() - ocrStarted,
      error: err,
      metadata: {
        imagePath: doc.imagePath,
      },
    });
    throw err;
  }

  const repairResult = ocrMarkdown.trim()
    ? await runRepairStage({ runId, documentId: input.documentId, ocrText: ocrMarkdown })
    : { text: ocrMarkdown, repaired: false, skipped: true };
  const llmInput = repairResult.text || "（OCR 无文本输出）";
  const llmStarted = nowMs();
  let extraction: ExtractionResult;
  try {
    extraction = applyOcrDerivedMeasurementFlags(await extractFromOcr(llmInput), llmInput);
    await recordPipelineRun({
      runId,
      documentId: input.documentId,
      stage: "llm_extract",
      status: "success",
      model: process.env.OPENAI_MODEL ?? null,
      inputText: llmInput,
      outputText: JSON.stringify(extraction),
      durationMs: nowMs() - llmStarted,
      metadata: {
        providerName: process.env.OPENAI_PROVIDER_NAME ?? "health-store",
        measurementCount: extraction.measurements.length,
        documentType: extraction.document_type,
        repairApplied: repairResult.repaired,
        repairSkipped: repairResult.skipped,
      },
    });
  } catch (err) {
    await recordPipelineRun({
      runId,
      documentId: input.documentId,
      stage: "llm_extract",
      status: "error",
      model: process.env.OPENAI_MODEL ?? null,
      inputText: llmInput,
      durationMs: nowMs() - llmStarted,
      error: err,
      metadata: {
        providerName: process.env.OPENAI_PROVIDER_NAME ?? "health-store",
        repairApplied: repairResult.repaired,
        repairSkipped: repairResult.skipped,
      },
    });
    throw err;
  }

  const preview = await buildReparsePreview({
    extraction,
    ocrMarkdown,
    ocrJson,
    generatedAt: now(),
    resolveMetric: resolveMetric ?? ((rawName) => resolveMetricFromDb(db, rawName)),
  });

  return {
    id: input.documentId,
    ...preview,
  };
}
