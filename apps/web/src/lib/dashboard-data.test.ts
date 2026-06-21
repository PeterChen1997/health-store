import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getDashboardHighlights,
  getLatestMetricSnapshots,
  summarizeLatestMarkers,
} from "./dashboard-data";

describe("dashboard data helpers", () => {
  it("keeps only the latest row for each normalized metric", () => {
    const snapshots = getLatestMetricSnapshots([
      {
        metricId: "ldl",
        rawName: "LDL-C",
        standardName: "低密度脂蛋白胆固醇",
        value: 122,
        unit: "mg/dL",
        flag: "normal",
        measuredAt: "2025-01-01",
        documentId: "old",
        category: "blood_lipid",
        refLow: null,
        refHigh: 100,
      },
      {
        metricId: "ldl",
        rawName: "LDL-C",
        standardName: "低密度脂蛋白胆固醇",
        value: 138,
        unit: "mg/dL",
        flag: "high",
        measuredAt: "2025-03-01",
        documentId: "new",
        category: "blood_lipid",
        refLow: null,
        refHigh: 100,
      },
      {
        metricId: null,
        rawName: "维生素D",
        standardName: null,
        value: 28,
        unit: "ng/mL",
        flag: "normal",
        measuredAt: "2025-02-01",
        documentId: "vitd",
        category: null,
        refLow: 20,
        refHigh: 50,
      },
    ]);

    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[0].displayName, "低密度脂蛋白胆固醇");
    assert.equal(snapshots[0].value, 138);
    assert.equal(snapshots[0].documentId, "new");
  });

  it("summarizes latest marker status", () => {
    const summary = summarizeLatestMarkers([
      { flag: "normal" },
      { flag: "high" },
      { flag: "critical_low" },
    ]);

    assert.deepEqual(summary, { total: 3, normal: 1, abnormal: 2 });
  });

  it("prioritizes abnormal and recent dashboard highlights", () => {
    const highlights = getDashboardHighlights(
      [
        {
          key: "normal",
          displayName: "空腹血糖",
          metricId: "glucose",
          value: 94,
          unit: "mg/dL",
          flag: "normal",
          measuredAt: "2025-06-01",
          documentId: "glucose",
          rawName: "Glucose",
          standardName: "空腹血糖",
          category: "blood_glucose",
          refLow: 70,
          refHigh: 99,
        },
        {
          key: "high",
          displayName: "低密度脂蛋白胆固醇",
          metricId: "ldl",
          value: 138,
          unit: "mg/dL",
          flag: "high",
          measuredAt: "2025-03-01",
          documentId: "ldl",
          rawName: "LDL-C",
          standardName: "低密度脂蛋白胆固醇",
          category: "blood_lipid",
          refLow: null,
          refHigh: 100,
        },
      ],
      1,
    );

    assert.equal(highlights.length, 1);
    assert.equal(highlights[0].key, "high");
  });
});
