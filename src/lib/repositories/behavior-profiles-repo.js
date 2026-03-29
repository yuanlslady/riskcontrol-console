import { createEntityRepository } from "./shared.js";

function mapBehaviorProfileToRow(item, userId) {
  return {
    id: item.id,
    user_id: userId,
    profile_key: item.profileKey,
    profile_name: item.profileName || "",
    profile_summary: item.profileSummary || "",
    signal_count: item.signalCount ?? 0,
    severity: item.severity || "info",
    evidence_list: item.evidenceList || [],
    updated_at: item.updatedAt || new Date().toISOString(),
  };
}

function mapRowToBehaviorProfile(row) {
  return {
    id: row.id,
    profileKey: row.profile_key || "",
    profileName: row.profile_name || "",
    profileSummary: row.profile_summary || "",
    signalCount: Number(row.signal_count ?? 0),
    severity: row.severity || "info",
    evidenceList: Array.isArray(row.evidence_list) ? row.evidence_list : [],
    updatedAt: row.updated_at,
  };
}

export const behaviorProfilesRepo = createEntityRepository({
  table: "behavior_profiles",
  toRow: mapBehaviorProfileToRow,
  fromRow: mapRowToBehaviorProfile,
  orderBy: { column: "updated_at", ascending: false },
});
