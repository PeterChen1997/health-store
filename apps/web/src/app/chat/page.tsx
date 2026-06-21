import { db } from "@/db/index";
import { measurements } from "@/db/schema";
import { count } from "drizzle-orm";
import { ChatClient } from "@/components/ChatClient";
import { MessageCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const [{ total }] = await db.select({ total: count() }).from(measurements);

  return (
    <div className="space-y-6">
      <div>
        <p className="hs-eyebrow">Health Assistant</p>
        <h1 className="hs-heading mt-1 flex items-center gap-2 text-3xl">
          <MessageCircle className="size-6 text-[var(--hs-primary-strong)]" aria-hidden="true" />
          健康问答
        </h1>
        <p className="mt-2 text-sm text-[var(--hs-muted)]">
          基于你的 {total} 条健康指标，随时提问
        </p>
      </div>
      <ChatClient />
    </div>
  );
}
