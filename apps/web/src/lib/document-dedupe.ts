import { readFile } from "fs/promises";
import path from "path";
import { eq, isNull } from "drizzle-orm";
import { db } from "@/db/index";
import { documents } from "@/db/schema";
import { md5Buffer } from "@/lib/image-md5";

const DATA_DIR = path.resolve(process.cwd(), "../../data");

type StoredDocument = {
  id: string;
  measuredAt: string;
};

function resolveStoredImagePath(imagePath: string) {
  return path.resolve(DATA_DIR, imagePath);
}

async function lookupDocumentByMd5(imageMd5: string): Promise<StoredDocument | undefined> {
  const [row] = await db
    .select({ id: documents.id, measuredAt: documents.measuredAt })
    .from(documents)
    .where(eq(documents.imageMd5, imageMd5))
    .limit(1);

  return row;
}

export async function backfillMissingDocumentMd5() {
  const rows = await db
    .select({ id: documents.id, imagePath: documents.imagePath })
    .from(documents)
    .where(isNull(documents.imageMd5));

  for (const row of rows) {
    try {
      const buf = await readFile(resolveStoredImagePath(row.imagePath));
      await db
        .update(documents)
        .set({ imageMd5: md5Buffer(buf) })
        .where(eq(documents.id, row.id));
    } catch (err) {
      console.warn(`无法补齐文档 ${row.id} 的 MD5:`, err);
    }
  }
}

export async function findStoredDocumentByImageMd5(imageMd5: string): Promise<StoredDocument | undefined> {
  const existing = await lookupDocumentByMd5(imageMd5);
  if (existing) return existing;

  await backfillMissingDocumentMd5();
  return lookupDocumentByMd5(imageMd5);
}
