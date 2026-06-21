import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("document detail page layout", () => {
  it("keeps long titles from pushing the action buttons below the header", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

    assert.match(source, /lg:grid-cols-\[minmax\(0,1fr\)_auto\]/);
    assert.match(source, /max-w-\[48rem\]/);
    assert.match(source, /lg:w-\[22rem\]/);
    assert.match(source, /shrink-0/);
  });
});
