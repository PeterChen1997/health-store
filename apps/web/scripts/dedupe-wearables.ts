/**
 * 一次性清理脚本：去重历史 Apple 健康可穿戴数据。
 *
 * 背景：早期导入用随机 UUID 作主键，onConflictDoNothing 永不命中，重复
 * 导入会让数据翻倍。本脚本把 apple_health 来源的采样按
 * (source, type, ts, value) 去重，并把保留行的 id 改写为与线上导入一致的
 * 确定性 id，从而让此后的重复导入真正幂等。
 *
 * 用法：pnpm tsx --env-file=.env.local scripts/dedupe-wearables.ts
 */
import { sqlite } from "../src/db/index";
import { appleHealthSampleId } from "../src/lib/apple-health";

const SOURCE = "apple_health";

type Row = { type: string; value: number; unit: string; ts: string };

function main() {
  const before = (
    sqlite.prepare("SELECT COUNT(*) AS n FROM wearable_samples WHERE source = ?").get(SOURCE) as {
      n: number;
    }
  ).n;

  const rows = sqlite
    .prepare("SELECT type, value, unit, ts FROM wearable_samples WHERE source = ?")
    .all(SOURCE) as Row[];

  // 按确定性 id 去重，保留每个 key 一行（unit 取代表行）
  const unique = new Map<string, Row>();
  for (const row of rows) {
    unique.set(appleHealthSampleId(SOURCE, row), row);
  }

  const insert = sqlite.prepare(
    "INSERT INTO wearable_samples(id, source, type, value, unit, ts, created_at) VALUES (?,?,?,?,?,?, datetime('now'))"
  );

  const rebuild = sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM wearable_samples WHERE source = ?").run(SOURCE);
    for (const [id, row] of unique) {
      insert.run(id, SOURCE, row.type, row.value, row.unit, row.ts);
    }
  });
  rebuild();

  console.log(
    `apple_health 采样：${before} → ${unique.size}（删除 ${before - unique.size} 条重复），id 已改写为确定性键。`
  );
  process.exit(0);
}

main();
