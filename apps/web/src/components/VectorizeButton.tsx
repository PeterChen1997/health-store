"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Cpu, CheckCircle2 } from "lucide-react";

type Props = {
  documentId: string;
  initialChunkCount: number;
};

export function VectorizeButton({ documentId, initialChunkCount }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [chunkCount, setChunkCount] = useState(initialChunkCount);
  const [error, setError] = useState("");

  async function handleVectorize(e: React.MouseEvent) {
    // 阻止冒泡到 <summary>，否则会展开/收起 OCR 文本块
    e.preventDefault();
    e.stopPropagation();
    setState("loading");
    try {
      const res = await fetch(`/api/documents/${documentId}/vectorize`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? res.statusText);
      }
      const data = (await res.json()) as { chunkCount: number };
      setChunkCount(data.chunkCount);
      setState("done");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setState("error");
    }
  }

  const alreadyIndexed = initialChunkCount > 0;

  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--hs-muted)]">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        向量化中…
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--hs-danger)]">
        <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
        <span>向量化失败：{error}</span>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setState("idle"); }}
          className="ml-1 font-semibold underline underline-offset-4"
        >
          重试
        </button>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--hs-success)]">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
        向量化完成（{chunkCount} 块）
      </div>
    );
  }

  return (
    <button
      onClick={handleVectorize}
      className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--hs-muted)] hover:text-[var(--hs-text)]"
      title={alreadyIndexed ? `已向量化（${chunkCount} 块），点击重新生成` : "生成向量索引以支持 AI 语义检索"}
    >
      <Cpu className="size-4" aria-hidden="true" />
      {alreadyIndexed ? `已向量化（${chunkCount} 块）` : "向量化"}
    </button>
  );
}
