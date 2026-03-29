function toNumber(value) {
  return Number(String(value ?? "").replace(/[,%$\s]/g, "")) || 0;
}

function toWeight(value) {
  const numeric = toNumber(value);
  return numeric > 1 ? numeric / 100 : numeric;
}

function isFutureTime(value) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time > Date.now();
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

const ACTION_PRIORITY = {
  allow: 0,
  review: 1,
  reduce_size: 2,
  delay: 3,
  block: 4,
};

const RULES = [
  {
    id: "R000_watchlist_before_execution",
    level: "review",
    action: "review",
    message: "新标的应先进入观察池，再进入正式交易审查。",
    nextStep: "先加入观察池并完成冷静期观察",
    riskFlags: ["not_on_watchlist"],
    when: ({ isNewIdea, isBuySide, watchlisted }) => isNewIdea && isBuySide && !watchlisted,
  },
  {
    id: "R001_missing_thesis",
    level: "block",
    action: "block",
    message: "建仓或加仓前必须先写清 thesis。",
    nextStep: "补充 thesis",
    riskFlags: ["missing_thesis"],
    penalty: 40,
    when: ({ isBuySide, thesisPresent }) => isBuySide && !thesisPresent,
  },
  {
    id: "R002_missing_invalidator",
    level: "warn",
    action: "review",
    message: "未定义失效条件，不能判断何时该退出。",
    nextStep: "补充失效条件",
    riskFlags: ["missing_invalidator"],
    penalty: 20,
    when: ({ invalidationPresent }) => !invalidationPresent,
  },
  {
    id: "R003_non_competence_long_hold",
    level: "block",
    action: "block",
    message: "非能力圈标的不能按中期或长期逻辑持有。",
    nextStep: "缩短持有周期或放弃交易",
    riskFlags: ["non_competence_trade"],
    penalty: 30,
    when: ({ inCompetenceCircle, targetPositionType, thesisHorizonLabel, plannedHoldingDays }) =>
      !inCompetenceCircle &&
      (["core_midterm", "core_longterm"].includes(targetPositionType) || ["midterm", "longterm"].includes(thesisHorizonLabel) || plannedHoldingDays > 7),
  },
  {
    id: "R004_non_competence_add",
    level: "block",
    action: "block",
    message: "非能力圈标的不允许连续加仓或摊低成本。",
    nextStep: "停止加仓，回到观察与复核",
    riskFlags: ["non_competence_trade"],
    penalty: 30,
    when: ({ inCompetenceCircle, action }) => !inCompetenceCircle && action === "add",
  },
  {
    id: "R006_probe_avg_down",
    level: "block",
    action: "block",
    message: "试错仓不允许通过加仓来放大错误。",
    nextStep: "维持试错仓位或退出",
    riskFlags: ["probe_to_long_hold_drift"],
    penalty: 20,
    when: ({ positionType, action, averagingDown }) => positionType === "probe" && action === "add" && averagingDown,
  },
  {
    id: "R007_trade_during_cooldown",
    level: "delay",
    action: "delay",
    message: "冷静期内不建议直接交易，先延迟并完成复核。",
    nextStep: "等待 3 个交易日后再评估",
    riskFlags: ["cooldown_active"],
    penalty: 20,
    delayWindow: "3d",
    when: ({ cooldownActive, action }) => cooldownActive && action !== "review",
  },
  {
    id: "R101_intraday_panic_sell",
    level: "delay",
    action: "delay",
    message: "盘中急跌下的情绪化卖出应先延迟复核。",
    nextStep: "等待 30 分钟后复核 thesis",
    riskFlags: ["panic_sell_risk", "emotion_driven"],
    penalty: 20,
    delayWindow: "30m",
    when: ({ action, emotionRisk, triggerType, tradeWindow, thesisStatus }) =>
      action === "sell" &&
      emotionRisk === "high" &&
      triggerType === "price_drop" &&
      tradeWindow === "intraday" &&
      thesisStatus === "active",
  },
  {
    id: "R102_chasing_strength",
    level: "delay",
    action: "delay",
    message: "涨势本身不能作为买入理由，先延迟并补充新事实。",
    nextStep: "等待 30 分钟并补充新增事实",
    riskFlags: ["chasing_risk", "no_new_information"],
    penalty: 15,
    delayWindow: "30m",
    when: ({ isBuySide, triggerType, onlyPriceDriven, hasNewInformation }) =>
      isBuySide && triggerType === "price_spike" && onlyPriceDriven && !hasNewInformation,
  },
  {
    id: "R103_large_reallocation",
    level: "delay",
    action: "delay",
    message: "大幅调仓必须经过一轮冷静复核。",
    nextStep: "等待 24 小时后重新评估",
    riskFlags: ["large_reallocation"],
    penalty: 15,
    delayWindow: "24h",
    when: ({ action, weightDelta, cashDelta, largeReallocationThreshold }) =>
      ["buy", "add", "reduce", "sell", "reclassify"].includes(action) && (weightDelta > largeReallocationThreshold || cashDelta > 0.1),
  },
  {
    id: "R104_weakened_thesis_delay",
    level: "delay",
    action: "delay",
    message: "thesis 已弱化，不允许在同一情绪周期内直接加仓。",
    nextStep: "更新 thesis 状态后再决定",
    riskFlags: ["weakened_thesis"],
    penalty: 15,
    delayWindow: "24h",
    when: ({ thesisStatus, action }) => thesisStatus === "weakened" && action === "add",
  },
  {
    id: "R201_single_position_overweight",
    level: "warn",
    action: "reduce_size",
    message: "单票仓位已超出预算，不应继续累积风险。",
    nextStep: "缩小仓位",
    riskFlags: ["overweight_position"],
    penalty: 20,
    when: ({ targetWeightAfterTrade, maxWeightAllowed }) => targetWeightAfterTrade > 0 && maxWeightAllowed > 0 && targetWeightAfterTrade > maxWeightAllowed,
  },
  {
    id: "R204_emotion_risk_high",
    level: "warn",
    action: "review",
    message: "当前情绪风险偏高，应先复核而不是立即执行。",
    nextStep: "先冷静并重新说明操作理由",
    riskFlags: ["emotion_driven"],
    penalty: 20,
    when: ({ emotionRisk }) => emotionRisk === "high",
  },
  {
    id: "R202_theme_concentration",
    level: "warn",
    action: "reduce_size",
    message: "同主题敞口过高，组合相关性可能被低估。",
    nextStep: "降低同主题总暴露",
    riskFlags: ["theme_concentration"],
    penalty: 10,
    when: ({ sameThemeWeight, themeMax }) => sameThemeWeight > 0 && themeMax > 0 && sameThemeWeight > themeMax,
  },
  {
    id: "R203_realized_thesis",
    level: "warn",
    action: "reduce_size",
    message: "原 thesis 已较大程度兑现，需要重新评估继续持有的赔率。",
    nextStep: "缩小仓位或重写 thesis",
    riskFlags: ["realized_thesis"],
    penalty: 10,
    when: ({ thesisStatus }) => thesisStatus === "realized",
  },
  {
    id: "R205_plan_drift",
    level: "warn",
    action: "review",
    message: "当前持仓已经偏离原计划，需要确认是策略升级还是纪律失守。",
    nextStep: "重做持仓分类",
    riskFlags: ["plan_drift"],
    penalty: 20,
    when: ({ planDriftFlag, action, onlyPriceDriven, holdingPlanText }) =>
      planDriftFlag || (action === "hold" && onlyPriceDriven) || /再等|改成长拿|继续扛/.test(holdingPlanText),
  },
  {
    id: "R206_instrument_horizon_mismatch",
    level: "review",
    action: "review",
    message: "当前工具更适合短周期表达，但 thesis 是中长期时间窗。",
    nextStep: "更换更匹配的工具或缩短时间窗",
    riskFlags: ["instrument_horizon_mismatch"],
    penalty: 20,
    when: ({ instrumentType, thesisHorizonLabel }) =>
      ["leveraged_product", "inverse_product"].includes(instrumentType) && ["midterm", "longterm"].includes(thesisHorizonLabel),
  },
  {
    id: "R301_invalidated_thesis",
    level: "review",
    action: "review",
    message: "thesis 已被证伪，应优先进入退出评估。",
    nextStep: "进入退出评估",
    riskFlags: ["invalidated_thesis"],
    penalty: 30,
    when: ({ thesisStatus }) => thesisStatus === "invalidated",
  },
  {
    id: "R302_midterm_timeout",
    level: "review",
    action: "review",
    message: "中线持有窗口已到，需要判断 thesis 是延长、降级还是退出。",
    nextStep: "更新 thesis 状态",
    riskFlags: ["review_overdue"],
    penalty: 10,
    when: ({ positionType, reviewDueAt, thesisStatus }) =>
      positionType === "core_midterm" && isFutureTime(reviewDueAt) === false && Boolean(reviewDueAt) && thesisStatus !== "realized",
  },
];

function buildContext(position, reviewForm, state) {
  const freeText = `${reviewForm.whyNow || ""} ${reviewForm.whatChanged || ""} ${reviewForm.wrongIf || ""} ${reviewForm.holdingPlanAfterTrade || ""}`.toLowerCase();
  const action = reviewForm.tradeAction || "hold";
  const targetWeightAfterTrade = toWeight(reviewForm.targetWeightAfterTrade || position.portfolioWeight);
  const currentWeight = toWeight(position.portfolioWeight);
  const sameThemeWeight = toWeight(position.sameThemeWeight);
  const maxWeightAllowed = toWeight(position.maxWeightAllowed || state.rules.singlePositionWarn || state.constitution?.coreMax);
  const themeMax = toWeight(state.constitution?.themeMax || 0.3);
  const largeReallocationThreshold = toWeight(state.rules.largeReallocation || 0.05);
  const thesisReference = reviewForm.thesisReference || position.entryReasonSummary || "";
  const invalidationReference = reviewForm.wrongIf || position.exitInvalidatorsSummary || "";
  const priceDriven = includesAny(freeText, [/price/, /chart/, /momentum/, /breakout/, /technical/, /追高/, /涨太快/, /跌太快/, /回本/, /盘口/]);
  const newInformationHint = includesAny(freeText, [/earnings/, /order/, /guidance/, /policy/, /contract/, /capex/, /财报/, /订单/, /政策/, /指引/, /基本面/]);

  return {
    action,
    isBuySide: action === "buy" || action === "add",
    isNewIdea: reviewForm.positionId === "__new__" || position.id === "__new__",
    watchlisted: state.watchlist.some((item) => item.ticker === position.ticker),
    thesisPresent: Boolean(thesisReference.trim()),
    invalidationPresent: Boolean(invalidationReference.trim()),
    inCompetenceCircle: position.inCompetenceCircle !== false,
    positionType: reviewForm.targetPositionType || position.positionType || "core_midterm",
    targetPositionType: reviewForm.targetPositionType || position.positionType || "core_midterm",
    thesisHorizonLabel: reviewForm.thesisHorizonLabel || position.thesisHorizonLabel || "midterm",
    targetWeightAfterTrade,
    currentWeight,
    weightDelta: Math.abs(targetWeightAfterTrade - currentWeight),
    maxWeightAllowed,
    sameThemeWeight,
    themeMax,
    largeReallocationThreshold,
    cashDelta: Math.abs(toWeight(reviewForm.estimatedCashRatioAfterTrade) - toWeight(position.estimatedCashRatio)),
    thesisStatus: reviewForm.thesisStatus || position.thesisStatus || "active",
    cooldownActive: isFutureTime(position.cooldownUntil || reviewForm.cooldownUntil),
    emotionRisk: reviewForm.emotionRisk || position.emotionRiskLevel || "medium",
    planDriftFlag: Boolean(position.planDriftFlag || reviewForm.planDriftFlag),
    triggerType: reviewForm.triggerType || "none",
    tradeWindow: reviewForm.tradeWindow || "close",
    onlyPriceDriven: priceDriven && !newInformationHint,
    hasNewInformation: newInformationHint,
    plannedHoldingDays: Number(reviewForm.plannedHoldingDays || position.plannedHoldingDays || 0),
    reviewDueAt: position.reviewDueAt || reviewForm.reviewDueAt || null,
    instrumentType: reviewForm.instrumentType || position.instrumentType || "single_stock",
    holdingPlanText: reviewForm.holdingPlanAfterTrade || "",
    averagingDown: action === "add" && position.avgCost && reviewForm.referencePrice && toNumber(reviewForm.referencePrice) < toNumber(position.avgCost),
  };
}

function dedupeStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function sortMatchedRules(rules) {
  return [...rules].sort((left, right) => ACTION_PRIORITY[right.action] - ACTION_PRIORITY[left.action]);
}

export function evaluateTradeReview(position, reviewForm, state) {
  const context = buildContext(position, reviewForm, state);
  const matchedRules = RULES.filter((rule) => rule.when(context)).map((rule) => ({
    id: rule.id,
    level: rule.level,
    action: rule.action,
    message: rule.message,
    nextStep: rule.nextStep,
    riskFlags: rule.riskFlags || [],
    delayWindow: rule.delayWindow || null,
    penalty: rule.penalty || 0,
  }));

  const sortedRules = sortMatchedRules(matchedRules);
  const riskFlags = dedupeStrings(sortedRules.flatMap((rule) => rule.riskFlags));
  const highestAction = sortedRules[0]?.action || "allow";
  const disciplineScore = Math.max(0, 100 - sortedRules.reduce((sum, rule) => sum + (rule.penalty || 0), 0));

  const finalAction =
    highestAction !== "allow"
      ? highestAction
      : disciplineScore < 50
        ? "block"
        : disciplineScore < 70
          ? "delay"
          : disciplineScore < 85
            ? "review"
            : "allow";

  const delayWindow = sortedRules.find((rule) => rule.action === "delay")?.delayWindow || null;
  const requiredNextStep =
    sortedRules[0]?.nextStep ||
    (finalAction === "allow"
      ? "按原计划执行"
      : finalAction === "review"
        ? "补充缺失信息并重新复核"
        : finalAction === "reduce_size"
          ? "缩小仓位后再决定"
          : finalAction === "delay"
            ? "等待冷静期结束后再评估"
            : "停止交易并修复流程");

  const why = sortedRules.length
    ? sortedRules.map((rule) => `${rule.id}: ${rule.message}`).join("；")
    : "未发现明显纪律冲突。";

  return {
    finalAction,
    disciplineScore,
    matchedRules: sortedRules,
    riskFlags,
    delayWindow,
    requiredNextStep,
    why,
  };
}
