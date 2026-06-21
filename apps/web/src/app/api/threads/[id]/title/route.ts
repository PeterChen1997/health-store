import { generateText, createLanguageModel } from "@/lib/llm";
import { db } from "@/db/index";
import { chatThreads } from "@/db/schema";
import {
  buildFallbackThreadTitle,
  buildTitlePrompt,
  normalizeGeneratedThreadTitle,
} from "@/lib/chat-persistence";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const TitleRequestSchema = z.object({
  messages: z.array(z.unknown()).default([]),
});

type ThreadTitleRouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, { params }: ThreadTitleRouteContext) {
  const { id } = await params;
  const parsed = TitleRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid title payload" }, { status: 400 });
  }

  const fallback = buildFallbackThreadTitle(parsed.data.messages);
  let title = fallback;

  try {
    const { text } = await generateText({
      model: createLanguageModel(),
      prompt: buildTitlePrompt(parsed.data.messages),
    });
    title = normalizeGeneratedThreadTitle(text, fallback);
  } catch {
    title = fallback;
  }

  await db
    .update(chatThreads)
    .set({ title, updatedAt: sql`(datetime('now'))` })
    .where(eq(chatThreads.id, id));

  return Response.json({ title });
}
