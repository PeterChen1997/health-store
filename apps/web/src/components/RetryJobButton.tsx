"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";

export function RetryJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "retrying" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function retryJob() {
    setStatus("retrying");
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "重试失败");
      }
      router.refresh();
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "重试失败");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={retryJob}
        disabled={status === "retrying"}
        title="重新排队"
        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "retrying" ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <RotateCcw className="size-3.5" aria-hidden="true" />
        )}
        {status === "retrying" ? "排队中" : "重试"}
      </button>
      {error ? <span className="text-xs text-[var(--hs-danger)]">{error}</span> : null}
    </div>
  );
}
