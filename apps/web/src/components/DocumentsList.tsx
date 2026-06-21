"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, FileText } from "lucide-react";
import { ReparseButton } from "@/components/ReparseButton";
import {
  DOCUMENT_TYPE_BADGE_BASE,
  getDocumentTypeBadge,
  getDocumentTypeLabel,
} from "@/lib/document-types";
import { cn } from "@/lib/utils";

export type DocumentListRow = {
  id: string;
  documentType: string;
  institution: string | null;
  measuredAt: string;
  createdAt: string;
  measurementCount: number;
};

function formatDate(value: string) {
  return value ? value.slice(0, 10) : "未识别日期";
}

export function DocumentsList({ rows }: { rows: DocumentListRow[] }) {
  const [filter, setFilter] = useState("all");
  const types = useMemo(
    () => Array.from(new Set(rows.map((row) => row.documentType))),
    [rows],
  );

  const filtered = rows.filter((row) => {
    if (filter === "all") return true;
    if (filter === "with_metrics") return row.measurementCount > 0;
    if (filter === "without_metrics") return row.measurementCount === 0;
    return row.documentType === filter;
  });

  const chips = [
    { key: "all", label: "全部" },
    { key: "with_metrics", label: "有指标" },
    { key: "without_metrics", label: "无指标" },
    ...types.map((type) => ({ key: type, label: getDocumentTypeLabel(type) })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setFilter(chip.key)}
            className={cn(
              "h-8 rounded-full border px-3 text-sm font-semibold transition-colors",
              filter === chip.key
                ? "border-[var(--hs-primary-strong)] bg-[var(--hs-primary-strong)] text-white"
                : "border-[var(--hs-border)] bg-white text-[var(--hs-muted)] hover:bg-[var(--hs-hover)]",
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="hs-card px-6 py-14 text-center">
          <p className="text-sm text-[var(--hs-muted)]">当前筛选下没有单据。</p>
        </div>
      ) : (
        <div className="hs-card overflow-hidden">
          <div className="hidden grid-cols-[2fr_1.2fr_1fr_1fr_auto] gap-4 border-b border-[var(--hs-border-soft)] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--hs-muted-soft)] lg:grid">
            <span>单据</span>
            <span>机构</span>
            <span>检查日期</span>
            <span>状态</span>
            <span />
          </div>
          <div className="divide-y divide-[var(--hs-border-soft)]">
            {filtered.map((row) => {
              const documentTypeBadge = getDocumentTypeBadge(row.documentType);

              return (
                <Link
                  key={row.id}
                  href={`/documents/${row.id}`}
                  className="grid gap-3 px-5 py-4 transition-colors hover:bg-[var(--hs-hover)] lg:grid-cols-[2fr_1.2fr_1fr_1fr_auto] lg:items-center"
                >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--hs-bg-muted)] text-[var(--hs-primary-strong)]">
                    <FileText className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          DOCUMENT_TYPE_BADGE_BASE,
                          documentTypeBadge.className,
                        )}
                      >
                        {documentTypeBadge.label}
                      </span>
                      <span className="truncate text-sm font-semibold text-[var(--hs-text)] lg:hidden">
                        {row.institution || "未识别机构"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--hs-muted-soft)]">
                      录入于 {formatDate(row.createdAt)}
                    </p>
                  </div>
                </div>
                <span className="hidden truncate text-sm text-[var(--hs-muted)] lg:block">
                  {row.institution || "未识别机构"}
                </span>
                <span className="text-sm text-[var(--hs-muted)]">{formatDate(row.measuredAt)}</span>
                <span>
                  {row.measurementCount > 0 ? (
                    <span className="hs-status-success">{row.measurementCount} 项指标</span>
                  ) : (
                    <span className="rounded-full bg-[var(--hs-bg-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--hs-muted)]">
                      无数值指标
                    </span>
                  )}
                </span>
                <span className="flex items-center justify-between gap-3 lg:justify-end">
                  <ReparseButton documentId={row.id} variant="icon" />
                  <ArrowRight className="size-4 text-[var(--hs-muted-soft)]" aria-hidden="true" />
                </span>
              </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
