"use client";

/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  RefreshCcw,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ItemStatus = "pending" | "uploading" | "queued" | "error" | "duplicate";

type UploadItem = {
  id: string;
  file: File;
  preview: string | null;
  status: ItemStatus;
  error?: string;
  documentId?: string;
};

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isAccepted(file: File) {
  return file.type.startsWith("image/") || isPdf(file);
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const newItems: UploadItem[] = Array.from(fileList)
      .filter(isAccepted)
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        status: "pending" as const,
      }));
    setItems((prev) => [...prev, ...newItems]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function retryItem(id: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: "pending", error: undefined } : item)),
    );
  }

  function patchItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pending = items.filter((item) => item.status === "pending");
    if (pending.length === 0 || submitting) return;

    setSubmitting(true);

    await Promise.all(
      pending.map(async (item) => {
        patchItem(item.id, { status: "uploading" });
        try {
          const form = new FormData();
          form.append("file", item.file);
          const res = await fetch("/api/documents", { method: "POST", body: form });
          const body = (await res.json()) as {
            id?: string | null;
            duplicate?: boolean;
            jobId?: string;
            error?: string;
          };
          if (!res.ok) throw new Error(body.error ?? "上传失败");
          patchItem(item.id, {
            status: body.duplicate ? "duplicate" : "queued",
            documentId: body.id ?? undefined,
          });
        } catch (err) {
          patchItem(item.id, {
            status: "error",
            error: err instanceof Error ? err.message : "未知错误",
          });
        }
      }),
    );

    setSubmitting(false);
  }

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const queuedCount = items.filter((i) => i.status === "queued").length;
  const allSettled = items.length > 0 && items.every((i) => i.status !== "pending" && i.status !== "uploading");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="hs-eyebrow">Upload</p>
        <h1 className="hs-heading mt-1 text-3xl">上传检查单据</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--hs-muted)]">
          支持图片（JPG、PNG、HEIC 等）和 PDF，可一次选择多个文件。上传后加入后台解析队列。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 拖拽区域 */}
        <div
          className={cn(
            "cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors sm:p-8",
            items.length > 0
              ? "border-[var(--hs-primary)] bg-[var(--hs-primary-soft)]"
              : "border-[var(--hs-border)] bg-[var(--hs-bg-muted)] hover:border-[var(--hs-primary)] hover:bg-white",
          )}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-lg bg-white text-[var(--hs-primary-strong)] shadow-sm">
              <ImageIcon className="size-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--hs-text)]">拖拽文件到这里，或点击选择</p>
              <p className="mt-1 text-xs text-[var(--hs-muted)]">支持多选 · JPG、PNG、HEIC 等图片，以及 PDF</p>
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* 文件列表 */}
        {items.length > 0 && (
          <div className="hs-card divide-y divide-[var(--hs-border-soft)] overflow-hidden p-0">
            {items.map((item) => (
              <FileRow
                key={item.id}
                item={item}
                onRemove={() => removeItem(item.id)}
                onRetry={() => retryItem(item.id)}
                onView={() => item.documentId && router.push(`/documents/${item.documentId}`)}
              />
            ))}
          </div>
        )}

        {/* 全部完成提示 */}
        {allSettled && queuedCount > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-[#c8ddd2] bg-[var(--hs-primary-soft)] px-4 py-3 text-sm text-[var(--hs-primary-strong)]">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span>
              {queuedCount} 个文件已加入解析队列，后台处理中。可继续添加更多文件。
            </span>
          </div>
        )}

        <button
          type="submit"
          disabled={pendingCount === 0 || submitting}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--hs-primary-strong)] text-sm font-semibold text-white transition-colors hover:bg-[var(--hs-primary)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              上传中...
            </>
          ) : (
            <>
              <Upload className="size-4" aria-hidden="true" />
              {pendingCount > 0 ? `开始解析（${pendingCount} 个文件）` : "开始解析"}
            </>
          )}
        </button>
      </form>
    </div>
  );
}

const STATUS_CONFIG: Record<
  ItemStatus,
  { label: string; cls: string; icon: typeof CheckCircle2 | null }
> = {
  pending: { label: "待上传", cls: "bg-[var(--hs-bg-muted)] text-[var(--hs-muted)]", icon: null },
  uploading: { label: "上传中", cls: "bg-[var(--hs-primary-soft)] text-[var(--hs-primary-strong)]", icon: Loader2 },
  queued: { label: "已入队", cls: "bg-[var(--hs-success-soft)] text-[var(--hs-success)]", icon: CheckCircle2 },
  duplicate: { label: "已存在", cls: "bg-[var(--hs-bg-muted)] text-[var(--hs-muted)]", icon: CheckCircle2 },
  error: { label: "失败", cls: "bg-[var(--hs-danger-soft)] text-[var(--hs-danger)]", icon: AlertCircle },
};

function FileRow({
  item,
  onRemove,
  onRetry,
  onView,
}: {
  item: UploadItem;
  onRemove: () => void;
  onRetry: () => void;
  onView: () => void;
}) {
  const cfg = STATUS_CONFIG[item.status];
  const Icon = cfg.icon;
  const canRemove = item.status === "pending" || item.status === "error";

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* 缩略图 / 图标 */}
      <div className="size-10 shrink-0 overflow-hidden rounded-md border border-[var(--hs-border-soft)] bg-[var(--hs-bg-muted)]">
        {item.preview ? (
          <img src={item.preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--hs-muted)]">
            <FileText className="size-5" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* 文件信息 */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--hs-text)]">{item.file.name}</p>
        <p className="mt-0.5 text-xs text-[var(--hs-muted-soft)]">{formatSize(item.file.size)}</p>
        {item.error && (
          <p className="mt-0.5 truncate text-xs text-[var(--hs-danger)]">{item.error}</p>
        )}
      </div>

      {/* 状态 badge */}
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
          cfg.cls,
        )}
      >
        {Icon && (
          <Icon
            className={cn("size-3", item.status === "uploading" && "animate-spin")}
            aria-hidden="true"
          />
        )}
        {cfg.label}
      </span>

      {/* 操作按钮 */}
      <div className="flex shrink-0 gap-1">
        {item.status === "error" && (
          <button
            type="button"
            onClick={onRetry}
            title="重试"
            className="flex size-7 items-center justify-center rounded-md text-[var(--hs-muted)] transition-colors hover:bg-[var(--hs-hover)] hover:text-[var(--hs-text)]"
          >
            <RefreshCcw className="size-3.5" aria-hidden="true" />
          </button>
        )}
        {(item.status === "queued" || item.status === "duplicate") && item.documentId && (
          <button
            type="button"
            onClick={onView}
            title="查看单据"
            className="flex size-7 items-center justify-center rounded-md text-[var(--hs-muted)] transition-colors hover:bg-[var(--hs-hover)] hover:text-[var(--hs-text)]"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </button>
        )}
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            title="移除"
            className="flex size-7 items-center justify-center rounded-md text-[var(--hs-muted)] transition-colors hover:bg-[var(--hs-hover)] hover:text-[var(--hs-danger)]"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
