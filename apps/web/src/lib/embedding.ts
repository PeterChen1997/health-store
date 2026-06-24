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

// 向量入库表 vec_chunks 的维度是固定的（float[1536]）。若模型返回的维度
// 与之不一致，写入/检索会静默错位，这里提前抛出明确错误。
function assertDim(embedding: number[]): number[] {
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `embedding 维度不符：期望 ${EMBEDDING_DIM}，实际 ${embedding.length}。` +
        "请确认 EMBEDDING_DIM 与向量表 vec_chunks 的维度一致。"
    );
  }
  return embedding;
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
  embeddings.forEach(assertDim);
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
  return assertDim(embedding);
}
