/**
 * 根据"每指标最新一次异常结果"生成复查提醒建议。
 * 把 measurements 的异常状态主动转化为可执行的复查待办，形成闭环。
 */

export type AbnormalMetricInput = {
  metricId: string | null;
  displayName: string;
  flag: string;
  value: number;
  unit: string;
  measuredAt: string;
  documentId: string | null;
};

export type ExistingReminder = {
  relatedMetricId: string | null;
  title: string;
  status: string;
};

export type RecheckSuggestion = {
  dedupeKey: string;
  title: string;
  kind: "recheck";
  dueDate: string; // YYYY-MM-DD
  note: string;
  relatedMetricId: string | null;
  relatedDocumentId: string | null;
};

const FLAG_LABEL: Record<string, string> = {
  high: "偏高",
  low: "偏低",
  critical_high: "极高",
  critical_low: "极低",
};

const ABNORMAL_FLAGS = new Set(Object.keys(FLAG_LABEL));

// 危急值 1 个月内复查，一般异常 3 个月复查。
function recheckMonths(flag: string): number {
  return flag === "critical_high" || flag === "critical_low" ? 1 : 3;
}

// 在 YYYY-MM-DD 基础上加 months 个月，按日历月进位，返回 YYYY-MM-DD。
export function addMonths(dateStr: string, months: number): string {
  const base = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return dateStr.slice(0, 10);
  const day = base.getUTCDate();
  base.setUTCMonth(base.getUTCMonth() + months);
  // 处理月末溢出（如 1/31 + 1 月）：溢出则回退到目标月最后一天
  if (base.getUTCDate() < day) base.setUTCDate(0);
  return base.toISOString().slice(0, 10);
}

export function buildRecheckSuggestions(
  abnormal: readonly AbnormalMetricInput[],
  existing: readonly ExistingReminder[]
): RecheckSuggestion[] {
  const takenMetricIds = new Set(
    existing
      .filter((r) => r.status === "active" && r.relatedMetricId)
      .map((r) => r.relatedMetricId as string)
  );
  const takenTitles = new Set(
    existing.filter((r) => r.status === "active").map((r) => r.title)
  );

  const suggestions: RecheckSuggestion[] = [];
  const seen = new Set<string>();

  for (const metric of abnormal) {
    if (!ABNORMAL_FLAGS.has(metric.flag)) continue;

    const title = `复查${metric.displayName}`;
    const dedupeKey = metric.metricId ?? `title:${title}`;

    // 跳过已存在的活跃提醒，避免重复建议
    if (metric.metricId && takenMetricIds.has(metric.metricId)) continue;
    if (takenTitles.has(title)) continue;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const flagLabel = FLAG_LABEL[metric.flag] ?? "异常";
    suggestions.push({
      dedupeKey,
      title,
      kind: "recheck",
      dueDate: addMonths(metric.measuredAt, recheckMonths(metric.flag)),
      note: `${metric.measuredAt.slice(0, 10)} 检测为${flagLabel}（${metric.value} ${metric.unit}），建议复查`,
      relatedMetricId: metric.metricId,
      relatedDocumentId: metric.documentId,
    });
  }

  return suggestions;
}
