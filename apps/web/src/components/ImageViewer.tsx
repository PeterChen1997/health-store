"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus, X } from "lucide-react";

type Props = {
  src: string;
  alt: string;
};

function PdfViewer({ src }: { src: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--hs-border)] bg-white">
      <iframe
        src={src}
        title="PDF 原件"
        className="h-[600px] w-full"
      />
      <div className="border-t border-[var(--hs-border-soft)] px-4 py-2">
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-[var(--hs-primary-strong)] hover:underline"
        >
          在新标签页中打开 PDF
        </a>
      </div>
    </div>
  );
}

export function ImageViewer({ src, alt }: Props) {
  // 注意：Hooks 必须无条件调用，PDF 分支的早返回放在所有 Hook 之后。
  const isPdf = src.toLowerCase().split("?").at(0)?.endsWith(".pdf") ?? false;
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastOffset = useRef({ x: 0, y: 0 });

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    lastOffset.current = { x: 0, y: 0 };
  }, []);

  const openLightbox = () => {
    reset();
    setOpen(true);
  };

  const closeLightbox = () => {
    setOpen(false);
  };

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // 禁止背景滚动
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setScale((s) => Math.min(10, Math.max(0.5, s + delta)));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    lastOffset.current = offset;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    setOffset({
      x: lastOffset.current.x + (e.clientX - dragStart.current.x),
      y: lastOffset.current.y + (e.clientY - dragStart.current.y),
    });
  };

  const onMouseUp = () => {
    dragging.current = false;
    setIsDragging(false);
  };

  const zoom = (delta: number) => {
    setScale((s) => Math.min(10, Math.max(0.5, s + delta)));
  };

  if (isPdf) return <PdfViewer src={src} />;

  return (
    <>
      {/* 缩略图 — 点击放大 */}
      <div
        className="group relative cursor-zoom-in overflow-hidden rounded-lg border border-[var(--hs-border)] bg-white"
        onClick={openLightbox}
        title="点击放大"
      >
        <img
          src={src}
          alt={alt}
          className="w-full object-contain transition-opacity group-hover:opacity-90"
        />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="inline-flex items-center gap-2 rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <Maximize2 className="size-3.5" aria-hidden="true" />
            放大查看
          </span>
        </div>
      </div>

      {/* Lightbox */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={closeLightbox}
        >
          {/* 工具栏 */}
          <div
            className="absolute top-4 right-4 flex items-center gap-2 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => zoom(0.25)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25"
              title="放大"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => zoom(-0.25)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25"
              title="缩小"
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <button
              onClick={reset}
              className="flex h-8 items-center justify-center rounded-full bg-white/10 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/25"
              title="重置"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={closeLightbox}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25"
              title="关闭 (ESC)"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          {/* 图片容器 */}
          <div
            className="relative max-h-screen max-w-screen overflow-hidden select-none"
            style={{ cursor: scale > 1 ? "grab" : "default" }}
            onClick={(e) => e.stopPropagation()}
            onWheel={onWheel}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            <img
              src={src}
              alt={alt}
              draggable={false}
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transformOrigin: "center",
                transition: isDragging ? "none" : "transform 0.1s ease",
                maxHeight: "90vh",
                maxWidth: "90vw",
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
