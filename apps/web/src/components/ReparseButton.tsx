"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { RotateCcw } from "lucide-react";

type Props = {
  documentId: string;
  variant?: "icon" | "full";
};

export function ReparseButton({ documentId, variant = "full" }: Props) {
  const router = useRouter();

  function openReparseReview(e: MouseEvent) {
    e.preventDefault(); // 阻止列表行的 Link 点击
    e.stopPropagation();
    router.push(`/documents/${documentId}?reparse=1`);
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={openReparseReview}
        title="重新解析"
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--hs-muted-soft)] transition-colors hover:bg-[var(--hs-primary-soft)] hover:text-[var(--hs-primary-strong)]"
      >
        <RotateCcw className="size-3.5" aria-hidden="true" />
        重解析
      </button>
    );
  }

  return (
    <button
    type="button"
    onClick={openReparseReview}
    className="inline-flex items-center gap-2 rounded-lg border border-[var(--hs-border)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--hs-muted)]
      transition-colors hover:bg-[var(--hs-hover)] hover:text-[var(--hs-primary-strong)]"
  >
    <RotateCcw className="size-4" aria-hidden="true" />
    重新解析
  </button>
  );
}
