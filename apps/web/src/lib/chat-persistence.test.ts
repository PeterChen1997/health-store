import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ChatMessageInsertSchema,
  ChatThreadPatchSchema,
  buildFallbackThreadTitle,
  buildTitlePrompt,
  extractThreadMessageText,
  normalizeGeneratedThreadTitle,
  parseStoredMessageContent,
  serializeMessageContent,
} from "./chat-persistence";

describe("chat persistence helpers", () => {
  it("validates thread patch payloads", () => {
    assert.deepEqual(ChatThreadPatchSchema.parse({ title: "  血脂复查  " }), {
      title: "血脂复查",
    });
    assert.deepEqual(ChatThreadPatchSchema.parse({ status: "archived" }), {
      status: "archived",
    });
    assert.throws(() => ChatThreadPatchSchema.parse({}));
    assert.throws(() => ChatThreadPatchSchema.parse({ status: "deleted" }));
  });

  it("validates message append payloads and normalizes missing parents", () => {
    const payload = ChatMessageInsertSchema.parse({
      id: "msg-1",
      format: "ai-sdk-v6",
      content: { message: { role: "user" } },
    });

    assert.deepEqual(payload, {
      id: "msg-1",
      parent_id: null,
      format: "ai-sdk-v6",
      content: { message: { role: "user" } },
    });
    assert.throws(() =>
      ChatMessageInsertSchema.parse({
        id: "msg-2",
        parent_id: 42,
        format: "ai-sdk-v6",
        content: {},
      }),
    );
  });

  it("serializes stored assistant-ui message content as JSON objects", () => {
    const content = { message: { id: "msg-1" }, state: { stable: true } };
    const serialized = serializeMessageContent(content);

    assert.equal(serialized, JSON.stringify(content));
    assert.deepEqual(parseStoredMessageContent(serialized), content);
    assert.throws(() => parseStoredMessageContent("[1,2,3]"));
    assert.throws(() => parseStoredMessageContent("\"text\""));
  });

  it("extracts text from assistant-ui thread messages", () => {
    const text = extractThreadMessageText({
      role: "user",
      content: [
        { type: "text", text: "我的 ALT 偏高吗？" },
        { type: "image", image: "data:image/png;base64,abc" },
        { type: "text", text: "需要注意什么" },
      ],
    });

    assert.equal(text, "我的 ALT 偏高吗？\n需要注意什么");
    assert.equal(
      extractThreadMessageText({
        role: "user",
        parts: [{ type: "text", text: "我的肝功能整体怎么样？" }],
      }),
      "我的肝功能整体怎么样？",
    );
    assert.equal(extractThreadMessageText({ role: "user", content: [] }), "");
  });

  it("builds concise fallback titles from first useful message text", () => {
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "  请列出我的异常指标，并说明饮食上最需要注意的三件事。  ",
          },
        ],
      },
    ];

    assert.equal(buildFallbackThreadTitle(messages), "请列出我的异常指标，并说明饮食上最需要注意...");
    assert.equal(buildFallbackThreadTitle([]), "新会话");
  });

  it("builds a title prompt from recent user and assistant message text", () => {
    const prompt = buildTitlePrompt([
      { role: "user", content: [{ type: "text", text: "血脂异常怎么办？" }] },
      { role: "assistant", content: [{ type: "text", text: "建议先看 LDL-C。" }] },
    ]);

    assert.match(prompt, /血脂异常怎么办/u);
    assert.match(prompt, /建议先看 LDL-C/u);
    assert.match(prompt, /12 个字以内/u);
  });

  it("normalizes generated titles and falls back when output is empty", () => {
    assert.equal(normalizeGeneratedThreadTitle("《血脂异常建议》"), "血脂异常建议");
    assert.equal(normalizeGeneratedThreadTitle("**肝功能复查计划**\n说明", "备用"), "肝功能复查计划");
    assert.equal(normalizeGeneratedThreadTitle("   ", "备用标题"), "备用标题");
  });
});
