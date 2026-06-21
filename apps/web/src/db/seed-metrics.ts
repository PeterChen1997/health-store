/**
 * 标准指标词典种子数据
 * 运行：cd apps/web && npx tsx src/db/seed-metrics.ts
 */
import { db } from "./index";
import { metricCatalog } from "./schema";
import { eq } from "drizzle-orm";

type MetricSeed = {
  id: string;
  standardName: string;
  aliases: string[];
  standardUnit: string;
  category: string;
  refLow?: number;
  refHigh?: number;
  description?: string;
};

const METRICS: MetricSeed[] = [
  // ── 血常规 ──────────────────────────────────────────
  { id: "wbc", standardName: "白细胞计数", aliases: ["WBC", "白细胞", "白血胞"], standardUnit: "×10⁹/L", category: "blood_routine", refLow: 3.5, refHigh: 9.5 },
  { id: "rbc", standardName: "红细胞计数", aliases: ["RBC", "红细胞"], standardUnit: "×10¹²/L", category: "blood_routine", refLow: 4.3, refHigh: 5.8 },
  { id: "hgb", standardName: "血红蛋白", aliases: ["HGB", "Hb", "血色素", "hemoglobin"], standardUnit: "g/L", category: "blood_routine", refLow: 130, refHigh: 175 },
  { id: "plt", standardName: "血小板计数", aliases: ["PLT", "血小板", "platelet"], standardUnit: "×10⁹/L", category: "blood_routine", refLow: 125, refHigh: 350 },
  { id: "hct", standardName: "红细胞压积", aliases: ["HCT", "Hct", "压积"], standardUnit: "%", category: "blood_routine", refLow: 40, refHigh: 50 },
  { id: "mcv", standardName: "平均红细胞体积", aliases: ["MCV"], standardUnit: "fL", category: "blood_routine", refLow: 82, refHigh: 100 },
  { id: "mch", standardName: "平均红细胞血红蛋白含量", aliases: ["MCH"], standardUnit: "pg", category: "blood_routine", refLow: 27, refHigh: 34 },
  { id: "mchc", standardName: "平均红细胞血红蛋白浓度", aliases: ["MCHC"], standardUnit: "g/L", category: "blood_routine", refLow: 316, refHigh: 354 },
  { id: "neut_pct", standardName: "中性粒细胞百分比", aliases: ["NEUT%", "中性粒细胞%", "N%", "中性%"], standardUnit: "%", category: "blood_routine", refLow: 40, refHigh: 75 },
  { id: "lymph_pct", standardName: "淋巴细胞百分比", aliases: ["LYMPH%", "淋巴细胞%", "L%"], standardUnit: "%", category: "blood_routine", refLow: 20, refHigh: 50 },
  { id: "mono_pct", standardName: "单核细胞百分比", aliases: ["MONO%", "单核细胞%", "M%"], standardUnit: "%", category: "blood_routine", refLow: 3, refHigh: 10 },
  { id: "eos_pct", standardName: "嗜酸性粒细胞百分比", aliases: ["EO%", "嗜酸%"], standardUnit: "%", category: "blood_routine", refLow: 0.4, refHigh: 8 },

  // ── 肝功能 ──────────────────────────────────────────
  { id: "alt", standardName: "谷丙转氨酶", aliases: ["ALT", "SGPT", "丙氨酸氨基转移酶", "丙氨酸转氨酶", "谷丙"], standardUnit: "U/L", category: "liver", refLow: 7, refHigh: 40 },
  { id: "ast", standardName: "谷草转氨酶", aliases: ["AST", "SGOT", "天冬氨酸氨基转移酶", "谷草"], standardUnit: "U/L", category: "liver", refLow: 13, refHigh: 35 },
  { id: "tbil", standardName: "总胆红素", aliases: ["TBIL", "TBiL", "总胆红素", "总胆"], standardUnit: "μmol/L", category: "liver", refLow: 3.4, refHigh: 17.1 },
  { id: "dbil", standardName: "直接胆红素", aliases: ["DBIL", "DBiL", "直接胆红素", "结合胆红素"], standardUnit: "μmol/L", category: "liver", refLow: 0, refHigh: 6.8 },
  { id: "ibil", standardName: "间接胆红素", aliases: ["IBIL", "IBiL", "间接胆红素", "游离胆红素"], standardUnit: "μmol/L", category: "liver", refLow: 0, refHigh: 12 },
  { id: "alb", standardName: "白蛋白", aliases: ["ALB", "Alb", "albumin"], standardUnit: "g/L", category: "liver", refLow: 40, refHigh: 55 },
  { id: "tp", standardName: "总蛋白", aliases: ["TP", "total protein", "总蛋白"], standardUnit: "g/L", category: "liver", refLow: 65, refHigh: 85 },
  { id: "ggt", standardName: "γ-谷氨酰转移酶", aliases: ["GGT", "γ-GT", "谷氨酰转移酶", "γGT"], standardUnit: "U/L", category: "liver", refLow: 10, refHigh: 60 },
  { id: "alp", standardName: "碱性磷酸酶", aliases: ["ALP", "alkaline phosphatase", "碱磷酶"], standardUnit: "U/L", category: "liver", refLow: 45, refHigh: 125 },

  // ── 肾功能 ──────────────────────────────────────────
  { id: "cr", standardName: "肌酐", aliases: ["Cr", "CREA", "creatinine", "血清肌酐"], standardUnit: "μmol/L", category: "kidney", refLow: 57, refHigh: 97 },
  { id: "bun", standardName: "尿素氮", aliases: ["BUN", "UREA", "尿素", "血尿素"], standardUnit: "mmol/L", category: "kidney", refLow: 2.9, refHigh: 8.2 },
  { id: "ua", standardName: "尿酸", aliases: ["UA", "SUA", "uric acid", "血尿酸"], standardUnit: "μmol/L", category: "kidney", refLow: 208, refHigh: 428 },
  { id: "egfr", standardName: "估算肾小球滤过率", aliases: ["eGFR", "GFR"], standardUnit: "mL/min/1.73m²", category: "kidney", refLow: 90, refHigh: 120 },

  // ── 血脂 ──────────────────────────────────────────
  { id: "tc", standardName: "总胆固醇", aliases: ["TC", "CHOL", "胆固醇", "total cholesterol"], standardUnit: "mmol/L", category: "blood_lipid", refLow: 0, refHigh: 5.17 },
  { id: "tg", standardName: "甘油三酯", aliases: ["TG", "TGC", "triglyceride", "三酰甘油"], standardUnit: "mmol/L", category: "blood_lipid", refLow: 0, refHigh: 1.7 },
  { id: "hdl", standardName: "高密度脂蛋白胆固醇", aliases: ["HDL-C", "HDL", "高密度脂蛋白", "好胆固醇"], standardUnit: "mmol/L", category: "blood_lipid", refLow: 1.04, refHigh: 1.96 },
  { id: "ldl", standardName: "低密度脂蛋白胆固醇", aliases: ["LDL-C", "LDL", "低密度脂蛋白", "坏胆固醇"], standardUnit: "mmol/L", category: "blood_lipid", refLow: 0, refHigh: 3.37 },

  // ── 血糖 ──────────────────────────────────────────
  { id: "glu", standardName: "空腹血糖", aliases: ["GLU", "FBG", "FPG", "血糖", "空腹葡萄糖", "glucose"], standardUnit: "mmol/L", category: "blood_glucose", refLow: 3.9, refHigh: 6.1 },
  { id: "hba1c", standardName: "糖化血红蛋白", aliases: ["HbA1c", "GHb", "糖化Hb", "A1C"], standardUnit: "%", category: "blood_glucose", refLow: 0, refHigh: 6.0 },

  // ── 甲状腺 ──────────────────────────────────────────
  { id: "tsh", standardName: "促甲状腺激素", aliases: ["TSH", "促甲状腺素"], standardUnit: "mIU/L", category: "thyroid", refLow: 0.27, refHigh: 4.2 },
  { id: "ft3", standardName: "游离三碘甲腺原氨酸", aliases: ["FT3", "游离T3", "free T3"], standardUnit: "pmol/L", category: "thyroid", refLow: 3.1, refHigh: 6.8 },
  { id: "ft4", standardName: "游离甲状腺素", aliases: ["FT4", "游离T4", "free T4"], standardUnit: "pmol/L", category: "thyroid", refLow: 12, refHigh: 22 },

  // ── 骨密度 ──────────────────────────────────────────
  { id: "bmd_tscore", standardName: "骨密度T值", aliases: ["T-score", "T值", "骨密度T", "BMD T-score"], standardUnit: "SD", category: "bone", description: "≥-1.0 正常，-1.0~-2.5 骨量减少，<-2.5 骨质疏松" },

  // ── 电解质 ──────────────────────────────────────────
  { id: "k", standardName: "血钾", aliases: ["K", "K+", "potassium", "钾"], standardUnit: "mmol/L", category: "electrolyte", refLow: 3.5, refHigh: 5.3 },
  { id: "na", standardName: "血钠", aliases: ["Na", "Na+", "sodium", "钠"], standardUnit: "mmol/L", category: "electrolyte", refLow: 137, refHigh: 147 },
  { id: "cl", standardName: "血氯", aliases: ["Cl", "Cl-", "chloride", "氯"], standardUnit: "mmol/L", category: "electrolyte", refLow: 99, refHigh: 110 },
  { id: "ca", standardName: "血钙", aliases: ["Ca", "Ca2+", "calcium", "钙"], standardUnit: "mmol/L", category: "electrolyte", refLow: 2.11, refHigh: 2.52 },
];

async function seed() {
  console.log(`准备写入 ${METRICS.length} 条标准指标...`);

  for (const m of METRICS) {
    const existing = await db.select().from(metricCatalog).where(eq(metricCatalog.id, m.id));
    if (existing.length > 0) {
      console.log(`  跳过（已存在）: ${m.standardName}`);
      continue;
    }
    await db.insert(metricCatalog).values({
      id: m.id,
      standardName: m.standardName,
      aliases: JSON.stringify(m.aliases),
      standardUnit: m.standardUnit,
      category: m.category,
      refLow: m.refLow ?? null,
      refHigh: m.refHigh ?? null,
      description: m.description ?? null,
      loinc: null,
    });
    console.log(`  ✓ ${m.standardName}`);
  }

  console.log("指标词典种子写入完成");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
