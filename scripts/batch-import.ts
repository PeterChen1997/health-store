/**
 * 批量导入图片到 health-store
 * 用法（在项目根目录执行）：
 *   pnpm --filter web exec tsx --env-file=$(pwd)/apps/web/.env.local ../../scripts/batch-import.ts <图片目录>
 *
 * 示例：
 *   pnpm --filter web exec tsx --env-file=$(pwd)/apps/web/.env.local ../../scripts/batch-import.ts /Users/peterchen/Downloads/report
 */
import { readdir, copyFile, mkdir, readFile, unlink } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../apps/web/src/db/index";
import { measurements } from "../apps/web/src/db/schema";
import { findStoredDocumentByImageMd5 } from "../apps/web/src/lib/document-dedupe";
import { md5Buffer } from "../apps/web/src/lib/image-md5";
import { createAsyncJobService } from "../apps/web/src/lib/async-jobs";
import { eq } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, "../data/uploads");
const SUPPORTED = new Set([".jpg", ".jpeg", ".png", ".heic", ".webp", ".bmp"]);

function getDocumentIdFromJobInput(input: unknown) {
  if (
    typeof input === "object" &&
    input !== null &&
    "documentId" in input &&
    typeof input.documentId === "string"
  ) {
    return input.documentId;
  }

  return null;
}

function getActiveJobStatus(status: string) {
  return status === "running" ? "running" : "queued";
}

async function importOne(srcPath: string) {
  const srcBuf = await readFile(srcPath);
  const imageMd5 = md5Buffer(srcBuf);
  const existingDocument = await findStoredDocumentByImageMd5(imageMd5);

  if (existingDocument) {
    const existingMeasurements = await db
      .select({ id: measurements.id })
      .from(measurements)
      .where(eq(measurements.documentId, existingDocument.id));

    return {
      docId: existingDocument.id,
      measurementCount: existingMeasurements.length,
      date: existingDocument.measuredAt,
      status: "existing" as const,
    };
  }

  const jobs = createAsyncJobService();
  const activeJob = await jobs.findActiveJob("document_import", imageMd5);
  if (activeJob) {
    return {
      jobId: activeJob.id,
      docId: getDocumentIdFromJobInput(activeJob.input),
      jobStatus: getActiveJobStatus(activeJob.status),
      status: "reused" as const,
    };
  }

  const ext = path.extname(srcPath).toLowerCase();
  const docId = crypto.randomUUID();
  const filename = `${docId}${ext}`;
  const destPath = path.join(UPLOADS_DIR, filename);
  const imagePath = `uploads/${filename}`;

  await copyFile(srcPath, destPath);

  const { job, reused } = await jobs.enqueue({
    type: "document_import",
    resourceId: imageMd5,
    input: {
      documentId: docId,
      imagePath,
      imageMd5,
      sourcePath: srcPath,
      inputBytes: srcBuf.length,
    },
  });

  if (reused) {
    await unlink(destPath).catch(() => undefined);
    return {
      jobId: job.id,
      docId: getDocumentIdFromJobInput(job.input),
      jobStatus: getActiveJobStatus(job.status),
      status: "reused" as const,
    };
  }

  return {
    docId,
    jobId: job.id,
    jobStatus: getActiveJobStatus(job.status),
    status: "queued" as const,
  };
}

async function main() {
  const sourceDir = process.argv.at(2);
  if (!sourceDir) {
    console.error("用法: tsx scripts/batch-import.ts <图片目录路径>");
    process.exit(1);
  }

  const allFiles = await readdir(sourceDir);
  const images = allFiles
    .filter((f) => SUPPORTED.has(path.extname(f).toLowerCase()))
    .sort();

  if (images.length === 0) {
    console.log("目录中没有找到支持的图片（jpg / png / heic / webp / bmp）");
    return;
  }

  console.log(`找到 ${images.length} 张图片。`);
  await mkdir(UPLOADS_DIR, { recursive: true });
  console.log("开始入队...\n");

  let queued = 0;
  let reused = 0;
  let existing = 0;
  let fail = 0;
  const errors: string[] = [];

  for (const [i, file] of images.entries()) {
    const filePath = path.join(sourceDir, file);
    process.stdout.write(`[${i + 1}/${images.length}] ${file} ... `);
    try {
      const result = await importOne(filePath);
      if (result.status === "existing") {
        console.log(`✓  已存在  ${result.date}  /  ${result.measurementCount} 项指标  (${result.docId.slice(0, 8)})`);
        existing++;
      } else if (result.status === "reused") {
        const docText = result.docId ? ` / doc ${result.docId.slice(0, 8)}` : "";
        console.log(`↺  已在队列  ${result.jobStatus}  job ${result.jobId.slice(0, 8)}${docText}`);
        reused++;
      } else {
        console.log(`✓  已入队  job ${result.jobId.slice(0, 8)} / doc ${result.docId.slice(0, 8)}`);
        queued++;
      }
    } catch (err) {
      const cause = err instanceof Error && (err as NodeJS.ErrnoException & { cause?: unknown }).cause;
      const msg = err instanceof Error ? err.message : String(err);
      const detail = cause instanceof Error ? ` → ${cause.message}` : cause ? ` → ${String(cause)}` : "";
      console.log(`✗  失败: ${msg}${detail}`);
      errors.push(`${file}: ${msg}${detail}`);
      fail++;
    }
  }

  console.log(`\n━━━ 入队完成：${queued} 新入队，${reused} 复用队列，${existing} 已存在，${fail} 失败 ━━━`);
  if (errors.length > 0) {
    console.log("\n失败详情：");
    for (const e of errors) console.log(`  ${e}`);
  }
}

main();
