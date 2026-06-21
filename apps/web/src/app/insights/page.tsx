import { InsightsClient } from "@/components/InsightsClient";
import { db } from "@/db/index";
import { measurements } from "@/db/schema";
import { count } from "drizzle-orm";
import Link from "next/link";
import { Sparkles, Upload } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const [{ value: totalCount }] = await db.select({ value: count() }).from(measurements);

  return (
    <div className="space-y-6">
      <div>
        <p className="hs-eyebrow">Insights</p>
        <h1 className="hs-heading mt-1 flex items-center gap-2 text-3xl">
          <Sparkles className="size-6 text-[var(--hs-primary-strong)]" aria-hidden="true" />
          AI 健康洞察
        </h1>
        <p className="mt-2 text-sm text-[var(--hs-muted)]">
          基于 {totalCount} 条健康指标，由 AI 生成综合分析报告
        </p>
      </div>

      {totalCount === 0 ? (
        <div className="hs-card flex flex-col items-center px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-lg bg-[var(--hs-primary-soft)] text-[var(--hs-primary-strong)]">
            <Upload className="size-6" aria-hidden="true" />
          </div>
          <h2 className="hs-heading mt-4 text-xl">暂无健康数据</h2>
          <p className="mt-2 text-sm text-[var(--hs-muted)]">上传并解析检查单据后，即可生成 AI 洞察报告。</p>
          <Link
            href="/documents/upload"
            className="mt-5 inline-flex h-10 items-center rounded-lg bg-[var(--hs-primary-strong)] px-4 text-sm font-semibold text-white hover:bg-[var(--hs-primary)]"
          >
            上传单据
          </Link>
        </div>
      ) : (
        <InsightsClient />
      )}
    </div>
  );
}
