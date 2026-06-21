import { NextRequest } from "next/server";
import { createAsyncJobService, serializeAsyncJobForApi } from "@/lib/async-jobs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = await createAsyncJobService().getJob(id);

  if (!job) {
    return Response.json({ error: "未找到任务" }, { status: 404 });
  }

  return Response.json(serializeAsyncJobForApi(job));
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobs = createAsyncJobService();
  const job = await jobs.getJob(id);

  if (!job) {
    return Response.json({ error: "未找到任务" }, { status: 404 });
  }

  if (job.status !== "error") {
    return Response.json({ error: "只有失败任务可以重试" }, { status: 409 });
  }

  const retried = await jobs.retryFailed(id);
  return Response.json(serializeAsyncJobForApi(retried), { status: 202 });
}
