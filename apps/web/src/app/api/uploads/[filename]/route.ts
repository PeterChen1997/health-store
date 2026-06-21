import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const UPLOADS_DIR = path.resolve(process.cwd(), "../../data/uploads");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // 防止路径穿越
  const safe = path.basename(filename);
  const filePath = path.join(UPLOADS_DIR, safe);

  try {
    const buf = await readFile(filePath);
    const ext = path.extname(safe).slice(1).toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return new Response(buf, { headers: { "Content-Type": mime } });
  } catch {
    return Response.json({ error: "文件不存在" }, { status: 404 });
  }
}
