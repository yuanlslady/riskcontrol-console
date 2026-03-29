import assert from "node:assert/strict";
import fs from "node:fs";

const agentSource = fs.readFileSync(new URL("../src/lib/agents.js", import.meta.url), "utf8");
const functionSource = fs.readFileSync(
  new URL("../supabase/functions/investment-agent/index.ts", import.meta.url),
  "utf8",
);

assert.ok(agentSource.includes("extractResponseErrorMessage"), "前端应读取 Edge Function 的响应体并解析报错");
assert.ok(agentSource.includes("response.clone().json()"), "前端应优先解析函数返回的 JSON 错误体");
assert.ok(functionSource.includes("response.text()"), "Edge Function 应保留上游 provider 的错误响应");
assert.ok(functionSource.includes('detail: "high"'), "OCR 请求应显式设置高分辨率 detail，避免宽图缩放后文字不可读");
assert.ok(functionSource.includes("imageDataUrls"), "Edge Function 应支持多张截图切片合并识别");

console.log("ocr error surface check passed");
