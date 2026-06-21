import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db/index";
import { pipelineRuns } from "@/db/schema";

export type PipelineStage = "ocr" | "llm_extract" | "llm_repair";
export type PipelineStatus = "success" | "error";

export type PipelineRunInsertValues = {
  id: string;
  runId: string;
  documentId: string | null;
  stage: PipelineStage;
  status: PipelineStatus;
  mode: string | null;
  model: string | null;
  inputChars: number | null;
  outputChars: number | null;
  durationMs: number | null;
  error: string | null;
  metadata: string;
  createdAt: string;
};

type PipelineRunRecord = Omit<PipelineRunInsertValues, "metadata"> & {
  metadata: Record<string, unknown>;
};

export type PipelineRunInput = {
  runId: string;
  documentId?: string | null;
  stage: PipelineStage;
  status: PipelineStatus;
  mode?: string | null;
  model?: string | null;
  inputText?: string | null;
  outputText?: string | null;
  inputChars?: number | null;
  outputChars?: number | null;
  durationMs?: number | null;
  error?: unknown;
  metadata?: Record<string, unknown>;
};

type PipelineLogOptions = {
  env?: Record<string, string | undefined>;
  logDir?: string;
  now?: () => Date;
  makeId?: () => string;
  insertRun?: (values: PipelineRunInsertValues) => Promise<void>;
  appendJsonl?: (filePath: string, line: string) => Promise<void>;
};

type PipelineLogResult =
  | { skipped: true }
  | { skipped: false; record: PipelineRunRecord; logFilePath: string }
  | { skipped: false; record: PipelineRunRecord; logFilePath: string; error: string };

function getDefaultLogDir() {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "../../data/logs");
}

function loggingEnabled(env: Record<string, string | undefined>) {
  return env.PIPELINE_LOG_ENABLED !== "false";
}

function fullTextEnabled(env: Record<string, string | undefined>) {
  return env.PIPELINE_LOG_FULL_TEXT === "true";
}

function countText(text: string | null | undefined) {
  return typeof text === "string" ? text.length : null;
}

function serializeError(error: unknown) {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  return String(error);
}

function buildMetadata(input: PipelineRunInput, includeFullText: boolean) {
  const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
  if (includeFullText) {
    metadata.inputText = input.inputText ?? null;
    metadata.outputText = input.outputText ?? null;
  }
  return metadata;
}

function toInsertValues(record: PipelineRunRecord): PipelineRunInsertValues {
  return {
    ...record,
    metadata: JSON.stringify(record.metadata),
  };
}

function defaultInsertRun(values: PipelineRunInsertValues) {
  return db.insert(pipelineRuns).values(values);
}

async function defaultAppendJsonl(filePath: string, line: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, line, "utf8");
}

export function getPipelineLogFileName(stage: PipelineStage) {
  return stage === "ocr" ? "ocr-runs.jsonl" : "llm-runs.jsonl";
}

export async function recordPipelineRun(
  input: PipelineRunInput,
  options: PipelineLogOptions = {}
): Promise<PipelineLogResult> {
  const env = options.env ?? process.env;
  if (!loggingEnabled(env)) {
    return { skipped: true };
  }

  const now = options.now ?? (() => new Date());
  const makeId = options.makeId ?? (() => crypto.randomUUID());
  const logDir = options.logDir ?? getDefaultLogDir();
  const insertRun = options.insertRun ?? defaultInsertRun;
  const appendJsonl = options.appendJsonl ?? defaultAppendJsonl;
  const includeFullText = fullTextEnabled(env);

  const record: PipelineRunRecord = {
    id: makeId(),
    runId: input.runId,
    documentId: input.documentId ?? null,
    stage: input.stage,
    status: input.status,
    mode: input.mode ?? null,
    model: input.model ?? null,
    inputChars: input.inputChars ?? countText(input.inputText),
    outputChars: input.outputChars ?? countText(input.outputText),
    durationMs: input.durationMs ?? null,
    error: serializeError(input.error),
    metadata: buildMetadata(input, includeFullText),
    createdAt: now().toISOString(),
  };

  const fileName = getPipelineLogFileName(input.stage);
  const logFilePath = path.join(logDir, fileName);

  try {
    await insertRun(toInsertValues(record));
    await appendJsonl(logFilePath, `${JSON.stringify(record)}\n`);
    return { skipped: false, record, logFilePath };
  } catch (err) {
    const message = serializeError(err) ?? "pipeline logging failed";
    console.warn("pipeline run logging failed:", err);
    return { skipped: false, record, logFilePath, error: message };
  }
}
