import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appleHealthSampleId,
  extractAppleHealthRecords,
  parseAppleHealthRecord,
} from "./apple-health";

test("解析受支持的心率记录", () => {
  const tag = '<Record type="HKQuantityTypeIdentifierHeartRate" value="72" startDate="2026-01-01 08:00:00 +0800" />';
  assert.deepEqual(parseAppleHealthRecord(tag), {
    type: "heart_rate",
    unit: "bpm",
    value: 72,
    ts: "2026-01-01 08:00:00 +0800",
  });
});

test("血氧 0~1 换算成百分比", () => {
  const tag = '<Record type="HKQuantityTypeIdentifierOxygenSaturation" value="0.98" startDate="2026-01-01 08:00:00 +0800"/>';
  assert.equal(parseAppleHealthRecord(tag)?.value, 98);
});

test("不支持的类型与无效值返回 null", () => {
  assert.equal(parseAppleHealthRecord('<Record type="HKQuantityTypeIdentifierBodyFatPercentage" value="20" startDate="x"/>'), null);
  assert.equal(parseAppleHealthRecord('<Record type="HKQuantityTypeIdentifierHeartRate" value="abc" startDate="x"/>'), null);
  assert.equal(parseAppleHealthRecord('<Record type="HKQuantityTypeIdentifierHeartRate" startDate="x"/>'), null);
});

test("从整段 XML 提取多条记录", () => {
  const xml = `
    <HealthData>
      <Record type="HKQuantityTypeIdentifierStepCount" value="1200" startDate="2026-01-01 08:00:00 +0800"/>
      <Record type="HKQuantityTypeIdentifierBodyMass" value="70.5" startDate="2026-01-02 08:00:00 +0800"/>
      <Record type="HKQuantityTypeIdentifierUnsupported" value="1" startDate="x"/>
    </HealthData>`;
  const records = extractAppleHealthRecords(xml);
  assert.equal(records.length, 2);
  assert.equal(records.at(0)?.type, "steps");
  assert.equal(records.at(1)?.value, 70.5);
});

test("确定性 id：相同采样得到相同 id，不同采样不同 id（保证重复导入幂等）", () => {
  const a = { type: "steps", value: 1200, unit: "count", ts: "2026-01-01 08:00:00 +0800" };
  const b = { type: "steps", value: 1300, unit: "count", ts: "2026-01-01 08:00:00 +0800" };
  assert.equal(appleHealthSampleId("apple_health", a), appleHealthSampleId("apple_health", a));
  assert.notEqual(appleHealthSampleId("apple_health", a), appleHealthSampleId("apple_health", b));
});
