"use client";

import { useState } from "react";
import { LineChart, Line, ResponsiveContainer, ReferenceLine } from "recharts";
import type { MetricTrend } from "@/types/trends";
import { TrendChart } from "./TrendChart";

const CATEGORY_LABEL: Record<string, string> = {
  blood_glucose: "血糖",
  blood_lipid: "血脂",
  blood_routine: "血常规",
  bone: "骨密度",
  electrolyte: "电解质",
  kidney: "肾功能",
  liver: "肝功能",
  thyroid: "甲状腺",
  other: "其他",
};

const FLAG_BADGE: Record<string, { label: string; cls: string }> = {
  normal: { label: "正常", cls: "bg-[var(--hs-success-soft)] text-[var(--hs-success)]" },
  high: { label: "偏高↑", cls: "bg-[var(--hs-danger-soft)] text-[var(--hs-danger)]" },
  low: { label: "偏低↓", cls: "bg-[var(--hs-warning-soft)] text-[var(--hs-warning)]" },
  critical_high: { label: "极高↑↑", cls: "bg-[var(--hs-danger-soft)] text-[var(--hs-danger)] font-semibold" },
  critical_low: { label: "极低↓↓", cls: "bg-[var(--hs-danger-soft)] text-[var(--hs-danger)] font-semibold" },
};

function Sparkline({ trend }: { trend: MetricTrend }) {
  if (trend.points.length < 2) {
    return (
      <div className="flex h-10 items-end justify-center">
        <div className="h-3 w-3 rounded-full bg-gray-300" />
      </div>
    );
  }
  const data = trend.points.map((p) => ({ v: p.value }));
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data}>
        {trend.refLow != null && (
          <ReferenceLine y={trend.refLow} stroke="#86efac" strokeWidth={1} />
        )}
        {trend.refHigh != null && (
          <ReferenceLine y={trend.refHigh} stroke="#86efac" strokeWidth={1} />
        )}
        <Line type="monotone" dataKey="v" stroke="#4E8E6A" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

type Props = { trends: MetricTrend[] };

export function TrendsView({ trends }: Props) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // 构造分类 tab
  const categoriesInData = Array.from(
    new Set(trends.map((t) => t.category ?? "other"))
  );
  const tabs = [
    { key: "all", label: "全部" },
    ...categoriesInData.map((c) => ({ key: c, label: CATEGORY_LABEL[c] ?? c })),
  ];

  const filtered =
    activeCategory === "all"
      ? trends
      : trends.filter((t) => (t.category ?? "other") === activeCategory);

  // 异常指标优先
  const sorted = [...filtered].sort((a, b) => {
    const order = (f: string) =>
      f === "critical_high" || f === "critical_low"
        ? 0
        : f === "high" || f === "low"
          ? 1
          : 2;
    return order(a.latestFlag) - order(b.latestFlag);
  });

  const selectedTrend = selectedKey
    ? trends.find((t) => (t.metricId ?? `raw:${t.rawName}`) === selectedKey) ?? null
    : null;

  return (
    <div>
      {/* 分类 tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveCategory(tab.key);
              setSelectedKey(null);
            }}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              activeCategory === tab.key
                ? "bg-[var(--hs-primary-strong)] text-white"
                : "border border-[var(--hs-border)] bg-white text-[var(--hs-muted)] hover:bg-[var(--hs-hover)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 指标卡片网格 */}
      {sorted.length === 0 ? (
        <div className="hs-card py-16 text-center text-[var(--hs-muted)]">暂无指标数据</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {sorted.map((trend) => {
            const key = trend.metricId ?? `raw:${trend.rawName}`;
            const latest = trend.points.at(-1)!;
            const badge = FLAG_BADGE[trend.latestFlag] ?? FLAG_BADGE.normal;
            const isSelected = selectedKey === key;

            return (
              <button
                key={key}
                onClick={() => setSelectedKey(isSelected ? null : key)}
                className={`rounded-xl border p-3 text-left transition-all ${
                  isSelected
                    ? "border-[var(--hs-primary)] bg-[var(--hs-primary-soft)] shadow-sm"
                    : "border-[var(--hs-border)] bg-white hover:bg-[var(--hs-hover)] hover:shadow-sm"
                }`}
              >
                <div className="mb-1 flex items-start justify-between gap-1">
                  <p className="line-clamp-2 text-xs font-semibold leading-tight text-[var(--hs-text)]">
                    {trend.standardName ?? trend.rawName}
                  </p>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
                <p className="text-lg font-bold text-[var(--hs-text)]">
                  {latest.value}
                  <span className="ml-1 text-xs font-normal text-[var(--hs-muted)]">
                    {trend.standardUnit ?? latest.unit}
                  </span>
                </p>
                <p className="mb-1 text-[10px] text-[var(--hs-muted-soft)]">{latest.measuredAt.slice(0, 10)}</p>
                <Sparkline trend={trend} />
              </button>
            );
          })}
        </div>
      )}

      {/* 展开的详细图表 */}
      {selectedTrend && (
        <div className="hs-card mt-6 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="hs-heading text-lg">
                {selectedTrend.standardName ?? selectedTrend.rawName}
              </h2>
              {selectedTrend.standardName && selectedTrend.rawName !== selectedTrend.standardName && (
                <p className="text-xs text-[var(--hs-muted-soft)]">{selectedTrend.rawName}</p>
              )}
              {selectedTrend.refLow != null && selectedTrend.refHigh != null && (
                <p className="mt-0.5 text-xs text-[var(--hs-muted)]">
                  参考范围：{selectedTrend.refLow} – {selectedTrend.refHigh}{" "}
                  {selectedTrend.standardUnit}
                </p>
              )}
            </div>
            <button
              onClick={() => setSelectedKey(null)}
              className="text-lg leading-none text-[var(--hs-muted-soft)] hover:text-[var(--hs-text)]"
            >
              ✕
            </button>
          </div>
          <TrendChart trend={selectedTrend} height={240} />
        </div>
      )}
    </div>
  );
}
