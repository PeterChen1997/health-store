export type MeasurementFlag = "normal" | "high" | "low" | "critical_high" | "critical_low";

export type MeasurementForFlag = {
  raw_name: string;
  value: number;
  unit: string;
  ref_low: number | null;
  ref_high: number | null;
  flag: MeasurementFlag;
};

type OcrClassMarker = {
  key: string;
  level: number | null;
  positive: boolean;
  refLow: number | null;
  refHigh: number | null;
};

export function calcFlagFromRange(
  value: number,
  refLow: number | null,
  refHigh: number | null
): MeasurementFlag {
  if (refLow == null && refHigh == null) return "normal";
  if (refHigh != null && value > refHigh * 1.5) return "critical_high";
  if (refLow != null && refLow > 0 && value < refLow * 0.5) return "critical_low";
  if (refHigh != null && value > refHigh) return "high";
  if (refLow != null && value < refLow) return "low";
  return "normal";
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function cleanCellText(cell: string) {
  return decodeHtmlEntities(cell)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(name: string) {
  return name
    .replace(/^\s*\d+\s*[.．、)]\s*/u, "")
    .replace(/[\s,，、()（）]/gu, "")
    .trim()
    .toUpperCase();
}

function parseReportLevel(text: string) {
  const match = text.match(/([0-6])\s*级/u);
  return match ? Number(match[1]) : null;
}

function parseReferenceRange(text: string): { refLow: number | null; refHigh: number | null } | null {
  const normalized = cleanCellText(text)
    .replace(/[－–—−~～]/gu, "-")
    .replace(/\s+/g, "");
  if (!normalized) return null;

  const range = normalized.match(/^([+-]?\d+(?:\.\d+)?)-+([+-]?\d+(?:\.\d+)?)$/u);
  if (range) {
    return {
      refLow: Number(range[1]),
      refHigh: Number(range[2]),
    };
  }

  const upperBound = normalized.match(/^[<≤]([+-]?\d+(?:\.\d+)?)$/u);
  if (upperBound) {
    return { refLow: null, refHigh: Number(upperBound[1]) };
  }

  const lowerBound = normalized.match(/^[>≥]([+-]?\d+(?:\.\d+)?)$/u);
  if (lowerBound) {
    return { refLow: Number(lowerBound[1]), refHigh: null };
  }

  return null;
}

function levelFlag(level: number): MeasurementFlag {
  if (level <= 0) return "normal";
  return level >= 4 ? "critical_high" : "high";
}

function addMarker(
  markers: Map<string, OcrClassMarker>,
  name: string,
  resultText: string,
  unitText: string,
  refText = ""
) {
  const cleanName = cleanCellText(name);
  if (!cleanName || /^(?:项目名称|检验项目|姓名|名|性别)$/u.test(cleanName)) return;

  const level = parseReportLevel(resultText);
  const positive = /阳性/u.test(resultText);
  const range = parseReferenceRange(refText);
  if (level == null && !positive && !range) return;
  if (!unitText && !range) return;

  const key = normalizeName(cleanName);
  if (!key) return;

  markers.set(key, {
    key,
    level,
    positive,
    refLow: range?.refLow ?? null,
    refHigh: range?.refHigh ?? null,
  });
}

function parseOcrClassMarkers(ocrText: string) {
  const markers = new Map<string, OcrClassMarker>();
  const rowMatches = ocrText.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/giu);

  for (const rowMatch of rowMatches) {
    const cells = [...rowMatch[0].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)].map((cell) =>
      cleanCellText(cell[1] ?? "")
    );
    if (cells.length < 4) continue;

    // Format: 项目名称 | 浓度 | 级别 | 单位 | 结果解释
    addMarker(markers, cells[0] ?? "", cells[2] ?? "", cells[3] ?? "");

    // Format: 序号 | 检验项目 | 结果(含级别) | 单位 | 参考区间 | 检验项目 | 结果 | 单位 | 参考区间
    if (cells.length >= 5) {
      addMarker(markers, cells[1] || cells[0] || "", cells[2] ?? "", cells[3] ?? "", cells[4] ?? "");
    }
    if (cells.length >= 9) {
      addMarker(markers, cells[5] ?? "", cells[6] ?? "", cells[7] ?? "", cells[8] ?? "");
    }

    // Generic fallback: 检验项目 | 结果 | 单位 | 参考区间
    for (let i = 0; i <= cells.length - 4; i += 1) {
      addMarker(markers, cells[i] ?? "", cells[i + 1] ?? "", cells[i + 2] ?? "", cells[i + 3] ?? "");
    }
  }

  return markers;
}

function findMarker(rawName: string, markers: Map<string, OcrClassMarker>) {
  const key = normalizeName(rawName);
  return (
    markers.get(key) ??
    [...markers.values()].find((marker) => marker.key.includes(key) || key.includes(marker.key)) ??
    null
  );
}

export function applyOcrDerivedMeasurementFlags<T extends { measurements: MeasurementForFlag[] }>(
  extraction: T,
  ocrText: string
): T {
  const markers = parseOcrClassMarkers(ocrText);
  if (markers.size === 0) return extraction;

  return {
    ...extraction,
    measurements: extraction.measurements.map((measurement) => {
      const marker = findMarker(measurement.raw_name, markers);
      if (!marker) return measurement;

      const refLow = marker.refLow ?? measurement.ref_low;
      const refHigh = marker.refHigh ?? measurement.ref_high;
      let flag = measurement.flag;

      if (marker.level === 0) {
        flag = "normal";
      } else if (refLow != null || refHigh != null) {
        flag = calcFlagFromRange(measurement.value, refLow, refHigh);
        if (flag === "normal" && marker.level != null) {
          flag = levelFlag(marker.level);
        }
      } else if (marker.level != null) {
        flag = levelFlag(marker.level);
      } else if (marker.positive) {
        flag = "high";
      }

      return {
        ...measurement,
        ref_low: refLow,
        ref_high: refHigh,
        flag,
      };
    }),
  } as T;
}
