import { db } from "@/db/index";
import { reminders } from "@/db/schema";
import { and, count, eq, lte } from "drizzle-orm";

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db
    .select({ total: count() })
    .from(reminders)
    .where(and(eq(reminders.status, "active"), lte(reminders.dueDate, today)));
  return Response.json({ dueOrOverdueCount: row?.total ?? 0 });
}
