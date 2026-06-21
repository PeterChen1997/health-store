"use client";

import { useState } from "react";
import type { Note } from "@/types/notes";
import { CalendarDays, Loader2, Plus, Trash2 } from "lucide-react";

type Props = { initialNotes: Note[] };

const TAG_COLOR: Record<string, string> = {
  症状: "bg-[var(--hs-danger-soft)] text-[var(--hs-danger)]",
  用药: "bg-[var(--hs-purple-soft)] text-[var(--hs-purple)]",
  饮食: "bg-[var(--hs-success-soft)] text-[var(--hs-success)]",
  睡眠: "bg-[var(--hs-purple-soft)] text-[var(--hs-purple)]",
  运动: "bg-[var(--hs-primary-soft)] text-[var(--hs-primary-strong)]",
  就诊: "bg-[var(--hs-warning-soft)] text-[var(--hs-warning)]",
  情绪: "bg-[var(--hs-purple-soft)] text-[var(--hs-purple)]",
  过敏: "bg-[var(--hs-warning-soft)] text-[var(--hs-warning)]",
  手术: "bg-[var(--hs-danger-soft)] text-[var(--hs-danger)]",
};

function tagStyle(tag: string) {
  return TAG_COLOR[tag] ?? "bg-gray-100 text-gray-600";
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function NotesClient({ initialNotes }: Props) {
  const [noteList, setNoteList] = useState<Note[]>(initialNotes);
  const [content, setContent] = useState("");
  const [relatedAt, setRelatedAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleSave() {
    if (!content.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, relatedAt: relatedAt || undefined }),
      });
      if (!res.ok) throw new Error("save failed");
      const note = (await res.json()) as Note;
      setNoteList((prev) => [note, ...prev]);
      setContent("");
      setRelatedAt("");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/notes/${id}`, { method: "DELETE" });
      setNoteList((prev) => prev.filter((n) => n.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="hs-card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="hs-heading text-lg">添加笔记</h2>
          {saving ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--hs-primary-strong)]">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              AI 分类中
            </span>
          ) : null}
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="记录症状、用药、就诊情况、饮食… AI 会自动分类"
          rows={4}
          className="w-full resize-none rounded-lg border border-[var(--hs-border)] px-3 py-2 text-sm focus:border-[var(--hs-primary)] focus:outline-none"
        />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--hs-muted)]">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              相关日期
            </label>
            <input
              type="date"
              value={relatedAt}
              onChange={(e) => setRelatedAt(e.target.value)}
              className="rounded border border-[var(--hs-border)] px-2 py-1 text-xs focus:border-[var(--hs-primary)] focus:outline-none"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !content.trim()}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--hs-primary-strong)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--hs-primary)] disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden="true" />
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
        {saving && (
          <p className="text-xs text-[var(--hs-muted-soft)]">AI 正在分类标签，请稍候…</p>
        )}
      </div>

      {noteList.length === 0 ? (
        <div className="hs-card py-12 text-center text-sm text-[var(--hs-muted)]">还没有笔记，写第一条吧</div>
      ) : (
        <div className="space-y-3">
          {noteList.map((note) => {
            const tags = parseTags(note.aiTags);
            return (
              <div key={note.id} className="hs-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {tags.map((t) => (
                          <span key={t} className={`rounded-full px-2 py-0.5 text-xs font-medium ${tagStyle(t)}`}>
                            {t}
                          </span>
                        ))}
                        {note.relatedAt && (
                          <span className="rounded-full bg-[var(--hs-bg-muted)] px-2 py-0.5 text-xs text-[var(--hs-muted)]">
                            {note.relatedAt}
                          </span>
                        )}
                      </div>
                    )}
                    {note.aiSummary && (
                      <p className="text-sm font-semibold text-[var(--hs-text)] mb-1">{note.aiSummary}</p>
                    )}
                    <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--hs-muted)]">{note.content}</p>
                    <p className="mt-2 text-xs text-[var(--hs-muted-soft)]">{note.createdAt.slice(0, 10)}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(note.id)}
                    disabled={deletingId === note.id}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--hs-muted-soft)] transition-colors hover:bg-[var(--hs-danger-soft)] hover:text-[var(--hs-danger)] disabled:opacity-40"
                    title="删除"
                  >
                    {deletingId === note.id ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
