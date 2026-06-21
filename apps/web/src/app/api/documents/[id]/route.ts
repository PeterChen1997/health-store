import { NextRequest } from "next/server";
import path from "path";
import { db } from "@/db/index";
import { documents, measurements, metricCatalog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { deleteDocument } from "@/lib/delete-document";

const UPLOADS_DIR = path.resolve(process.cwd(), "../../data/uploads");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) {
    return Response.json({ error: "未找到" }, { status: 404 });
  }

  const measurementRows = await db
    .select({
      id: measurements.id,
      rawName: measurements.rawName,
      value: measurements.value,
      unit: measurements.unit,
      refLow: measurements.refLow,
      refHigh: measurements.refHigh,
      flag: measurements.flag,
      metricId: measurements.metricId,
      standardName: metricCatalog.standardName,
    })
    .from(measurements)
    .leftJoin(metricCatalog, eq(measurements.metricId, metricCatalog.id))
    .where(eq(measurements.documentId, id));

  return Response.json({ doc, measurements: measurementRows });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await deleteDocument(id, { uploadsDir: UPLOADS_DIR });

  if (!result.deleted) {
    return Response.json({ error: "未找到" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
