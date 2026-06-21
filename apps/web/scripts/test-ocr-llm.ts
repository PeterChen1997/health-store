/**
 * 验证脚本：OCR 服务 + LLM 结构化抽取整条链路
 * 用法：
 *   pnpm --filter web exec tsx ../../scripts/test-ocr-llm.ts <图片路径>
 *   pnpm --filter web exec tsx ../../scripts/test-ocr-llm.ts --mock
 */
import { generateStructured } from "../src/lib/llm";
import { z } from "zod";

// 以下为完全虚构的示例患者数据，仅用于测试 OCR→LLM 链路，不含任何真实个人信息。
const MOCK_OCR_TEXT = `
示例医院门诊病历记录
就诊日期：2024/01/15  患者姓名：张三  性别：男  年龄：35  费用类别：自费
科室：内科  普通门诊  医师姓名：李医生
病历号：000000

主诉：腹部不适一周

现病史：
腹部轻度不适一周，饭后偶有胀感，无明显其他伴随症状，睡眠可，精神状态良好。

查体：无异常

辅助检查：无

既往史：无特殊

过敏史：无

家族史：无

初步诊断（或者诊断）：
西医：1 消化不良

治疗方案：生活方式调整，必要时对症处理

Rx 处方号：000001  示例药物  100mg*30片  1盒  1片 每日三次 口服
医师签字：李医生  第1页共1页
`;

// 门诊病历的结构化 schema
const MedicalRecordSchema = z.object({
  visit_date: z.string().describe("就诊日期 YYYY-MM-DD"),
  patient: z.object({
    name: z.string(),
    gender: z.string(),
    age: z.number(),
    insurance_type: z.string().optional(),
  }),
  institution: z.string().describe("医院名称"),
  department: z.string().describe("科室"),
  doctor: z.string().describe("医师姓名"),
  chief_complaint: z.string().describe("主诉"),
  diagnoses: z.array(z.object({
    system: z.string().describe("中医 or 西医"),
    diagnosis: z.string(),
  })),
  allergies: z.array(z.string()).describe("过敏史"),
  past_history: z.array(z.string()).describe("既往史"),
  prescriptions: z.array(z.object({
    drug_name: z.string(),
    specification: z.string().optional(),
    quantity: z.string().optional(),
    usage: z.string().describe("用法用量"),
  })),
  ai_summary: z.string().describe("用患者能读懂的通俗语言，3句话内总结本次就诊情况、诊断和用药目的"),
});

async function testWithOcr(imagePath: string) {
  console.log(`\n[1/2] 调用 OCR 服务解析：${imagePath}`);
  const form = new FormData();
  const fs = await import("fs/promises");
  const path = await import("path");
  const buf = await fs.readFile(imagePath);
  form.append("file", new Blob([buf]), path.basename(imagePath));

  const res = await fetch("http://localhost:8700/parse", { method: "POST", body: form });
  if (!res.ok) throw new Error(`OCR 失败: ${res.status} ${await res.text()}`);
  const { markdown } = await res.json() as { markdown: string; json_data: unknown[] };

  console.log("\n--- OCR Markdown 输出（前 500 字符）---");
  console.log(markdown.slice(0, 500));

  return markdown;
}

async function testLlmStructure(ocrText: string) {
  console.log("\n[2/2] 调用 LLM 结构化抽取...");
  const result = await generateStructured(
    MedicalRecordSchema,
    `以下是一份医院门诊病历的 OCR 识别文本，请将其中的信息结构化提取。\n\n${ocrText}`
  );
  console.log("\n--- LLM 结构化结果 ---");
  console.log(JSON.stringify(result, null, 2));
  console.log("\n--- AI 通俗摘要 ---");
  console.log(result.ai_summary);
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const isMock = args.includes("--mock");
  const imagePath = args.find(a => !a.startsWith("--"));

  try {
    let ocrText: string;

    if (isMock || !imagePath) {
      console.log("[模式] 使用 mock OCR 文本（跳过 OCR 微服务）");
      ocrText = MOCK_OCR_TEXT;
    } else {
      ocrText = await testWithOcr(imagePath);
    }

    await testLlmStructure(ocrText);
    console.log("\n✓ 链路验证通过");
  } catch (err) {
    console.error("\n✗ 验证失败:", err);
    process.exit(1);
  }
}

main();
