import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

assert.ok(appSource.includes("normalizeImageForVisionImport"), "截图导入前应先做图片标准化");
assert.ok(appSource.includes("canvas.toDataURL"), "前端应通过 canvas 重编码图片，避免坏头部图片直接送 OCR");
assert.ok(appSource.includes("analysisImageDataUrls"), "超宽截图应切片后再送 OCR，避免整图缩放后文字过小");
assert.ok(appSource.includes("image/jpeg"), "OCR 分析图应优先压缩编码，避免请求体过大导致 Edge Function 无法接收");
assert.ok(appSource.includes("maxAnalysisBytes"), "OCR 导入应限制分析图总大小，避免大截图在发送前就失败");

console.log("ocr image normalize check passed");
