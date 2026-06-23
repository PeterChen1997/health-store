import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed, embedMany } from "ai";

export const EMBEDDING_DIM = 1536;

function createEmbeddingModel() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY 未配置，RAG 功能不可用。\n" +
        "请在 .env.local 中添加：GOOGLE_GENERATIVE_AI_API_KEY=<your-key>"
    );
  }
  const google = createGoogleGenerativeAI({ apiKey });
  return google.textEmbeddingModel("gemini-embedding-2");
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: createEmbeddingModel(),
    values: texts,
    providerOptions: {
      google: {
        outputDimensionality: EMBEDDING_DIM,
        taskType: "RETRIEVAL_DOCUMENT",
      },
    },
  });
  return embeddings;
}

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: createEmbeddingModel(),
    value: text,
    providerOptions: {
      google: {
        outputDimensionality: EMBEDDING_DIM,
        taskType: "RETRIEVAL_QUERY",
      },
    },
  });
  return embedding;
}
