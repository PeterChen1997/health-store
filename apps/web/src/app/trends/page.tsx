import { db } from "@/db/index";
import { measurements, metricCatalog } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import type { MetricTrend } from "@/types/trends";
import { TrendsView } from "@/components/TrendsView";
import Link from "next/link";
import { Upload } from "lucide-react";

export const dynamic = "force-dynamic";

async function getTrends(): Promise<MetricTrend[]> {
  const rows = await db
    .select({
      metricId: measurements.metricId,
      rawName: measurements.rawName,
      value: measurements.value,
      unit: measurements.unit,
      flag: measurements.flag,
      measuredAt: measurements.measuredAt,
      documentId: measurements.documentId,
      standardName: metricCatalog.standardName,
      category: metricCatalog.category,
      refLow: metricCatalog.refLow,
      refHigh: metricCatalog.refHigh,
      standardUnit: metricCatalog.standardUnit,
    })
    .from(measurements)
    .leftJoin(metricCatalog, eq(measurements.metricId, metricCatalog.id))
    .orderBy(asc(measurements.measuredAt));

  const grouped = new Map<string, MetricTrend>();

  for (const row of rows) {
    const key = row.metricId ?? `raw:${row.rawName}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        metricId: row.metricId,
        rawName: row.rawName,
        standardName: row.standardName,
        category: row.category,
        refLow: row.refLow,
        refHigh: row.refHigh,
        standardUnit: row.standardUnit,
        points: [],
        latestFlag: row.flag,
      });
    }
    const trend = grouped.get(key)!;
    trend.points.push({
      measuredAt: row.measuredAt,
      value: row.value,
      unit: row.unit,
      flag: row.flag,
      documentId: row.documentId,
    });
    trend.latestFlag = row.flag;
  }

  return Array.from(grouped.values());
}

export default async function TrendsPage() {
  const trends = await getTrends();

  const abnormalCount = trends.filter(
    (t) => t.latestFlag !== "normal"
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <p className="hs-eyebrow">Trends</p>
        <h1 className="hs-heading mt-1 text-3xl">指标趋势</h1>
        <p className="mt-2 text-sm text-[var(--hs-muted)]">
          共 {trends.length} 项指标
          {abnormalCount > 0 && (
            <span className="ml-2 font-semibold text-[var(--hs-danger)]">
              · {abnormalCount} 项异常
            </span>
          )}
        </p>
      </div>

      {trends.length === 0 ? (
        <div className="hs-card flex flex-col items-center px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-lg bg-[var(--hs-primary-soft)] text-[var(--hs-primary-strong)]">
            <Upload className="size-6" aria-hidden="true" />
          </div>
          <h2 className="hs-heading mt-4 text-xl">暂无指标数据</h2>
          <p className="mt-2 text-sm text-[var(--hs-muted)]">上传检查单据后，解析出的数值指标会在这里显示。</p>
          <Link
            href="/documents/upload"
            className="mt-5 inline-flex h-10 items-center rounded-lg bg-[var(--hs-primary-strong)] px-4 text-sm font-semibold text-white hover:bg-[var(--hs-primary)]"
          >
            上传单据
          </Link>
        </div>
      ) : (
        <TrendsView trends={trends} />
      )}
    </div>
  );
}
