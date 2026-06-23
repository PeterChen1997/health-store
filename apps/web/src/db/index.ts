import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "./schema";
import path from "path";

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(process.cwd(), "../../data/health.db");

export const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqliteVec.load(sqlite);

// 向量块元数据表（integer PK = rowid，与 vec_chunks 虚拟表对齐）
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS document_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
// 向量存储虚拟表（Drizzle 不管理，维度固定 1536）
sqlite.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks
  USING vec0(embedding float[1536])
`);

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
