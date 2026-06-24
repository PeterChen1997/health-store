import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import * as schema from "./schema";
import path from "path";
import { mkdirSync } from "fs";

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(process.cwd(), "../../data/health.db");

// 确保数据目录存在，否则全新 clone / CI / 新机器上 better-sqlite3 会因
// 父目录缺失而开库失败（data/ 已被 gitignore，不随仓库分发）。
mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
// web 与后台 worker（及并行测试进程）共用同一个 SQLite 文件，默认 busy_timeout=0
// 会在并发写/建表时立即抛 SQLITE_BUSY，这里改为等待而非报错。
sqlite.pragma("busy_timeout = 5000");
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
