import { createEntityRepository } from "./shared.js";

function mapWatchToRow(item, userId) {
  return {
    id: item.id,
    user_id: userId,
    ticker: item.ticker,
    name: item.name,
    market: item.market,
    source: item.source,
    thesis: item.thesis,
    catalyst: item.catalyst,
    added_at: item.addedAt,
    updated_at: new Date().toISOString(),
  };
}

function mapRowToWatch(row) {
  return {
    id: row.id,
    ticker: row.ticker,
    name: row.name || "",
    market: row.market,
    source: row.source,
    thesis: row.thesis || "",
    catalyst: row.catalyst || "",
    addedAt: row.added_at,
  };
}

export const watchlistRepo = createEntityRepository({
  table: "watchlist",
  toRow: mapWatchToRow,
  fromRow: mapRowToWatch,
  orderBy: { column: "added_at", ascending: false },
});
