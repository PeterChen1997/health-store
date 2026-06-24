import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  buildRecheckSuggestions,
  type AbnormalMetricInput,
} from "./reminder-suggestions";

test("addMonths 按日历月进位", () => {
  assert.equal(addMonths("2026-01-15", 3), "2026-04-15");
  assert.equal(addMonths("2026-11-30", 3), "2027-02-28"); // 月末溢出回退
  assert.equal(addMonths("2026-06-24T08:00:00 +0800", 1), "2026-07-24");
});

const ua: AbnormalMetricInput = {
  metricId: "ua",
  displayName: "尿酸",
  flag: "high",
  value: 520,
  unit: "μmol/L",
  measuredAt: "2026-03-01",
  documentId: "doc-1",
};

test("一般异常 3 个月复查、危急值 1 个月复查", () => {
  const [s] = buildRecheckSuggestions([ua], []);
  assert.equal(s?.title, "复查尿酸");
  assert.equal(s?.kind, "recheck");
  assert.equal(s?.dueDate, "2026-06-01");
  assert.equal(s?.relatedMetricId, "ua");
  assert.equal(s?.relatedDocumentId, "doc-1");

  const [c] = buildRecheckSuggestions([{ ...ua, flag: "critical_high" }], []);
  assert.equal(c?.dueDate, "2026-04-01");
});

test("正常指标不产生建议", () => {
  assert.equal(buildRecheckSuggestions([{ ...ua, flag: "normal" }], []).length, 0);
});

test("已有同指标活跃提醒则跳过", () => {
  const out = buildRecheckSuggestions([ua], [
    { relatedMetricId: "ua", title: "随便什么标题", status: "active" },
  ]);
  assert.equal(out.length, 0);
});

test("已有同标题活跃提醒则跳过；已完成的不算占位", () => {
  assert.equal(
    buildRecheckSuggestions([ua], [{ relatedMetricId: null, title: "复查尿酸", status: "active" }]).length,
    0
  );
  assert.equal(
    buildRecheckSuggestions([ua], [{ relatedMetricId: "ua", title: "复查尿酸", status: "done" }]).length,
    1
  );
});

test("同指标多条异常只建议一次", () => {
  const out = buildRecheckSuggestions([ua, { ...ua, measuredAt: "2026-04-01", value: 530 }], []);
  assert.equal(out.length, 1);
});
