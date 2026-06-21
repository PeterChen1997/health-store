"use client";

import { useState } from "react";
import type { TranslationResult } from "@/app/api/ai/translate-report/route";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";

type Props = { documentId: string };

export function TranslateButton({ documentId }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState("");

  async function handleTranslate() {
    setState("loading");
    try {
      const res = await fetch("/api/ai/translate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as TranslationResult;
      setResult(data);
      setState("done");
    } catch (e) {
      setError(String(e));
      setState("error");
    }
  }

  if (state === "idle") {
    return (
      <button
        onClick={handleTranslate}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#c8ddd2] bg-[var(--hs-primary-soft)] px-3 text-sm font-semibold text-[var(--hs-primary-strong)] transition-colors hover:bg-white"
      >
        <Sparkles className="size-4" aria-hidden="true" />
        AI 解读
      </button>
    );
  }

  if (state === "loading") {
    return (
      <div className="hs-card p-4">
        <div className="flex items-center gap-2 text-sm text-[var(--hs-primary-strong)]">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span>AI 正在解读报告，通常需要 10-20 秒…</span>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-lg border border-[#edd8d4] bg-[var(--hs-danger-soft)] p-4 text-sm text-[var(--hs-danger)]">
        <div className="flex gap-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            解读失败：{error}
            <button onClick={() => setState("idle")} className="ml-3 font-semibold underline underline-offset-4">重试</button>
          </div>
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="hs-card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="hs-heading flex items-center gap-2 text-lg">
          <Sparkles className="size-4 text-[var(--hs-primary-strong)]" aria-hidden="true" />
          AI 解读
        </h2>
        <button onClick={() => setState("idle")} className="text-xs font-semibold text-[var(--hs-muted)] hover:text-[var(--hs-text)]">
          收起
        </button>
      </div>

      <div className="rounded-lg border border-[#c8ddd2] bg-[var(--hs-primary-soft)] p-4">
        <p className="text-sm leading-relaxed text-[#264838]">{result.summary}</p>
      </div>

      {result.key_findings.length > 0 && (
        <div>
          <h3 className="hs-eyebrow mb-2">关键发现</h3>
          <ul className="space-y-1.5">
            {result.key_findings.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-[var(--hs-muted)]">
                <span className="mt-0.5 shrink-0 text-[var(--hs-primary)]">•</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.abnormal_items.length > 0 && (
        <div>
          <h3 className="hs-eyebrow mb-2">异常指标解读</h3>
          <div className="space-y-2">
            {result.abnormal_items.map((item, i) => (
              <div key={i} className="rounded-lg border border-[#edd8d4] bg-[var(--hs-danger-soft)] p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-[var(--hs-danger)]">{item.name}</span>
                  <span className="text-xs text-[var(--hs-danger)]">{item.value}</span>
                </div>
                <p className="text-xs text-[var(--hs-muted)] mb-1">{item.interpretation}</p>
                <p className="text-xs font-semibold text-[var(--hs-primary-strong)]">→ {item.suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.overall_advice && (
        <div className="rounded-lg border border-[#c8ddd2] bg-[var(--hs-success-soft)] p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--hs-success)]">生活建议</h3>
          <p className="text-sm whitespace-pre-line leading-relaxed text-[#264838]">{result.overall_advice}</p>
        </div>
      )}

      <p className="text-[11px] text-[var(--hs-muted-soft)]">以上解读由 AI 生成，仅供参考，不构成医疗诊断，请遵医嘱。</p>
    </div>
  );
}
