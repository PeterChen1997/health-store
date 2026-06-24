import path from "path";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db/index";
import { documents, measurements, metricCatalog } from "@/db/schema";
import { getOcrAnalysisText, getOcrModelName, parseImage as defaultParseImage, type OcrResult } from "./ocr-client";
import { extractFromOcr as defaultExtractFromOcr, type ExtractionResult } from "./extract";
import { applyOcrDerivedMeasurementFlags } from "./measurement-flags";
import { recordPipelineRun as defaultRecordPipelineRun, type PipelineRunInput } from "./pipeline-log";
import { runRepairStage as defaultRunRepairStage, type RepairStageResult } from "./repair";
import { indexDocument } from "./index-document-chunks";
import { matchMetricId } from "./metric-match";

const DEFAULT_UPLOADS_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "../../data/uploads");

export type DocumentImportJobInput = {
  documentId: string;
  imagePath: string;
  imageMd5: string;
  fileName?: string;
  sourcePath?: string;
  inputBytes?: number;
};

export type DocumentImportJobResult = {
  id: string;
  measurementCount: number;
  measuredAt: string;
  duplicate: boolean;
};

type MetricResolution = {
  metricId: string | null;
};

type DocumentImportJobDeps = {
  db?: typeof defaultDb;
  uploadsDir?: string;
  makeRunId?: () => string;
  makeMeasurementId?: () => string;
  parseImage?: (imagePath: string, runId: string) => Promise<OcrResult>;
  runRepairStage?: (input: {
    runId: string;
    documentId?: string | null;
    ocrText: string;
  }) => Promise<RepairStageResult>;
  extractFromOcr?: (ocrText: string) => Promise<ExtractionResult>;
  recordPipelineRun?: (input: PipelineRunInput) => Promise<unknown>;
  resolveMetric?: (rawName: string) => Promise<MetricResolution>;
  indexDocumentChunks?: (documentId: string) => Promise<void>;
  nowMs?: () => number;
};

async function resolveMetricFromDb(db: typeof defaultDb, rawName: string): Promise<MetricResolution> {
  const rows = await db
    .select({
      id: metricCatalog.id,
      standardName: metricCatalog.standardName,
      aliases: metricCatalog.aliases,
    })
    .from(metricCatalog);

  const catalog = rows.map((row) => ({
    id: row.id,
    standardName: row.standardName,
    aliases: JSON.parse(row.aliases) as string[],
  }));

  return { metricId: matchMetricId(rawName, catalog) };
}

async function findExistingImportResult(
  db: typeof defaultDb,
  imageMd5: string
): Promise<DocumentImportJobResult | null> {
  const [existingDocument] = await db
    .select()
    .from(documents)
    .where(eq(documents.imageMd5, imageMd5))
    .limit(1);

  if (!existingDocument) return null;

  const existingMeasurements = await db
    .select({ id: measurements.id })
    .from(measurements)
    .where(eq(measurements.documentId, existingDocument.id));

  return {
    id: existingDocument.id,
    measurementCount: existingMeasurements.length,
    measuredAt: existingDocument.measuredAt,
    duplicate: true,
  };
}

export async function runDocumentImportJob(
  input: DocumentImportJobInput,
  {
    db = defaultDb,
    uploadsDir = DEFAULT_UPLOADS_DIR,
    makeRunId = () => crypto.randomUUID(),
    makeMeasurementId = () => crypto.randomUUID(),
    parseImage = defaultParseImage,
    runRepairStage = defaultRunRepairStage,
    extractFromOcr = defaultExtractFromOcr,
    recordPipelineRun = defaultRecordPipelineRun,
    resolveMetric,
    indexDocumentChunks = indexDocument,
    nowMs = Date.now,
  }: DocumentImportJobDeps = {}
): Promise<DocumentImportJobResult> {
  const existing = await findExistingImportResult(db, input.imageMd5);
  if (existing) return existing;

  const runId = makeRunId();
  const absoluteImagePath = path.join(uploadsDir, path.basename(input.imagePath));

  let ocrMarkdown = "";
  let ocrJson: string | null = null;
  const ocrStarted = nowMs();
  try {
    const ocr = await parseImage(absoluteImagePath, runId);
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
        fileName: input.fileName ?? null,
        sourcePath: input.sourcePath ?? null,
        imagePath: input.imagePath,
        inputBytes: input.inputBytes ?? null,
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
        fileName: input.fileName ?? null,
        sourcePath: input.sourcePath ?? null,
        imagePath: input.imagePath,
        inputBytes: input.inputBytes ?? null,
      },
    });
    throw err;
  }

  const repairResult = ocrMarkdown.trim()
    ? await runRepairStage({ runId, documentId: input.documentId, ocrText: ocrMarkdown })
    : { text: ocrMarkdown, repaired: false, skipped: true };
  const llmInput = repairResult.text || "（OCR 无文本）";
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

  await db.insert(documents).values({
    id: input.documentId,
    imagePath: input.imagePath,
    imageMd5: input.imageMd5,
    documentType: extraction.document_type,
    institution: extraction.institution,
    measuredAt: extraction.measured_at,
    ocrMarkdown,
    ocrJson,
  });

  indexDocumentChunks(input.documentId).catch((err) =>
    console.error("[index-document] 向量索引失败，可稍后通过回填脚本恢复:", err)
  );

  const resolve = resolveMetric ?? ((rawName: string) => resolveMetricFromDb(db, rawName));
  const measurementRows = await Promise.all(
    extraction.measurements.map(async (measurement) => {
      const metric = await resolve(measurement.raw_name);
      return {
        id: makeMeasurementId(),
        documentId: input.documentId,
        metricId: metric.metricId,
        rawName: measurement.raw_name,
        value: measurement.value,
        unit: measurement.unit,
        refLow: measurement.ref_low,
        refHigh: measurement.ref_high,
        flag: measurement.flag,
        measuredAt: extraction.measured_at,
      };
    })
  );

  if (measurementRows.length > 0) {
    await db.insert(measurements).values(measurementRows);
  }

  return {
    id: input.documentId,
    measurementCount: measurementRows.length,
    measuredAt: extraction.measured_at,
    duplicate: false,
  };
}
