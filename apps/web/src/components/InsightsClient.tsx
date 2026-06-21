"use client";

import { useState } from "react";
import type { InsightResult } from "@/app/api/ai/insights/route";
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  优秀: { bg: "bg-[var(--hs-success-soft)] border-[#c8ddd2]", text: "text-[var(--hs-success)]", dot: "bg-[var(--hs-success)]" },
  良好: { bg: "bg-[var(--hs-primary-soft)] border-[#c8ddd2]", text: "text-[var(--hs-primary-strong)]", dot: "bg-[var(--hs-primary)]" },
  需关注: { bg: "bg-[var(--hs-warning-soft)] border-[#e2d4a6]", text: "text-[var(--hs-warning)]", dot: "bg-[#b89040]" },
  建议就医: { bg: "bg-[var(--hs-danger-soft)] border-[#edd8d4]", text: "text-[var(--hs-danger)]", dot: "bg-[#cc6858]" },
};

const SEVERITY_BADGE: Record<string, string> = {
  注意: "bg-[var(--hs-warning-soft)] text-[var(--hs-warning)]",
  关注: "bg-[var(--hs-warning-soft)] text-[var(--hs-warning)]",
  重要: "bg-[var(--hs-danger-soft)] text-[var(--hs-danger)]",
};

const SYSTEM_STATUS_DOT: Record<string, string> = {
  正常: "bg-[var(--hs-success)]",
  轻度异常: "bg-[#b89040]",
  需关注: "bg-[#cc6858]",
};

export function InsightsClient() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<InsightResult | null>(null);
  const [error, setError] = useState("");

  async function generate() {
    setState("loading");
    try {
      const res = await fetch("/api/ai/insights");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if ((body as { error?: string }).error === "no_data") {
          setError("暂无指标数据，请先上传并解析检查单据。");
        } else {
          throw new Error(JSON.stringify(body));
        }
        setState("error");
        return;
      }
      const data = (await res.json()) as InsightResult;
      setResult(data);
      setState("done");
    } catch (e) {
      setError(String(e));
      setState("error");
    }
  }

  if (state === "idle") {
    return (
      <div className="hs-card flex flex-col items-center gap-4 px-6 py-16">
        <div className="flex size-12 items-center justify-center rounded-lg bg-[var(--hs-primary-soft)] text-[var(--hs-primary-strong)]">
          <Sparkles className="size-6" aria-hidden="true" />
        </div>
        <p className="max-w-xs text-center text-sm leading-6 text-[var(--hs-muted)]">
          AI 将综合分析你所有的健康指标，生成个性化洞察报告
        </p>
        <button
          onClick={generate}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--hs-primary-strong)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--hs-primary)]"
        >
          <Sparkles className="size-4" aria-hidden="true" />
          生成健康洞察报告
        </button>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="hs-card flex flex-col items-center gap-3 px-6 py-16">
        <Loader2 className="size-8 animate-spin text-[var(--hs-primary-strong)]" aria-hidden="true" />
        <p className="text-sm text-[var(--hs-muted)]">AI 正在分析你的健康数据，通常需要 15-30 秒…</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-lg border border-[#edd8d4] bg-[var(--hs-danger-soft)] p-6 text-center">
        <AlertCircle className="mx-auto mb-3 size-5 text-[var(--hs-danger)]" aria-hidden="true" />
        <p className="mb-3 text-sm text-[var(--hs-danger)]">{error}</p>
        <button onClick={() => setState("idle")} className="text-sm font-semibold text-[var(--hs-primary-strong)] underline underline-offset-4">重新生成</button>
      </div>
    );
  }

  if (!result) return null;

  const statusStyle = STATUS_STYLE[result.overall_status] ?? STATUS_STYLE.良好;

  return (
    <div className="space-y-5">
      {/* 整体状态 */}
      <div className={`rounded-lg border p-5 ${statusStyle.bg}`}>
        <div className="flex items-center gap-3 mb-2">
          <div className={`h-3 w-3 rounded-full ${statusStyle.dot}`} />
          <span className={`text-lg font-bold ${statusStyle.text}`}>{result.overall_status}</span>
        </div>
        <p className={`text-base ${statusStyle.text}`}>{result.headline}</p>
      </div>

      {/* 需要关注的异常指标 */}
      {result.alerts.length > 0 && (
        <div>
          <h2 className="hs-eyebrow mb-3">需要关注</h2>
          <div className="space-y-2">
            {result.alerts.map((alert, i) => (
              <div key={i} className="rounded-lg border border-[var(--hs-border-soft)] bg-white p-4">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--hs-text)]">{alert.metric}</span>
                    <span className="text-xs text-[var(--hs-muted)]">{alert.value}</span>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${SEVERITY_BADGE[alert.severity] ?? SEVERITY_BADGE.注意}`}>
                    {alert.severity}
                  </span>
                </div>
                <p className="mb-2 text-sm text-[var(--hs-muted)]">{alert.finding}</p>
                <p className="text-sm font-semibold text-[var(--hs-primary-strong)]">→ {alert.action}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 系统状态总览 */}
      {result.system_summary.length > 0 && (
        <div>
          <h2 className="hs-eyebrow mb-3">身体系统概览</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {result.system_summary.map((sys, i) => (
              <div key={i} className="rounded-lg border border-[var(--hs-border-soft)] bg-white p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${SYSTEM_STATUS_DOT[sys.status] ?? "bg-gray-300"}`} />
                  <span className="text-xs font-semibold text-[var(--hs-text)]">{sys.system}</span>
                </div>
                <p className="text-[11px] leading-snug text-[var(--hs-muted)]">{sys.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 正向发现 */}
      {result.positives.length > 0 && (
        <div className="rounded-lg border border-[#c8ddd2] bg-[var(--hs-success-soft)] p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--hs-success)]">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            值得肯定
          </h2>
          <ul className="space-y-1">
            {result.positives.map((p, i) => (
              <li key={i} className="text-sm text-[#264838]">• {p}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 行动建议 */}
      {result.recommendations.length > 0 && (
        <div>
          <h2 className="hs-eyebrow mb-3">行动建议</h2>
          <div className="space-y-2">
            {result.recommendations.map((rec, i) => (
              <div key={i} className="flex gap-3 rounded-lg border border-[var(--hs-border-soft)] bg-white p-3">
                <span className="shrink-0 text-sm font-bold text-[var(--hs-primary-strong)]">{i + 1}</span>
                <p className="text-sm text-[var(--hs-muted)]">{rec}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-[var(--hs-muted-soft)]">以上内容由 AI 生成，仅供参考，不构成医疗诊断，请遵医嘱。</p>
        <button onClick={() => setState("idle")} className="text-xs font-semibold text-[var(--hs-primary-strong)] hover:underline">
          重新生成
        </button>
      </div>
    </div>
  );
}
