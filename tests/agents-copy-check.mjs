import assert from "node:assert/strict";
import { generatePostTradeReflection, generatePreTradeAssessment } from "../src/lib/agents.js";

const preTrade = await generatePreTradeAssessment({
  position: { ticker: "0700", name: "Tencent" },
  reviewResult: {
    finalAction: "delay",
    disciplineScore: 80,
    riskFlags: ["not_on_watchlist", "missing_invalidator"],
    requiredNextStep: "先加入观察池并补全失效条件",
    why: "新标的未完成观察，退出条件也还不完整。",
  },
  watchlist: [],
});

assert.equal(preTrade.mode, "local");
assert.match(preTrade.text, /Investment Committee Pre-trade Memo \/ 投前纪要/);
assert.match(preTrade.text, /投资结论 \/ Investment Conclusion/);
assert.match(preTrade.text, /关键风险 \/ Key Risks/);

const postTrade = await generatePostTradeReflection({
  reviewInput: {
    tradeAction: "buy",
    whyNow: "看到股价拉升后临时决定跟进。",
  },
  reviewResult: {
    finalAction: "delay",
    why: "新标的未完成观察，且退出条件不清晰。",
    requiredNextStep: "先纳入观察池，再写清失效条件。",
    riskFlags: ["not_on_watchlist", "missing_invalidator"],
  },
  memoryDraft: {
    reason: "",
    lesson: "",
  },
});

assert.equal(postTrade.mode, "local");
assert.match(postTrade.text, /Investment Committee Post-trade Memo \/ 投后复盘纪要/);
assert.match(postTrade.text, /原因归纳 \/ Core Reason/);
assert.match(postTrade.text, /后续改进 \/ Improvement Focus/);
assert.match(postTrade.suggestedReason, /原因归纳 \/ Core Reason/);
assert.match(postTrade.suggestedLesson, /复盘教训 \/ Lesson/);

console.log("agents copy check passed");
