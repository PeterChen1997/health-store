import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DELETE_DOCUMENT_CONFIRM_TEXT } from "./DeleteDocumentButton";

describe("DeleteDocumentButton", () => {
  it("uses an explicit destructive confirmation message", () => {
    assert.match(DELETE_DOCUMENT_CONFIRM_TEXT, /确认删除/);
    assert.match(DELETE_DOCUMENT_CONFIRM_TEXT, /无法撤销/);
  });

  it("redirects to the provided target after deletion succeeds", () => {
    const source = readFileSync(new URL("./DeleteDocumentButton.tsx", import.meta.url), "utf8");

    assert.match(source, /redirectHref/);
    assert.match(source, /router\.push\(redirectHref\)/);
  });
});
