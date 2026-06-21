import { db } from "@/db/index";
import { wearableSamples } from "@/db/schema";
import { randomUUID } from "crypto";

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

function extractRecords(xml: string) {
  const records: Array<{ type: string; value: number; unit: string; ts: string }> = [];

  // 用正则流式提取 Record 标签，避免完整 DOM 解析（XML 可达几百 MB）
  const recordRe = /<Record\s[^>]+\/>/g;
  let match: RegExpExecArray | null;

  while ((match = recordRe.exec(xml)) !== null) {
    const tag = match[0];
    const attr = (name: string) => {
      const m = tag.match(new RegExp(`${name}="([^"]*)"`, "i"));
      return m ? m.at(1) ?? "" : "";
    };

    const hkType = attr("type");
    const mapping = SUPPORTED_TYPES[hkType];
    if (!mapping) continue;

    const rawValue = attr("value");
    const startDate = attr("startDate");
    if (!rawValue || !startDate) continue;

    let value = parseFloat(rawValue);
    if (isNaN(value)) continue;

    // Sleep: Apple 存储的是秒，换算成分钟
    if (mapping.type === "sleep") value = Math.round(value / 60);

    // OxygenSaturation：Apple 存 0~1，换算成百分比
    if (mapping.type === "blood_oxygen" && value <= 1) value = Math.round(value * 100);

    records.push({
      type: mapping.type,
      unit: mapping.unit,
      value,
      ts: startDate,
    });
  }

  return records;
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file required" }, { status: 400 });
  }

  const xml = await file.text();
  const records = extractRecords(xml);

  if (records.length === 0) {
    return Response.json({ imported: 0, message: "未找到支持的健康数据类型" });
  }

  // 分批插入，每批 500 条
  const BATCH = 500;
  let imported = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH).map((r) => ({
      id: randomUUID(),
      source: "apple_health" as const,
      type: r.type,
      value: r.value,
      unit: r.unit,
      ts: r.ts,
      createdAt: new Date().toISOString(),
    }));

    await db.insert(wearableSamples).values(batch).onConflictDoNothing();
    imported += batch.length;
  }

  const summary: Record<string, number> = {};
  for (const r of records) {
    summary[r.type] = (summary[r.type] ?? 0) + 1;
  }

  return Response.json({ imported, summary });
}
