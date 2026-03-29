import { createEntityRepository } from "./shared.js";

function mapReviewToRow(item, userId) {
  const row = {
    id: item.id,
    user_id: userId,
    position_id: item.positionId || null,
    position_name: item.positionName || "",
    trade_action: item.tradeAction,
    result_quality: item.resultQuality,
    followed_agent: item.followedAgent,
    review_date: item.reviewDate || null,
    action_review: item.actionReview || "",
    reason: item.reason || "",
    mistake_tags: item.mistakeTags || [],
    lesson: item.lesson || "",
    review_payload: item.reviewPayload || null,
    updated_at: new Date().toISOString(),
  };

  if (item.createdAt) {
    row.created_at = item.createdAt;
  }

  return row;
}

function mapRowToReview(row) {
  return {
    id: row.id,
    positionId: row.position_id,
    positionName: row.position_name || "",
    tradeAction: row.trade_action,
    resultQuality: row.result_quality,
    followedAgent: row.followed_agent,
    reviewDate: row.review_date,
    actionReview: row.action_review || "",
    reason: row.reason || "",
    mistakeTags: Array.isArray(row.mistake_tags) ? row.mistake_tags : [],
    lesson: row.lesson || "",
    reviewPayload: row.review_payload,
    createdAt: row.created_at,
  };
}

export const reviewsRepo = createEntityRepository({
  table: "reviews",
  toRow: mapReviewToRow,
  fromRow: mapRowToReview,
  orderBy: { column: "created_at", ascending: false },
});
