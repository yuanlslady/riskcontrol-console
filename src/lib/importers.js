function asNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const normalized = String(value).replace(/[,%$\s]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asWeight(value, totalPortfolioAmount = 0, marketValue = 0) {
  if (value !== null && value !== undefined && value !== "") {
    const text = String(value).trim();
    if (text.includes("%")) return asNumber(text) / 100;
    const parsed = asNumber(text);
    return parsed > 1 ? parsed / 100 : parsed;
  }
  if (totalPortfolioAmount > 0 && marketValue > 0) {
    return marketValue / totalPortfolioAmount;
  }
  return 0;
}

export function parseBrokerScreenshotResponse(raw) {
  if (!raw) return { positions: [], totalPortfolioAmount: undefined };

  if (typeof raw === "object") {
    if (Array.isArray(raw)) return { positions: raw, totalPortfolioAmount: undefined };
    if (Array.isArray(raw.positions)) {
      return {
        positions: raw.positions,
        totalPortfolioAmount: raw.totalPortfolioAmount ?? raw.total_amount ?? raw.totalMarketValue,
      };
    }
  }

  const text = String(raw);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { positions: [], totalPortfolioAmount: undefined };

  const parsed = JSON.parse(match[0]);
  if (Array.isArray(parsed)) return { positions: parsed, totalPortfolioAmount: undefined };

  return {
    positions: Array.isArray(parsed.positions) ? parsed.positions : [],
    totalPortfolioAmount: parsed.totalPortfolioAmount ?? parsed.total_amount ?? parsed.totalMarketValue,
  };
}

export function normalizeImportedPositions(rows, options = {}) {
  const totalPortfolioAmount = asNumber(options.totalPortfolioAmount);

  return (rows || [])
    .map((row) => {
      const marketValue = asNumber(row.marketValue || row.market_value || row.positionValue || row.market_value_amount);
      const shareCount = asNumber(row.shareCount || row.quantity || row.shares || row.holdingQty);

      return {
        ticker: String(row.ticker || row.symbol || "").trim().toUpperCase(),
        name: String(row.name || "").trim(),
        market: String(row.market || "HK").trim().toUpperCase() || "HK",
        instrumentType: row.instrumentType || "single_stock",
        positionType: row.positionType || "core_midterm",
        inCompetenceCircle: true,
        shareCount,
        marketValue,
        avgCost: asNumber(row.avgCost || row.cost || row.averageCost),
        lastPrice: asNumber(row.lastPrice || row.price || row.close),
        portfolioWeight: asWeight(row.portfolioWeight || row.weight, totalPortfolioAmount, marketValue),
        maxWeightAllowed: asWeight(row.maxWeightAllowed || row.maxWeight || 15),
        thesisHorizonLabel: row.thesisHorizonLabel || "midterm",
        entryReasonSummary: row.entryReasonSummary || "",
        exitInvalidatorsSummary: row.exitInvalidatorsSummary || "",
      };
    })
    .filter((row) => row.ticker);
}

export function recalculateImportedDraftWeights(drafts, totalPortfolioAmount) {
  const total = asNumber(totalPortfolioAmount);
  if (!total) return drafts || [];

  return (drafts || []).map((draft) => ({
    ...draft,
    portfolioWeight: draft.marketValue ? draft.marketValue / total : draft.portfolioWeight || 0,
  }));
}

export function updateImportedDraft(drafts, index, patch, options = {}) {
  const next = (drafts || []).map((draft, currentIndex) => (currentIndex === index ? { ...draft, ...patch } : draft));
  return recalculateImportedDraftWeights(next, options.totalPortfolioAmount);
}
