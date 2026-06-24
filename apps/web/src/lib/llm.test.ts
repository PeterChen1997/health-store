import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJsonObject } from "./llm";

test("纯 JSON 原样返回", () => {
  assert.equal(extractJsonObject('{"a":1}'), '{"a":1}');
});

test("剥离 ```json 代码块", () => {
  assert.equal(extractJsonObject('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(extractJsonObject('```\n{"a":1}\n```'), '{"a":1}');
});

test("截取夹带说明文字时的最外层大括号", () => {
  assert.equal(extractJsonObject('好的，结果如下：{"a":1} 以上。'), '{"a":1}');
});

test("嵌套对象取到最外层闭合", () => {
  const s = '前缀 {"a":{"b":2},"c":[1,2]} 后缀';
  assert.equal(JSON.parse(extractJsonObject(s)).a.b, 2);
});
