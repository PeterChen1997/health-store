import { db } from "@/db/index";
import { notes } from "@/db/schema";
import { desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { generateStructured } from "@/lib/llm";
import { z } from "zod";

const NoteClassifySchema = z.object({
  tags: z.array(z.string()).max(4),
  summary: z.string().max(100),
});

export async function GET() {
  const rows = await db.select().from(notes).orderBy(desc(notes.createdAt));
  return Response.json(rows);
}

const NoteInputSchema = z.object({
  content: z.string().min(1, "content required"),
  relatedAt: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = NoteInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "content required" }, { status: 400 });
  }
  const { content, relatedAt } = parsed.data;

  let aiTags: string[] = [];
  let aiSummary: string | null = null;

  try {
    const result = await generateStructured(
      NoteClassifySchema,
      `请分析以下健康笔记，提取标签并生成摘要。
标签类型举例：症状、用药、饮食、睡眠、运动、就诊、情绪、过敏、手术、其他。
每条笔记最多 4 个标签，摘要不超过 50 字。

笔记内容：
${content}`
    );
    aiTags = result.tags;
    aiSummary = result.summary;
  } catch {
    // AI 分类失败不阻断保存
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  const [row] = await db
    .insert(notes)
    .values({
      id,
      content,
      aiTags: JSON.stringify(aiTags),
      aiSummary,
      relatedAt: relatedAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return Response.json(row, { status: 201 });
}
