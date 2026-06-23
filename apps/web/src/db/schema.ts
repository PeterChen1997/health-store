import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// 原始检查单据
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  imagePath: text("image_path").notNull(),
  imageMd5: text("image_md5").unique(),
  documentType: text("document_type").notNull(), // blood_test | physical | imaging | other
  institution: text("institution"),
  measuredAt: text("measured_at").notNull(), // ISO date string
  ocrMarkdown: text("ocr_markdown"),
  ocrJson: text("ocr_json"), // JSON string
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// OCR 文本分块，与 vec_chunks 虚拟表 rowid 对齐（integer PK = rowid）
export const documentChunks = sqliteTable("document_chunks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  text: text("text").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// 标准指标词典
export const metricCatalog = sqliteTable("metric_catalog", {
  id: text("id").primaryKey(),
  standardName: text("standard_name").notNull(), // e.g. "谷丙转氨酶"
  aliases: text("aliases").notNull(), // JSON string[] e.g. ["ALT","丙氨酸氨基转移酶"]
  standardUnit: text("standard_unit").notNull(), // e.g. "U/L"
  category: text("category").notNull(), // liver | kidney | blood_lipid | blood_glucose | blood_routine | other
  refLow: real("ref_low"),
  refHigh: real("ref_high"),
  loinc: text("loinc"),
  description: text("description"),
});

// 标准化时序测量值（趋势分析核心）
export const measurements = sqliteTable("measurements", {
  id: text("id").primaryKey(),
  documentId: text("document_id").references(() => documents.id, { onDelete: "cascade" }),
  metricId: text("metric_id").references(() => metricCatalog.id),
  rawName: text("raw_name").notNull(), // OCR 识别到的原始指标名
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  refLow: real("ref_low"),
  refHigh: real("ref_high"),
  flag: text("flag").notNull().default("normal"), // normal | high | low | critical_high | critical_low
  measuredAt: text("measured_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// OCR / LLM pipeline run logs. This is intentionally separate from business tables.
export const pipelineRuns = sqliteTable("pipeline_runs", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  documentId: text("document_id"),
  stage: text("stage").notNull(), // ocr | llm_extract | llm_repair
  status: text("status").notNull(), // success | error
  mode: text("mode"),
  model: text("model"),
  inputChars: integer("input_chars"),
  outputChars: integer("output_chars"),
  durationMs: integer("duration_ms"),
  error: text("error"),
  metadata: text("metadata").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// Generic durable background jobs. A separate worker processes queued parsing jobs.
export const asyncJobs = sqliteTable("async_jobs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // document_reparse | document_import
  status: text("status").notNull(), // queued | running | success | error
  resourceId: text("resource_id"),
  input: text("input").notNull(),
  result: text("result"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// 日常健康记录
export const healthLogs = sqliteTable("health_logs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // diet | exercise | sleep | symptom | medication | vitals
  payload: text("payload").notNull(), // JSON string - 各类型的结构化 payload
  note: text("note"),
  measuredAt: text("measured_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// 可穿戴设备时序数据（Apple 健康等）
export const wearableSamples = sqliteTable("wearable_samples", {
  id: text("id").primaryKey(),
  source: text("source").notNull(), // apple_health | manual
  type: text("type").notNull(), // heart_rate | steps | sleep | blood_oxygen | hrv
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  ts: text("ts").notNull(), // ISO datetime
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// 非结构化笔记
export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  aiTags: text("ai_tags"), // JSON string[] - AI 自动分类标签
  aiSummary: text("ai_summary"),
  relatedAt: text("related_at"), // 笔记关联的日期（如就诊日期）
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// 健康问答会话
export const chatThreads = sqliteTable("chat_threads", {
  id: text("id").primaryKey(),
  title: text("title"),
  status: text("status").notNull().default("regular"), // regular | archived
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// 健康问答消息历史
export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => chatThreads.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  format: text("format").notNull(),
  content: text("content").notNull(), // JSON string
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// 统一标签体系
export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  category: text("category").notNull(), // topic | symptom | organ | lifestyle | other
  color: text("color"),
});

// 标签关联表（多态）
export const tagRelations = sqliteTable("tag_relations", {
  id: text("id").primaryKey(),
  tagId: text("tag_id").references(() => tags.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(), // document | health_log | note | wearable
  entityId: text("entity_id").notNull(),
});

// AI 洞察报告
export const insights = sqliteTable("insights", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // report | translation | alert | chat_answer
  period: text("period"), // e.g. "2024" | "2024-Q1" | null（单条解读）
  title: text("title").notNull(),
  content: text("content").notNull(),
  sourceRefs: text("source_refs"), // JSON string[] - document_ids / measurement_ids
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// 复查与体检提醒
export const reminders = sqliteTable("reminders", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  kind: text("kind").notNull(), // recheck | annual_physical | medication | custom
  dueDate: text("due_date").notNull(), // ISO date YYYY-MM-DD
  relatedMetricId: text("related_metric_id").references(() => metricCatalog.id),
  relatedDocumentId: text("related_document_id").references(() => documents.id, { onDelete: "set null" }),
  note: text("note"),
  status: text("status").notNull().default("active"), // active | done | dismissed
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  completedAt: text("completed_at"),
});
