"use client";

import { useState } from "react";
import { Bell, BellOff, CalendarClock, CheckCircle2, PlusCircle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Reminder = {
  id: string;
  title: string;
  kind: string;
  dueDate: string;
  relatedMetricId: string | null;
  relatedDocumentId: string | null;
  note: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
};

type Props = {
  initialReminders: Reminder[];
};

const KIND_LABEL: Record<string, string> = {
  recheck: "复查随访",
  annual_physical: "年度体检",
  medication: "用药提醒",
  custom: "自定义",
};

const KIND_CLASS: Record<string, string> = {
  recheck: "bg-[var(--hs-primary-soft)] text-[var(--hs-primary-strong)]",
  annual_physical: "bg-[var(--hs-success-soft)] text-[var(--hs-success)]",
  medication: "bg-[var(--hs-warning-soft)] text-[var(--hs-warning)]",
  custom: "bg-[var(--hs-bg-muted)] text-[var(--hs-muted)]",
};

function dueDateStyle(dueDate: string, today: string) {
  if (dueDate < today) return "text-[var(--hs-danger)] font-semibold";
  const diff = Math.ceil((new Date(dueDate).getTime() - new Date(today).getTime()) / 86400000);
  if (diff <= 7) return "text-[var(--hs-warning)] font-semibold";
  return "text-[var(--hs-muted)]";
}

function dueDateLabel(dueDate: string, today: string) {
  if (dueDate < today) {
    const days = Math.ceil((new Date(today).getTime() - new Date(dueDate).getTime()) / 86400000);
    return `已逾期 ${days} 天`;
  }
  if (dueDate === today) return "今天到期";
  const diff = Math.ceil((new Date(dueDate).getTime() - new Date(today).getTime()) / 86400000);
  if (diff <= 7) return `${diff} 天后到期`;
  return dueDate;
}

export function RemindersClient({ initialReminders }: Props) {
  const [reminders, setReminders] = useState<Reminder[]>(initialReminders);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"recheck" | "annual_physical" | "medication" | "custom">("recheck");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<"active" | "done">("active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), kind, dueDate, note: note.trim() || null }),
      });
      if (!res.ok) throw new Error("创建失败，请重试");
      const created = (await res.json()) as Reminder;
      setReminders((prev) => [created, ...prev]);
      setTitle("");
      setDueDate("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(id: string, status: "done" | "dismissed") {
    const res = await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return;
    const updated = (await res.json()) as Reminder;
    setReminders((prev) => prev.map((r) => (r.id === id ? updated : r)));
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/reminders/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  const active = reminders.filter((r) => r.status === "active");
  const done = reminders.filter((r) => r.status !== "active");
  const displayed = filter === "active" ? active : done;

  return (
    <div className="space-y-6">
      {/* 新建表单 */}
      <div className="hs-card p-5">
        <h2 className="hs-heading mb-4 text-lg">新建提醒</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--hs-text)]">
                提醒标题 <span className="text-[var(--hs-danger)]">*</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="如：复查尿酸、年度体检"
                className="h-10 w-full rounded-lg border border-[var(--hs-border)] bg-white px-3 text-sm outline-none transition-colors placeholder:text-[var(--hs-muted)] focus:border-[var(--hs-primary)]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--hs-text)]">
                到期日 <span className="text-[var(--hs-danger)]">*</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-[var(--hs-border)] bg-white px-3 text-sm outline-none transition-colors focus:border-[var(--hs-primary)]"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--hs-text)]">类型</label>
            <div className="flex flex-wrap gap-2">
              {(["recheck", "annual_physical", "medication", "custom"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                    kind === k
                      ? KIND_CLASS[k]
                      : "bg-[var(--hs-bg-muted)] text-[var(--hs-muted)] hover:bg-[var(--hs-hover)]",
                  )}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--hs-text)]">备注（可选）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="如：主治医生叮嘱 3 个月后复查"
              className="w-full resize-none rounded-lg border border-[var(--hs-border)] bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-[var(--hs-muted)] focus:border-[var(--hs-primary)]"
            />
          </div>
          {error && (
            <p className="text-xs text-[var(--hs-danger)]">{error}</p>
          )}
          <button
            type="submit"
            disabled={saving || !title.trim() || !dueDate}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--hs-primary-strong)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--hs-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusCircle className="size-4" aria-hidden="true" />
            {saving ? "保存中..." : "创建提醒"}
          </button>
        </form>
      </div>

      {/* 筛选标签 */}
      <div className="flex gap-2">
        {(["active", "done"] as const).map((f) => {
          const count = f === "active" ? active.length : done.length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors",
                filter === f
                  ? "bg-[var(--hs-primary-soft)] text-[var(--hs-primary-strong)]"
                  : "bg-[var(--hs-bg-muted)] text-[var(--hs-muted)] hover:bg-[var(--hs-hover)] hover:text-[var(--hs-text)]",
              )}
            >
              {f === "active" ? "待办" : "已完成"}
              <span className="rounded-full bg-white/60 px-1.5 text-xs">{count}</span>
            </button>
          );
        })}
      </div>

      {/* 提醒列表 */}
      <div className="space-y-3">
        {displayed.map((r) => (
          <div key={r.id} className="hs-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", KIND_CLASS[r.kind] ?? KIND_CLASS.custom)}>
                    {KIND_LABEL[r.kind] ?? "自定义"}
                  </span>
                  <p className="text-sm font-semibold text-[var(--hs-text)]">{r.title}</p>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <CalendarClock className="size-3.5 text-[var(--hs-muted)]" aria-hidden="true" />
                  <span className={cn("text-xs", r.status === "active" ? dueDateStyle(r.dueDate, today) : "text-[var(--hs-muted)]")}>
                    {r.status === "active" ? dueDateLabel(r.dueDate, today) : r.dueDate}
                  </span>
                </div>
                {r.note && (
                  <p className="mt-1.5 text-xs leading-5 text-[var(--hs-muted)]">{r.note}</p>
                )}
              </div>
              {/* 操作按钮 */}
              <div className="flex shrink-0 gap-1">
                {r.status === "active" && (
                  <>
                    <button
                      onClick={() => handleStatus(r.id, "done")}
                      title="标记为已完成"
                      className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--hs-success-soft)] px-3 text-xs font-semibold text-[var(--hs-success)] transition-colors hover:opacity-80"
                    >
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      完成
                    </button>
                    <button
                      onClick={() => handleStatus(r.id, "dismissed")}
                      title="忽略"
                      className="flex size-8 items-center justify-center rounded-lg text-[var(--hs-muted)] transition-colors hover:bg-[var(--hs-hover)] hover:text-[var(--hs-text)]"
                    >
                      <BellOff className="size-3.5" aria-hidden="true" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleDelete(r.id)}
                  title="删除"
                  className="flex size-8 items-center justify-center rounded-lg text-[var(--hs-muted)] transition-colors hover:bg-[var(--hs-danger-soft)] hover:text-[var(--hs-danger)]"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {displayed.length === 0 && (
          <div className="flex flex-col items-center py-12 text-center">
            <Bell className="mb-3 size-10 text-[var(--hs-border)]" aria-hidden="true" />
            <p className="text-sm text-[var(--hs-muted)]">
              {filter === "active" ? "没有待办提醒。创建一条提醒，在到期时首页会自动高亮。" : "还没有已完成的提醒。"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
