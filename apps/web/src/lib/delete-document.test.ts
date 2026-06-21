import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { documents, measurements } from "../db/schema";
import { deleteDocument } from "./delete-document";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE documents (
      id text PRIMARY KEY NOT NULL,
      image_path text NOT NULL,
      image_md5 text,
      document_type text NOT NULL,
      institution text,
      measured_at text NOT NULL,
      ocr_markdown text,
      ocr_json text,
      created_at text DEFAULT (datetime('now')) NOT NULL
    );
    CREATE TABLE measurements (
      id text PRIMARY KEY NOT NULL,
      document_id text,
      metric_id text,
      raw_name text NOT NULL,
      value real NOT NULL,
      unit text NOT NULL,
      ref_low real,
      ref_high real,
      flag text DEFAULT 'normal' NOT NULL,
      measured_at text NOT NULL,
      created_at text DEFAULT (datetime('now')) NOT NULL
    );
  `);

  return drizzle(sqlite, { schema });
}

describe("delete document", () => {
  it("deletes the document, its measurements, and the uploaded image", async () => {
    const db = makeTestDb();
    const deletedFiles: string[] = [];
    await db.insert(documents).values({
      id: "doc-1",
      imagePath: "uploads/doc-1.jpeg",
      imageMd5: "md5-1",
      documentType: "blood_test",
      institution: "医院",
      measuredAt: "2026-06-21",
    });
    await db.insert(measurements).values({
      id: "measurement-1",
      documentId: "doc-1",
      rawName: "ALT",
      value: 42,
      unit: "U/L",
      flag: "normal",
      measuredAt: "2026-06-21",
    });

    const result = await deleteDocument("doc-1", {
      db,
      uploadsDir: "/uploads-root",
      unlinkFile: async (filePath) => {
        deletedFiles.push(filePath);
      },
    });

    assert.deepEqual(result, { deleted: true, imageDeleted: true });
    assert.deepEqual(deletedFiles, ["/uploads-root/doc-1.jpeg"]);
    assert.equal((await db.select().from(documents)).length, 0);
    assert.equal((await db.select().from(measurements).where(eq(measurements.documentId, "doc-1"))).length, 0);
  });

  it("does not delete files when the document is missing", async () => {
    const db = makeTestDb();
    const result = await deleteDocument("missing", {
      db,
      uploadsDir: "/uploads-root",
      unlinkFile: async () => {
        throw new Error("should not delete a file");
      },
    });

    assert.deepEqual(result, { deleted: false, imageDeleted: false });
  });
});
