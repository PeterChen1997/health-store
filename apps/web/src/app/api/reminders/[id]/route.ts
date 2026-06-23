import { db } from "@/db/index";
import { reminders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const PatchSchema = z.object({
  status: z.enum(["active", "done", "dismissed"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "参数错误" }, { status: 400 });
  }
  const { status } = parsed.data;
  const completedAt = status === "done" ? new Date().toISOString() : null;

  await db
    .update(reminders)
    .set({ status, completedAt })
    .where(eq(reminders.id, id));

  const [updated] = await db.select().from(reminders).where(eq(reminders.id, id)).limit(1);
  if (!updated) {
    return Response.json({ error: "未找到" }, { status: 404 });
  }
  return Response.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [existing] = await db.select({ id: reminders.id }).from(reminders).where(eq(reminders.id, id)).limit(1);
  if (!existing) {
    return Response.json({ error: "未找到" }, { status: 404 });
  }
  await db.delete(reminders).where(eq(reminders.id, id));
  return new Response(null, { status: 204 });
}
