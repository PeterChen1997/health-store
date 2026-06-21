"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Plus, Save, Trash2, X } from "lucide-react";

type MeasurementRow = {
  id: string;
  rawName: string;
  value: number;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  flag: string;
  standardName: string | null;
};

type EditRow = {
  _key: string;
  name: string;        // 主编辑字段：standardName ?? rawName，提交为 rawName
  originalRawName: string; // OCR 原文，仅展示参考（standardName 存在且不同时显示）
  value: string;
  unit: string;
  refLow: string;
  refHigh: string;
};

const FLAG_STYLE: Record<string, string> = {
  normal: "text-gray-700",
  high: "text-red-600 font-semibold",
  low: "text-blue-600 font-semibold",
  critical_high: "text-red-700 font-bold",
  critical_low: "text-blue-700 font-bold",
};

const FLAG_LABEL: Record<string, string> = {
  normal: "",
  high: "↑",
  low: "↓",
  critical_high: "↑↑",
  critical_low: "↓↓",
};

function rowToEdit(m: MeasurementRow): EditRow {
  return {
    _key: m.id,
    name: m.standardName ?? m.rawName,
    originalRawName: m.rawName,
    value: String(m.value),
    unit: m.unit,
    refLow: m.refLow != null ? String(m.refLow) : "",
    refHigh: m.refHigh != null ? String(m.refHigh) : "",
  };
}

export function MeasurementsEditor({
  documentId,
  initialMeasurements,
}: {
  documentId: string;
  initialMeasurements: MeasurementRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function enterEdit() {
    setRows(initialMeasurements.map(rowToEdit));
    setEditing(true);
    setError(null);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  function updateRow(key: string, field: keyof Omit<EditRow, "_key">, val: string) {
    setRows((prev) =>
      prev.map((r) => (r._key === key ? { ...r, [field]: val } : r))
    );
  }

  function deleteRow(key: string) {
    setRows((prev) => prev.filter((r) => r._key !== key));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { _key: crypto.randomUUID(), name: "", originalRawName: "", value: "", unit: "", refLow: "", refHigh: "" },
    ]);
  }

  async function save() {
    const parsed = rows
      .filter((r) => r.name.trim() !== "" && r.value.trim() !== "")
      .map((r) => ({
        rawName: r.name.trim(),
        value: parseFloat(r.value),
        unit: r.unit.trim(),
        refLow: r.refLow !== "" ? parseFloat(r.refLow) : null,
        refHigh: r.refHigh !== "" ? parseFloat(r.refHigh) : null,
      }));

    if (parsed.some((r) => isNaN(r.value))) {
      setError("存在无效数值，请检查");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/documents/${documentId}/measurements`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurements: parsed }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? "保存失败");
      }

      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="hs-eyebrow">Extracted metrics</p>
            <h2 className="hs-heading mt-1 text-xl">
              检验指标（{initialMeasurements.length} 项）
            </h2>
          </div>
          <button
            onClick={enterEdit}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--hs-border)] bg-white px-3 text-xs font-semibold text-[var(--hs-primary-strong)] transition-colors hover:bg-[var(--hs-hover)]"
          >
            <Edit3 className="size-3.5" aria-hidden="true" />
            编辑
          </button>
        </div>

        {initialMeasurements.length > 0 ? (
          <div className="hs-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--hs-border-soft)] bg-[var(--hs-bg-muted)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--hs-muted)]">指标</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--hs-muted)]">结果</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--hs-muted)]">参考范围</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--hs-border-soft)]">
                {initialMeasurements.map((m) => (
                  <tr key={m.id} className="hover:bg-[var(--hs-hover)]">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[var(--hs-text)]">{m.standardName ?? m.rawName}</p>
                      {m.standardName && m.standardName !== m.rawName && (
                        <p className="text-xs text-[var(--hs-muted-soft)]">{m.rawName}</p>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right ${FLAG_STYLE[m.flag] ?? ""}`}>
                      {m.value} {m.unit}
                      {FLAG_LABEL[m.flag] && (
                        <span className="ml-1 text-xs">{FLAG_LABEL[m.flag]}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-[var(--hs-muted-soft)]">
                      {m.refLow != null && m.refHigh != null
                        ? `${m.refLow} - ${m.refHigh}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="hs-card px-5 py-8 text-center text-sm text-[var(--hs-muted)]">
            此单据无数值检验指标
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="hs-eyebrow">Edit metrics</p>
          <h2 className="hs-heading mt-1 text-xl">
            编辑指标（{rows.length} 项）
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={cancelEdit}
            disabled={saving}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--hs-border)] bg-white px-3 text-xs font-semibold text-[var(--hs-muted)] transition-colors hover:bg-[var(--hs-hover)] disabled:opacity-40"
          >
            <X className="size-3.5" aria-hidden="true" />
            取消
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--hs-primary-strong)] px-3 text-xs font-semibold text-white transition-colors hover:bg-[var(--hs-primary)] disabled:opacity-40"
          >
            <Save className="size-3.5" aria-hidden="true" />
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-[var(--hs-danger-soft)] px-3 py-2 text-xs text-[var(--hs-danger)]">{error}</div>
      )}

      <div className="hs-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--hs-border-soft)] bg-[var(--hs-primary-soft)]">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--hs-muted)] min-w-[160px]">指标名</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--hs-muted)] w-24">数值</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--hs-muted)] w-24">单位</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--hs-muted)] w-20">参考下限</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--hs-muted)] w-20">参考上限</th>
              <th className="px-3 py-2 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hs-border-soft)]">
            {rows.map((r) => (
              <tr key={r._key}>
                <td className="px-3 py-1.5">
                  <input
                    value={r.name}
                    onChange={(e) => updateRow(r._key, "name", e.target.value)}
                    className="w-full rounded border border-[var(--hs-border)] px-2 py-1 text-sm focus:border-[var(--hs-primary)] focus:outline-none"
                    placeholder="指标名"
                  />
                  {r.originalRawName && r.originalRawName !== r.name && (
                    <p className="text-xs text-[var(--hs-muted-soft)] mt-0.5 px-1">{r.originalRawName}</p>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <input
                    value={r.value}
                    onChange={(e) => updateRow(r._key, "value", e.target.value)}
                    className="w-20 rounded border border-[var(--hs-border)] px-2 py-1 text-sm focus:border-[var(--hs-primary)] focus:outline-none"
                    placeholder="0.0"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    value={r.unit}
                    onChange={(e) => updateRow(r._key, "unit", e.target.value)}
                    className="w-20 rounded border border-[var(--hs-border)] px-2 py-1 text-sm focus:border-[var(--hs-primary)] focus:outline-none"
                    placeholder="单位"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    value={r.refLow}
                    onChange={(e) => updateRow(r._key, "refLow", e.target.value)}
                    className="w-16 rounded border border-[var(--hs-border)] px-2 py-1 text-sm focus:border-[var(--hs-primary)] focus:outline-none"
                    placeholder="—"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    value={r.refHigh}
                    onChange={(e) => updateRow(r._key, "refHigh", e.target.value)}
                    className="w-16 rounded border border-[var(--hs-border)] px-2 py-1 text-sm focus:border-[var(--hs-primary)] focus:outline-none"
                    placeholder="—"
                  />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <button
                    onClick={() => deleteRow(r._key)}
                    className="inline-flex size-7 items-center justify-center rounded-lg text-[var(--hs-muted-soft)] transition-colors hover:bg-[var(--hs-danger-soft)] hover:text-[var(--hs-danger)]"
                    title="删除此行"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-[var(--hs-border-soft)] px-3 py-2">
          <button
            onClick={addRow}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--hs-primary-strong)] transition-colors hover:text-[var(--hs-primary)]"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            添加行
          </button>
        </div>
      </div>
    </div>
  );
}
