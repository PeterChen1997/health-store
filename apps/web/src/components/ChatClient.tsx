"use client";

import { Thread } from "@/components/assistant-ui/thread";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { chatThreadAdapter } from "@/lib/chat-thread-adapter";
import {
  AssistantRuntimeProvider,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import { useMemo } from "react";

function useHealthChatRuntime() {
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/api/ai/chat",
      }),
    [],
  );

  return useChatRuntime({
    transport,
  });
}

export function ChatClient() {
  const runtime = useRemoteThreadListRuntime({
    runtimeHook: useHealthChatRuntime,
    adapter: chatThreadAdapter,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <section className="h-[calc(100vh-224px)] min-h-0 overflow-hidden rounded-lg border border-[var(--hs-border)] bg-white shadow-sm">
        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)_auto]">
          <aside className="min-h-0 border-b border-[var(--hs-border-soft)] bg-[var(--hs-sidebar)] p-2 md:border-r md:border-b-0">
            <ThreadList />
          </aside>
          <div className="min-h-0">
            <Thread />
          </div>
          <p className="border-t border-[var(--hs-border-soft)] bg-white px-4 py-2 text-center text-xs text-[var(--hs-muted-soft)] md:col-start-2">
            AI 回答仅供参考，不构成医疗诊断，请遵医嘱
          </p>
        </div>
      </section>
    </AssistantRuntimeProvider>
  );
}
