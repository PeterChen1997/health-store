import { db } from "@/db/index";
import { asyncJobs, pipelineRuns } from "@/db/schema";
import {
  summarizeAsyncJobs,
  toAsyncJobView,
  type AsyncJobView,
} from "@/lib/async-job-view";
import { RetryJobButton } from "@/components/RetryJobButton";
import {
  groupPipelineRunsByRunId,
  readJsonlTail,
  toPipelineRunView,
  type JsonlTailRecord,
  type PipelineRunView,
} from "@/lib/pipeline-log-view";
import { desc } from "drizzle-orm";
import Link from "next/link";
import path from "node:path";
import { Activity, Clock3, Database, ListChecks, Upload } from "lucide-react";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  ocr: "OCR",
  llm_repair: "LLM 纠错",
  llm_extract: "LLM 抽取",
};

const STATUS_LABEL: Record<string, string> = {
  success: "成功",
  error: "失败",
};

const JOB_TYPE_LABEL: Record<string, string> = {
  document_import: "导入解析",
  document_reparse: "重新解析",
};

const JOB_STATUS_LABEL: Record<string, string> = {
  queued: "待处理",
  running: "处理中",
  success: "已完成",
  error: "失败",
};

const LOG_DIR = path.resolve(process.cwd(), "../../data/logs");

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatDuration(value: number | null) {
  if (value === null) return "—";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function formatChars(input: number | null, output: number | null) {
  if (input === null && output === null) return "—";
  return `${input ?? "—"} / ${output ?? "—"}`;
}

function statusClass(status: string) {
  return status === "error"
    ? "bg-red-50 text-red-700 ring-red-200"
    : "bg-green-50 text-green-700 ring-green-200";
}

function jobStatusClass(status: string) {
  if (status === "error") return "bg-red-50 text-red-700 ring-red-200";
  if (status === "success") return "bg-green-50 text-green-700 ring-green-200";
  if (status === "running") return "bg-blue-50 text-blue-700 ring-blue-200";
  return "bg-amber-50 text-amber-700 ring-amber-200";
}

function getStageLabel(stage: string) {
  return STAGE_LABEL[stage] ?? stage;
}

function getJobTypeLabel(type: string) {
  return JOB_TYPE_LABEL[type] ?? type;
}

function getJobStatusLabel(status: string) {
  return JOB_STATUS_LABEL[status] ?? status;
}

function activeDuration(job: AsyncJobView) {
  const start = job.startedAt ?? job.createdAt;
  const startMs = new Date(start).getTime();
  if (Number.isNaN(startMs)) return "—";
  const endMs = job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now();
  if (Number.isNaN(endMs)) return "—";
  return formatDuration(Math.max(0, endMs - startMs));
}

function JsonPreview({ title, records }: { title: string; records: JsonlTailRecord[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        <p className="mt-1 text-xs text-gray-400">最近 {records.length} 条 JSONL</p>
      </div>
      {records.length === 0 ? (
        <div className="px-4 py-8 text-sm text-gray-400">暂无日志文件或日志记录。</div>
      ) : (
        <div className="max-h-96 overflow-auto p-4">
          <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-600">
            {records.map((record) => JSON.stringify(record, null, 2)).join("\n\n")}
          </pre>
        </div>
      )}
    </div>
  );
}

function StageTable({ stages }: { stages: PipelineRunView[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3 text-left font-medium">阶段</th>
            <th className="px-4 py-3 text-left font-medium">状态</th>
            <th className="px-4 py-3 text-left font-medium">耗时</th>
            <th className="px-4 py-3 text-left font-medium">输入/输出</th>
            <th className="px-4 py-3 text-left font-medium">模型</th>
            <th className="px-4 py-3 text-left font-medium">摘要</th>
            <th className="px-4 py-3 text-left font-medium">时间</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {stages.map((stage) => (
            <tr key={stage.id}>
              <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-800">
                {getStageLabel(stage.stage)}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusClass(stage.status)}`}>
                  {STATUS_LABEL[stage.status] ?? stage.status}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDuration(stage.durationMs)}</td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-500">
                {formatChars(stage.inputChars, stage.outputChars)}
              </td>
              <td className="max-w-48 truncate px-4 py-3 text-gray-600">{stage.model ?? stage.mode ?? "—"}</td>
              <td className="min-w-52 px-4 py-3 text-gray-600">
                <div className="flex flex-wrap gap-1.5">
                  {stage.facts.length > 0 ? (
                    stage.facts.map((fact) => (
                      <span key={fact} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {fact}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                  {stage.error && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">
                      {stage.error}
                    </span>
                  )}
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-400">{formatDate(stage.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QueueTable({ jobs, emptyText }: { jobs: AsyncJobView[]; emptyText: string }) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-white px-4 py-8 text-sm text-gray-400">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3 text-left font-medium">任务</th>
            <th className="px-4 py-3 text-left font-medium">状态</th>
            <th className="px-4 py-3 text-left font-medium">对象</th>
            <th className="px-4 py-3 text-left font-medium">尝试</th>
            <th className="px-4 py-3 text-left font-medium">耗时</th>
            <th className="px-4 py-3 text-left font-medium">结果</th>
            <th className="px-4 py-3 text-left font-medium">更新时间</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {jobs.map((job) => (
            <tr key={job.id}>
              <td className="whitespace-nowrap px-4 py-3">
                <div className="font-medium text-gray-800">{getJobTypeLabel(job.type)}</div>
                <code className="mt-1 block text-xs text-gray-400">{job.shortId}</code>
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${jobStatusClass(job.status)}`}>
                  {getJobStatusLabel(job.status)}
                </span>
              </td>
              <td className="min-w-64 px-4 py-3 text-gray-600">
                <div className="max-w-80 truncate">{job.resourceLabel}</div>
                {job.documentId ? (
                  <Link
                    href={`/documents/${job.documentId}`}
                    className="mt-1 inline-block text-xs font-semibold text-[var(--hs-primary-strong)] hover:underline"
                  >
                    查看单据 →
                  </Link>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-gray-600">{job.attempts}</td>
              <td className="whitespace-nowrap px-4 py-3 text-gray-600">{activeDuration(job)}</td>
              <td className="min-w-48 px-4 py-3 text-gray-600">
                {job.error ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">{job.error}</span>
                    {job.status === "error" ? <RetryJobButton jobId={job.id} /> : null}
                  </div>
                ) : job.measurementCount !== null ? (
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                    {job.measurementCount} 项指标{job.duplicate ? " · 重复" : ""}
                  </span>
                ) : job.status === "queued" ? (
                  <span className="text-gray-400">等待 worker 消费</span>
                ) : job.status === "running" ? (
                  <span className="text-blue-600">OCR / LLM 处理中</span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-400">{formatDate(job.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function LogsPage() {
  const [rows, jobRows] = await Promise.all([
    db
      .select({
        id: pipelineRuns.id,
        runId: pipelineRuns.runId,
        documentId: pipelineRuns.documentId,
        stage: pipelineRuns.stage,
        status: pipelineRuns.status,
        mode: pipelineRuns.mode,
        model: pipelineRuns.model,
        inputChars: pipelineRuns.inputChars,
        outputChars: pipelineRuns.outputChars,
        durationMs: pipelineRuns.durationMs,
        error: pipelineRuns.error,
        metadata: pipelineRuns.metadata,
        createdAt: pipelineRuns.createdAt,
      })
      .from(pipelineRuns)
      .orderBy(desc(pipelineRuns.createdAt))
      .limit(60),
    db
      .select({
        id: asyncJobs.id,
        type: asyncJobs.type,
        status: asyncJobs.status,
        resourceId: asyncJobs.resourceId,
        input: asyncJobs.input,
        result: asyncJobs.result,
        error: asyncJobs.error,
        attempts: asyncJobs.attempts,
        createdAt: asyncJobs.createdAt,
        startedAt: asyncJobs.startedAt,
        finishedAt: asyncJobs.finishedAt,
        updatedAt: asyncJobs.updatedAt,
      })
      .from(asyncJobs)
      .orderBy(desc(asyncJobs.updatedAt))
      .limit(120),
  ]);

  const views = rows.map(toPipelineRunView);
  const groups = groupPipelineRunsByRunId(views);
  const [ocrLogs, llmLogs] = await Promise.all([
    readJsonlTail(path.join(LOG_DIR, "ocr-runs.jsonl"), 3),
    readJsonlTail(path.join(LOG_DIR, "llm-runs.jsonl"), 3),
  ]);
  const errorGroupCount = groups.filter((group) => group.status === "error").length;
  const jobViews = jobRows.map(toAsyncJobView);
  const jobSummary = summarizeAsyncJobs(jobViews);
  const queuedJobs = jobViews
    .filter((job) => job.status === "queued")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const runningJobs = jobViews
    .filter((job) => job.status === "running")
    .sort((a, b) => a.startedAt?.localeCompare(b.startedAt ?? "") ?? 0);
  const finishedJobs = jobViews
    .filter((job) => job.status === "success" || job.status === "error")
    .slice(0, 20);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="hs-eyebrow">Diagnostics</p>
          <h1 className="hs-heading mt-1 flex items-center gap-2 text-3xl">
            <Database className="size-6 text-[var(--hs-primary-strong)]" aria-hidden="true" />
            Pipeline 运行日志
          </h1>
          <p className="mt-2 text-sm text-[var(--hs-muted)]">
            查看上传和重解析时的 OCR、LLM 纠错、LLM 抽取记录。
          </p>
        </div>
        <Link
          href="/documents/upload"
          className="inline-flex h-10 w-fit items-center gap-2 rounded-lg bg-[var(--hs-primary-strong)] px-4 text-sm font-semibold text-white hover:bg-[var(--hs-primary)]"
        >
          <Upload className="size-4" aria-hidden="true" />
          上传单据
        </Link>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--hs-text)]">
              <Activity className="size-5 text-[var(--hs-primary-strong)]" aria-hidden="true" />
              消费队列
            </h2>
            <p className="mt-1 text-sm text-[var(--hs-muted)]">
              async_jobs 队列状态与最近处理结果。
            </p>
          </div>
          <span className="text-xs text-gray-400">async_jobs 最近 {jobViews.length} 条</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="hs-card px-4 py-3">
            <p className="text-xs text-[var(--hs-muted-soft)]">待处理</p>
            <p className="mt-1 text-2xl font-semibold text-amber-700">{jobSummary.byStatus.queued}</p>
          </div>
          <div className="hs-card px-4 py-3">
            <p className="text-xs text-[var(--hs-muted-soft)]">处理中</p>
            <p className="mt-1 text-2xl font-semibold text-blue-700">{jobSummary.byStatus.running}</p>
          </div>
          <div className="hs-card px-4 py-3">
            <p className="text-xs text-[var(--hs-muted-soft)]">已完成</p>
            <p className="mt-1 text-2xl font-semibold text-green-700">{jobSummary.byStatus.success}</p>
          </div>
          <div className="hs-card px-4 py-3">
            <p className="text-xs text-[var(--hs-muted-soft)]">失败</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--hs-danger)]">{jobSummary.byStatus.error}</p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-gray-500">
                <Clock3 className="size-4" aria-hidden="true" />
                哪些要处理 / 没处理
              </h3>
              <span className="text-xs text-gray-400">共 {queuedJobs.length} 个，按创建时间从早到晚</span>
            </div>
            <QueueTable jobs={queuedJobs.slice(0, 30)} emptyText="当前没有等待处理的任务。" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-gray-500">
                <ListChecks className="size-4" aria-hidden="true" />
                具体处理情况
              </h3>
              <span className="text-xs text-gray-400">处理中 + 最近完成/失败</span>
            </div>
            <div className="space-y-4">
              <QueueTable jobs={runningJobs} emptyText="当前没有正在处理的任务。" />
              <QueueTable jobs={finishedJobs} emptyText="最近还没有完成或失败的任务。" />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="hs-card px-4 py-3">
          <p className="text-xs text-[var(--hs-muted-soft)]">最近 run_id</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--hs-text)]">{groups.length}</p>
        </div>
        <div className="hs-card px-4 py-3">
          <p className="text-xs text-[var(--hs-muted-soft)]">阶段记录</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--hs-text)]">{views.length}</p>
        </div>
        <div className="hs-card px-4 py-3">
          <p className="text-xs text-[var(--hs-muted-soft)]">失败 run_id</p>
          <p className={`mt-1 text-2xl font-semibold ${errorGroupCount > 0 ? "text-[var(--hs-danger)]" : "text-[var(--hs-text)]"}`}>
            {errorGroupCount}
          </p>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">数据库记录</h2>
          <span className="text-xs text-gray-400">pipeline_runs 最近 60 条</span>
        </div>

        {groups.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-200 bg-white py-16 text-center">
            <p className="text-sm text-gray-500">还没有 pipeline 运行日志。</p>
            <Link href="/documents/upload" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
              上传一张检查单据生成日志 →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.runId} className="rounded-lg border border-gray-200 bg-white">
                <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="break-all rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                        {group.runId}
                      </code>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusClass(group.status)}`}>
                        {STATUS_LABEL[group.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      最新记录 {formatDate(group.latestCreatedAt)} · {group.stages.length} 个阶段
                    </p>
                  </div>
                  {group.documentId && (
                    <Link
                      href={`/documents/${group.documentId}`}
                      className="text-sm font-semibold text-[var(--hs-primary-strong)] hover:underline"
                    >
                      查看单据 →
                    </Link>
                  )}
                </div>
                <StageTable stages={group.stages} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">JSONL 日志</h2>
          <span className="text-xs text-gray-400">data/logs 最近 3 条</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <JsonPreview title="ocr-runs.jsonl" records={ocrLogs} />
          <JsonPreview title="llm-runs.jsonl" records={llmLogs} />
        </div>
      </section>
    </div>
  );
}
