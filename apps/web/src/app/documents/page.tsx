import { db } from "@/db/index";
import { documents, measurements } from "@/db/schema";
import { asc, desc, eq, count } from "drizzle-orm";
import Link from "next/link";
import { Upload } from "lucide-react";
import { DocumentsList, type DocumentListRow } from "@/components/DocumentsList";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const rows = await db
    .select({
      id: documents.id,
      documentType: documents.documentType,
      institution: documents.institution,
      measuredAt: documents.measuredAt,
      createdAt: documents.createdAt,
      measurementCount: count(measurements.id),
    })
    .from(documents)
    .leftJoin(measurements, eq(measurements.documentId, documents.id))
    .groupBy(documents.id)
    .orderBy(desc(documents.measuredAt), desc(documents.createdAt), asc(documents.id));

  const listRows: DocumentListRow[] = rows.map((row) => ({
    ...row,
    measurementCount: Number(row.measurementCount),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="hs-eyebrow">Documents</p>
          <h1 className="hs-heading mt-1 text-3xl">检查单据</h1>
          <p className="mt-2 text-sm text-[var(--hs-muted)]">
            共 {rows.length} 份记录，保存原图、OCR 文本和结构化指标。
          </p>
        </div>
        <Link
          href="/documents/upload"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--hs-primary-strong)] px-4 text-sm font-semibold text-white hover:bg-[var(--hs-primary)]"
        >
          <Upload className="size-4" aria-hidden="true" />
          上传单据
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="hs-card flex flex-col items-center px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-lg bg-[var(--hs-primary-soft)] text-[var(--hs-primary-strong)]">
            <Upload className="size-6" aria-hidden="true" />
          </div>
          <h2 className="hs-heading mt-4 text-xl">还没有任何单据</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-[var(--hs-muted)]">
            上传检查单据图片后，系统会保存原图并提取结构化指标。
          </p>
          <Link
            href="/documents/upload"
            className="mt-5 inline-flex h-10 items-center rounded-lg bg-[var(--hs-primary-strong)] px-4 text-sm font-semibold text-white hover:bg-[var(--hs-primary)]"
          >
            上传第一张检查单据
          </Link>
        </div>
      ) : (
        <DocumentsList rows={listRows} />
      )}
    </div>
  );
}
