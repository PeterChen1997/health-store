"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

export const DELETE_DOCUMENT_CONFIRM_TEXT =
  "确认删除这份单据？此操作会删除原图和已解析指标，无法撤销。";

export function DeleteDocumentButton({
  documentId,
  redirectHref,
}: {
  documentId: string;
  redirectHref: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "deleting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm(DELETE_DOCUMENT_CONFIRM_TEXT)) return;

    setStatus("deleting");
    setError(null);

    try {
      const res = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "删除失败");
      }
      router.push(redirectHref);
      router.refresh();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={status === "deleting"}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#edd8d4] bg-[var(--hs-danger-soft)] px-3 text-sm font-semibold text-[var(--hs-danger)] transition-colors hover:bg-[#ecd4cf] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "deleting" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="size-4" aria-hidden="true" />
        )}
        {status === "deleting" ? "删除中" : "删除"}
      </button>
      {error ? <p className="text-xs text-[var(--hs-danger)]">{error}</p> : null}
    </div>
  );
}
