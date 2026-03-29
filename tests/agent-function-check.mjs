import assert from "node:assert/strict";
import fs from "node:fs";

const agentSource = fs.readFileSync(new URL("../src/lib/agents.js", import.meta.url), "utf8");
const functionSource = fs.readFileSync(
  new URL("../supabase/functions/investment-agent/index.ts", import.meta.url),
  "utf8",
);
const envExample = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const supabaseSource = fs.readFileSync(new URL("../src/lib/supabase.js", import.meta.url), "utf8");
const supabaseConfig = fs.readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");

assert.ok(agentSource.includes('/functions/v1/${functionName}'), "前端应直接请求 Supabase Edge Function 端点");
assert.ok(agentSource.includes("apikey: supabaseAnonKey"), "前端调用函数时应显式携带 apikey");
assert.ok(agentSource.includes("Authorization: `Bearer ${accessToken}`"), "前端应显式携带当前登录 access token 调用函数");
assert.ok(!agentSource.includes("VITE_AGENT_API_KEY"), "前端不应继续依赖 VITE_AGENT_API_KEY");
assert.ok(functionSource.includes("AGENT_API_KEY"), "Edge Function 应从服务端 secret 读取 agent key");
assert.ok(functionSource.includes("generate_pre_trade_assessment"), "Edge Function 应处理投前纪要动作");
assert.ok(functionSource.includes("import_positions_from_image"), "Edge Function 应处理 OCR 导入动作");
assert.ok(functionSource.includes("requireSignedInUser"), "Edge Function 应在函数内显式校验登录用户");
assert.ok(agentSource.includes("imageDataUrls"), "前端 OCR 导入应支持多图切片后合并识别");
assert.ok(agentSource.includes("forceRefresh"), "函数鉴权失败时前端应至少尝试一次强制刷新 session 后重试");
assert.ok(agentSource.includes("isJwtErrorMessage"), "函数鉴权失败时应统一识别 Invalid JWT 并触发重试");
assert.ok(envExample.includes("VITE_AGENT_FUNCTION_NAME"), "前端环境变量示例应改为函数名");
assert.ok(supabaseSource.includes("getSupabaseAccessToken"), "supabase auth 层应提供当前 access token 读取逻辑");
assert.ok(supabaseSource.includes("refreshSupabaseSession"), "supabase auth 层应提供显式 session 刷新逻辑");
assert.ok(supabaseConfig.includes("verify_jwt = false"), "Edge Function 应关闭网关 JWT 校验，改为函数内显式校验");

console.log("agent function check passed");
