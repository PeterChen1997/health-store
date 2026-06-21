"use client";

import { useState, useRef } from "react";
import { AlertCircle, CheckCircle2, FileUp, Loader2 } from "lucide-react";

type ImportResult = { imported: number; summary: Record<string, number> };

const TYPE_LABEL: Record<string, string> = {
  heart_rate: "心率",
  resting_heart_rate: "静息心率",
  steps: "步数",
  blood_oxygen: "血氧",
  body_weight: "体重",
  hrv: "心率变异性",
  sleep: "睡眠",
};

export function AppleHealthImport() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = Array.from(e.target.files ?? []).at(0);
    if (!file) return;

    setStatus("loading");
    setResult(null);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/apple-health", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ImportResult;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
      setStatus("error");
    }

    // 重置 input 以便再次选同一文件
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="rounded-lg border border-dashed border-[var(--hs-border)] bg-[var(--hs-bg-muted)] p-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-white text-[var(--hs-primary-strong)] shadow-sm">
          {status === "loading" ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <FileUp className="size-5" aria-hidden="true" />
          )}
        </div>
        <p className="mb-1 text-sm font-semibold text-[var(--hs-text)]">导入 Apple 健康数据</p>
        <p className="mb-4 text-xs text-[var(--hs-muted)]">
          在 iPhone 健康 App → 个人资料 → 导出健康数据，得到 export.xml
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".xml"
          onChange={handleFile}
          className="hidden"
          id="apple-health-file"
        />
        <label
          htmlFor="apple-health-file"
          className={`inline-flex h-10 cursor-pointer items-center rounded-lg border border-[var(--hs-border)] bg-white px-4 text-sm font-semibold text-[var(--hs-primary-strong)] transition-colors hover:bg-[var(--hs-hover)] ${
            status === "loading" ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {status === "loading" ? "导入中…" : "选择 export.xml"}
        </label>
      </div>

      {status === "done" && result && (
        <div className="mt-4 rounded-lg border border-[#c8ddd2] bg-[var(--hs-success-soft)] p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--hs-success)]">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            成功导入 {result.imported} 条记录
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.summary).map(([type, count]) => (
              <span key={type} className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-[var(--hs-success)]">
                {TYPE_LABEL[type] ?? type}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {status === "error" && (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-[var(--hs-danger)]">
          <AlertCircle className="size-4" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
