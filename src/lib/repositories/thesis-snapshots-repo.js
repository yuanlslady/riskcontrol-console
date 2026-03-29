import { createEntityRepository } from "./shared.js";

function mapThesisSnapshotToRow(item, userId) {
  const row = {
    id: item.id,
    user_id: userId,
    position_id: item.positionId || null,
    ticker: item.ticker || null,
    title: item.title || "",
    thesis_summary: item.thesisSummary || "",
    catalyst_summary: item.catalystSummary || "",
    invalidation_summary: item.invalidationSummary || "",
    horizon_label: item.horizonLabel || null,
    evidence_list: item.evidenceList || [],
    notes: item.notes || "",
    snapshot_date: item.snapshotDate || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (item.createdAt) {
    row.created_at = item.createdAt;
  }

  return row;
}

function mapRowToThesisSnapshot(row) {
  return {
    id: row.id,
    positionId: row.position_id,
    ticker: row.ticker || "",
    title: row.title || "",
    thesisSummary: row.thesis_summary || "",
    catalystSummary: row.catalyst_summary || "",
    invalidationSummary: row.invalidation_summary || "",
    horizonLabel: row.horizon_label || "",
    evidenceList: Array.isArray(row.evidence_list) ? row.evidence_list : [],
    notes: row.notes || "",
    snapshotDate: row.snapshot_date,
    createdAt: row.created_at,
  };
}

export const thesisSnapshotsRepo = createEntityRepository({
  table: "thesis_snapshots",
  toRow: mapThesisSnapshotToRow,
  fromRow: mapRowToThesisSnapshot,
  orderBy: { column: "snapshot_date", ascending: false },
});
