/**
 * 回填脚本：为所有已有 ocr_markdown 的文档生成向量索引。
 * 用法：pnpm tsx --env-file=.env.local scripts/backfill-embeddings.ts
 */
import { db } from "../src/db/index";
import { documents } from "../src/db/schema";
import { isNotNull } from "drizzle-orm";
import { indexDocument } from "../src/lib/index-document-chunks";

async function main() {
  const rows = await db
    .select({ id: documents.id, institution: documents.institution, measuredAt: documents.measuredAt })
    .from(documents)
    .where(isNotNull(documents.ocrMarkdown));

  console.log(`共找到 ${rows.length} 份有 OCR 文本的单据，开始生成向量索引...`);

  let success = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await indexDocument(row.id);
      success++;
      console.log(`  ✓ ${row.measuredAt} ${row.institution ?? ""} (${row.id})`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${row.id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\n完成：${success} 成功，${failed} 失败。`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
