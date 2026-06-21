"use client";

import {
  RuntimeAdapterProvider,
  useAui,
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter,
} from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";
import { useMemo, type PropsWithChildren } from "react";

type ThreadStatus = "regular" | "archived";

type ThreadRow = {
  id: string;
  title: string | null;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
};

type StoredMessageRow<TContent extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  parent_id: string | null;
  format: string;
  content: TContent;
};

type ThreadCreateResponse = {
  id: string;
};

type ThreadTitleResponse = {
  title: string;
};

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function requestVoid(input: RequestInfo | URL, init?: RequestInit): Promise<void> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
}

function parseSqliteDate(value: string): Date | undefined {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

type RemoteThread = Awaited<ReturnType<RemoteThreadListAdapter["fetch"]>>;

function toRemoteThread(row: ThreadRow): RemoteThread {
  return {
    status: row.status,
    remoteId: row.id,
    title: row.title ?? undefined,
    lastMessageAt: parseSqliteDate(row.updatedAt),
  };
}

function ChatThreadRuntimeAdapterProvider({ children }: PropsWithChildren) {
  const aui = useAui();
  const history = useMemo<ThreadHistoryAdapter>(
    () => ({
      async load() {
        return { messages: [] };
      },
      async append() {},
      withFormat: (fmt) => ({
        async load() {
          const { remoteId } = aui.threadListItem().getState();
          if (!remoteId) return { messages: [] };

          type StorageFormat = Parameters<typeof fmt.decode>[0]["content"];
          const rows = await requestJson<StoredMessageRow<StorageFormat>[]>(
            `/api/threads/${remoteId}/messages`,
          );
          return {
            messages: rows.map((row) =>
              fmt.decode({
                id: row.id,
                parent_id: row.parent_id,
                format: row.format,
                content: row.content,
              }),
            ),
          };
        },
        async append(item) {
          const { remoteId } = await aui.threadListItem().initialize();
          await requestVoid(`/api/threads/${remoteId}/messages`, {
            method: "POST",
            body: JSON.stringify({
              id: fmt.getId(item.message),
              parent_id: item.parentId,
              format: fmt.format,
              content: fmt.encode(item),
            }),
          });
        },
      }),
    }),
    [aui],
  );

  return (
    <RuntimeAdapterProvider adapters={{ history }}>
      {children}
    </RuntimeAdapterProvider>
  );
}

export const chatThreadAdapter: RemoteThreadListAdapter = {
  async list() {
    const rows = await requestJson<ThreadRow[]>("/api/threads");
    return { threads: rows.map(toRemoteThread) };
  },

  async initialize() {
    const { id } = await requestJson<ThreadCreateResponse>("/api/threads", {
      method: "POST",
    });
    return { remoteId: id, externalId: undefined };
  },

  async rename(remoteId, title) {
    await requestVoid(`/api/threads/${remoteId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
  },

  async archive(remoteId) {
    await requestVoid(`/api/threads/${remoteId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "archived" }),
    });
  },

  async unarchive(remoteId) {
    await requestVoid(`/api/threads/${remoteId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "regular" }),
    });
  },

  async delete(remoteId) {
    await requestVoid(`/api/threads/${remoteId}`, { method: "DELETE" });
  },

  async fetch(remoteId) {
    const row = await requestJson<ThreadRow>(`/api/threads/${remoteId}`);
    return toRemoteThread(row);
  },

  async generateTitle(remoteId, messages) {
    return createAssistantStream(async (controller) => {
      const { title } = await requestJson<ThreadTitleResponse>(
        `/api/threads/${remoteId}/title`,
        {
          method: "POST",
          body: JSON.stringify({ messages }),
        },
      );
      controller.appendText(title);
    });
  },

  unstable_Provider: ChatThreadRuntimeAdapterProvider,
};
