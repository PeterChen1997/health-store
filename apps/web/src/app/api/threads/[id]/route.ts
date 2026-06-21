import { db } from "@/db/index";
import { chatThreads } from "@/db/schema";
import { ChatThreadPatchSchema } from "@/lib/chat-persistence";
import { eq, sql } from "drizzle-orm";

type ThreadRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, { params }: ThreadRouteContext) {
  const { id } = await params;
  const thread = await db
    .select({
      id: chatThreads.id,
      title: chatThreads.title,
      status: chatThreads.status,
      createdAt: chatThreads.createdAt,
      updatedAt: chatThreads.updatedAt,
    })
    .from(chatThreads)
    .where(eq(chatThreads.id, id))
    .limit(1);

  const item = thread.at(0);
  if (!item) return Response.json({ error: "Thread not found" }, { status: 404 });
  return Response.json(item);
}

export async function PATCH(req: Request, { params }: ThreadRouteContext) {
  const { id } = await params;
  const parsed = ChatThreadPatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid thread payload" }, { status: 400 });
  }

  await db
    .update(chatThreads)
    .set({
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(chatThreads.id, id));

  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: ThreadRouteContext) {
  const { id } = await params;
  await db.delete(chatThreads).where(eq(chatThreads.id, id));
  return new Response(null, { status: 204 });
}
