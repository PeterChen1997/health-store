import { test } from "node:test";
import assert from "node:assert/strict";
import { matchMetricId, normalizeMetricName, type MetricCatalogEntry } from "./metric-match";

// 取自真实种子词典中容易互相串味的几条
const catalog: MetricCatalogEntry[] = [
  { id: "tc", standardName: "总胆固醇", aliases: ["TC", "CHOL", "胆固醇"] },
  { id: "hdl", standardName: "高密度脂蛋白胆固醇", aliases: ["HDL-C", "HDL", "高密度脂蛋白"] },
  { id: "ldl", standardName: "低密度脂蛋白胆固醇", aliases: ["LDL-C", "LDL", "低密度脂蛋白"] },
  { id: "ca", standardName: "血钙", aliases: ["Ca", "Ca2+", "calcium", "钙"] },
  { id: "k", standardName: "血钾", aliases: ["K", "K+", "potassium", "钾"] },
  { id: "alt", standardName: "谷丙转氨酶", aliases: ["ALT", "丙氨酸氨基转移酶", "谷丙"] },
];

test("normalizeMetricName 去序号/标点/连字符并大写", () => {
  assert.equal(normalizeMetricName(" 1. HDL-C "), "HDLC");
  assert.equal(normalizeMetricName("高密度脂蛋白胆固醇"), "高密度脂蛋白胆固醇");
});

test("精确匹配胜过更短别名的子串匹配", () => {
  // 关键回归：旧版会因 tc 别名 '胆固醇' 排在前面而把 HDL/LDL 误判为总胆固醇
  assert.equal(matchMetricId("高密度脂蛋白胆固醇", catalog), "hdl");
  assert.equal(matchMetricId("低密度脂蛋白胆固醇", catalog), "ldl");
  assert.equal(matchMetricId("总胆固醇", catalog), "tc");
});

test("纯 '胆固醇' 仍归一到总胆固醇", () => {
  assert.equal(matchMetricId("胆固醇", catalog), "tc");
});

test("短别名不参与子串匹配，避免 CA199 / K 串味", () => {
  assert.equal(matchMetricId("CA199", catalog), null);
  assert.equal(matchMetricId("CA15-3", catalog), null);
  // 但精确的电解质代号仍可命中
  assert.equal(matchMetricId("Ca", catalog), "ca");
  assert.equal(matchMetricId("K", catalog), "k");
  assert.equal(matchMetricId("钾", catalog), "k");
});

test("常规别名与中文全名匹配", () => {
  assert.equal(matchMetricId("ALT", catalog), "alt");
  assert.equal(matchMetricId("丙氨酸氨基转移酶", catalog), "alt");
  assert.equal(matchMetricId("谷丙转氨酶", catalog), "alt");
});

test("无法匹配返回 null", () => {
  assert.equal(matchMetricId("某种未知肿瘤标志物", catalog), null);
  assert.equal(matchMetricId("", catalog), null);
});
