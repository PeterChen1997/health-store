import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "../db/schema";
import {
  createAsyncJobService,
  serializeAsyncJobForApi,
  type AsyncJobRecord,
} from "./async-jobs";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE async_jobs (
      id text PRIMARY KEY NOT NULL,
      type text NOT NULL,
      status text NOT NULL,
      resource_id text,
      input text NOT NULL,
      result text,
      error text,
      attempts integer DEFAULT 0 NOT NULL,
      created_at text DEFAULT (datetime('now')) NOT NULL,
      started_at text,
      finished_at text,
      updated_at text DEFAULT (datetime('now')) NOT NULL
    );
  `);

  return drizzle(sqlite, { schema });
}

function makeClock(...values: string[]) {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]!);
}

describe("async jobs", () => {
  it("enqueues a queued job with serialized input", async () => {
    const service = createAsyncJobService({
      db: makeTestDb(),
      makeId: () => "job-1",
      now: () => new Date("2026-06-21T10:00:00.000Z"),
    });

    const { job, reused } = await service.enqueue({
      type: "document_reparse",
      resourceId: "doc-1",
      input: { documentId: "doc-1" },
    });

    assert.equal(reused, false);
    assert.equal(job.id, "job-1");
    assert.equal(job.status, "queued");
    assert.deepEqual(job.input, { documentId: "doc-1" });
    assert.equal(job.result, null);
    assert.equal(job.error, null);
    assert.equal(job.attempts, 0);
    assert.equal(job.createdAt, "2026-06-21T10:00:00.000Z");
  });

  it("uses the default id generator without losing crypto context", async () => {
    const service = createAsyncJobService({
      db: makeTestDb(),
      now: () => new Date("2026-06-21T10:00:00.000Z"),
    });

    const { job } = await service.enqueue({
      type: "document_import",
      resourceId: "md5-1",
      input: { documentId: "doc-1", imageMd5: "md5-1", imagePath: "uploads/doc-1.jpeg" },
    });

    assert.match(job.id, /^[0-9a-f-]{36}$/);
  });

  it("reuses an active document reparse job for the same document", async () => {
    const service = createAsyncJobService({
      db: makeTestDb(),
      makeId: () => "job-1",
      now: () => new Date("2026-06-21T10:00:00.000Z"),
    });

    const first = await service.enqueue({
      type: "document_reparse",
      resourceId: "doc-1",
      input: { documentId: "doc-1" },
    });
    const second = await service.enqueue({
      type: "document_reparse",
      resourceId: "doc-1",
      input: { documentId: "doc-1" },
    });

    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(second.job.id, first.job.id);
  });

  it("reuses an active document import job for the same image fingerprint", async () => {
    const service = createAsyncJobService({
      db: makeTestDb(),
      makeId: () => "job-1",
      now: () => new Date("2026-06-21T10:00:00.000Z"),
    });

    const first = await service.enqueue({
      type: "document_import",
      resourceId: "md5-1",
      input: { documentId: "doc-1", imageMd5: "md5-1", imagePath: "uploads/doc-1.jpeg" },
    });
    const second = await service.enqueue({
      type: "document_import",
      resourceId: "md5-1",
      input: { documentId: "doc-2", imageMd5: "md5-1", imagePath: "uploads/doc-2.jpeg" },
    });

    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(second.job.id, first.job.id);
    assert.deepEqual(second.job.input, {
      documentId: "doc-1",
      imageMd5: "md5-1",
      imagePath: "uploads/doc-1.jpeg",
    });
  });

  it("claims the oldest queued job and increments attempts", async () => {
    const service = createAsyncJobService({
      db: makeTestDb(),
      makeId: (() => {
        const ids = ["job-1", "job-2"];
        return () => ids.shift()!;
      })(),
      now: makeClock(
        "2026-06-21T10:00:00.000Z",
        "2026-06-21T10:01:00.000Z",
        "2026-06-21T10:02:00.000Z"
      ),
    });

    await service.enqueue({ type: "document_reparse", resourceId: "doc-1", input: { documentId: "doc-1" } });
    await service.enqueue({ type: "document_reparse", resourceId: "doc-2", input: { documentId: "doc-2" } });

    const claimed = await service.claimNextQueued();

    assert.equal(claimed?.id, "job-1");
    assert.equal(claimed?.status, "running");
    assert.equal(claimed?.attempts, 1);
    assert.equal(claimed?.startedAt, "2026-06-21T10:02:00.000Z");
  });

  it("marks jobs success and error with serialized public API responses", async () => {
    const db = makeTestDb();
    const service = createAsyncJobService({
      db,
      makeId: (() => {
        const ids = ["job-ok", "job-bad"];
        return () => ids.shift()!;
      })(),
      now: makeClock(
        "2026-06-21T10:00:00.000Z",
        "2026-06-21T10:01:00.000Z",
        "2026-06-21T10:02:00.000Z",
        "2026-06-21T10:03:00.000Z"
      ),
    });

    await service.enqueue({ type: "document_reparse", resourceId: "doc-ok", input: { documentId: "doc-ok" } });
    await service.enqueue({ type: "document_reparse", resourceId: "doc-bad", input: { documentId: "doc-bad" } });

    const success = await service.markSuccess("job-ok", { id: "doc-ok", temporary: true });
    const error = await service.markError("job-bad", new Error("OCR failed"));

    assert.equal(success.status, "success");
    assert.deepEqual(success.result, { id: "doc-ok", temporary: true });
    assert.equal(success.finishedAt, "2026-06-21T10:02:00.000Z");
    assert.equal(error.status, "error");
    assert.equal(error.error, "OCR failed");
    assert.equal(error.finishedAt, "2026-06-21T10:03:00.000Z");

    assert.deepEqual(serializeAsyncJobForApi(success as AsyncJobRecord), {
      id: "job-ok",
      type: "document_reparse",
      status: "success",
      result: { id: "doc-ok", temporary: true },
    });
    assert.deepEqual(serializeAsyncJobForApi(error as AsyncJobRecord), {
      id: "job-bad",
      type: "document_reparse",
      status: "error",
      error: "OCR failed",
    });
    assert.equal("input" in serializeAsyncJobForApi(success as AsyncJobRecord), false);

    const rows = await db.run(sql`select count(*) as count from async_jobs`);
    assert.ok(rows);
  });

  it("requeues an error job for retry and resets attempts to 0", async () => {
    const service = createAsyncJobService({
      db: makeTestDb(),
      makeId: () => "job-retry",
      now: makeClock(
        "2026-06-21T10:00:00.000Z",
        "2026-06-21T10:01:00.000Z",
        "2026-06-21T10:02:00.000Z",
        "2026-06-21T10:03:00.000Z"
      ),
    });

    await service.enqueue({
      type: "document_import",
      resourceId: "md5-1",
      input: { documentId: "doc-1", imageMd5: "md5-1", imagePath: "uploads/doc-1.jpeg" },
    });
    await service.claimNextQueued();
    await service.markError("job-retry", new Error("fetch failed"));

    assert.equal(typeof service.retryFailed, "function");
    const retried = await service.retryFailed("job-retry");

    assert.equal(retried.status, "queued");
    assert.equal(retried.error, null);
    assert.equal(retried.result, null);
    assert.equal(retried.startedAt, null);
    assert.equal(retried.finishedAt, null);
    assert.equal(retried.attempts, 0);
    assert.equal(retried.updatedAt, "2026-06-21T10:03:00.000Z");

    const claimedAgain = await service.claimNextQueued();
    assert.equal(claimedAgain?.id, "job-retry");
    assert.equal(claimedAgain?.attempts, 1);
  });
});
