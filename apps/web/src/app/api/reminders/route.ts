import { db } from "@/db/index";
import { reminders } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";

export async function GET() {
  const rows = await db
    .select()
    .from(reminders)
    .orderBy(asc(reminders.dueDate));
  return Response.json(rows);
}

const CreateSchema = z.object({
  title: z.string().min(1),
  kind: z.enum(["recheck", "annual_physical", "medication", "custom"]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().optional(),
  relatedMetricId: z.string().optional(),
  relatedDocumentId: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }
  const { title, kind, dueDate, note, relatedMetricId, relatedDocumentId } = parsed.data;

  const id = randomUUID();
  await db.insert(reminders).values({
    id,
    title,
    kind,
    dueDate,
    note: note ?? null,
    relatedMetricId: relatedMetricId ?? null,
    relatedDocumentId: relatedDocumentId ?? null,
    status: "active",
  });

  const [created] = await db.select().from(reminders).where(eq(reminders.id, id)).limit(1);
  return Response.json(created, { status: 201 });
}
