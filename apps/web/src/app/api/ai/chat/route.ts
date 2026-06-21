import { db } from "@/db/index";
import { measurements, metricCatalog, notes, documents } from "@/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { streamText, createLanguageModel } from "@/lib/llm";
import { convertToModelMessages, type UIMessage } from "ai";

async function buildHealthContext(): Promise<string> {
  const rows = await db
    .select({
      rawName: measurements.rawName,
      value: measurements.value,
      unit: measurements.unit,
      flag: measurements.flag,
      measuredAt: measurements.measuredAt,
      standardName: metricCatalog.standardName,
      category: metricCatalog.category,
    })
    .from(measurements)
    .leftJoin(metricCatalog, eq(measurements.metricId, metricCatalog.id))
    .orderBy(asc(measurements.measuredAt));

  const docRows = await db
    .select({ institution: documents.institution, measuredAt: documents.measuredAt, documentType: documents.documentType })
    .from(documents)
    .orderBy(desc(documents.measuredAt));

  const noteRows = await db
    .select({ content: notes.content, aiSummary: notes.aiSummary, createdAt: notes.createdAt })
    .from(notes)
    .orderBy(desc(notes.createdAt))
    .limit(10);

  const abnormal = rows.filter((r) => r.flag !== "normal");
  const normal = rows.filter((r) => r.flag === "normal");

  const lines: string[] = ["=== 用户健康档案概览 ==="];

  if (docRows.length > 0) {
    lines.push("\n【检查记录】");
    docRows.forEach((d) => {
      lines.push(`- ${d.measuredAt} ${d.institution ?? ""} ${d.documentType}`);
    });
  }

  if (abnormal.length > 0) {
    lines.push("\n【异常指标】");
    abnormal.forEach((m) => {
      const name = m.standardName ?? m.rawName;
      lines.push(`- ${name}: ${m.value} ${m.unit} [${m.flag}] (${m.measuredAt})`);
    });
  }

  if (normal.length > 0) {
    lines.push(`\n【正常指标】共 ${normal.length} 项在正常范围内`);
  }

  if (noteRows.length > 0) {
    lines.push("\n【近期笔记】");
    noteRows.forEach((n) => {
      lines.push(`- ${n.createdAt.slice(0, 10)}: ${n.aiSummary ?? n.content.slice(0, 80)}`);
    });
  }

  return lines.join("\n");
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const healthContext = await buildHealthContext();

  const systemPrompt = `你是用户的私人健康顾问 AI，拥有用户完整的健康档案数据，能够基于真实数据回答用户的健康问题。

${healthContext}

=== 行为准则 ===
1. 回答基于用户的实际数据，直接引用具体指标和数值
2. 用口语化中文，避免过多专业术语
3. 如果数据不足以回答，坦诚说明并建议就医
4. 给出可执行的具体建议，不说废话
5. 所有建议均为参考性质，非医疗诊断
6. 如果用户问到档案中没有的指标，告知用户当前档案暂无该数据`;

  const result = streamText({
    model: createLanguageModel(),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
