import { db } from "@/db/index";
import { notes } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NotesClient } from "@/components/NotesClient";
import { AppleHealthImport } from "@/components/AppleHealthImport";
import type { Note } from "@/types/notes";
import { HeartPulse, NotebookPen } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const rows = await db.select().from(notes).orderBy(desc(notes.createdAt));
  const initialNotes: Note[] = rows.map((r) => ({
    id: r.id,
    content: r.content,
    aiTags: r.aiTags,
    aiSummary: r.aiSummary,
    relatedAt: r.relatedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return (
    <div className="space-y-8">
      <div>
        <p className="hs-eyebrow">Notes</p>
        <h1 className="hs-heading mt-1 flex items-center gap-2 text-3xl">
          <NotebookPen className="size-6 text-[var(--hs-primary-strong)]" aria-hidden="true" />
          健康笔记
        </h1>
        <p className="mt-2 text-sm text-[var(--hs-muted)]">
          记录症状、用药、就诊，AI 自动打标签 · 共 {rows.length} 条
        </p>
      </div>
      <NotesClient initialNotes={initialNotes} />

      <section>
        <div className="mb-3 flex items-center gap-2">
          <HeartPulse className="size-5 text-[var(--hs-primary-strong)]" aria-hidden="true" />
          <h2 className="hs-heading text-xl">Apple 健康导入</h2>
        </div>
        <AppleHealthImport />
      </section>
    </div>
  );
}
