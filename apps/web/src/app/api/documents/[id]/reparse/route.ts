import { NextRequest } from "next/server";
import { db } from "@/db/index";
import { documents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createAsyncJobService } from "@/lib/async-jobs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) {
    return Response.json({ error: "未找到" }, { status: 404 });
  }

  const { job } = await createAsyncJobService().enqueue({
    type: "document_reparse",
    resourceId: id,
    input: { documentId: id },
  });

  return Response.json({
    jobId: job.id,
    status: job.status,
  }, { status: 202 });
}
