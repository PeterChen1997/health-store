import { db } from "@/db/index";
import { documents, measurements, metricCatalog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Download, MessageCircle } from "lucide-react";
import { ImageViewer } from "@/components/ImageViewer";
import { MeasurementsEditor } from "@/components/MeasurementsEditor";
import { ReparseReview } from "@/components/ReparseReview";
import { TranslateButton } from "@/components/TranslateButton";
import { DeleteDocumentButton } from "@/components/DeleteDocumentButton";
import {
  getAdjacentDocumentIds,
  getDocumentDeleteRedirectHref,
} from "@/lib/document-navigation";
import {
  DOCUMENT_TYPE_BADGE_BASE,
  getDocumentTypeBadge,
  getDocumentTypeLabel,
} from "@/lib/document-types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) notFound();
  const documentTypeBadge = getDocumentTypeBadge(doc.documentType);

  const [measurementRows, navigationRows] = await Promise.all([
    db
      .select({
        id: measurements.id,
        rawName: measurements.rawName,
        value: measurements.value,
        unit: measurements.unit,
        refLow: measurements.refLow,
        refHigh: measurements.refHigh,
        flag: measurements.flag,
        standardName: metricCatalog.standardName,
      })
      .from(measurements)
      .leftJoin(metricCatalog, eq(measurements.metricId, metricCatalog.id))
      .where(eq(measurements.documentId, id)),
    db
      .select({
        id: documents.id,
        measuredAt: documents.measuredAt,
        createdAt: documents.createdAt,
      })
      .from(documents),
  ]);
  const adjacentDocuments = getAdjacentDocumentIds(navigationRows, doc.id);
  const deleteRedirectHref = getDocumentDeleteRedirectHref(adjacentDocuments);

  const imageSrc = `/api/uploads/${doc.imagePath.replace("uploads/", "")}`;
  const currentMeasurements = measurementRows.map((m) => ({
    id: m.id,
    rawName: m.rawName,
    value: m.value,
    unit: m.unit,
    refLow: m.refLow,
    refHigh: m.refHigh,
    flag: m.flag,
    standardName: m.standardName ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/documents"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--hs-muted)] hover:text-[var(--hs-primary-strong)]"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          单据列表
        </Link>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0 max-w-[48rem]">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="hs-heading max-w-[48rem] break-words text-3xl leading-tight">
                {doc.institution || getDocumentTypeLabel(doc.documentType) || "检查单据"}
              </h1>
              <span className="hs-status-success">已保存</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--hs-muted)]">
              <span className={cn(DOCUMENT_TYPE_BADGE_BASE, documentTypeBadge.className)}>
                {documentTypeBadge.label}
              </span>
              <span>检查日期 {doc.measuredAt}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 lg:w-[22rem] lg:justify-end">
            <DocumentNavigationLink direction="previous" documentId={adjacentDocuments.previousId} />
            <DocumentNavigationLink direction="next" documentId={adjacentDocuments.nextId} />
            <a
              href={imageSrc}
              download
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--hs-border)] bg-white px-3 text-sm font-semibold text-[var(--hs-muted)] hover:bg-[var(--hs-hover)]"
            >
              <Download className="size-4" aria-hidden="true" />
              下载原图
            </a>
            <Link
              href="/chat"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--hs-primary-strong)] px-3 text-sm font-semibold text-white hover:bg-[var(--hs-primary)]"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              问问 AI
            </Link>
            <DeleteDocumentButton documentId={doc.id} redirectHref={deleteRedirectHref} />
          </div>
        </div>
      </div>

      <ReparseReview
        documentId={doc.id}
        currentDocument={{
          documentType: doc.documentType,
          institution: doc.institution,
          measuredAt: doc.measuredAt,
          ocrMarkdown: doc.ocrMarkdown ?? "",
        }}
        currentMeasurements={currentMeasurements}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-3">
          <div>
            <p className="hs-eyebrow">Original document</p>
            <h2 className="hs-heading mt-1 text-xl">原始单据</h2>
          </div>
          <div className="hs-card p-3">
            <ImageViewer src={imageSrc} alt="检查单据" />
          </div>
        </div>

        <div className="space-y-6">
          <MeasurementsEditor
            documentId={doc.id}
            initialMeasurements={currentMeasurements}
          />

          <TranslateButton documentId={doc.id} />

          {doc.ocrMarkdown && (
            <details className="hs-card overflow-hidden">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--hs-muted)] hover:text-[var(--hs-text)]">
                OCR 识别文本
              </summary>
              <div className="border-t border-[var(--hs-border-soft)] p-4">
                <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--hs-muted)]">
                  {doc.ocrMarkdown}
                </pre>
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentNavigationLink({
  direction,
  documentId,
}: {
  direction: "previous" | "next";
  documentId: string | null;
}) {
  const label = direction === "previous" ? "上一张" : "下一张";
  const icon =
    direction === "previous" ? (
      <ArrowLeft className="size-4" aria-hidden="true" />
    ) : (
      <ArrowRight className="size-4" aria-hidden="true" />
    );
  const className =
    "inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--hs-border)] bg-white px-3 text-sm font-semibold text-[var(--hs-muted)] transition-colors hover:bg-[var(--hs-hover)]";

  if (!documentId) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-lg border border-[var(--hs-border-soft)] bg-[var(--hs-bg-muted)] px-3 text-sm font-semibold text-[var(--hs-muted-soft)]"
      >
        {icon}
        {label}
      </span>
    );
  }

  return (
    <Link href={`/documents/${documentId}`} className={className}>
      {icon}
      {label}
    </Link>
  );
}
