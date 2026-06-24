import { db } from "@/db/index";
import { wearableSamples } from "@/db/schema";
import {
  appleHealthSampleId,
  parseAppleHealthRecord,
  RECORD_TAG_RE,
  type WearableSampleInput,
} from "@/lib/apple-health";

const SOURCE = "apple_health";
const BATCH = 500;

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file required" }, { status: 400 });
  }

  const summary: Record<string, number> = {};
  let imported = 0;
  let scanned = 0;
  let batch: Array<typeof wearableSamples.$inferInsert> = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const inserted = await db
      .insert(wearableSamples)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: wearableSamples.id });
    imported += inserted.length;
    batch = [];
  };

  const handle = async (sample: WearableSampleInput) => {
    scanned += 1;
    summary[sample.type] = (summary[sample.type] ?? 0) + 1;
    batch.push({
      id: appleHealthSampleId(SOURCE, sample),
      source: SOURCE,
      type: sample.type,
      value: sample.value,
      unit: sample.unit,
      ts: sample.ts,
      createdAt: new Date().toISOString(),
    });
    if (batch.length >= BATCH) await flush();
  };

  // 流式解析：逐块解码并就地提取 Record，避免把可达数百 MB 的
  // export.xml 全量驻留为 JS 字符串/数组。
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let carry = "";

  const drainCarry = async () => {
    let lastEnd = 0;
    for (const match of carry.matchAll(RECORD_TAG_RE)) {
      const sample = parseAppleHealthRecord(match[0]);
      if (sample) await handle(sample);
      lastEnd = (match.index ?? 0) + match[0].length;
    }
    // 保留尾部（可能是被切断的半个标签），从最后一个完整标签后截断。
    if (lastEnd > 0) carry = carry.slice(lastEnd);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });
    if (carry.length > 1_000_000) await drainCarry();
  }
  carry += decoder.decode();
  await drainCarry();
  await flush();

  if (scanned === 0) {
    return Response.json({ imported: 0, message: "未找到支持的健康数据类型" });
  }

  return Response.json({ imported, scanned, duplicates: scanned - imported, summary });
}
