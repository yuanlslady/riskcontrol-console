export const APP_INTRO_COPY = {
  title: "这不是选股工具，而是一套投资决策仪表盘。",
  body:
    "先在控制台说明页确认投资宪法和今日动作，再把持仓、宏观、产业、交易和复盘放回同一套纪律框架里。核心目标不是预测涨跌，而是减少坏过程和计划漂移。",
  steps: [
    "先看控制台说明，确认投资宪法、组合体检和今日动作建议。",
    "再维护持仓概览，确保每笔仓位和持有依据都完整。",
    "然后更新宏观框架，回答当前该偏进攻、均衡还是防守。",
    "再维护产业地图，明确哪些方向顺风、观察或逆风。",
    "交易前必须经过交易审查，先看上层冲突，再看执行建议。",
    "交易后进入复盘归因，把错误标签和教训沉淀成长期记忆。",
  ],
};

export function buildPortfolioCheckHeadline({
  riskLevel,
  overweightCount,
  watchlistReadyCount,
  reviewDraftsCount,
  macroReviewDue,
  industryReviewDueCount,
}) {
  if (macroReviewDue || industryReviewDueCount > 0) {
    return `上层判断需要先复核。宏观框架${macroReviewDue ? "已到复核日" : "暂时有效"}，产业判断待复核 ${industryReviewDueCount} 个。`;
  }

  if (riskLevel === "high") {
    return `当前组合进入重点体检区，应先收缩风险暴露，再讨论新增交易。超限仓位 ${overweightCount} 笔，待补依据持仓 ${reviewDraftsCount} 笔。`;
  }

  if (riskLevel === "medium") {
    return `当前组合总体可控，但纪律上还不够干净。先处理仓位边界，再把 ${watchlistReadyCount} 个观察池到期标的推进到正式复核。`;
  }

  return "当前组合总体稳定，没有明显失衡。今天更适合推进观察、补齐依据，而不是基于短期价格噪音做动作。";
}

export function buildPortfolioCheckAction({
  overweightCount,
  watchlistReadyCount,
  reviewDraftsCount,
  macroReviewDue,
  industryReviewDueCount,
}) {
  const steps = [];

  if (macroReviewDue) {
    steps.push("先更新宏观框架");
  }

  if (industryReviewDueCount > 0) {
    steps.push(`${steps.length ? "再" : "先"}复核 ${industryReviewDueCount} 个产业判断`);
  }

  if (overweightCount > 0) {
    steps.push(`${steps.length ? "再" : "先"}处理 ${overweightCount} 笔超限仓位`);
  }

  if (watchlistReadyCount > 0) {
    steps.push(`${steps.length ? "再" : "先"}复核 ${watchlistReadyCount} 个观察池到期标的`);
  }

  if (reviewDraftsCount > 0) {
    steps.push(`${steps.length ? "并" : "先"}补齐 ${reviewDraftsCount} 笔持仓依据`);
  }

  if (!steps.length) {
    return "今日没有必须立即处理的纪律警报，按既定清单跟踪组合、观察池和复盘记录即可。";
  }

  return `今日动作建议：${steps.join("，")}。`;
}
