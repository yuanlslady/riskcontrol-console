import { createEntityRepository } from "./shared.js";

function mapEventToRow(item, userId) {
  const row = {
    id: item.id,
    user_id: userId,
    title: item.title,
    detail: item.detail,
    severity: item.severity,
    updated_at: new Date().toISOString(),
  };

  if (item.createdAt) {
    row.created_at = item.createdAt;
  }

  return row;
}

function mapRowToEvent(row) {
  return {
    id: row.id,
    title: row.title,
    detail: row.detail || "",
    severity: row.severity,
    createdAt: row.created_at,
  };
}

export const eventsRepo = createEntityRepository({
  table: "events",
  toRow: mapEventToRow,
  fromRow: mapRowToEvent,
  orderBy: { column: "created_at", ascending: false },
  defaultLimit: 12,
  removeMissing: false,
});
