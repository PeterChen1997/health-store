import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyOcrDerivedMeasurementFlags } from "./measurement-flags";

describe("measurement flags", () => {
  it("uses report reference ranges and result levels like the allergy report with reference columns", () => {
    const ocrText = `
      <table>
        <tr><td>检验项目</td><td></td><td>结果</td><td>单位</td><td>参考区间</td><td>检验项目</td><td>结果</td><td>单位</td><td>参考区间</td></tr>
        <tr><td>1</td><td>户尘螨（D1）</td><td>0.32（0级）</td><td>KUA/I</td><td>0-0.35</td><td>20鸡蛋白（F1）</td><td>0.41（1级）</td><td>KUA/I</td><td>0--0.35</td></tr>
        <tr><td></td><td>4猫毛皮屑（E1）</td><td>0.70（2级）</td><td>KUA/I</td><td>0--0.35</td><td>21牛奶（F2）</td><td>1.90（2级）</td><td>KUA/I</td><td>0--0.35</td></tr>
      </table>
    `;

    const extraction = {
      document_type: "blood_test" as const,
      institution: "中国中医科学院望京医院",
      measured_at: "2021-10-23",
      measurements: [
        {
          raw_name: "户尘螨（D1）",
          value: 0.32,
          unit: "KUA/I",
          ref_low: null,
          ref_high: null,
          flag: "normal" as const,
        },
        {
          raw_name: "20鸡蛋白（F1）",
          value: 0.41,
          unit: "KUA/I",
          ref_low: null,
          ref_high: null,
          flag: "normal" as const,
        },
        {
          raw_name: "4猫毛皮屑（E1）",
          value: 0.7,
          unit: "KUA/I",
          ref_low: null,
          ref_high: null,
          flag: "normal" as const,
        },
        {
          raw_name: "21牛奶（F2）",
          value: 1.9,
          unit: "KUA/I",
          ref_low: null,
          ref_high: null,
          flag: "normal" as const,
        },
      ],
    };

    const result = applyOcrDerivedMeasurementFlags(extraction, ocrText);

    assert.deepEqual(
      result.measurements.map((measurement) => ({
        rawName: measurement.raw_name,
        refLow: measurement.ref_low,
        refHigh: measurement.ref_high,
        flag: measurement.flag,
      })),
      [
        { rawName: "户尘螨（D1）", refLow: 0, refHigh: 0.35, flag: "normal" },
        { rawName: "20鸡蛋白（F1）", refLow: 0, refHigh: 0.35, flag: "high" },
        { rawName: "4猫毛皮屑（E1）", refLow: 0, refHigh: 0.35, flag: "critical_high" },
        { rawName: "21牛奶（F2）", refLow: 0, refHigh: 0.35, flag: "critical_high" },
      ]
    );
  });

  it("uses standalone OCR level columns without inventing missing reference ranges", () => {
    const ocrText = `
      <table>
        <tr><td>项目名称</td><td>浓度</td><td>级别</td><td>单位</td><td>结果解释</td></tr>
        <tr><td>1. 户尘螨</td><td>0</td><td>0级</td><td>IU/ml</td><td>0 没有检测到特定抗体.</td></tr>
        <tr><td>3. 矮豚草 蒿 葎草 藜</td><td>1.9</td><td>2级</td><td>IU/ml</td><td></td></tr>
        <tr><td>6. 狗毛皮屑</td><td>0.39</td><td>1级</td><td>IU/ml</td><td>1 检测非常低滴度的抗体.</td></tr>
        <tr><td>20. 总IgE</td><td>&gt;200</td><td>阳性</td><td>IU/ml</td><td>5 非常高的抗体滴度.</td></tr>
      </table>
    `;

    const result = applyOcrDerivedMeasurementFlags(
      {
        document_type: "blood_test" as const,
        institution: "北京市医疗机构",
        measured_at: "2024-12-24",
        measurements: [
          {
            raw_name: "1. 户尘螨",
            value: 0,
            unit: "IU/ml",
            ref_low: null,
            ref_high: null,
            flag: "normal" as const,
          },
          {
            raw_name: "3. 矮豚草 蒿 葎草 藜",
            value: 1.9,
            unit: "IU/ml",
            ref_low: null,
            ref_high: null,
            flag: "normal" as const,
          },
          {
            raw_name: "6. 狗毛皮屑",
            value: 0.39,
            unit: "IU/ml",
            ref_low: null,
            ref_high: null,
            flag: "normal" as const,
          },
          {
            raw_name: "20. 总IgE",
            value: 200,
            unit: "IU/ml",
            ref_low: null,
            ref_high: null,
            flag: "normal" as const,
          },
        ],
      },
      ocrText
    );

    assert.deepEqual(
      result.measurements.map((measurement) => ({
        rawName: measurement.raw_name,
        refLow: measurement.ref_low,
        refHigh: measurement.ref_high,
        flag: measurement.flag,
      })),
      [
        { rawName: "1. 户尘螨", refLow: null, refHigh: null, flag: "normal" },
        { rawName: "3. 矮豚草 蒿 葎草 藜", refLow: null, refHigh: null, flag: "high" },
        { rawName: "6. 狗毛皮屑", refLow: null, refHigh: null, flag: "high" },
        { rawName: "20. 总IgE", refLow: null, refHigh: null, flag: "high" },
      ]
    );
  });
});
