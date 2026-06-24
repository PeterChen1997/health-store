import { db } from "@/db/index";
import { measurements, metricCatalog, documents } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { generateStructured } from "@/lib/llm";
import { z } from "zod";

const InsightSchema = z.object({
  overall_status: z.enum(["优秀", "良好", "需关注", "建议就医"]),
  headline: z.string().describe("一句话概括整体健康状态，20字以内"),
  alerts: z
    .array(
      z.object({
        metric: z.string().describe("指标名称"),
        value: z.string().describe("数值+单位"),
        severity: z.enum(["注意", "关注", "重要"]),
        finding: z.string().describe("说明这个值意味着什么，口语化，30字以内"),
        action: z.string().describe("一条可立即执行的建议"),
      })
    )
    .describe("需要关注的异常指标，按严重程度排序，最多6条"),
  system_summary: z
    .array(
      z.object({
        system: z.string().describe("系统名称，如血脂、免疫/过敏、肾功能等"),
        status: z.enum(["正常", "轻度异常", "需关注"]),
        note: z.string().describe("一句话说明，20字以内"),
      })
    )
    .describe("各身体系统状态概览"),
  recommendations: z.array(z.string()).describe("3-5条可执行的生活方式建议"),
  positives: z.array(z.string()).describe("1-3条正向发现，鼓励用户"),
});

export type InsightResult = z.infer<typeof InsightSchema>;

export async function GET() {
  // 拉取所有测量值
  const allRows = await db
    .select({
      metricId: measurements.metricId,
      rawName: measurements.rawName,
      value: measurements.value,
      unit: measurements.unit,
      flag: measurements.flag,
      measuredAt: measurements.measuredAt,
      refLow: measurements.refLow,
      refHigh: measurements.refHigh,
      standardName: metricCatalog.standardName,
      category: metricCatalog.category,
      documentId: measurements.documentId,
    })
    .from(measurements)
    .leftJoin(metricCatalog, eq(measurements.metricId, metricCatalog.id))
    .orderBy(asc(measurements.measuredAt));

  if (allRows.length === 0) {
    return Response.json({ error: "no_data" }, { status: 404 });
  }

  // 收敛到"每个指标最新一次"，避免同一指标历次记录刷屏并撑爆上下文。
  const latestByMetric = new Map<string, (typeof allRows)[number]>();
  for (const row of allRows) {
    latestByMetric.set(row.metricId ?? `raw:${row.rawName}`, row);
  }
  const rows = Array.from(latestByMetric.values());

  // 文档摘要（来源和日期）：仅取与这些指标相关的单据
  const docIds = [...new Set(rows.map((r) => r.documentId).filter(Boolean))] as string[];
  const docRows = docIds.length
    ? await db
        .select({ id: documents.id, institution: documents.institution, measuredAt: documents.measuredAt, documentType: documents.documentType })
        .from(documents)
        .where(inArray(documents.id, docIds))
    : [];

  const docContext = docRows
    .map((d) => `${d.measuredAt} ${d.institution ?? ""} ${d.documentType}`)
    .join("；");

  // 构建指标摘要文本
  const abnormal = rows.filter((r) => r.flag !== "normal");
  const normal = rows.filter((r) => r.flag === "normal");

  const metricsText = [
    "【异常指标】",
    ...abnormal.map((m) => {
      const name = m.standardName ?? m.rawName;
      const ref = m.refLow != null && m.refHigh != null ? ` (参考 ${m.refLow}-${m.refHigh})` : "";
      return `  ${name}: ${m.value} ${m.unit}${ref} [${m.flag}] ${m.measuredAt}`;
    }),
    "",
    "【正常指标摘要】",
    `  共 ${normal.length} 项在正常范围内`,
  ].join("\n");

  const prompt = `你是一位经验丰富的健康顾问，擅长综合分析多份医疗检查数据。

以下是用户的健康检查数据汇总（来源：${docContext || "检查单据"}）：

${metricsText}

总计 ${rows.length} 项指标，其中 ${abnormal.length} 项异常，${normal.length} 项正常。

请综合分析，给出全面的个人健康洞察报告。要求：
1. 客观准确，不夸大风险，不虚假安抚
2. 建议具体可执行，避免泛泛而谈
3. 如有过敏原数据，重点说明需要避免的食物/环境因素
4. 所有建议均为参考性质，非医疗诊断，用户应遵医嘱`;

  try {
    const result = await generateStructured(InsightSchema, prompt);
    return Response.json(result);
  } catch (e) {
    console.error("[insights]", e);
    return Response.json({ error: "健康洞察生成失败，请稍后再试" }, { status: 500 });
  }
}
