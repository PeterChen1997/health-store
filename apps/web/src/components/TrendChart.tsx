"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import type { MetricTrend } from "@/types/trends";

type Props = {
  trend: MetricTrend;
  height?: number;
};

const FLAG_COLOR: Record<string, string> = {
  normal: "#3E7054",
  high: "#CC6858",
  low: "#B89040",
  critical_high: "#9A4840",
  critical_low: "#9A4840",
};

function CustomDot(props: {
  cx?: number;
  cy?: number;
  payload?: { flag: string };
}) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const color = FLAG_COLOR[payload?.flag ?? "normal"] ?? "#6b7280";
  return <circle cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={2} />;
}

export function TrendChart({ trend, height = 200 }: Props) {
  const data = trend.points.map((p) => ({
    date: p.measuredAt.slice(0, 10),
    value: p.value,
    flag: p.flag,
    unit: p.unit,
  }));

  const values = data.map((d) => d.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const padding = (dataMax - dataMin) * 0.3 || 1;
  const yMin = Math.min(dataMin - padding, trend.refLow ?? dataMin - padding);
  const yMax = Math.max(dataMax + padding, trend.refHigh ?? dataMax + padding);

  const hasRef = trend.refLow != null && trend.refHigh != null;
  const unit = trend.standardUnit ?? trend.points.at(0)?.unit ?? "";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickFormatter={(v: string) => v.slice(0, 7)}
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickFormatter={(v: number) => v.toFixed(1)}
          width={45}
        />
        <Tooltip
          formatter={(value) => [`${value} ${unit}`, trend.standardName ?? trend.rawName]}
          labelStyle={{ fontSize: 12 }}
          contentStyle={{ fontSize: 12 }}
        />

        {/* 参考范围绿色背景带 */}
        {hasRef && (
          <ReferenceArea
            y1={trend.refLow!}
            y2={trend.refHigh!}
            fill="#D0E4D8"
            fillOpacity={0.5}
          />
        )}
        {hasRef && (
          <>
            <ReferenceLine y={trend.refLow!} stroke="#7AAE90" strokeDasharray="4 2" strokeWidth={1} />
            <ReferenceLine y={trend.refHigh!} stroke="#7AAE90" strokeDasharray="4 2" strokeWidth={1} />
          </>
        )}

        <Line
          type="monotone"
          dataKey="value"
          stroke="#4E8E6A"
          strokeWidth={2}
          dot={<CustomDot />}
          activeDot={{ r: 7 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
