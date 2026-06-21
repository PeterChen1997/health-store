import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DESKTOP_SIDEBAR_CLASS } from "./AppShell";

describe("AppShell layout", () => {
  it("keeps the desktop sidebar constrained to the viewport height", () => {
    const classes = DESKTOP_SIDEBAR_CLASS.split(/\s+/);

    assert.ok(classes.includes("h-screen"));
    assert.ok(classes.includes("self-start"));
    assert.ok(classes.includes("sticky"));
    assert.ok(classes.includes("top-0"));
    assert.ok(classes.includes("overflow-y-auto"));
  });

  it("does not render the redundant global medical disclaimer footer", () => {
    const source = readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");

    assert.ok(!source.includes("<footer"));
    assert.ok(!source.includes("以上内容仅供参考，不构成医疗诊断，不替代医生建议。"));
  });
});
