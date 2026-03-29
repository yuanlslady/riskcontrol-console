import { WATCH_COOLDOWN_DAYS } from "./constants";
import { buildPortfolioCheckAction, buildPortfolioCheckHeadline } from "./dashboard-copy";

const daysSince = (value) => Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
const isReviewDue = (value) => Boolean(value) && new Date(`${value}T23:59:59`).getTime() <= Date.now();

const pnl = (position) =>
  !position.avgCost || !position.lastPrice ? 0 : ((position.lastPrice - position.avgCost) / position.avgCost) * 100;

export function buildAutomationDigest(state) {
  const overweight = state.positions.filter((item) => (item.portfolioWeight || 0) * 100 > state.rules.singlePositionWarn);
  const deepDrawdowns = state.positions.filter((item) => pnl(item) <= -12);
  const watchlistReady = state.watchlist.filter((item) => daysSince(item.addedAt) >= WATCH_COOLDOWN_DAYS);
  const watchlistCooling = state.watchlist.filter((item) => daysSince(item.addedAt) < WATCH_COOLDOWN_DAYS);
  const thesisMissing = state.positions.filter((item) => !item.entryReasonSummary || !item.exitInvalidatorsSummary);
  const macroReviewDue = isReviewDue(state.macroFramework?.reviewDate);
  const industryReviewDueCount = (state.industryViews || []).filter((item) => isReviewDue(item.reviewDate)).length;

  const riskLevel =
    deepDrawdowns.length + overweight.length >= 3 ? "high" : deepDrawdowns.length + overweight.length > 0 ? "medium" : "low";

  return {
    summary: {
      riskLevel,
      overweightCount: overweight.length,
      deepDrawdownCount: deepDrawdowns.length,
      watchlistReadyCount: watchlistReady.length,
      thesisMissingCount: thesisMissing.length,
      macroReviewDue,
      industryReviewDueCount,
      frameworkReviewCount: (macroReviewDue ? 1 : 0) + industryReviewDueCount,
    },
    headline: buildPortfolioCheckHeadline({
      riskLevel,
      overweightCount: overweight.length,
      watchlistReadyCount: watchlistReady.length,
      reviewDraftsCount: thesisMissing.length,
      macroReviewDue,
      industryReviewDueCount,
    }),
    actionRecommendation: buildPortfolioCheckAction({
      overweightCount: overweight.length,
      watchlistReadyCount: watchlistReady.length,
      reviewDraftsCount: thesisMissing.length,
      macroReviewDue,
      industryReviewDueCount,
    }),
    watchAlerts: watchlistReady.map((item) => ({
      id: item.id,
      ticker: item.ticker,
      title: `${item.ticker} 已完成观察期`,
      detail: "可以从观察池推进到正式交易复核，前提是 thesis 与失效条件都已补齐。",
    })),
    reviewDrafts: thesisMissing.map((item) => ({
      id: item.id,
      positionId: item.id,
      positionName: `${item.ticker} ${item.name || ""}`.trim(),
      reason: item.entryReasonSummary || `Need thesis for ${item.ticker}`,
      mistakeTags: [!item.entryReasonSummary ? "missing thesis" : null, !item.exitInvalidatorsSummary ? "missing invalidation" : null].filter(Boolean),
      lesson: "Fill thesis, invalidation, and target weight before adding more size.",
    })),
    counts: {
      cooling: watchlistCooling.length,
      ready: watchlistReady.length,
    },
  };
}
