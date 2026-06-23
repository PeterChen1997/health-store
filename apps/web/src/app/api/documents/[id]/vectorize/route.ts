import { NextRequest } from "next/server";
import { db, sqlite } from "@/db/index";
import { documents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { indexDocument } from "@/lib/index-document-chunks";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [doc] = await db.select({ id: documents.id, ocrMarkdown: documents.ocrMarkdown }).from(documents).where(eq(documents.id, id));
  if (!doc) return Response.json({ error: "未找到" }, { status: 404 });
  if (!doc.ocrMarkdown?.trim()) return Response.json({ error: "该单据暂无 OCR 文本，无法向量化" }, { status: 422 });

  await indexDocument(id);

  const chunkCount = sqlite
    .prepare("SELECT COUNT(*) FROM document_chunks WHERE document_id = ?")
    .pluck()
    .get(id) as number;

  return Response.json({ chunkCount });
}
