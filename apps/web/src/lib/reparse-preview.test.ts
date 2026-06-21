import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ReparseReplacementSchema,
  buildReparsePreview,
  prepareReplacementRows,
} from "./reparse-preview";

describe("reparse preview", () => {
  it("builds a temporary preview without replacement rows", async () => {
    const preview = await buildReparsePreview({
      extraction: {
        document_type: "blood_test",
        institution: "市一医院",
        measured_at: "2026-06-20",
        measurements: [
          {
            raw_name: "ALT",
            value: 42,
            unit: "U/L",
            ref_low: 0,
            ref_high: 40,
            flag: "high",
          },
        ],
      },
      ocrMarkdown: "ALT 42 U/L",
      ocrJson: "{\"lines\":[]}",
      generatedAt: new Date("2026-06-21T08:00:00.000Z"),
      resolveMetric: async () => ({ metricId: "metric-alt", standardName: "谷丙转氨酶" }),
    });

    assert.equal(preview.temporary, true);
    assert.equal(preview.generatedAt, "2026-06-21T08:00:00.000Z");
    assert.deepEqual(preview.document, {
      documentType: "blood_test",
      institution: "市一医院",
      measuredAt: "2026-06-20",
      ocrMarkdown: "ALT 42 U/L",
      ocrJson: "{\"lines\":[]}",
    });
    assert.equal(preview.measurementCount, 1);
    assert.equal(preview.ocrLength, 10);
    assert.deepEqual(preview.measurements[0], {
      rawName: "ALT",
      value: 42,
      unit: "U/L",
      refLow: 0,
      refHigh: 40,
      flag: "high",
      metricId: "metric-alt",
      standardName: "谷丙转氨酶",
    });
  });

  it("requires save-and-replace payloads to be temporary previews", () => {
    assert.throws(() =>
      ReparseReplacementSchema.parse({
        temporary: false,
        document: {
          documentType: "blood_test",
          institution: null,
          measuredAt: "2026-06-20",
          ocrMarkdown: "",
          ocrJson: null,
        },
        measurements: [],
      })
    );
  });

  it("prepares document and measurement rows only after confirmation", () => {
    const preview = ReparseReplacementSchema.parse({
      temporary: true,
      document: {
        documentType: "blood_test",
        institution: null,
        measuredAt: "2026-06-20",
        ocrMarkdown: "ALT 42 U/L",
        ocrJson: null,
      },
      measurements: [
        {
          rawName: "ALT",
          value: 42,
          unit: "U/L",
          refLow: 0,
          refHigh: 40,
          flag: "high",
          metricId: "metric-alt",
          standardName: "谷丙转氨酶",
        },
      ],
    });

    const rows = prepareReplacementRows("doc-1", preview, () => "measurement-1");

    assert.deepEqual(rows.documentValues, {
      documentType: "blood_test",
      institution: null,
      measuredAt: "2026-06-20",
      ocrMarkdown: "ALT 42 U/L",
      ocrJson: null,
    });
    assert.deepEqual(rows.measurementRows, [
      {
        id: "measurement-1",
        documentId: "doc-1",
        metricId: "metric-alt",
        rawName: "ALT",
        value: 42,
        unit: "U/L",
        refLow: 0,
        refHigh: 40,
        flag: "high",
        measuredAt: "2026-06-20",
      },
    ]);
  });

  it("prepares replacement rows with default ids without losing crypto context", () => {
    const preview = ReparseReplacementSchema.parse({
      temporary: true,
      document: {
        documentType: "blood_test",
        institution: null,
        measuredAt: "2026-06-20",
        ocrMarkdown: "ALT 42 U/L",
        ocrJson: null,
      },
      measurements: [
        {
          rawName: "ALT",
          value: 42,
          unit: "U/L",
          refLow: 0,
          refHigh: 40,
          flag: "high",
          metricId: "metric-alt",
          standardName: "谷丙转氨酶",
        },
      ],
    });

    const rows = prepareReplacementRows("doc-1", preview);

    assert.match(rows.measurementRows[0]?.id ?? "", /^[0-9a-f-]{36}$/);
  });
});
