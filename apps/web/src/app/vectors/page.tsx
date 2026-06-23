import { db } from "@/db/index";
import { documents, documentChunks } from "@/db/schema";
import { asc, desc } from "drizzle-orm";
import Link from "next/link";
import { Boxes, FileText } from "lucide-react";
import {
  DOCUMENT_TYPE_BADGE_BASE,
  getDocumentTypeBadge,
} from "@/lib/document-types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type DocMeta = {
  id: string;
  measuredAt: string;
  institution: string | null;
  documentType: string;
};

export default async function VectorsPage() {
  const [docRows, chunkRows] = await Promise.all([
    db
      .select({
        id: documents.id,
        measuredAt: documents.measuredAt,
        institution: documents.institution,
        documentType: documents.documentType,
        ocrMarkdown: documents.ocrMarkdown,
      })
      .from(documents)
      .orderBy(desc(documents.measuredAt)),
    db
      .select({
        documentId: documentChunks.documentId,
        chunkIndex: documentChunks.chunkIndex,
        text: documentChunks.text,
      })
      .from(documentChunks)
      .orderBy(asc(documentChunks.documentId), asc(documentChunks.chunkIndex)),
  ]);

  const chunksByDoc = new Map<string, string[]>();
  for (const row of chunkRows) {
    const list = chunksByDoc.get(row.documentId) ?? [];
    list.push(row.text);
    chunksByDoc.set(row.documentId, list);
  }

  const docsWithOcr = docRows.filter((d) => d.ocrMarkdown?.trim());
  const vectorized = docsWithOcr.filter((d) => chunksByDoc.has(d.id));
  const pending = docsWithOcr.filter((d) => !chunksByDoc.has(d.id));

  const stats = [
    { label: "单据总数", value: docRows.length },
    { label: "有 OCR 文本", value: docsWithOcr.length },
    { label: "已向量化", value: vectorized.length },
    { label: "文本分块", value: chunkRows.length },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="hs-eyebrow">Vector store</p>
        <h1 className="hs-heading mt-1 flex items-center gap-2 text-3xl">
          <Boxes className="size-6 text-[var(--hs-primary-strong)]" aria-hidden="true" />
          向量库
        </h1>
        <p className="mt-2 text-sm text-[var(--hs-muted)]">
          已向量化的单据原文会进入 AI 对话的语义检索。在单据详情页点「向量化」即可加入或更新。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="hs-card p-4">
            <p className="text-xs font-semibold text-[var(--hs-muted)]">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--hs-text)]">{s.value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="hs-heading text-xl">
          已向量化 <span className="text-base font-normal text-[var(--hs-muted)]">({vectorized.length})</span>
        </h2>
        {vectorized.length === 0 ? (
          <p className="hs-card p-4 text-sm text-[var(--hs-muted)]">
            还没有向量化的单据。去单据详情页点「向量化」开始吧。
          </p>
        ) : (
          <div className="space-y-3">
            {vectorized.map((doc) => (
              <VectorizedCard key={doc.id} doc={doc} chunks={chunksByDoc.get(doc.id) ?? []} />
            ))}
          </div>
        )}
      </section>

      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="hs-heading text-xl">
            待向量化 <span className="text-base font-normal text-[var(--hs-muted)]">({pending.length})</span>
          </h2>
          <div className="hs-card divide-y divide-[var(--hs-border-soft)]">
            {pending.map((doc) => {
              const badge = getDocumentTypeBadge(doc.documentType);
              return (
                <Link
                  key={doc.id}
                  href={`/documents/${doc.id}`}
                  className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-[var(--hs-hover)]"
                >
                  <FileText className="size-4 shrink-0 text-[var(--hs-muted)]" aria-hidden="true" />
                  <span className={cn(DOCUMENT_TYPE_BADGE_BASE, badge.className)}>{badge.label}</span>
                  <span className="text-[var(--hs-text)]">{doc.institution || "未识别机构"}</span>
                  <span className="ml-auto text-[var(--hs-muted)]">{doc.measuredAt}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function VectorizedCard({ doc, chunks }: { doc: DocMeta; chunks: string[] }) {
  const badge = getDocumentTypeBadge(doc.documentType);
  return (
    <details className="hs-card overflow-hidden">
      <summary className="flex cursor-pointer items-center gap-3 px-4 py-3">
        <span className={cn(DOCUMENT_TYPE_BADGE_BASE, badge.className)}>{badge.label}</span>
        <Link
          href={`/documents/${doc.id}`}
          className="font-semibold text-[var(--hs-text)] hover:text-[var(--hs-primary-strong)]"
        >
          {doc.institution || "未识别机构"}
        </Link>
        <span className="text-sm text-[var(--hs-muted)]">{doc.measuredAt}</span>
        <span className="ml-auto rounded-full bg-[var(--hs-primary-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--hs-primary-strong)]">
          {chunks.length} 块
        </span>
      </summary>
      <div className="space-y-2 border-t border-[var(--hs-border-soft)] p-4">
        {chunks.map((text, i) => (
          <div key={i} className="rounded-lg border border-[var(--hs-border-soft)] bg-[var(--hs-bg-muted)] p-3">
            <p className="mb-1 text-[11px] font-semibold text-[var(--hs-muted-soft)]">分块 #{i + 1}</p>
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--hs-muted)]">
              {text}
            </pre>
          </div>
        ))}
      </div>
    </details>
  );
}
