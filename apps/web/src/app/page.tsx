import Link from "next/link";
import { asc, count, desc, eq } from "drizzle-orm";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Database,
  FileText,
  HeartPulse,
  NotebookPen,
  Sparkles,
  Upload,
} from "lucide-react";
import { db } from "@/db/index";
import {
  documents,
  measurements,
  metricCatalog,
  notes,
  pipelineRuns,
  wearableSamples,
} from "@/db/schema";
import {
  DOCUMENT_TYPE_BADGE_BASE,
  getDocumentTypeBadge,
} from "@/lib/document-types";
import {
  getDashboardHighlights,
  getLatestMetricSnapshots,
  isAbnormalFlag,
  summarizeLatestMarkers,
} from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FLAG_BADGE: Record<string, { label: string; cls: string }> = {
  normal: { label: "正常", cls: "hs-status-success" },
  high: { label: "偏高", cls: "hs-status-danger" },
  low: { label: "偏低", cls: "hs-status-warning" },
  critical_high: { label: "极高", cls: "hs-status-danger" },
  critical_low: { label: "极低", cls: "hs-status-danger" },
};

const WEARABLE_LABEL: Record<string, string> = {
  heart_rate: "心率",
  resting_heart_rate: "静息心率",
  steps: "步数",
  blood_oxygen: "血氧",
  body_weight: "体重",
  hrv: "心率变异性",
  sleep: "睡眠",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "未识别日期";
  return value.slice(0, 10);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function flagBadge(flag: string) {
  return FLAG_BADGE[flag] ?? FLAG_BADGE.normal;
}

export default async function HomeDashboard() {
  const [
    documentCountRows,
    documentRows,
    measurementRows,
    noteCountRows,
    noteRows,
    wearableRows,
    pipelineRows,
  ] = await Promise.all([
      db.select({ value: count() }).from(documents),
      db
        .select({
          id: documents.id,
          documentType: documents.documentType,
          institution: documents.institution,
          measuredAt: documents.measuredAt,
          createdAt: documents.createdAt,
          measurementCount: count(measurements.id),
        })
        .from(documents)
        .leftJoin(measurements, eq(measurements.documentId, documents.id))
        .groupBy(documents.id)
        .orderBy(desc(documents.measuredAt), desc(documents.createdAt), asc(documents.id))
        .limit(5),
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
        .leftJoin(metricCatalog, eq(measurements.metricId, metricCatalog.id)),
      db.select({ value: count() }).from(notes),
      db.select().from(notes).orderBy(desc(notes.createdAt)).limit(3),
      db.select().from(wearableSamples).orderBy(desc(wearableSamples.ts)).limit(6),
      db
        .select({
          id: pipelineRuns.id,
          runId: pipelineRuns.runId,
          stage: pipelineRuns.stage,
          status: pipelineRuns.status,
          createdAt: pipelineRuns.createdAt,
        })
        .from(pipelineRuns)
        .orderBy(desc(pipelineRuns.createdAt))
        .limit(12),
    ]);

  const documentCount = documentCountRows[0]?.value ?? 0;
  const noteCount = noteCountRows[0]?.value ?? 0;
  const latestMetrics = getLatestMetricSnapshots(measurementRows);
  const markerSummary = summarizeLatestMarkers(latestMetrics);
  const highlights = getDashboardHighlights(latestMetrics, 6);
  const abnormalMetrics = latestMetrics.filter((metric) => isAbnormalFlag(metric.flag));
  const metricTotal = measurementRows.length;
  const pipelineErrorCount = pipelineRows.filter((row) => row.status === "error").length;
  const latestWearable = wearableRows.at(0);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--hs-muted)]">
            {new Intl.DateTimeFormat("zh-CN", {
              month: "long",
              day: "numeric",
              weekday: "long",
            }).format(new Date())}
          </p>
          <h1 className="hs-heading mt-2 text-3xl">健康总览</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--hs-muted)]">
            汇总检查单据、结构化指标、健康笔记和可穿戴数据，快速看到最近需要关注的地方。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/documents/upload"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--hs-primary-strong)] px-4 text-sm font-semibold text-white hover:bg-[var(--hs-primary)]"
          >
            <Upload className="size-4" aria-hidden="true" />
            上传单据
          </Link>
          <Link
            href="/insights"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--hs-border)] bg-white px-4 text-sm font-semibold text-[var(--hs-primary-strong)] hover:bg-[var(--hs-hover)]"
          >
            <Sparkles className="size-4" aria-hidden="true" />
            生成洞察
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={FileText}
          label="健康单据"
          value={documentCount}
          helper="最近上传与解析记录"
          href="/documents"
        />
        <SummaryCard
          icon={Activity}
          label="结构化指标"
          value={metricTotal}
          helper={`${markerSummary.total} 项最新指标可追踪`}
          href="/trends"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="需要关注"
          value={markerSummary.abnormal}
          helper={`${markerSummary.normal} / ${markerSummary.total || 0} 项最新指标正常`}
          href="/trends"
          tone={markerSummary.abnormal > 0 ? "danger" : "success"}
        />
        <SummaryCard
          icon={NotebookPen}
          label="健康笔记"
          value={noteCount}
          helper="症状、用药与就诊记录"
          href="/notes"
        />
      </section>

      {markerSummary.total > 0 ? (
        <section className="hs-card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="hs-eyebrow">最新指标</p>
              <h2 className="hs-heading mt-1 text-xl">
                {markerSummary.normal} / {markerSummary.total} 项在正常范围
              </h2>
            </div>
            <Link
              href="/trends"
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--hs-primary-strong)]"
            >
              查看趋势
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {highlights.map((metric) => {
              const badge = flagBadge(metric.flag);
              const content = (
                <div className="h-full rounded-lg border border-[var(--hs-border-soft)] bg-white p-4 transition-colors hover:bg-[var(--hs-hover)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--hs-text)]">
                        {metric.displayName}
                      </p>
                      {metric.standardName && metric.standardName !== metric.rawName ? (
                        <p className="mt-1 truncate text-xs text-[var(--hs-muted-soft)]">
                          {metric.rawName}
                        </p>
                      ) : null}
                    </div>
                    <span className={badge.cls}>{badge.label}</span>
                  </div>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-2xl font-bold tracking-normal text-[var(--hs-text)]">
                      {metric.value}
                    </span>
                    <span className="text-sm font-medium text-[var(--hs-muted)]">
                      {metric.unit}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-[var(--hs-muted-soft)]">
                    {formatDate(metric.measuredAt)}
                    {metric.refLow != null || metric.refHigh != null ? (
                      <span>
                        {" "}
                        · 参考 {metric.refLow ?? "-"} - {metric.refHigh ?? "-"}
                      </span>
                    ) : null}
                  </p>
                </div>
              );

              return metric.documentId ? (
                <Link key={metric.key} href={`/documents/${metric.documentId}`}>
                  {content}
                </Link>
              ) : (
                <div key={metric.key}>{content}</div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="hs-card flex flex-col items-center px-6 py-14 text-center">
          <div className="flex size-12 items-center justify-center rounded-lg bg-[var(--hs-primary-soft)] text-[var(--hs-primary-strong)]">
            <Upload className="size-6" aria-hidden="true" />
          </div>
          <h2 className="hs-heading mt-4 text-xl">还没有可追踪指标</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-[var(--hs-muted)]">
            上传检查单据后，系统会通过 OCR 和 AI 抽取结构化指标，并在这里显示最新状态。
          </p>
          <Link
            href="/documents/upload"
            className="mt-5 inline-flex h-10 items-center rounded-lg bg-[var(--hs-primary-strong)] px-4 text-sm font-semibold text-white hover:bg-[var(--hs-primary)]"
          >
            上传第一张单据
          </Link>
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="hs-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--hs-border-soft)] px-5 py-4">
            <div>
              <p className="hs-eyebrow">最近单据</p>
              <h2 className="hs-heading mt-1 text-lg">解析记录</h2>
            </div>
            <Link
              href="/documents"
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--hs-primary-strong)]"
            >
              全部单据
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          {documentRows.length > 0 ? (
            <div className="divide-y divide-[var(--hs-border-soft)]">
              {documentRows.map((doc) => {
                const documentTypeBadge = getDocumentTypeBadge(doc.documentType);

                return (
                  <Link
                    key={doc.id}
                    href={`/documents/${doc.id}`}
                    className="grid gap-3 px-5 py-4 transition-colors hover:bg-[var(--hs-hover)] sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn(DOCUMENT_TYPE_BADGE_BASE, documentTypeBadge.className)}>
                          {documentTypeBadge.label}
                        </span>
                      <span className="truncate text-sm font-semibold text-[var(--hs-text)]">
                        {doc.institution || "未识别机构"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--hs-muted-soft)]">
                      检查日期 {formatDate(doc.measuredAt)} · 录入于 {formatDate(doc.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[var(--hs-muted)]">
                    {Number(doc.measurementCount) > 0 ? (
                      <span>{doc.measurementCount} 项指标</span>
                    ) : (
                      <span>无数值指标</span>
                    )}
                    <ArrowRight className="size-4 text-[var(--hs-muted-soft)]" aria-hidden="true" />
                  </div>
                </Link>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-12 text-center text-sm text-[var(--hs-muted)]">
              还没有单据记录。
            </div>
          )}
        </div>

        <div className="space-y-5">
          <InsightCard abnormalMetrics={abnormalMetrics.length} />
          <StatusCard
            icon={HeartPulse}
            title="Apple 健康"
            badge={latestWearable ? "已导入" : "未导入"}
            badgeTone={latestWearable ? "success" : "neutral"}
            href="/notes"
          >
            {latestWearable ? (
              <>
                最近记录：{WEARABLE_LABEL[latestWearable.type] ?? latestWearable.type} ·{" "}
                {latestWearable.value} {latestWearable.unit}
                <br />
                {formatDate(latestWearable.ts)}
              </>
            ) : (
              "在健康笔记页导入 iPhone 健康 App 的 export.xml。"
            )}
          </StatusCard>
          <StatusCard
            icon={Database}
            title="Pipeline 日志"
            badge={pipelineErrorCount > 0 ? `${pipelineErrorCount} 个错误` : "运行正常"}
            badgeTone={pipelineErrorCount > 0 ? "danger" : "success"}
            href="/logs"
          >
            最近 {pipelineRows.length} 条 OCR / LLM 阶段记录。
          </StatusCard>
          <div className="hs-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="hs-heading text-lg">最近笔记</h2>
              <Link href="/notes" className="text-sm font-semibold text-[var(--hs-primary-strong)]">
                查看
              </Link>
            </div>
            {noteRows.length > 0 ? (
              <div className="space-y-3">
                {noteRows.map((note) => (
                  <div key={note.id} className="rounded-lg bg-[var(--hs-bg-muted)] p-3">
                    <p className="line-clamp-2 text-sm leading-6 text-[var(--hs-text)]">
                      {note.aiSummary || note.content}
                    </p>
                    <p className="mt-2 text-xs text-[var(--hs-muted-soft)]">
                      {formatDate(note.relatedAt || note.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-[var(--hs-muted)]">
                还没有健康笔记，可以记录症状、用药、就诊和生活方式变化。
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  helper,
  href,
  tone = "neutral",
}: {
  icon: typeof FileText;
  label: string;
  value: number;
  helper: string;
  href: string;
  tone?: "neutral" | "success" | "danger";
}) {
  return (
    <Link href={href} className="hs-card block p-4 transition-colors hover:bg-[var(--hs-hover)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[var(--hs-muted-soft)]">{label}</p>
          <p className="mt-2 text-2xl font-bold text-[var(--hs-text)]">{formatNumber(value)}</p>
        </div>
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-lg",
            tone === "danger"
              ? "bg-[var(--hs-danger-soft)] text-[var(--hs-danger)]"
              : tone === "success"
                ? "bg-[var(--hs-success-soft)] text-[var(--hs-success)]"
                : "bg-[var(--hs-primary-soft)] text-[var(--hs-primary-strong)]",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--hs-muted)]">{helper}</p>
    </Link>
  );
}

function InsightCard({ abnormalMetrics }: { abnormalMetrics: number }) {
  return (
    <Link
      href="/insights"
      className="block rounded-lg border border-[#c8ddd2] bg-[linear-gradient(135deg,#eef4f0,#e6f0ea)] p-5 transition-opacity hover:opacity-90"
    >
      <div className="flex gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--hs-primary-strong)] text-white">
          <Sparkles className="size-5" aria-hidden="true" />
        </div>
        <div>
          <p className="hs-eyebrow text-[var(--hs-primary-strong)]">AI 健康洞察</p>
          <p className="mt-2 text-sm leading-6 text-[#264838]">
            {abnormalMetrics > 0
              ? `当前有 ${abnormalMetrics} 项最新指标需要关注，可生成综合解读与行动建议。`
              : "根据全部结构化指标生成综合报告，帮助你快速理解近期健康状态。"}
          </p>
        </div>
      </div>
    </Link>
  );
}

function StatusCard({
  icon: Icon,
  title,
  badge,
  badgeTone,
  href,
  children,
}: {
  icon: typeof HeartPulse;
  title: string;
  badge: string;
  badgeTone: "success" | "danger" | "neutral";
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="hs-card block p-5 transition-colors hover:bg-[var(--hs-hover)]">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--hs-bg-muted)] text-[var(--hs-primary-strong)]">
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--hs-text)]">{title}</h2>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-semibold",
                badgeTone === "success" && "bg-[var(--hs-success-soft)] text-[var(--hs-success)]",
                badgeTone === "danger" && "bg-[var(--hs-danger-soft)] text-[var(--hs-danger)]",
                badgeTone === "neutral" && "bg-[var(--hs-bg-muted)] text-[var(--hs-muted)]",
              )}
            >
              {badge}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--hs-muted)]">{children}</p>
        </div>
      </div>
    </Link>
  );
}
