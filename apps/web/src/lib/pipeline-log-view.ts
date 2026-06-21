import { readFile } from "node:fs/promises";

export type PipelineRunRow = {
  id: string;
  runId: string;
  documentId: string | null;
  stage: string;
  status: string;
  mode: string | null;
  model: string | null;
  inputChars: number | null;
  outputChars: number | null;
  durationMs: number | null;
  error: string | null;
  metadata: string;
  createdAt: string;
};

export type PipelineRunView = Omit<PipelineRunRow, "metadata"> & {
  metadata: Record<string, unknown>;
  facts: string[];
};

export type PipelineRunGroup = {
  runId: string;
  documentId: string | null;
  status: "success" | "error";
  latestCreatedAt: string;
  stages: PipelineRunView[];
};

export type JsonlTailRecord = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMetadata(metadata: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(metadata);
    return isRecord(parsed) ? parsed : { raw: metadata };
  } catch {
    return {
      parseError: "metadata JSON 解析失败",
      raw: metadata,
    };
  }
}

function stringFact(label: string, value: unknown) {
  return typeof value === "string" && value.trim() ? `${label} ${value}` : null;
}

function numberFact(label: string, suffix: string, value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? `${label} ${value} ${suffix}` : null;
}

function buildFacts(metadata: Record<string, unknown>) {
  if (metadata.parseError) {
    return ["metadata JSON 解析失败"];
  }

  return [
    stringFact("文件", metadata.fileName),
    stringFact("图片", metadata.imagePath),
    stringFact("类型", metadata.documentType),
    numberFact("指标", "项", metadata.measurementCount),
    numberFact("修正", "处", metadata.correctionCount),
    numberFact("输入", "bytes", metadata.inputBytes),
    numberFact("OCR", "块", metadata.blockCount),
    metadata.repairApplied === true ? "已纠错" : null,
    metadata.repairSkipped === true ? "跳过纠错" : null,
  ].filter((fact): fact is string => Boolean(fact));
}

export function toPipelineRunView(row: PipelineRunRow): PipelineRunView {
  const metadata = parseMetadata(row.metadata);
  return {
    ...row,
    metadata,
    facts: buildFacts(metadata),
  };
}

export function groupPipelineRunsByRunId(rows: PipelineRunView[]): PipelineRunGroup[] {
  const groups = new Map<string, PipelineRunView[]>();

  for (const row of rows) {
    const current = groups.get(row.runId);
    if (current) {
      current.push(row);
    } else {
      groups.set(row.runId, [row]);
    }
  }

  return Array.from(groups.entries())
    .map(([runId, stages]) => {
      const sortedStages = [...stages].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return {
        runId,
        documentId: sortedStages.find((stage) => stage.documentId)?.documentId ?? null,
        status: sortedStages.some((stage) => stage.status === "error") ? "error" : "success",
        latestCreatedAt: sortedStages[0]?.createdAt ?? "",
        stages: sortedStages,
      } satisfies PipelineRunGroup;
    })
    .sort((a, b) => b.latestCreatedAt.localeCompare(a.latestCreatedAt));
}

export async function readJsonlTail(filePath: string, limit: number): Promise<JsonlTailRecord[]> {
  if (limit <= 0) return [];

  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return content
    .split("\n")
    .filter((line) => line.trim())
    .slice(-limit)
    .map((line) => {
      try {
        const parsed = JSON.parse(line);
        return isRecord(parsed) ? parsed : { raw: line };
      } catch {
        return {
          parseError: "JSONL 解析失败",
          raw: line,
        };
      }
    });
}
