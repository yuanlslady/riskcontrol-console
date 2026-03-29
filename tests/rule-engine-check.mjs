import assert from "node:assert/strict";
import { evaluateTradeReview } from "../src/lib/rule-engine.js";

const baseState = {
  constitution: {
    coreMax: 0.15,
    probeMax: 0.05,
    themeMax: 0.3,
  },
  rules: {
    singlePositionWarn: 0.15,
    largeReallocation: 0.05,
    allowInstrumentMismatch: true,
    missingTargetWeightAction: "warn",
  },
  watchlist: [],
};

const newIdeaResult = evaluateTradeReview(
  {
    id: "__new__",
    ticker: "0700",
    name: "Tencent",
    entryReasonSummary: "",
    exitInvalidatorsSummary: "",
    maxWeightAllowed: 0.15,
  },
  {
    positionId: "__new__",
    tradeAction: "buy",
    targetWeightAfterTrade: "20",
    emotionRisk: "high",
    whyNow: "Chart breakout only",
    whatChanged: "",
    wrongIf: "",
  },
  baseState,
);

assert.equal(newIdeaResult.finalAction, "block", "高风险新开仓应被 block");
assert.ok(newIdeaResult.matchedRules.some((item) => item.id === "R000_watchlist_before_execution"), "应命中先观察后交易规则");
assert.ok(newIdeaResult.riskFlags.includes("emotion_driven"), "应识别情绪风险");

const watchedState = {
  ...baseState,
  watchlist: [{ id: "watch-1", ticker: "0700" }],
};

const watchedIdeaResult = evaluateTradeReview(
  {
    id: "position-1",
    ticker: "0700",
    name: "Tencent",
    entryReasonSummary: "AI infra demand continues",
    exitInvalidatorsSummary: "Order momentum weakens",
    maxWeightAllowed: 0.15,
  },
  {
    positionId: "position-1",
    tradeAction: "hold",
    targetWeightAfterTrade: "10",
    emotionRisk: "low",
    whyNow: "Order flow is on plan",
    whatChanged: "Nothing material changed",
    wrongIf: "Demand turns negative",
  },
  watchedState,
);

assert.equal(watchedIdeaResult.finalAction, "allow", "合规持仓应 allow");
assert.equal(watchedIdeaResult.riskFlags.length, 0, "合规持仓不应有风险标记");

const nonCompetenceAddResult = evaluateTradeReview(
  {
    id: "position-2",
    ticker: "XYZ",
    name: "Outside Circle",
    entryReasonSummary: "short catalyst",
    exitInvalidatorsSummary: "catalyst fails",
    maxWeightAllowed: 0.05,
    inCompetenceCircle: false,
    positionType: "probe",
    thesisHorizonLabel: "midterm",
  },
  {
    positionId: "position-2",
    tradeAction: "add",
    targetWeightAfterTrade: "8",
    emotionRisk: "low",
    whyNow: "Want to average down",
    whatChanged: "nothing changed",
    wrongIf: "still wrong",
  },
  baseState,
);

assert.equal(nonCompetenceAddResult.finalAction, "block", "非能力圈加仓应 block");
assert.ok(nonCompetenceAddResult.matchedRules.some((item) => item.id === "R004_non_competence_add"), "应命中 R004");

const panicSellResult = evaluateTradeReview(
  {
    id: "position-3",
    ticker: "0700",
    name: "Tencent",
    entryReasonSummary: "AI infra demand continues",
    exitInvalidatorsSummary: "Order momentum weakens",
    maxWeightAllowed: 0.15,
    inCompetenceCircle: true,
    positionType: "core_midterm",
    thesisStatus: "active",
  },
  {
    positionId: "position-3",
    tradeAction: "sell",
    targetWeightAfterTrade: "0",
    emotionRisk: "high",
    triggerType: "price_drop",
    tradeWindow: "intraday",
    whyNow: "跌太快了先卖掉",
    whatChanged: "盘中急跌",
    wrongIf: "基本面没坏",
  },
  baseState,
);

assert.equal(panicSellResult.finalAction, "delay", "情绪化盘中卖出应 delay");
assert.equal(panicSellResult.delayWindow, "30m", "盘中延迟窗口应为 30m");
assert.ok(panicSellResult.matchedRules.some((item) => item.id === "R101_intraday_panic_sell"), "应命中 R101");

const cooldownResult = evaluateTradeReview(
  {
    id: "position-6",
    ticker: "1810",
    name: "Xiaomi",
    entryReasonSummary: "phone cycle recovers",
    exitInvalidatorsSummary: "channel inventory worsens",
    maxWeightAllowed: 0.1,
    inCompetenceCircle: true,
    positionType: "core_midterm",
    cooldownUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    positionId: "position-6",
    tradeAction: "buy",
    targetWeightAfterTrade: "8",
    emotionRisk: "medium",
    whyNow: "想直接买入",
    whatChanged: "无新变化",
    wrongIf: "周期不成立",
  },
  baseState,
);

assert.equal(cooldownResult.finalAction, "delay", "冷静期内交易应 delay 而不是 block");
assert.equal(cooldownResult.delayWindow, "3d", "冷静期默认窗口应为 3d");
assert.ok(cooldownResult.matchedRules.some((item) => item.id === "R007_trade_during_cooldown"), "应命中 R007");

const realizedThesisResult = evaluateTradeReview(
  {
    id: "position-4",
    ticker: "9988",
    name: "Alibaba",
    entryReasonSummary: "valuation repair",
    exitInvalidatorsSummary: "repair fails",
    maxWeightAllowed: 0.15,
    portfolioWeight: 0.18,
    sameThemeWeight: 0.34,
    inCompetenceCircle: true,
    positionType: "core_midterm",
    thesisStatus: "realized",
  },
  {
    positionId: "position-4",
    tradeAction: "hold",
    targetWeightAfterTrade: "18",
    emotionRisk: "low",
    whyNow: "想继续拿着",
    whatChanged: "原逻辑已兑现",
    wrongIf: "修复结束",
  },
  baseState,
);

assert.equal(realizedThesisResult.finalAction, "reduce_size", "thesis 已兑现且仓位过重时应 reduce_size");
assert.ok(realizedThesisResult.matchedRules.some((item) => item.id === "R203_realized_thesis"), "应命中 R203");
assert.ok(realizedThesisResult.matchedRules.some((item) => item.id === "R201_single_position_overweight"), "应命中 R201");

const mismatchResult = evaluateTradeReview(
  {
    id: "position-5",
    ticker: "TQQQ",
    name: "Leveraged ETF",
    entryReasonSummary: "AI trend",
    exitInvalidatorsSummary: "trend breaks",
    maxWeightAllowed: 0.08,
    instrumentType: "leveraged_product",
    thesisHorizonLabel: "midterm",
    positionType: "swing",
  },
  {
    positionId: "position-5",
    tradeAction: "add",
    targetWeightAfterTrade: "4",
    emotionRisk: "low",
    whyNow: "继续看多",
    whatChanged: "无新事实",
    wrongIf: "趋势破坏",
  },
  baseState,
);

assert.equal(mismatchResult.finalAction, "review", "工具与时间窗错配应 review");
assert.ok(mismatchResult.riskFlags.includes("instrument_horizon_mismatch"), "应打上工具错配标签");

console.log("rule engine check passed");
