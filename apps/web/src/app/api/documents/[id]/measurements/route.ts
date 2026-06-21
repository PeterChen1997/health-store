import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db/index";
import { documents, measurements } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalizeMetric } from "@/lib/extract";

const MeasurementInputSchema = z.object({
  rawName: z.string().min(1),
  value: z.number(),
  unit: z.string(),
  refLow: z.number().nullable(),
  refHigh: z.number().nullable(),
});

const BodySchema = z.object({
  measurements: z.array(MeasurementInputSchema),
});

function calcFlag(
  value: number,
  refLow: number | null,
  refHigh: number | null
): string {
  if (refLow == null && refHigh == null) return "normal";
  if (refHigh != null && value > refHigh * 1.5) return "critical_high";
  if (refLow != null && refLow > 0 && value < refLow * 0.5) return "critical_low";
  if (refHigh != null && value > refHigh) return "high";
  if (refLow != null && value < refLow) return "low";
  return "normal";
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [doc] = await db
    .select({ measuredAt: documents.measuredAt })
    .from(documents)
    .where(eq(documents.id, id));

  if (!doc) {
    return Response.json({ error: "文档不存在" }, { status: 404 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "参数格式错误" }, { status: 400 });
  }

  await db.delete(measurements).where(eq(measurements.documentId, id));

  if (body.measurements.length > 0) {
    const newRows = await Promise.all(
      body.measurements.map(async (m) => {
        const metricId = await normalizeMetric(m.rawName);
        return {
          id: crypto.randomUUID(),
          documentId: id,
          metricId,
          rawName: m.rawName,
          value: m.value,
          unit: m.unit,
          refLow: m.refLow,
          refHigh: m.refHigh,
          flag: calcFlag(m.value, m.refLow, m.refHigh),
          measuredAt: doc.measuredAt,
        };
      })
    );
    await db.insert(measurements).values(newRows);
  }

  return Response.json({ count: body.measurements.length });
}
