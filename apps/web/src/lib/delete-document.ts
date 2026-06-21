import path from "node:path";
import { unlink } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/index";
import { documents, measurements } from "@/db/schema";

type DeleteDocumentOptions = {
  db?: DB;
  uploadsDir: string;
  unlinkFile?: (filePath: string) => Promise<void>;
};

type DeleteDocumentResult = {
  deleted: boolean;
  imageDeleted: boolean;
};

export async function deleteDocument(
  documentId: string,
  options: DeleteDocumentOptions,
): Promise<DeleteDocumentResult> {
  const {
    db = defaultDb,
    uploadsDir,
    unlinkFile = unlink,
  } = options;

  const [doc] = await db
    .select({ id: documents.id, imagePath: documents.imagePath })
    .from(documents)
    .where(eq(documents.id, documentId));

  if (!doc) {
    return { deleted: false, imageDeleted: false };
  }

  await db.delete(measurements).where(eq(measurements.documentId, documentId));
  await db.delete(documents).where(eq(documents.id, documentId));

  let imageDeleted = false;
  try {
    await unlinkFile(path.join(uploadsDir, path.basename(doc.imagePath)));
    imageDeleted = true;
  } catch {
    imageDeleted = false;
  }

  return { deleted: true, imageDeleted };
}
