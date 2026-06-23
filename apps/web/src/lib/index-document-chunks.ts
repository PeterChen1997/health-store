import { eq } from "drizzle-orm";
import { sqlite, db } from "@/db/index";
import { documents, documentChunks } from "@/db/schema";
import { embedDocuments } from "./embedding";

const MAX_CHUNK_CHARS = 1200;
const OVERLAP_CHARS = 180;

export function chunkMarkdown(md: string): string[] {
  const sections = md.split(/(?=^#{1,4}\s)/m);
  const chunks: string[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    if (trimmed.length <= MAX_CHUNK_CHARS) {
      chunks.push(trimmed);
    } else {
      let start = 0;
      while (start < trimmed.length) {
        const slice = trimmed.slice(start, start + MAX_CHUNK_CHARS).trim();
        if (slice) chunks.push(slice);
        start += MAX_CHUNK_CHARS - OVERLAP_CHARS;
      }
    }
  }

  return chunks.filter((c) => c.length > 10);
}

function toVecBlob(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer);
}

export async function indexDocument(documentId: string): Promise<void> {
  const [doc] = await db
    .select({ ocrMarkdown: documents.ocrMarkdown })
    .from(documents)
    .where(eq(documents.id, documentId));

  if (!doc?.ocrMarkdown?.trim()) return;

  // 删旧数据：先清向量（依赖 document_chunks.id），再清元数据
  sqlite
    .prepare(
      "DELETE FROM vec_chunks WHERE rowid IN (SELECT id FROM document_chunks WHERE document_id = ?)"
    )
    .run(documentId);
  await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));

  const chunks = chunkMarkdown(doc.ocrMarkdown);
  if (chunks.length === 0) return;

  const embeddings = await embedDocuments(chunks);

  const insertChunk = sqlite.prepare(
    "INSERT INTO document_chunks(document_id, chunk_index, text) VALUES (?, ?, ?)"
  );
  const insertVec = sqlite.prepare(
    "INSERT INTO vec_chunks(rowid, embedding) VALUES (?, ?)"
  );

  for (let i = 0; i < chunks.length; i++) {
    const result = insertChunk.run(documentId, i, chunks.at(i)!);
    // better-sqlite3 binds JS `number` as REAL; sqlite-vec vec0 requires INTEGER rowid → use BigInt
    insertVec.run(BigInt(result.lastInsertRowid), toVecBlob(embeddings.at(i)!));
  }
}

type RetrievedChunk = {
  text: string;
  measuredAt: string;
  institution: string | null;
  documentType: string;
  distance: number;
};

export function retrieveRelevantChunks(queryEmbedding: number[], k = 5): RetrievedChunk[] {
  const rows = sqlite
    .prepare<[Buffer, number], RetrievedChunk>(`
      SELECT
        dc.text,
        d.measured_at AS measuredAt,
        d.institution,
        d.document_type AS documentType,
        knn.distance
      FROM (
        SELECT rowid, distance FROM vec_chunks
        WHERE embedding MATCH ?
        AND k = ?
        ORDER BY distance
      ) AS knn
      JOIN document_chunks dc ON dc.id = knn.rowid
      JOIN documents d ON d.id = dc.document_id
    `)
    .all(toVecBlob(queryEmbedding), k);

  return rows;
}
