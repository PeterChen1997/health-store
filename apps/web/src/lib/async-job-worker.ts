import {
  createAsyncJobService,
  type AsyncJobRecord,
} from "./async-jobs";
import { checkOcrHealth as defaultCheckOcrHealth } from "./ocr-client";
import type { DocumentReparseJobInput } from "./document-reparse-job";
import type { DocumentImportJobInput } from "./document-import-job";

type AsyncJobServiceForWorker = {
  claimNextQueued: () => Promise<AsyncJobRecord | null>;
  markSuccess: (id: string, result: unknown) => Promise<AsyncJobRecord>;
  markError: (id: string, error: unknown) => Promise<AsyncJobRecord>;
};

type WorkerLogger = Pick<Console, "log" | "warn" | "error">;

type IntervalHandle = ReturnType<typeof setInterval>;

type ProcessNextJobDeps = {
  createJobService?: () => AsyncJobServiceForWorker;
  runDocumentImportJob?: (input: DocumentImportJobInput) => Promise<unknown>;
  runDocumentReparseJob?: (input: DocumentReparseJobInput) => Promise<unknown>;
  checkOcrReady?: () => Promise<boolean>;
  logger?: WorkerLogger;
};

type AsyncJobActiveCheckerOptions = {
  pollIntervalMs?: number;
  processNextJob?: () => Promise<boolean>;
  setInterval?: (callback: () => void, ms: number) => IntervalHandle;
  clearInterval?: (handle: IntervalHandle) => void;
  logger?: WorkerLogger;
};

export type AsyncJobActiveChecker = {
  checkNow: () => Promise<boolean>;
  stop: () => void;
  isStopped: () => boolean;
};

const ACTIVE_CHECKER_GLOBAL_KEY = "__healthStoreAsyncJobActiveChecker";
const DEFAULT_ACTIVE_CHECK_INTERVAL_MS = 1000;
const DEFAULT_MAX_JOB_ATTEMPTS = 3;

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function getDefaultActiveCheckIntervalMs() {
  return parsePositiveInteger(
    process.env.ASYNC_JOB_ACTIVE_CHECK_INTERVAL_MS ?? process.env.ASYNC_JOB_POLL_INTERVAL_MS,
    DEFAULT_ACTIVE_CHECK_INTERVAL_MS
  );
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const cause = error.cause;
    if (cause instanceof Error) {
      return `${error.message} (${cause.constructor.name}: ${cause.message})`;
    }
    return error.message;
  }
  return String(error);
}

function parseDocumentReparseInput(input: unknown): DocumentReparseJobInput {
  if (
    typeof input === "object" &&
    input !== null &&
    "documentId" in input &&
    typeof input.documentId === "string" &&
    input.documentId.trim() !== ""
  ) {
    return { documentId: input.documentId };
  }

  throw new Error("document_reparse job input must include documentId");
}

function parseDocumentImportInput(input: unknown): DocumentImportJobInput {
  if (
    typeof input === "object" &&
    input !== null &&
    "documentId" in input &&
    typeof input.documentId === "string" &&
    input.documentId.trim() !== "" &&
    "imagePath" in input &&
    typeof input.imagePath === "string" &&
    input.imagePath.trim() !== "" &&
    "imageMd5" in input &&
    typeof input.imageMd5 === "string" &&
    input.imageMd5.trim() !== ""
  ) {
    return {
      documentId: input.documentId,
      imagePath: input.imagePath,
      imageMd5: input.imageMd5,
      fileName: "fileName" in input && typeof input.fileName === "string" ? input.fileName : undefined,
      sourcePath: "sourcePath" in input && typeof input.sourcePath === "string" ? input.sourcePath : undefined,
      inputBytes: "inputBytes" in input && typeof input.inputBytes === "number" ? input.inputBytes : undefined,
    };
  }

  throw new Error("document_import job input must include documentId, imagePath, and imageMd5");
}

async function runJob(
  job: AsyncJobRecord,
  {
    runDocumentImportJob,
    runDocumentReparseJob,
  }: Pick<ProcessNextJobDeps, "runDocumentImportJob" | "runDocumentReparseJob"> = {}
) {
  if (job.type === "document_import") {
    const runner =
      runDocumentImportJob ?? (await import("./document-import-job")).runDocumentImportJob;
    return runner(parseDocumentImportInput(job.input));
  }

  if (job.type === "document_reparse") {
    const runner =
      runDocumentReparseJob ?? (await import("./document-reparse-job")).runDocumentReparseJob;
    return runner(parseDocumentReparseInput(job.input));
  }

  throw new Error(`Unsupported async job type: ${job.type}`);
}

export async function processNextJob({
  createJobService = createAsyncJobService,
  runDocumentImportJob,
  runDocumentReparseJob,
  checkOcrReady = defaultCheckOcrHealth,
  logger = console,
}: ProcessNextJobDeps = {}) {
  const ocrReady = await checkOcrReady();
  if (!ocrReady) {
    logger.warn("[worker] OCR service is not ready; waiting before claiming parsing jobs");
    return false;
  }

  const maxAttempts = parsePositiveInteger(
    process.env.ASYNC_JOB_MAX_ATTEMPTS,
    DEFAULT_MAX_JOB_ATTEMPTS
  );

  const jobs = createJobService();
  const job = await jobs.claimNextQueued();
  if (!job) return false;

  logger.log(`[worker] claimed ${job.type} job ${job.id} (attempt ${job.attempts})`);

  if (job.attempts > maxAttempts) {
    await jobs.markError(job.id, new Error(`超过最大重试次数 (${maxAttempts})`));
    logger.warn(`[worker] job ${job.id} exceeded max attempts (${maxAttempts}), skipping`);
    return true;
  }

  try {
    const result = await runJob(job, { runDocumentImportJob, runDocumentReparseJob });
    await jobs.markSuccess(job.id, result);
    logger.log(`[worker] completed job ${job.id}`);
  } catch (error) {
    await jobs.markError(job.id, error);
    logger.error(`[worker] failed job ${job.id}: ${serializeError(error)}`);
  }

  return true;
}

function unrefTimerIfAvailable(handle: IntervalHandle) {
  if (
    typeof handle === "object" &&
    handle !== null &&
    "unref" in handle &&
    typeof handle.unref === "function"
  ) {
    handle.unref();
  }
}

export function createAsyncJobActiveChecker({
  pollIntervalMs = getDefaultActiveCheckIntervalMs(),
  processNextJob: processOneJob = () => processNextJob(),
  setInterval: setIntervalFn = setInterval,
  clearInterval: clearIntervalFn = clearInterval,
  logger = console,
}: AsyncJobActiveCheckerOptions = {}): AsyncJobActiveChecker {
  let stopped = false;
  let activeCheck: Promise<boolean> | null = null;

  async function drainQueuedJobs() {
    let processedAny = false;

    while (!stopped) {
      const processed = await processOneJob();
      if (!processed) break;
      processedAny = true;
    }

    return processedAny;
  }

  function checkNow() {
    if (stopped) return Promise.resolve(false);
    if (activeCheck) return activeCheck;

    activeCheck = drainQueuedJobs()
      .catch((error) => {
        logger.error(`[worker] active check failed: ${serializeError(error)}`);
        return false;
      })
      .finally(() => {
        activeCheck = null;
      });

    return activeCheck;
  }

  const interval = setIntervalFn(() => {
    void checkNow();
  }, pollIntervalMs);
  unrefTimerIfAvailable(interval);
  void checkNow();

  return {
    checkNow,
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearIntervalFn(interval);
    },
    isStopped: () => stopped,
  };
}

export function startAsyncJobActiveChecker(
  options: AsyncJobActiveCheckerOptions = {}
): AsyncJobActiveChecker {
  const globalWithChecker = globalThis as typeof globalThis & {
    [ACTIVE_CHECKER_GLOBAL_KEY]?: AsyncJobActiveChecker;
  };

  const existing = globalWithChecker[ACTIVE_CHECKER_GLOBAL_KEY];
  if (existing && !existing.isStopped()) {
    void existing.checkNow();
    return existing;
  }

  const checker = createAsyncJobActiveChecker(options);
  globalWithChecker[ACTIVE_CHECKER_GLOBAL_KEY] = checker;
  return checker;
}
