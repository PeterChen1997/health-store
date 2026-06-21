import { generateText, streamText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { type ZodType, z } from "zod";

export type LlmSettings = {
  baseURL?: string;
  apiKey: string;
  model: string;
  providerName: string;
};

export function getLlmSettings(env = process.env): LlmSettings {
  const providerName = env.OPENAI_PROVIDER_NAME ?? "health-store";
  const isAnthropic = providerName.toLowerCase() === "anthropic";

  const apiKey = isAnthropic
    ? (env.ANTHROPIC_API_KEY ?? env.OPENAI_API_KEY ?? "")
    : (env.OPENAI_API_KEY ?? "");

  const baseURL = isAnthropic ? undefined : env.OPENAI_BASE_URL;
  const model = env.OPENAI_MODEL ?? (isAnthropic ? "claude-sonnet-4-6" : "");

  if (!apiKey || !model || (!isAnthropic && !baseURL)) {
    throw new Error(
      "LLM 配置缺失，请检查 .env.local：\n" +
        "  OPENAI_PROVIDER_NAME=anthropic|deepseek|...\n" +
        "  OPENAI_API_KEY=...\n" +
        "  OPENAI_BASE_URL=...（anthropic 不需要）\n" +
        "  OPENAI_MODEL=..."
    );
  }

  return { baseURL, apiKey, model, providerName };
}

export function createLanguageModel(settings = getLlmSettings()) {
  if (settings.providerName.toLowerCase() === "anthropic") {
    const provider = createAnthropic({ apiKey: settings.apiKey });
    return provider(settings.model);
  }

  const provider = createOpenAICompatible({
    name: settings.providerName,
    baseURL: settings.baseURL ?? "",
    apiKey: settings.apiKey,
  });
  return provider(settings.model);
}

// Zod schema 注入 prompt → provider 无关的结构化输出
export async function generateStructured<T>(
  schema: ZodType<T>,
  prompt: string
): Promise<T> {
  const schemaJson = JSON.stringify(z.toJSONSchema(schema as ZodType), null, 2);
  const fullPrompt =
    `${prompt}\n\n输出必须严格符合以下 JSON Schema，只返回合法 JSON object，不输出任何 Markdown、解释或代码块：\n${schemaJson}`;

  const { text } = await generateText({
    model: createLanguageModel(),
    prompt: fullPrompt,
  });

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/u);
  const raw = (fenced ? fenced.at(1) : text)?.trim() ?? "";
  return schema.parse(JSON.parse(raw));
}

export { generateText, streamText };
