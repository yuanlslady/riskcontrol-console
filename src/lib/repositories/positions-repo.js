import { createEntityRepository } from "./shared.js";

function mapPositionToRow(position, userId) {
  return {
    id: position.id,
    user_id: userId,
    ticker: position.ticker,
    name: position.name,
    market: position.market,
    theme: position.theme,
    industry_view_id: position.industryViewId || null,
    sector: position.sector,
    instrument_type: position.instrumentType,
    position_type: position.positionType,
    in_competence_circle: position.inCompetenceCircle,
    avg_cost: position.avgCost,
    last_price: position.lastPrice,
    share_count: position.shareCount,
    market_value: position.marketValue,
    portfolio_weight: position.portfolioWeight,
    max_weight_allowed: position.maxWeightAllowed,
    thesis_horizon_label: position.thesisHorizonLabel,
    entry_reason_summary: position.entryReasonSummary,
    exit_invalidators_summary: position.exitInvalidatorsSummary,
    updated_at: new Date().toISOString(),
  };
}

function mapRowToPosition(row) {
  return {
    id: row.id,
    ticker: row.ticker,
    name: row.name || "",
    market: row.market,
    theme: row.theme || "",
    industryViewId: row.industry_view_id || "",
    sector: row.sector || "",
    instrumentType: row.instrument_type,
    positionType: row.position_type,
    inCompetenceCircle: row.in_competence_circle,
    avgCost: row.avg_cost,
    lastPrice: row.last_price,
    shareCount: row.share_count,
    marketValue: row.market_value,
    portfolioWeight: row.portfolio_weight,
    maxWeightAllowed: row.max_weight_allowed,
    thesisHorizonLabel: row.thesis_horizon_label,
    entryReasonSummary: row.entry_reason_summary || "",
    exitInvalidatorsSummary: row.exit_invalidators_summary || "",
  };
}

export const positionsRepo = createEntityRepository({
  table: "positions",
  toRow: mapPositionToRow,
  fromRow: mapRowToPosition,
  orderBy: { column: "updated_at", ascending: false },
});
