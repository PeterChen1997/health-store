import { NextRequest } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { db } from "@/db/index";
import { documents } from "@/db/schema";
import { md5Buffer } from "@/lib/image-md5";
import { findStoredDocumentByImageMd5 } from "@/lib/document-dedupe";
import { createAsyncJobService } from "@/lib/async-jobs";
import { desc } from "drizzle-orm";

const UPLOADS_DIR = path.resolve(process.cwd(), "../../data/uploads");

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

export async function GET() {
  const rows = await db
    .select()
    .from(documents)
    .orderBy(desc(documents.measuredAt));
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "需要上传图片文件" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const imageMd5 = md5Buffer(buf);

  const existingDocument = await findStoredDocumentByImageMd5(imageMd5);

  if (existingDocument) {
    return Response.json({
      id: existingDocument.id,
      duplicate: true,
      message: "当前数据已经存储完毕",
    });
  }

  const jobs = createAsyncJobService();
  const activeJob = await jobs.findActiveJob("document_import", imageMd5);
  if (activeJob) {
    return Response.json({
      id: getDocumentIdFromJobInput(activeJob.input),
      jobId: activeJob.id,
      status: activeJob.status,
      duplicateJob: true,
      queued: true,
    }, { status: 202 });
  }

  const ext = path.extname(file.name) || ".jpg";
  const docId = crypto.randomUUID();
  const filename = `${docId}${ext}`;
  const savePath = path.join(UPLOADS_DIR, filename);
  const imagePath = `uploads/${filename}`;

  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(savePath, buf);

  const { job, reused } = await jobs.enqueue({
    type: "document_import",
    resourceId: imageMd5,
    input: {
      documentId: docId,
      imagePath,
      imageMd5,
      fileName: file.name,
      inputBytes: buf.length,
    },
  });

  if (reused) {
    await unlink(savePath).catch(() => undefined);
  }

  return Response.json({
    id: getDocumentIdFromJobInput(job.input) ?? docId,
    jobId: job.id,
    status: job.status,
    duplicateJob: reused,
    queued: true,
  }, { status: 202 });
}
