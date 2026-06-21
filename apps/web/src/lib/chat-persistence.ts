import { z } from "zod";

const ChatThreadStatusSchema = z.enum(["regular", "archived"]);

const JsonObjectSchema = z.record(z.string(), z.unknown());

export const ChatThreadPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    status: ChatThreadStatusSchema.optional(),
  })
  .refine((value) => value.title !== undefined || value.status !== undefined, {
    message: "title or status is required",
  });

export const ChatMessageInsertSchema = z.object({
  id: z.string().trim().min(1),
  parent_id: z.string().trim().min(1).nullable().optional().default(null),
  format: z.string().trim().min(1),
  content: JsonObjectSchema,
});

export type ChatThreadStatus = z.infer<typeof ChatThreadStatusSchema>;
export type ChatMessageInsert = z.infer<typeof ChatMessageInsertSchema>;
export type ChatThreadPatch = z.infer<typeof ChatThreadPatchSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function serializeMessageContent(content: Record<string, unknown>): string {
  return JSON.stringify(content);
}

export function parseStoredMessageContent(content: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed)) {
    throw new Error("Stored chat message content must be a JSON object");
  }
  return parsed;
}

export function extractThreadMessageText(message: unknown): string {
  if (!isRecord(message)) return "";

  const parts = Array.isArray(message.content)
    ? message.content
    : Array.isArray(message.parts)
      ? message.parts
      : [];

  return parts
    .map((part) => {
      if (!isRecord(part) || part.type !== "text" || typeof part.text !== "string") {
        return "";
      }
      return part.text.trim();
    })
    .filter(Boolean)
    .join("\n");
}

function compactText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function buildFallbackThreadTitle(messages: readonly unknown[]): string {
  const firstText = messages.map(extractThreadMessageText).find((text) => text.trim());
  if (!firstText) return "新会话";

  const compact = compactText(firstText);
  const maxLength = 21;
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}...`;
}

export function buildTitlePrompt(messages: readonly unknown[]): string {
  const transcript = messages
    .map((message) => {
      if (!isRecord(message)) return "";
      const role = typeof message.role === "string" ? message.role : "message";
      const text = compactText(extractThreadMessageText(message));
      return text ? `${role}: ${text}` : "";
    })
    .filter(Boolean)
    .slice(0, 6)
    .join("\n");

  return `请根据下面健康问答对话生成一个中文会话标题，12 个字以内，只输出标题，不要标点包装。

${transcript || "健康问答"}`;
}

export function normalizeGeneratedThreadTitle(
  title: string,
  fallback = "新会话",
): string {
  const firstLine = title.split("\n").at(0) ?? "";
  const normalized = compactText(firstLine)
    .replace(/^\*\*(.*)\*\*$/u, "$1")
    .replace(/^["'“”‘’《【\[]+/u, "")
    .replace(/["'“”‘’》】\]]+$/u, "")
    .trim();

  if (!normalized) return fallback;
  if (normalized.length <= 24) return normalized;
  return `${normalized.slice(0, 24)}...`;
}
