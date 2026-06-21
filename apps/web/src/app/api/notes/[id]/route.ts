import { db } from "@/db/index";
import { notes } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [existing] = await db.select({ id: notes.id }).from(notes).where(eq(notes.id, id));
  if (!existing) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  await db.delete(notes).where(eq(notes.id, id));
  return new Response(null, { status: 204 });
}
