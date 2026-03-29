import assert from "node:assert/strict";
import {
  DEFAULT_FX_RATES,
  REVIEW_TAG_OPTIONS,
  convertToBaseCurrency,
  filterPositions,
  formatReviewDate,
  getMarketCurrency,
} from "../src/lib/presentation.js";

assert.equal(getMarketCurrency("HK"), "HKD", "港股应显示 HKD");
assert.equal(getMarketCurrency("US"), "USD", "美股应显示 USD");
assert.equal(getMarketCurrency("CN"), "CNY", "A 股应显示 CNY");
assert.equal(getMarketCurrency("unknown"), "N/A", "未知市场应显示 N/A");
assert.equal(convertToBaseCurrency(100, "USD", "HKD", DEFAULT_FX_RATES), 780, "USD 应按默认汇率换算到 HKD");
assert.equal(convertToBaseCurrency(100, "CNY", "HKD", DEFAULT_FX_RATES), 108, "CNY 应按默认汇率换算到 HKD");
assert.equal(convertToBaseCurrency(100, "HKD", "HKD", DEFAULT_FX_RATES), 100, "同币种不应换算");

assert.equal(formatReviewDate("2026-03-27T10:25:00.000Z"), "2026-03-27", "复盘日期应格式化为 YYYY-MM-DD");

assert.ok(REVIEW_TAG_OPTIONS.includes("FOMO追高"), "应提供 FOMO 预设标签");
assert.ok(REVIEW_TAG_OPTIONS.includes("计划漂移"), "应提供计划漂移标签");

const filtered = filterPositions(
  [
    { ticker: "0700", theme: "AI", sector: "互联网", marketValue: 1000 },
    { ticker: "9988", theme: "AI", sector: "互联网", marketValue: 2000 },
    { ticker: "NVDA", theme: "算力", sector: "半导体", marketValue: 3000 },
  ],
  { market: "all", theme: "AI" },
);

assert.equal(filtered.length, 2, "应能按主题筛选");
assert.equal(filtered[0].theme, "AI", "筛选后应保留对应主题");

console.log("presentation check passed");
