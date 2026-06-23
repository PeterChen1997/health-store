import { db } from "@/db/index";
import { reminders } from "@/db/schema";
import { asc } from "drizzle-orm";
import { Bell } from "lucide-react";
import { RemindersClient } from "@/components/RemindersClient";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const rows = await db.select().from(reminders).orderBy(asc(reminders.dueDate));

  const initialReminders = rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    dueDate: r.dueDate,
    relatedMetricId: r.relatedMetricId,
    relatedDocumentId: r.relatedDocumentId,
    note: r.note,
    status: r.status,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
  }));

  const activeCount = rows.filter((r) => r.status === "active").length;

  return (
    <div className="space-y-6">
      <div>
        <p className="hs-eyebrow">Reminders</p>
        <h1 className="hs-heading mt-1 flex items-center gap-2 text-3xl">
          <Bell className="size-6 text-[var(--hs-primary-strong)]" aria-hidden="true" />
          复查提醒
        </h1>
        <p className="mt-2 text-sm text-[var(--hs-muted)]">
          设置复查、体检、用药提醒，到期时首页会主动显示。当前 {activeCount} 条待办。
        </p>
      </div>
      <RemindersClient initialReminders={initialReminders} />
    </div>
  );
}
