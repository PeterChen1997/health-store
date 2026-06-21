import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("ChatClient layout", () => {
  it("does not force the chat panel taller than the viewport space", () => {
    const source = readFileSync(new URL("./ChatClient.tsx", import.meta.url), "utf8");

    assert.ok(!source.includes("min-h-[560px]"));
    assert.ok(source.includes("h-[calc(100vh-224px)]"));
  });
});
