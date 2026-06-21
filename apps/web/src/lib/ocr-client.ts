import { readFile } from "fs/promises";
import path from "path";
import { Agent } from "undici";

const OCR_URL = process.env.OCR_SERVICE_URL ?? "http://localhost:8700";

// Node.js 原生 fetch (undici) 默认 headersTimeout = 300s，会在代码里的 600s AbortSignal 之前触发。
// 用自定义 Agent 把内置超时清零，让 AbortSignal.timeout(600_000) 成为唯一上限。
const ocrDispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

export type OcrResult = {
  markdown: string;
  json_data: unknown[];
  raw_text?: string;
  mode?: string;
  analysis_text?: string;
  run_id?: string;
  timing?: {
    predict_ms?: number;
    total_ms?: number;
  };
  blocks?: unknown[];
};

const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".bmp": "image/bmp",
};

export function getOcrAnalysisText(ocr: OcrResult): string {
  return ocr.analysis_text || ocr.markdown;
}

export function getOcrModelName(mode: string | null | undefined): string | null {
  if (mode === "vl") return "PaddleOCR-VL";
  if (mode === "ppocr") return "PP-OCRv6";
  return null;
}

export async function parseImage(imagePath: string, runId?: string): Promise<OcrResult> {
  const buf = await readFile(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mime = EXT_MIME[ext] ?? "image/jpeg";
  const blob = new Blob([buf], { type: mime });

  const form = new FormData();
  form.append("file", blob, path.basename(imagePath));
  if (runId) {
    form.append("run_id", runId);
  }

  const res = await fetch(`${OCR_URL}/parse`, {
    method: "POST",
    body: form,
    // PaddleOCR-VL runs on local CPU and may need several minutes for one image.
    signal: AbortSignal.timeout(600_000),
    // @ts-expect-error -- undici-specific option，覆盖内置 headersTimeout/bodyTimeout
    dispatcher: ocrDispatcher,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`OCR 服务错误 ${res.status}: ${msg}`);
  }
  return res.json() as Promise<OcrResult>;
}

export async function checkOcrHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${OCR_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;

    const body = await res.json().catch(() => null) as
      | { status?: unknown; pipeline?: unknown }
      | null;
    return body?.status === "ok" && body.pipeline === "ready";
  } catch {
    return false;
  }
}
