import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAsyncJobActiveChecker,
  processNextJob,
  startAsyncJobActiveChecker,
} from "./async-job-worker";
import type { AsyncJobRecord } from "./async-jobs";

function makeJob(overrides: Partial<AsyncJobRecord> = {}): AsyncJobRecord {
  return {
    id: "job-1",
    type: "document_import",
    status: "running",
    resourceId: "md5-1",
    input: {
      documentId: "doc-1",
      imagePath: "uploads/doc-1.jpeg",
      imageMd5: "md5-1",
    },
    result: null,
    error: null,
    attempts: 1,
    createdAt: "2026-06-21T10:00:00.000Z",
    startedAt: "2026-06-21T10:00:00.000Z",
    finishedAt: null,
    updatedAt: "2026-06-21T10:00:00.000Z",
    ...overrides,
  };
}

describe("async job worker", () => {
  it("waits for OCR readiness before claiming queued parsing jobs", async () => {
    let claimed = false;
    const processed = await processNextJob({
      checkOcrReady: async () => false,
      createJobService: () => ({
        claimNextQueued: async () => {
          claimed = true;
          return makeJob();
        },
        markSuccess: async () => makeJob({ status: "success" }),
        markError: async () => makeJob({ status: "error" }),
      }),
      logger: {
        log: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    assert.equal(processed, false);
    assert.equal(claimed, false);
  });

  it("claims and completes one job when OCR is ready", async () => {
    let markedSuccess = false;
    const processed = await processNextJob({
      checkOcrReady: async () => true,
      createJobService: () => ({
        claimNextQueued: async () => makeJob(),
        markSuccess: async (_id, result) => {
          markedSuccess = true;
          assert.deepEqual(result, { id: "doc-1" });
          return makeJob({ status: "success", result });
        },
        markError: async () => makeJob({ status: "error" }),
      }),
      runDocumentImportJob: async () => ({ id: "doc-1" }),
      logger: {
        log: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    assert.equal(processed, true);
    assert.equal(markedSuccess, true);
  });

  it("actively checks on startup and every interval until the queue is idle", async () => {
    const intervalCallbacks: Array<() => void> = [];
    const clearIntervalCalls: unknown[] = [];
    const outcomes = [true, true, false, false];
    const processCalls: number[] = [];

    const checker = createAsyncJobActiveChecker({
      pollIntervalMs: 123,
      processNextJob: async () => {
        processCalls.push(processCalls.length + 1);
        return outcomes.shift() ?? false;
      },
      setInterval: (callback, ms) => {
        assert.equal(ms, 123);
        intervalCallbacks.push(callback);
        return "timer-1" as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval: (handle) => {
        clearIntervalCalls.push(handle);
      },
      logger: {
        log: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    assert.equal(await checker.checkNow(), true);
    assert.deepEqual(processCalls, [1, 2, 3]);

    intervalCallbacks[0]!();
    assert.equal(await checker.checkNow(), false);
    assert.deepEqual(processCalls, [1, 2, 3, 4]);

    checker.stop();
    assert.deepEqual(clearIntervalCalls, ["timer-1"]);
  });

  it("does not overlap active checks when a previous check is still running", async () => {
    const intervalCallbacks: Array<() => void> = [];
    let resolveFirstCheck: ((processed: boolean) => void) | undefined;
    let processCalls = 0;

    const checker = createAsyncJobActiveChecker({
      processNextJob: async () => {
        processCalls += 1;
        return new Promise<boolean>((resolve) => {
          resolveFirstCheck = resolve;
        });
      },
      setInterval: (callback) => {
        intervalCallbacks.push(callback);
        return "timer-1" as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval: () => undefined,
      logger: {
        log: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    const firstCheck = checker.checkNow();
    intervalCallbacks[0]!();
    const secondCheck = checker.checkNow();

    assert.equal(processCalls, 1);
    resolveFirstCheck!(false);

    assert.equal(await firstCheck, false);
    assert.equal(await secondCheck, false);
    assert.equal(processCalls, 1);

    checker.stop();
  });

  it("reuses the process-wide active checker instead of starting duplicate intervals", async () => {
    const globalKey = "__healthStoreAsyncJobActiveChecker";
    const globalWithChecker = globalThis as typeof globalThis & {
      [globalKey]?: unknown;
    };
    delete globalWithChecker[globalKey];

    const intervalCallbacks: Array<() => void> = [];
    let processCalls = 0;

    try {
      const first = startAsyncJobActiveChecker({
        processNextJob: async () => {
          processCalls += 1;
          return false;
        },
        setInterval: (callback) => {
          intervalCallbacks.push(callback);
          return "timer-1" as unknown as ReturnType<typeof setInterval>;
        },
        clearInterval: () => undefined,
        logger: {
          log: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
      });
      await first.checkNow();

      const second = startAsyncJobActiveChecker({
        processNextJob: async () => {
          throw new Error("duplicate checker should not start");
        },
        setInterval: (callback) => {
          intervalCallbacks.push(callback);
          return "timer-2" as unknown as ReturnType<typeof setInterval>;
        },
        clearInterval: () => undefined,
        logger: {
          log: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
      });
      await second.checkNow();

      assert.equal(second, first);
      assert.equal(intervalCallbacks.length, 1);
      assert.equal(processCalls, 2);
      first.stop();
    } finally {
      delete globalWithChecker[globalKey];
    }
  });
});
