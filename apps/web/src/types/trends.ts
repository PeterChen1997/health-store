export type TrendPoint = {
  measuredAt: string;
  value: number;
  unit: string;
  flag: string;
  documentId: string | null;
};

export type MetricTrend = {
  metricId: string | null;
  rawName: string;
  standardName: string | null;
  category: string | null;
  refLow: number | null;
  refHigh: number | null;
  standardUnit: string | null;
  points: TrendPoint[];
  latestFlag: string;
};
