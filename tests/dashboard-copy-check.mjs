import assert from "node:assert/strict";
import { APP_INTRO_COPY, buildInvestmentSummaryHeadline } from "../src/lib/dashboard-copy.js";

assert.ok(APP_INTRO_COPY.title.includes("投资纪律"), "首页说明应明确这是投资纪律控制台");
assert.ok(APP_INTRO_COPY.steps.length === 4, "首页说明应覆盖四步闭环");

const summary = buildInvestmentSummaryHeadline({
  riskLevel: "high",
  overweightCount: 2,
  watchlistReadyCount: 1,
  reviewDraftsCount: 3,
});

assert.ok(summary.includes("组合风险偏高"), "高风险摘要应使用投资语言");

console.log("dashboard copy check passed");
