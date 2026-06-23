import { NextRequest } from "next/server";
import { db } from "@/db/index";
import { documents, measurements } from "@/db/schema";
import { eq } from "drizzle-orm";
import { prepareReplacementRows, ReparseReplacementSchema } from "@/lib/reparse-preview";
import { indexDocument } from "@/lib/index-document-chunks";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let preview;
  try {
    preview = ReparseReplacementSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "临时解析结果格式错误" }, { status: 400 });
  }

  const [doc] = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, id));
  if (!doc) {
    return Response.json({ error: "未找到" }, { status: 404 });
  }

  const { documentValues, measurementRows } = prepareReplacementRows(id, preview);

  db.transaction((tx) => {
    tx
      .update(documents)
      .set(documentValues)
      .where(eq(documents.id, id))
      .run();

    tx.delete(measurements).where(eq(measurements.documentId, id)).run();

    if (measurementRows.length > 0) {
      tx.insert(measurements).values(measurementRows).run();
    }
  });

  indexDocument(id).catch((err) =>
    console.error("[index-document] reparse 后向量索引失败，可稍后通过回填脚本恢复:", err)
  );

  return Response.json({
    id,
    measurementCount: measurementRows.length,
    ocrLength: documentValues.ocrMarkdown.length,
  });
}
