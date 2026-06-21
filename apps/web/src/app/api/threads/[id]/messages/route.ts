import { db } from "@/db/index";
import { chatMessages, chatThreads } from "@/db/schema";
import {
  ChatMessageInsertSchema,
  parseStoredMessageContent,
  serializeMessageContent,
} from "@/lib/chat-persistence";
import { asc, eq, sql } from "drizzle-orm";

type ThreadRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, { params }: ThreadRouteContext) {
  const { id } = await params;
  const rows = await db
    .select({
      id: chatMessages.id,
      parentId: chatMessages.parentId,
      format: chatMessages.format,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, id))
    .orderBy(asc(chatMessages.createdAt));

  return Response.json(
    rows.map((row) => ({
      id: row.id,
      parent_id: row.parentId,
      format: row.format,
      content: parseStoredMessageContent(row.content),
      createdAt: row.createdAt,
    })),
  );
}

export async function POST(req: Request, { params }: ThreadRouteContext) {
  const { id: threadId } = await params;
  const parsed = ChatMessageInsertSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid message payload" }, { status: 400 });
  }

  await db
    .insert(chatMessages)
    .values({
      id: parsed.data.id,
      threadId,
      parentId: parsed.data.parent_id,
      format: parsed.data.format,
      content: serializeMessageContent(parsed.data.content),
    })
    .onConflictDoUpdate({
      target: chatMessages.id,
      set: {
        parentId: parsed.data.parent_id,
        format: parsed.data.format,
        content: serializeMessageContent(parsed.data.content),
      },
    });

  await db
    .update(chatThreads)
    .set({ updatedAt: sql`(datetime('now'))` })
    .where(eq(chatThreads.id, threadId));

  return Response.json({ ok: true }, { status: 201 });
}
