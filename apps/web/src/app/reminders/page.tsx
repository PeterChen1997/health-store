import { db } from "@/db/index";
import { measurements, metricCatalog, reminders } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { Bell } from "lucide-react";
import { RemindersClient } from "@/components/RemindersClient";
import {
  getLatestMetricSnapshots,
  isAbnormalFlag,
  type DashboardMeasurementRow,
} from "@/lib/dashboard-data";
import { buildRecheckSuggestions } from "@/lib/reminder-suggestions";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const [rows, measurementRows] = await Promise.all([
    db.select().from(reminders).orderBy(asc(reminders.dueDate)),
    db
      .select({
        metricId: measurements.metricId,
        rawName: measurements.rawName,
        standardName: metricCatalog.standardName,
        value: measurements.value,
        unit: measurements.unit,
        flag: measurements.flag,
        measuredAt: measurements.measuredAt,
        documentId: measurements.documentId,
        category: metricCatalog.category,
        refLow: metricCatalog.refLow,
        refHigh: metricCatalog.refHigh,
      })
      .from(measurements)
      .leftJoin(metricCatalog, eq(measurements.metricId, metricCatalog.id))
      .orderBy(asc(measurements.measuredAt)),
  ]);

  const initialReminders = rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    dueDate: r.dueDate,
    relatedMetricId: r.relatedMetricId,
    relatedDocumentId: r.relatedDocumentId,
    note: r.note,
    status: r.status,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
  }));

  // 异常指标 → 复查建议（每指标最新一次，排除已有活跃提醒）
  const latestAbnormal = getLatestMetricSnapshots(measurementRows as DashboardMeasurementRow[]).filter(
    (m) => isAbnormalFlag(m.flag)
  );
  const initialSuggestions = buildRecheckSuggestions(
    latestAbnormal.map((m) => ({
      metricId: m.metricId,
      displayName: m.displayName,
      flag: m.flag,
      value: m.value,
      unit: m.unit,
      measuredAt: m.measuredAt,
      documentId: m.documentId,
    })),
    rows
  );

  const activeCount = rows.filter((r) => r.status === "active").length;

  return (
    <div className="space-y-6">
      <div>
        <p className="hs-eyebrow">Reminders</p>
        <h1 className="hs-heading mt-1 flex items-center gap-2 text-3xl">
          <Bell className="size-6 text-[var(--hs-primary-strong)]" aria-hidden="true" />
          复查提醒
        </h1>
        <p className="mt-2 text-sm text-[var(--hs-muted)]">
          设置复查、体检、用药提醒，到期时首页会主动显示。当前 {activeCount} 条待办。
        </p>
      </div>
      <RemindersClient initialReminders={initialReminders} initialSuggestions={initialSuggestions} />
    </div>
  );
}
