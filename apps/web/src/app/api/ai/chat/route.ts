import { db } from "@/db/index";
import { measurements, metricCatalog, notes, documents } from "@/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { streamText, createLanguageModel } from "@/lib/llm";
import { convertToModelMessages, type UIMessage } from "ai";
import { embedQuery } from "@/lib/embedding";
import { retrieveRelevantChunks } from "@/lib/index-document-chunks";

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

function extractLastUserText(messages: UIMessage[]): string {
  const last = messages.filter((m) => m.role === "user").at(-1);
  if (!last) return "";
  return last.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ");
}

async function buildRagContext(query: string): Promise<string> {
  if (!query.trim()) return "";
  try {
    const queryVec = await embedQuery(query);
    const chunks = retrieveRelevantChunks(queryVec, 5);
    if (chunks.length === 0) return "";

    const lines = ["\n=== 相关检查原文（向量检索）==="];
    for (const chunk of chunks) {
      const source = `${chunk.measuredAt} ${chunk.institution ?? ""} ${chunk.documentType}`.trim();
      lines.push(`\n【来源：${source}】\n${chunk.text}`);
    }
    return lines.join("\n");
  } catch (err) {
    console.error("[rag] 检索失败，跳过 RAG 上下文:", err);
    return "";
  }
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const query = extractLastUserText(messages);
  const [healthContext, ragContext] = await Promise.all([
    buildHealthContext(),
    buildRagContext(query),
  ]);

  const systemPrompt = `你是用户的私人健康顾问 AI，拥有用户完整的健康档案数据，能够基于真实数据回答用户的健康问题。

${healthContext}
${ragContext}

=== 行为准则 ===
1. 回答基于用户的实际数据，直接引用具体指标和数值
2. 引用检查原文时，注明来源单据（日期/机构）
3. 用口语化中文，避免过多专业术语
4. 如果数据不足以回答，坦诚说明并建议就医
5. 给出可执行的具体建议，不说废话
6. 所有建议均为参考性质，非医疗诊断
7. 如果用户问到档案中没有的指标，告知用户当前档案暂无该数据`;

  const result = streamText({
    model: createLanguageModel(),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
