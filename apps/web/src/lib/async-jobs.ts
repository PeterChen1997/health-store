import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db/index";
import { asyncJobs } from "@/db/schema";

export const ASYNC_JOB_STATUSES = ["queued", "running", "success", "error"] as const;
export const ASYNC_JOB_TYPES = ["document_reparse", "document_import"] as const;

export type AsyncJobStatus = (typeof ASYNC_JOB_STATUSES)[number];
export type AsyncJobType = (typeof ASYNC_JOB_TYPES)[number];
export type AsyncJobDb = typeof defaultDb;

export type AsyncJobRecord = {
  id: string;
  type: AsyncJobType;
  status: AsyncJobStatus;
  resourceId: string | null;
  input: unknown;
  result: unknown | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

export type AsyncJobApiResponse =
  | {
      id: string;
      type: AsyncJobType;
      status: "queued" | "running";
    }
  | {
      id: string;
      type: AsyncJobType;
      status: "success";
      result: unknown;
    }
  | {
      id: string;
      type: AsyncJobType;
      status: "error";
      error: string | null;
    };

type AsyncJobRow = typeof asyncJobs.$inferSelect;

type AsyncJobServiceOptions = {
  db?: AsyncJobDb;
  makeId?: () => string;
  now?: () => Date;
};

type EnqueueInput = {
  type: AsyncJobType;
  resourceId?: string | null;
  input: unknown;
};

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const cause = error.cause;
    if (cause instanceof Error) {
      return `${error.message} (${cause.constructor.name}: ${cause.message})`;
    }
    return error.message;
  }
  if (error == null) return null;
  return String(error);
}

function parseJsonField(value: string | null): unknown | null {
  if (value == null) return null;
  return JSON.parse(value) as unknown;
}

function normalizeJob(row: AsyncJobRow): AsyncJobRecord {
  return {
    id: row.id,
    type: row.type as AsyncJobType,
    status: row.status as AsyncJobStatus,
    resourceId: row.resourceId,
    input: JSON.parse(row.input) as unknown,
    result: parseJsonField(row.result),
    error: row.error,
    attempts: row.attempts,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    updatedAt: row.updatedAt,
  };
}

export function serializeAsyncJobForApi(job: AsyncJobRecord): AsyncJobApiResponse {
  if (job.status === "success") {
    return {
      id: job.id,
      type: job.type,
      status: "success",
      result: job.result,
    };
  }

  if (job.status === "error") {
    return {
      id: job.id,
      type: job.type,
      status: "error",
      error: job.error,
    };
  }

  return {
    id: job.id,
    type: job.type,
    status: job.status,
  };
}

export function createAsyncJobService({
  db = defaultDb,
  makeId = () => crypto.randomUUID(),
  now = () => new Date(),
}: AsyncJobServiceOptions = {}) {
  async function getJob(id: string): Promise<AsyncJobRecord | null> {
    const [row] = await db.select().from(asyncJobs).where(eq(asyncJobs.id, id)).limit(1);
    return row ? normalizeJob(row) : null;
  }

  async function findActiveJob(type: AsyncJobType, resourceId: string): Promise<AsyncJobRecord | null> {
    const [existing] = await db
      .select()
      .from(asyncJobs)
      .where(
        and(
          eq(asyncJobs.type, type),
          eq(asyncJobs.resourceId, resourceId),
          inArray(asyncJobs.status, ["queued", "running"])
        )
      )
      .orderBy(desc(asyncJobs.createdAt))
      .limit(1);

    return existing ? normalizeJob(existing) : null;
  }

  async function enqueue(input: EnqueueInput): Promise<{ job: AsyncJobRecord; reused: boolean }> {
    const resourceId = input.resourceId ?? null;
    if (resourceId) {
      const existing = await findActiveJob(input.type, resourceId);
      if (existing) {
        return { job: existing, reused: true };
      }
    }

    const id = makeId();
    const timestamp = now().toISOString();
    await db.insert(asyncJobs).values({
      id,
      type: input.type,
      status: "queued",
      resourceId,
      input: JSON.stringify(input.input),
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const job = await getJob(id);
    if (!job) throw new Error(`async job ${id} was not created`);
    return { job, reused: false };
  }

  async function claimNextQueued(): Promise<AsyncJobRecord | null> {
    const timestamp = now().toISOString();
    const row = db.transaction((tx) => {
      const [queued] = tx
        .select()
        .from(asyncJobs)
        .where(eq(asyncJobs.status, "queued"))
        .orderBy(asc(asyncJobs.createdAt))
        .limit(1)
        .all();

      if (!queued) return null;

      tx.update(asyncJobs)
        .set({
          status: "running",
          attempts: sql`${asyncJobs.attempts} + 1`,
          startedAt: timestamp,
          updatedAt: timestamp,
        })
        .where(and(eq(asyncJobs.id, queued.id), eq(asyncJobs.status, "queued")))
        .run();

      const [claimed] = tx.select().from(asyncJobs).where(eq(asyncJobs.id, queued.id)).limit(1).all();
      return claimed ?? null;
    });

    return row ? normalizeJob(row) : null;
  }

  async function markSuccess(id: string, result: unknown): Promise<AsyncJobRecord> {
    const timestamp = now().toISOString();
    await db
      .update(asyncJobs)
      .set({
        status: "success",
        result: JSON.stringify(result),
        error: null,
        finishedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(asyncJobs.id, id));

    const job = await getJob(id);
    if (!job) throw new Error(`async job ${id} was not found after success update`);
    return job;
  }

  async function markError(id: string, error: unknown): Promise<AsyncJobRecord> {
    const timestamp = now().toISOString();
    await db
      .update(asyncJobs)
      .set({
        status: "error",
        error: serializeError(error),
        finishedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(asyncJobs.id, id));

    const job = await getJob(id);
    if (!job) throw new Error(`async job ${id} was not found after error update`);
    return job;
  }

  async function retryFailed(id: string): Promise<AsyncJobRecord> {
    const job = await getJob(id);
    if (!job) throw new Error(`async job ${id} was not found`);
    if (job.status !== "error") throw new Error(`async job ${id} is not failed`);

    const timestamp = now().toISOString();
    await db
      .update(asyncJobs)
      .set({
        status: "queued",
        attempts: 0,
        result: null,
        error: null,
        startedAt: null,
        finishedAt: null,
        updatedAt: timestamp,
      })
      .where(eq(asyncJobs.id, id));

    const retried = await getJob(id);
    if (!retried) throw new Error(`async job ${id} was not found after retry update`);
    return retried;
  }

  return {
    enqueue,
    findActiveJob,
    getJob,
    claimNextQueued,
    markSuccess,
    markError,
    retryFailed,
  };
}
