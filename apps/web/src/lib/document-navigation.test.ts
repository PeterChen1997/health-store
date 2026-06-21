import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAdjacentDocumentIds,
  getDocumentDeleteRedirectHref,
  sortDocumentNavigationRows,
} from "./document-navigation";

describe("document detail navigation", () => {
  it("uses the documents list order for previous and next document ids", () => {
    const rows = [
      { id: "older", measuredAt: "2024-01-02", createdAt: "2026-01-01T09:00:00.000Z" },
      { id: "newest", measuredAt: "2024-03-01", createdAt: "2026-01-01T09:00:00.000Z" },
      { id: "middle", measuredAt: "2024-02-01", createdAt: "2026-01-01T09:00:00.000Z" },
    ];

    assert.deepEqual(sortDocumentNavigationRows(rows).map((row) => row.id), [
      "newest",
      "middle",
      "older",
    ]);
    assert.deepEqual(getAdjacentDocumentIds(rows, "middle"), {
      previousId: "newest",
      nextId: "older",
    });
  });

  it("breaks same-date ties by created date and id for stable navigation", () => {
    const rows = [
      { id: "c", measuredAt: "2024-02-01", createdAt: "2026-01-01T09:00:00.000Z" },
      { id: "a", measuredAt: "2024-02-01", createdAt: "2026-01-01T10:00:00.000Z" },
      { id: "b", measuredAt: "2024-02-01", createdAt: "2026-01-01T10:00:00.000Z" },
    ];

    assert.deepEqual(sortDocumentNavigationRows(rows).map((row) => row.id), ["a", "b", "c"]);
    assert.deepEqual(getAdjacentDocumentIds(rows, "a"), {
      previousId: null,
      nextId: "b",
    });
  });

  it("redirects after deletion to previous, then next, then the list", () => {
    assert.equal(
      getDocumentDeleteRedirectHref({ previousId: "previous-doc", nextId: "next-doc" }),
      "/documents/previous-doc",
    );
    assert.equal(
      getDocumentDeleteRedirectHref({ previousId: null, nextId: "next-doc" }),
      "/documents/next-doc",
    );
    assert.equal(
      getDocumentDeleteRedirectHref({ previousId: null, nextId: null }),
      "/documents",
    );
  });
});
