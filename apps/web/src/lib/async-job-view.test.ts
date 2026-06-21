import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  summarizeAsyncJobs,
  toAsyncJobView,
  type AsyncJobQueueRow,
} from "./async-job-view";

const baseRow: AsyncJobQueueRow = {
  id: "job-1",
  type: "document_import",
  status: "queued",
  resourceId: "md5-1",
  input: JSON.stringify({
    documentId: "doc-1",
    imagePath: "uploads/doc-1.jpeg",
    imageMd5: "md5-1",
    fileName: "report.jpeg",
  }),
  result: null,
  error: null,
  attempts: 0,
  createdAt: "2026-06-21T10:00:00.000Z",
  startedAt: null,
  finishedAt: null,
  updatedAt: "2026-06-21T10:00:00.000Z",
};

describe("async job view helpers", () => {
  it("extracts document and image details from job input", () => {
    const view = toAsyncJobView(baseRow);

    assert.equal(view.documentId, "doc-1");
    assert.equal(view.imagePath, "uploads/doc-1.jpeg");
    assert.equal(view.fileName, "report.jpeg");
    assert.equal(view.resourceLabel, "report.jpeg");
  });

  it("extracts measurement count and duplicate state from success result", () => {
    const view = toAsyncJobView({
      ...baseRow,
      status: "success",
      result: JSON.stringify({
        id: "doc-1",
        measurementCount: 9,
        duplicate: true,
      }),
      finishedAt: "2026-06-21T10:02:00.000Z",
    });

    assert.equal(view.measurementCount, 9);
    assert.equal(view.duplicate, true);
    assert.equal(view.documentId, "doc-1");
  });

  it("summarizes queue progress by status and pending work", () => {
    const summary = summarizeAsyncJobs([
      toAsyncJobView(baseRow),
      toAsyncJobView({ ...baseRow, id: "job-2", status: "running" }),
      toAsyncJobView({ ...baseRow, id: "job-3", status: "success" }),
      toAsyncJobView({ ...baseRow, id: "job-4", status: "error" }),
    ]);

    assert.deepEqual(summary.byStatus, {
      queued: 1,
      running: 1,
      success: 1,
      error: 1,
    });
    assert.equal(summary.pendingCount, 2);
    assert.equal(summary.totalCount, 4);
  });
});
