import { db } from "@/db/index";
import { chatThreads } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  const threads = await db
    .select({
      id: chatThreads.id,
      title: chatThreads.title,
      status: chatThreads.status,
      createdAt: chatThreads.createdAt,
      updatedAt: chatThreads.updatedAt,
    })
    .from(chatThreads)
    .where(eq(chatThreads.status, "regular"))
    .orderBy(desc(chatThreads.updatedAt));

  return Response.json(threads);
}

export async function POST() {
  const id = crypto.randomUUID();
  await db.insert(chatThreads).values({ id });
  return Response.json({ id }, { status: 201 });
}
