import type { AsyncJobStatus, AsyncJobType } from "./async-jobs";

export type AsyncJobQueueRow = {
  id: string;
  type: string;
  status: string;
  resourceId: string | null;
  input: string;
  result: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

export type AsyncJobView = {
  id: string;
  shortId: string;
  type: AsyncJobType | string;
  status: AsyncJobStatus | string;
  resourceId: string | null;
  documentId: string | null;
  imagePath: string | null;
  fileName: string | null;
  resourceLabel: string;
  measurementCount: number | null;
  duplicate: boolean | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  input: unknown;
  result: unknown | null;
};

export type AsyncJobSummary = {
  totalCount: number;
  pendingCount: number;
  byStatus: Record<AsyncJobStatus, number>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: string | null): unknown | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { parseError: "JSON 解析失败", raw: value };
  }
}

function stringValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

export function toAsyncJobView(row: AsyncJobQueueRow): AsyncJobView {
  const input = parseJson(row.input);
  const result = parseJson(row.result);
  const inputRecord = isRecord(input) ? input : {};
  const resultRecord = isRecord(result) ? result : {};
  const documentId = stringValue(inputRecord, "documentId") ?? stringValue(resultRecord, "id");
  const imagePath = stringValue(inputRecord, "imagePath");
  const fileName = stringValue(inputRecord, "fileName");

  return {
    id: row.id,
    shortId: row.id.slice(0, 8),
    type: row.type,
    status: row.status,
    resourceId: row.resourceId,
    documentId,
    imagePath,
    fileName,
    resourceLabel: fileName ?? imagePath ?? documentId ?? row.resourceId ?? row.id,
    measurementCount: numberValue(resultRecord, "measurementCount"),
    duplicate: booleanValue(resultRecord, "duplicate"),
    error: row.error,
    attempts: row.attempts,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    updatedAt: row.updatedAt,
    input,
    result,
  };
}

export function summarizeAsyncJobs(jobs: AsyncJobView[]): AsyncJobSummary {
  const byStatus = {
    queued: 0,
    running: 0,
    success: 0,
    error: 0,
  };

  for (const job of jobs) {
    if (job.status === "queued" || job.status === "running" || job.status === "success" || job.status === "error") {
      byStatus[job.status] += 1;
    }
  }

  return {
    totalCount: jobs.length,
    pendingCount: byStatus.queued + byStatus.running,
    byStatus,
  };
}
