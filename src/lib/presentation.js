export const REVIEW_TAG_OPTIONS = [
  "FOMO追高",
  "情绪化卖出",
  "无thesis交易",
  "失效条件不清",
  "计划漂移",
  "仓位过重",
  "非能力圈扩张",
  "试错仓失控",
];

export const REVIEW_ACTION_LABELS = {
  allow: "允许执行",
  review: "需要复核",
  reduce_size: "缩小仓位",
  delay: "延后复核",
  block: "阻止执行",
};

export const REVIEW_FIELD_PLACEHOLDERS = {
  thesisReference: "这笔操作的核心依据是什么？尽量用一句话说清。",
  whyNow: "为什么是现在？触发这次操作的直接原因是什么？",
  whatChanged: "和上一次决策相比，新增了什么事实或变化？",
  wrongIf: "什么情况出现，说明这次操作是错的？",
  holdingPlanAfterTrade: "做完这笔后，准备拿多久，怎么跟踪，什么条件下调整？",
  alternativeAction: "如果今天不交易，最稳妥的替代动作是什么？",
};

export const DEFAULT_FX_RATES = {
  "USD_HKD": 7.8,
  "CNY_HKD": 1.08,
  "HKD_HKD": 1,
};

export function getMarketCurrency(market) {
  if (market === "HK") return "HKD";
  if (market === "US") return "USD";
  if (market === "CN") return "CNY";
  return "N/A";
}

export function formatReviewDate(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export function convertToBaseCurrency(amount, fromCurrency, baseCurrency, rates = DEFAULT_FX_RATES) {
  const numeric = Number(amount || 0);
  if (!numeric || fromCurrency === baseCurrency) return numeric;
  const rateKey = `${fromCurrency}_${baseCurrency}`;
  return numeric * Number(rates[rateKey] || 1);
}

export function groupPositionsByField(positions, field) {
  const grouped = new Map();
  positions.forEach((item) => {
    const groupValue = item[field] || "未分类";
    const current = grouped.get(groupValue) || {
      groupValue,
      count: 0,
      marketValue: 0,
      items: [],
    };
    current.count += 1;
    current.marketValue += Number(item.marketValue || 0);
    current.items.push(item);
    grouped.set(groupValue, current);
  });

  return [...grouped.values()].sort((a, b) => b.marketValue - a.marketValue);
}

export function filterPositions(positions, filters) {
  return positions.filter((item) => {
    const marketMatch = !filters.market || filters.market === "all" || item.market === filters.market;
    const themeMatch = !filters.theme || filters.theme === "all" || item.theme === filters.theme;
    return marketMatch && themeMatch;
  });
}
