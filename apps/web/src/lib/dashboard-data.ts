export type DashboardMeasurementRow = {
  metricId: string | null;
  rawName: string;
  standardName: string | null;
  value: number;
  unit: string;
  flag: string;
  measuredAt: string;
  documentId: string | null;
  category: string | null;
  refLow: number | null;
  refHigh: number | null;
};

export type DashboardMetricSnapshot = DashboardMeasurementRow & {
  key: string;
  displayName: string;
};

export type MarkerSummary = {
  total: number;
  normal: number;
  abnormal: number;
};

const ABNORMAL_FLAGS = new Set(["high", "low", "critical_high", "critical_low"]);

function metricKey(row: DashboardMeasurementRow) {
  return row.metricId ?? `raw:${row.rawName.trim().toUpperCase()}`;
}

function dateValue(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function priorityForFlag(flag: string) {
  if (flag === "critical_high" || flag === "critical_low") return 0;
  if (flag === "high" || flag === "low") return 1;
  return 2;
}

export function isAbnormalFlag(flag: string) {
  return ABNORMAL_FLAGS.has(flag);
}

export function getLatestMetricSnapshots(rows: DashboardMeasurementRow[]) {
  const latest = new Map<string, DashboardMeasurementRow>();

  for (const row of rows) {
    const key = metricKey(row);
    const current = latest.get(key);
    if (!current || dateValue(row.measuredAt) >= dateValue(current.measuredAt)) {
      latest.set(key, row);
    }
  }

  return Array.from(latest.entries()).map<DashboardMetricSnapshot>(([key, row]) => ({
    ...row,
    key,
    displayName: row.standardName ?? row.rawName,
  }));
}

export function summarizeLatestMarkers(rows: Array<{ flag: string }>): MarkerSummary {
  const total = rows.length;
  const abnormal = rows.filter((row) => isAbnormalFlag(row.flag)).length;
  return {
    total,
    normal: total - abnormal,
    abnormal,
  };
}

export function getDashboardHighlights(
  snapshots: DashboardMetricSnapshot[],
  max = 6,
) {
  return [...snapshots]
    .sort((a, b) => {
      const byFlag = priorityForFlag(a.flag) - priorityForFlag(b.flag);
      if (byFlag !== 0) return byFlag;
      return dateValue(b.measuredAt) - dateValue(a.measuredAt);
    })
    .slice(0, max);
}
