import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const positionsSection = appSource.slice(
  appSource.indexOf('{tab === "positions-rationale" && ('),
  appSource.indexOf('{tab === "review-gate" && ('),
);
const reviewSection = appSource.slice(
  appSource.indexOf('{tab === "review-gate" && ('),
  appSource.indexOf('{tab === "feedback" && ('),
);

assert.ok(appSource.includes("Generate Pre-trade Memo / 生成投前纪要"), "交易审查页应使用投前纪要按钮文案");
assert.ok(appSource.includes("Pre-trade Memo / 投前纪要"), "结果卡片应展示投前纪要标题");
assert.ok(appSource.includes("Post-trade Memo / 投后复盘纪要"), "复盘页应展示投后复盘纪要标题");
assert.ok(appSource.includes("投资结论"), "结果面板应使用投资语言");
assert.ok(appSource.includes("核心依据"), "结果面板应使用投资语言");
assert.ok(!appSource.includes("Generate Post-trade Reflection / 生成复盘建议"), "旧的投后复盘按钮不应留在交易前页面");
assert.ok(!positionsSection.includes("Watchlist / 观察池"), "观察池不应继续放在持仓与依据页");
assert.ok(reviewSection.includes("Watchlist / 观察池"), "观察池应迁移到交易审查页");
assert.ok(reviewSection.includes("观察名单先行"), "交易审查页应强调先观察再交易");

console.log("review workflow check passed");
