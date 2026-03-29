import { createEntityRepository } from "./shared.js";

function mapTradeReviewRecordToRow(item, userId) {
  const row = {
    id: item.id,
    user_id: userId,
    position_id: item.positionId || null,
    thesis_snapshot_id: item.thesisSnapshotId || null,
    review_target_type: item.reviewTargetType || "position",
    review_stage: item.reviewStage || "pre_trade",
    action_label: item.actionLabel || "",
    final_action: item.finalAction || "review",
    matched_rules: item.matchedRules || [],
    decision_summary: item.decisionSummary || "",
    agent_summary: item.agentSummary || "",
    user_note: item.userNote || "",
    executed: Boolean(item.executed),
    execution_note: item.executionNote || "",
    outcome_label: item.outcomeLabel || null,
    updated_at: new Date().toISOString(),
  };

  if (item.createdAt) {
    row.created_at = item.createdAt;
  }

  return row;
}

function mapRowToTradeReviewRecord(row) {
  return {
    id: row.id,
    positionId: row.position_id,
    thesisSnapshotId: row.thesis_snapshot_id,
    reviewTargetType: row.review_target_type || "position",
    reviewStage: row.review_stage || "pre_trade",
    actionLabel: row.action_label || "",
    finalAction: row.final_action || "review",
    matchedRules: Array.isArray(row.matched_rules) ? row.matched_rules : [],
    decisionSummary: row.decision_summary || "",
    agentSummary: row.agent_summary || "",
    userNote: row.user_note || "",
    executed: Boolean(row.executed),
    executionNote: row.execution_note || "",
    outcomeLabel: row.outcome_label || "",
    createdAt: row.created_at,
  };
}

export const tradeReviewRecordsRepo = createEntityRepository({
  table: "trade_review_records",
  toRow: mapTradeReviewRecordToRow,
  fromRow: mapRowToTradeReviewRecord,
  orderBy: { column: "created_at", ascending: false },
});
