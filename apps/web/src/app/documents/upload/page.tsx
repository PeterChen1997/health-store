"use client";

/* eslint-disable @next/next/no-img-element */

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileText, ImageIcon, Loader2, Upload } from "lucide-react";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "queued" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleFile(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStatus("idle");
    setError(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files.item(0);
    if (f && f.type.startsWith("image/")) handleFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setError(null);
    setStatus("uploading");

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const body = await res.json() as {
        id?: string | null;
        duplicate?: boolean;
        jobId?: string;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(body.error ?? "上传失败");
      }

      if (body.duplicate && body.id) {
        setStatus("done");
        router.push(`/documents/${body.id}`);
        return;
      }

      if (!body.jobId) {
        throw new Error("解析任务响应格式错误");
      }

      setFile(null);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
      setStatus("queued");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "未知错误");
    }
  }

  function resetQueuedState() {
    if (status === "queued") {
      setStatus("idle");
      setError(null);
    }
  }

  function handlePickClick() {
    resetQueuedState();
    inputRef.current?.click();
  }

  async function handleQueuedSubmit(e: React.FormEvent) {
    await handleSubmit(e);
  }

  const statusText: Record<string, string> = {
    uploading: "保存图片并加入队列中...",
    queued: "已加入解析队列，可以继续上传下一张。",
    done: "完成，跳转中...",
    error: "出错了",
  };
  const isBusy = status === "uploading" || status === "done";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="hs-eyebrow">Upload</p>
        <h1 className="hs-heading mt-1 text-3xl">上传检查单据</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--hs-muted)]">
          支持图片类检查单据。上传后会保存原图并加入后台解析队列。
        </p>
      </div>

      <form onSubmit={handleQueuedSubmit} className="hs-card space-y-5 p-5">
        <div
          className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors sm:p-8
            ${preview ? "border-[var(--hs-primary)] bg-[var(--hs-primary-soft)]" : "border-[var(--hs-border)] bg-[var(--hs-bg-muted)] hover:border-[var(--hs-primary)] hover:bg-white"}`}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={handlePickClick}
        >
          {preview ? (
            <img src={preview} alt="预览" className="mx-auto max-h-80 rounded-lg object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-lg bg-white text-[var(--hs-primary-strong)] shadow-sm">
                <ImageIcon className="size-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--hs-text)]">拖拽图片到这里，或点击选择</p>
                <p className="mt-1 text-xs text-[var(--hs-muted)]">JPG、PNG、HEIC 等图片格式</p>
              </div>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.item(0);
              if (f) handleFile(f);
            }}
          />
        </div>

        {file && (
          <div className="flex items-center gap-3 rounded-lg border border-[var(--hs-border)] bg-white p-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--hs-bg-muted)] text-[var(--hs-primary-strong)]">
              <FileText className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--hs-text)]">{file.name}</p>
              <p className="text-xs text-[var(--hs-muted-soft)]">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
          </div>
        )}

        {status !== "idle" && status !== "error" && (
          <div className="flex items-center gap-3 rounded-lg border border-[#c8ddd2] bg-[var(--hs-primary-soft)] px-4 py-3 text-sm text-[var(--hs-primary-strong)]">
            {status === "queued" || status === "done" ? (
              <CheckCircle2 className="size-4" aria-hidden="true" />
            ) : (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            )}
            <span>{statusText[status]}</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-[#edd8d4] bg-[var(--hs-danger-soft)] px-4 py-3 text-sm text-[var(--hs-danger)]">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setError(null);
                }}
                className="mt-2 text-xs font-semibold underline underline-offset-4"
              >
                重新尝试
              </button>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!file || isBusy}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--hs-primary-strong)] text-sm font-semibold text-white transition-colors hover:bg-[var(--hs-primary)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Upload className="size-4" aria-hidden="true" />
          {status === "idle" || status === "error" || status === "queued" ? "开始解析" : statusText[status]}
        </button>
      </form>
    </div>
  );
}
