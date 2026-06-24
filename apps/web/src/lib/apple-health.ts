import { createHash } from "crypto";

// 只解析这些类型，避免 XML 爆炸
const SUPPORTED_TYPES: Record<string, { type: string; unit: string }> = {
  HKQuantityTypeIdentifierHeartRate: { type: "heart_rate", unit: "bpm" },
  HKQuantityTypeIdentifierStepCount: { type: "steps", unit: "count" },
  HKQuantityTypeIdentifierOxygenSaturation: { type: "blood_oxygen", unit: "%" },
  HKQuantityTypeIdentifierBodyMass: { type: "body_weight", unit: "kg" },
  HKQuantityTypeIdentifierRestingHeartRate: { type: "resting_heart_rate", unit: "bpm" },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: { type: "hrv", unit: "ms" },
  HKCategoryTypeIdentifierSleepAnalysis: { type: "sleep", unit: "min" },
};

export type WearableSampleInput = {
  type: string;
  value: number;
  unit: string;
  ts: string;
};

// 匹配单个自闭合 <Record .../> 标签。
export const RECORD_TAG_RE = /<Record\s[^>]+?\/?>/g;

// 确定性 id：同一条采样（来源+类型+时间+数值）重复导入得到相同 id，
// 配合 onConflictDoNothing 实现幂等，避免重复导入数据翻倍。
export function appleHealthSampleId(source: string, sample: WearableSampleInput): string {
  return createHash("md5")
    .update(`${source}|${sample.type}|${sample.ts}|${sample.value}`)
    .digest("hex");
}

// 解析单个 <Record .../> 标签为受支持的可穿戴采样；不支持/无效返回 null。
export function parseAppleHealthRecord(tag: string): WearableSampleInput | null {
  const attr = (name: string) => {
    const m = tag.match(new RegExp(`${name}="([^"]*)"`, "i"));
    return m ? (m.at(1) ?? "") : "";
  };

  const mapping = SUPPORTED_TYPES[attr("type")];
  if (!mapping) return null;

  const rawValue = attr("value");
  const startDate = attr("startDate");
  if (!rawValue || !startDate) return null;

  let value = parseFloat(rawValue);
  if (Number.isNaN(value)) return null;

  // Sleep: Apple 存储的是秒，换算成分钟
  if (mapping.type === "sleep") value = Math.round(value / 60);
  // OxygenSaturation：Apple 存 0~1，换算成百分比
  if (mapping.type === "blood_oxygen" && value <= 1) value = Math.round(value * 100);

  return { type: mapping.type, unit: mapping.unit, value, ts: startDate };
}

// 从一整段文本中提取受支持的采样（供单测使用；线上走流式）。
export function extractAppleHealthRecords(xml: string): WearableSampleInput[] {
  const records: WearableSampleInput[] = [];
  for (const match of xml.matchAll(RECORD_TAG_RE)) {
    const sample = parseAppleHealthRecord(match[0]);
    if (sample) records.push(sample);
  }
  return records;
}
