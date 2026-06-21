import { z } from "zod";
import type { ExtractionResult } from "./extract";

const DocumentTypeSchema = z.enum(["blood_test", "physical", "imaging", "clinic_note", "other"]);
const FlagSchema = z.enum(["normal", "high", "low", "critical_high", "critical_low"]);

export const ReparseDocumentSchema = z.object({
  documentType: DocumentTypeSchema,
  institution: z.string().nullable(),
  measuredAt: z.string().min(1),
  ocrMarkdown: z.string(),
  ocrJson: z.string().nullable(),
});

export const ReparseMeasurementSchema = z.object({
  rawName: z.string().min(1),
  value: z.number(),
  unit: z.string(),
  refLow: z.number().nullable(),
  refHigh: z.number().nullable(),
  flag: FlagSchema,
  metricId: z.string().nullable(),
  standardName: z.string().nullable(),
});

export const ReparseReplacementSchema = z.object({
  temporary: z.literal(true),
  document: ReparseDocumentSchema,
  measurements: z.array(ReparseMeasurementSchema),
});

export type ReparseDocumentPreview = z.infer<typeof ReparseDocumentSchema>;
export type ReparseMeasurementPreview = z.infer<typeof ReparseMeasurementSchema>;
export type ReparseReplacement = z.infer<typeof ReparseReplacementSchema>;

export type ReparsePreview = ReparseReplacement & {
  generatedAt: string;
  measurementCount: number;
  ocrLength: number;
};

type MetricResolution = {
  metricId: string | null;
  standardName: string | null;
};

type BuildReparsePreviewInput = {
  extraction: ExtractionResult;
  ocrMarkdown: string;
  ocrJson: string | null;
  generatedAt?: Date;
  resolveMetric: (rawName: string) => Promise<MetricResolution>;
};

export async function buildReparsePreview({
  extraction,
  ocrMarkdown,
  ocrJson,
  generatedAt = new Date(),
  resolveMetric,
}: BuildReparsePreviewInput): Promise<ReparsePreview> {
  const measurements = await Promise.all(
    extraction.measurements.map(async (measurement) => {
      const resolved = await resolveMetric(measurement.raw_name);
      return {
        rawName: measurement.raw_name,
        value: measurement.value,
        unit: measurement.unit,
        refLow: measurement.ref_low,
        refHigh: measurement.ref_high,
        flag: measurement.flag,
        metricId: resolved.metricId,
        standardName: resolved.standardName,
      };
    })
  );

  return {
    temporary: true,
    generatedAt: generatedAt.toISOString(),
    document: {
      documentType: extraction.document_type,
      institution: extraction.institution,
      measuredAt: extraction.measured_at,
      ocrMarkdown,
      ocrJson,
    },
    measurements,
    measurementCount: measurements.length,
    ocrLength: ocrMarkdown.length,
  };
}

export function prepareReplacementRows(
  documentId: string,
  preview: ReparseReplacement,
  generateId: () => string = () => crypto.randomUUID()
) {
  return {
    documentValues: {
      documentType: preview.document.documentType,
      institution: preview.document.institution,
      measuredAt: preview.document.measuredAt,
      ocrMarkdown: preview.document.ocrMarkdown,
      ocrJson: preview.document.ocrJson,
    },
    measurementRows: preview.measurements.map((measurement) => ({
      id: generateId(),
      documentId,
      metricId: measurement.metricId,
      rawName: measurement.rawName,
      value: measurement.value,
      unit: measurement.unit,
      refLow: measurement.refLow,
      refHigh: measurement.refHigh,
      flag: measurement.flag,
      measuredAt: preview.document.measuredAt,
    })),
  };
}
