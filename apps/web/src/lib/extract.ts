/**
 * LLM 结构化抽取 + 指标归一
 * 输入：OCR 文本
 * 输出：文档元信息 + 归一后的测量值列表
 */
import { z } from "zod";
import { generateStructured } from "./llm";
import { db } from "@/db/index";
import { metricCatalog } from "@/db/schema";

// OCR → LLM 抽取的原始 schema
const RawMeasurementSchema = z.object({
  raw_name: z.string().describe("OCR 中原始指标名，原样保留"),
  value: z.number().describe("数值"),
  unit: z.string().describe("单位"),
  ref_low: z.number().nullable().describe("参考范围下限，无则 null"),
  ref_high: z.number().nullable().describe("参考范围上限，无则 null"),
  flag: z.enum(["normal", "high", "low", "critical_high", "critical_low"])
    .describe("箭头或标注：正常/偏高/偏低/危急高/危急低"),
});

const ExtractionSchema = z.object({
  document_type: z.enum(["blood_test", "physical", "imaging", "clinic_note", "other"])
    .describe("单据类型"),
  institution: z.string().nullable().describe("医院/机构名称，无则 null"),
  measured_at: z.string().describe("采集/就诊日期 YYYY-MM-DD，无法识别则用今天"),
  measurements: z.array(RawMeasurementSchema)
    .describe("所有含数值的指标行，门诊病历无指标时返回空数组"),
});

export type ExtractionResult = z.infer<typeof ExtractionSchema>;
export type RawMeasurement = z.infer<typeof RawMeasurementSchema>;

export async function extractFromOcr(ocrText: string): Promise<ExtractionResult> {
  const today = new Date().toISOString().slice(0, 10);
  return generateStructured(
    ExtractionSchema,
    `你是医疗文档解析专家。以下是一份医疗单据的 OCR 识别文本，请结构化提取其中的信息。
今天日期是 ${today}，若无法识别日期则用今天。
对于含数值的检验指标行（如"谷丙转氨酶 25 U/L ↑"），逐行提取。
对于门诊病历、影像报告等无数值指标的单据，measurements 返回空数组。

OCR 文本：
${ocrText}`
  );
}

// 指标归一：raw_name → metric_catalog.id
// 策略：alias 精确/模糊匹配，匹配不上则 null
type CatalogEntry = { id: string; standardName: string; aliases: string[] };
let _catalog: CatalogEntry[] = [];
let _catalogLoaded = false;

async function getCatalog(): Promise<CatalogEntry[]> {
  if (_catalogLoaded) return _catalog;
  const rows = await db.select({
    id: metricCatalog.id,
    standardName: metricCatalog.standardName,
    aliases: metricCatalog.aliases,
  }).from(metricCatalog);
  _catalog = rows.map((r) => ({
    id: r.id,
    standardName: r.standardName,
    aliases: JSON.parse(r.aliases) as string[],
  }));
  _catalogLoaded = true;
  return _catalog;
}

export async function normalizeMetric(rawName: string): Promise<string | null> {
  const catalog = await getCatalog();
  const needle = rawName.trim().toUpperCase();

  for (const entry of catalog) {
    const targets = [entry.standardName, ...entry.aliases].map((s) => s.toUpperCase());
    if (targets.some((t) => t === needle || needle.includes(t) || t.includes(needle))) {
      return entry.id;
    }
  }
  return null;
}
