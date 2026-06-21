"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReparseMeasurementPreview, ReparsePreview } from "@/lib/reparse-preview";

type CurrentDocument = {
  documentType: string;
  institution: string | null;
  measuredAt: string;
  ocrMarkdown: string;
};

type CurrentMeasurement = {
  id: string;
  rawName: string;
  value: number;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  flag: string;
  standardName: string | null;
};

type ReparsePreviewResponse = ReparsePreview & { id: string; error?: string };
type ReparseStartResponse = {
  jobId?: string;
  status?: "queued" | "running" | "success" | "error";
  error?: string;
};
type ReparseJobResponse = {
  id?: string;
  type?: string;
  status?: "queued" | "running" | "success" | "error";
  result?: ReparsePreviewResponse;
  error?: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  blood_test: "化验单",
  physical: "体检报告",
  imaging: "影像报告",
  clinic_note: "门诊病历",
  other: "其他",
};

const FLAG_STYLE: Record<string, string> = {
  normal: "text-gray-700",
  high: "text-red-600 font-semibold",
  low: "text-blue-600 font-semibold",
  critical_high: "text-red-700 font-bold",
  critical_low: "text-blue-700 font-bold",
};

const CHANGE_STYLE: Record<string, string> = {
  same: "bg-gray-100 text-gray-500",
  changed: "bg-amber-100 text-amber-700",
  added: "bg-green-100 text-green-700",
  removed: "bg-red-100 text-red-700",
};

const CHANGE_LABEL: Record<string, string> = {
  same: "相同",
  changed: "变化",
  added: "新增",
  removed: "缺失",
};

function typeLabel(value: string) {
  return TYPE_LABEL[value] ?? value;
}

function missing(value: string | null | undefined) {
  return value && value.trim() !== "" ? value : "未识别";
}

function refRange(refLow: number | null, refHigh: number | null) {
  if (refLow == null && refHigh == null) return "-";
  if (refLow == null) return `≤ ${refHigh}`;
  if (refHigh == null) return `≥ ${refLow}`;
  return `${refLow} - ${refHigh}`;
}

function currentKey(measurement: CurrentMeasurement) {
  return (measurement.standardName ?? measurement.rawName).trim().toUpperCase();
}

function previewKey(measurement: ReparseMeasurementPreview) {
  return (measurement.standardName ?? measurement.rawName).trim().toUpperCase();
}

function measurementName(measurement: CurrentMeasurement | ReparseMeasurementPreview) {
  return measurement.standardName ?? measurement.rawName;
}

function valueText(measurement: CurrentMeasurement | ReparseMeasurementPreview | undefined) {
  if (!measurement) return "-";
  return `${measurement.value} ${measurement.unit}`;
}

function measurementChanged(
  current: CurrentMeasurement | undefined,
  preview: ReparseMeasurementPreview | undefined
) {
  if (!current || !preview) return true;
  return (
    current.value !== preview.value ||
    current.unit !== preview.unit ||
    current.refLow !== preview.refLow ||
    current.refHigh !== preview.refHigh ||
    current.flag !== preview.flag
  );
}

export function ReparseReview({
  documentId,
  currentDocument,
  currentMeasurements,
}: {
  documentId: string;
  currentDocument: CurrentDocument;
  currentMeasurements: CurrentMeasurement[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialJobId = searchParams.get("reparseJob");
  const autoStarted = useRef(false);
  const [preview, setPreview] = useState<ReparsePreviewResponse | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "saving" | "saved" | "error">(
    initialJobId ? "loading" : "idle"
  );
  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const [jobStatus, setJobStatus] = useState<"queued" | "running" | null>(initialJobId ? "running" : null);
  const [message, setMessage] = useState<string | null>(null);

  const handleReparse = useCallback(async () => {
    setState("loading");
    setJobStatus("queued");
    setPreview(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/documents/${documentId}/reparse`, { method: "POST" });
      const body = await res.json() as ReparseStartResponse;

      if (!res.ok) {
        throw new Error(body.error ?? "重新解析失败");
      }
      if (!body.jobId || (body.status !== "queued" && body.status !== "running")) {
        throw new Error("重新解析任务响应格式错误");
      }

      setJobId(body.jobId);
      setJobStatus(body.status);
      router.replace(`/documents/${documentId}?reparseJob=${body.jobId}`, { scroll: false });
    } catch (err) {
      setState("error");
      setJobId(null);
      setJobStatus(null);
      setMessage(err instanceof Error ? err.message : "重新解析失败");
    }
  }, [documentId, router]);

  useEffect(() => {
    if (autoStarted.current) return;
    if (searchParams.get("reparse") !== "1") return;
    autoStarted.current = true;
    const timer = window.setTimeout(() => {
      void handleReparse();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [handleReparse, searchParams]);

  useEffect(() => {
    if (!jobId || state !== "loading") return;

    let cancelled = false;

    async function pollJob() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        const body = await res.json() as ReparseJobResponse;

        if (!res.ok) {
          throw new Error(body.error ?? "查询解析任务失败");
        }

        if (body.status === "queued" || body.status === "running") {
          if (!cancelled) setJobStatus(body.status);
          return;
        }

        if (body.status === "success" && body.result) {
          if (!cancelled) {
            setPreview(body.result);
            setState("idle");
            setJobId(null);
            setJobStatus(null);
            setMessage(null);
          }
          return;
        }

        if (body.status === "error") {
          throw new Error(body.error ?? "重新解析失败");
        }

        throw new Error("解析任务状态响应格式错误");
      } catch (err) {
        if (!cancelled) {
          setState("error");
          setJobId(null);
          setJobStatus(null);
          setMessage(err instanceof Error ? err.message : "重新解析失败");
        }
      }
    }

    void pollJob();
    const timer = window.setInterval(() => {
      void pollJob();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [jobId, state]);

  const comparisonRows = useMemo(() => {
    if (!preview) return [];

    const currentByKey = new Map(currentMeasurements.map((measurement) => [currentKey(measurement), measurement]));
    const previewByKey = new Map(preview.measurements.map((measurement) => [previewKey(measurement), measurement]));
    const keys = Array.from(new Set([...currentByKey.keys(), ...previewByKey.keys()]));

    return keys.map((key) => {
      const current = currentByKey.get(key);
      const next = previewByKey.get(key);
      const status = !current ? "added" : !next ? "removed" : measurementChanged(current, next) ? "changed" : "same";

      return {
        key,
        label: measurementName(next ?? current!),
        current,
        next,
        status,
      };
    });
  }, [currentMeasurements, preview]);

  async function saveAndReplace() {
    if (!preview) return;

    setState("saving");
    setMessage(null);

    try {
      const res = await fetch(`/api/documents/${documentId}/reparse/replace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          temporary: preview.temporary,
          document: preview.document,
          measurements: preview.measurements,
        }),
      });
      const body = await res.json() as { error?: string };

      if (!res.ok) {
        throw new Error(body.error ?? "保存失败");
      }

      setPreview(null);
      setState("saved");
      setJobId(null);
      setJobStatus(null);
      setMessage("已保存并替换当前结果");
      router.replace(`/documents/${documentId}`, { scroll: false });
      router.refresh();
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "保存失败");
    }
  }

  function discardPreview() {
    setPreview(null);
    setState("idle");
    setJobId(null);
    setJobStatus(null);
    setMessage(null);
    router.replace(`/documents/${documentId}`, { scroll: false });
  }

  const loadingText = jobStatus === "queued" ? "解析任务已排队..." : "后台解析中...";

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleReparse}
          disabled={state === "loading" || state === "saving"}
          className="rounded-lg border border-[var(--hs-border)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--hs-muted)]
            hover:bg-[var(--hs-hover)] hover:text-[var(--hs-primary-strong)]
            disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          {state === "loading" ? loadingText : "重新解析"}
        </button>
      </div>

      {state === "loading" && (
        <p className="text-right text-xs text-blue-600">
          {loadingText}
        </p>
      )}

      {message && (
        <p className={`text-right text-xs ${state === "error" ? "text-[var(--hs-danger)]" : "text-[var(--hs-success)]"}`}>
          {message}
        </p>
      )}

      {preview && (
        <section className="rounded-lg border border-[#e2d4a6] bg-[#fbf6e6]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eadfbd] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--hs-text)]">临时解析结果</h2>
              <p className="mt-0.5 text-xs text-[var(--hs-muted)]">
                {preview.measurementCount} 项指标 · OCR {preview.ocrLength} 字符
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hs-status-warning">未保存</span>
              <button
                type="button"
                onClick={discardPreview}
                disabled={state === "saving"}
                className="rounded-lg border border-[var(--hs-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--hs-muted)]
                  hover:bg-[var(--hs-hover)] disabled:opacity-40"
              >
                放弃
              </button>
              <button
                type="button"
                onClick={saveAndReplace}
                disabled={state === "saving"}
                className="rounded-lg bg-[var(--hs-primary-strong)] px-2.5 py-1 text-xs font-semibold text-white
                  hover:bg-[var(--hs-primary)] disabled:opacity-40"
              >
                {state === "saving" ? "保存中..." : "保存并替换"}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-[#eadfbd] bg-white/70">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">字段</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">当前结果</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">临时结果</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eadfbd] bg-white">
                <tr>
                  <td className="px-4 py-2.5 text-gray-500">类型</td>
                  <td className="px-4 py-2.5 text-gray-700">{typeLabel(currentDocument.documentType)}</td>
                  <td className="px-4 py-2.5 text-gray-900">{typeLabel(preview.document.documentType)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-gray-500">机构</td>
                  <td className="px-4 py-2.5 text-gray-700">{missing(currentDocument.institution)}</td>
                  <td className="px-4 py-2.5 text-gray-900">{missing(preview.document.institution)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-gray-500">日期</td>
                  <td className="px-4 py-2.5 text-gray-700">{currentDocument.measuredAt}</td>
                  <td className="px-4 py-2.5 text-gray-900">{preview.document.measuredAt}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto border-t border-[#eadfbd]">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-[#eadfbd] bg-white/70">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">指标</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">当前结果</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">临时结果</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">参考范围</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">变化</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eadfbd] bg-white">
                {comparisonRows.length > 0 ? comparisonRows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-800">{row.label}</p>
                      {row.next?.standardName && row.next.standardName !== row.next.rawName && (
                        <p className="text-xs text-gray-400">{row.next.rawName}</p>
                      )}
                    </td>
                    <td className={`px-4 py-2.5 ${row.current ? FLAG_STYLE[row.current.flag] ?? "text-gray-700" : "text-gray-400"}`}>
                      {valueText(row.current)}
                    </td>
                    <td className={`px-4 py-2.5 ${row.next ? FLAG_STYLE[row.next.flag] ?? "text-gray-900" : "text-gray-400"}`}>
                      {valueText(row.next)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {row.next
                        ? refRange(row.next.refLow, row.next.refHigh)
                        : row.current
                          ? refRange(row.current.refLow, row.current.refHigh)
                          : "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${CHANGE_STYLE[row.status]}`}>
                        {CHANGE_LABEL[row.status]}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td className="px-4 py-6 text-center text-sm text-gray-400" colSpan={5}>
                      临时结果无数值指标
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <details className="border-t border-[#eadfbd] bg-white/70">
            <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-[var(--hs-muted)] hover:text-[var(--hs-text)]">
              OCR 文本对比
            </summary>
            <div className="grid gap-4 border-t border-[#eadfbd] px-4 py-3 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-medium text-gray-500">当前文本</h3>
                <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-gray-600">
                  {currentDocument.ocrMarkdown || "无 OCR 文本"}
                </pre>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-medium text-gray-500">临时文本</h3>
                <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-gray-800">
                  {preview.document.ocrMarkdown || "无 OCR 文本"}
                </pre>
              </div>
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
