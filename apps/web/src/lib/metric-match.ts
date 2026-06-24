/**
 * 指标归一：把 OCR/LLM 抽取的原始指标名匹配到标准指标词典。
 *
 * 设计要点（修复旧版双向子串误配）：
 * - 先做规范化（去空白/标点、统一大小写、去掉 +/- 连字符），再比较。
 * - 精确匹配优先级远高于子串匹配。
 * - 子串匹配按"命中目标长度"打分，越长越具体者胜出，避免
 *   "高密度脂蛋白胆固醇" 因含 "胆固醇" 被误判为总胆固醇。
 * - 长度过短的别名（如 K / CA / Na / Cl）禁止参与子串匹配，
 *   避免 "CA199" 命中血钙、英文代号互相串味；这类只允许精确命中。
 */

export type MetricCatalogEntry = {
  id: string;
  standardName: string;
  aliases: string[];
};

// 参与"子串"匹配的最小规范化长度；短于此的别名只允许精确命中。
const MIN_SUBSTRING_LEN = 3;

export function normalizeMetricName(name: string): string {
  return name
    .replace(/^\s*\d+\s*[.．、)]\s*/u, "") // 去掉行首序号，如 "1. "
    .replace(/[\s,，、.．。:：;；%()（）\[\]【】+\-]/gu, "")
    .trim()
    .toUpperCase();
}

type Candidate = {
  id: string;
  score: number;
};

export function matchMetricId(
  rawName: string,
  catalog: readonly MetricCatalogEntry[]
): string | null {
  const needle = normalizeMetricName(rawName);
  if (!needle) return null;

  let best: Candidate | null = null;

  for (const entry of catalog) {
    for (const target of [entry.standardName, ...entry.aliases]) {
      const nt = normalizeMetricName(target);
      if (!nt) continue;

      let score = 0;
      if (nt === needle) {
        // 精确匹配：基线分远高于任何子串匹配，长度作为同分裁决。
        score = 1000 + nt.length;
      } else if (nt.length >= MIN_SUBSTRING_LEN && needle.length >= MIN_SUBSTRING_LEN) {
        // 子串匹配：命中的目标越长越具体，得分越高。
        if (needle.includes(nt) || nt.includes(needle)) {
          score = Math.min(nt.length, needle.length);
        }
      }

      if (score > 0 && (!best || score > best.score)) {
        best = { id: entry.id, score };
      }
    }
  }

  return best?.id ?? null;
}
