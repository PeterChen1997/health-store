import { db } from "@/db/index";
import { measurements, metricCatalog } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import type { MetricTrend } from "@/types/trends";

export async function GET() {
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

  // 分组：用 metricId 或 rawName 作为 key
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

  return Response.json(Array.from(grouped.values()));
}
