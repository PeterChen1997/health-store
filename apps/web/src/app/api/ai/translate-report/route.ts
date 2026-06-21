import { db } from "@/db/index";
import { documents, measurements, metricCatalog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateStructured } from "@/lib/llm";
import { z } from "zod";

const TranslationSchema = z.object({
  summary: z.string().describe("一段话概括本次检查的总体情况，口语化，不超过80字"),
  key_findings: z.array(z.string()).describe("3-5条关键发现，每条一句话"),
  abnormal_items: z
    .array(
      z.object({
        name: z.string(),
        value: z.string().describe("数值+单位，如 '4.1 kUA/L'"),
        interpretation: z.string().describe("用大白话解释偏高/偏低意味着什么，30字以内"),
        suggestion: z.string().describe("一条可执行建议"),
      })
    )
    .describe("所有异常指标，最多8条"),
  overall_advice: z.string().describe("总体生活方式建议，2-3条，每条一句话，换行分隔"),
});

export type TranslationResult = z.infer<typeof TranslationSchema>;

const TranslateInputSchema = z.object({ documentId: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = TranslateInputSchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "missing documentId" }, { status: 400 });
  const { documentId } = parsed.data;

  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) return Response.json({ error: "not found" }, { status: 404 });

  const measurementRows = await db
    .select({
      rawName: measurements.rawName,
      value: measurements.value,
      unit: measurements.unit,
      flag: measurements.flag,
      refLow: measurements.refLow,
      refHigh: measurements.refHigh,
      standardName: metricCatalog.standardName,
    })
    .from(measurements)
    .leftJoin(metricCatalog, eq(measurements.metricId, metricCatalog.id))
    .where(eq(measurements.documentId, documentId));

  const measurementsText = measurementRows
    .map((m) => {
      const name = m.standardName ?? m.rawName;
      const ref = m.refLow != null && m.refHigh != null ? `参考范围 ${m.refLow}-${m.refHigh}` : "";
      const flagStr = m.flag !== "normal" ? `【${m.flag}】` : "";
      return `- ${name}: ${m.value} ${m.unit} ${ref} ${flagStr}`.trim();
    })
    .join("\n");

  const ocrText = doc.ocrMarkdown?.slice(0, 3000) ?? "（无OCR文本）";

  const prompt = `你是一位经验丰富的健康顾问，擅长用通俗易懂的语言解读医学检查报告。

以下是一份来自「${doc.institution ?? "医疗机构"}」的${
    doc.documentType === "blood_test"
      ? "化验单"
      : doc.documentType === "physical"
        ? "体检报告"
        : doc.documentType === "imaging"
          ? "影像报告"
          : "检查报告"
  }（检查日期：${doc.measuredAt}）。

${measurementRows.length > 0 ? `【结构化指标数据】\n${measurementsText}` : ""}

${ocrText !== "（无OCR文本）" ? `【OCR原文节选】\n${ocrText}` : ""}

请用大白话解读这份报告，帮助用户理解检查结果。注意：
1. 使用口语化中文，避免专业术语
2. 对异常指标给出可执行的具体建议
3. 保持客观，不过度渲染，不夸大风险
4. 所有建议均为参考性质，非医疗诊断`;

  try {
    const result = await generateStructured(TranslationSchema, prompt);
    return Response.json(result);
  } catch (e) {
    console.error("[translate-report]", e);
    return Response.json({ error: "报告解读生成失败，请稍后再试" }, { status: 500 });
  }
}
