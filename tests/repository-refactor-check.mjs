import assert from "node:assert/strict";
import { createAppStateGateway } from "../src/lib/repository.js";
import { DEMO_STORAGE_KEY } from "../src/lib/constants.js";
import { createEntityRepository, diffRowsById } from "../src/lib/repositories/shared.js";

function createStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
    dump(key) {
      return store.get(key);
    },
  };
}

function createMockClient(initialTables = {}) {
  const tables = Object.fromEntries(
    Object.entries(initialTables).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]),
  );
  const operations = [];

  function selectRows(table, filters, orderBy, limitValue) {
    let rows = (tables[table] || []).map((row) => ({ ...row }));

    rows = rows.filter((row) => filters.every(({ key, value }) => row[key] === value));

    if (orderBy) {
      const { column, ascending } = orderBy;
      rows.sort((left, right) => {
        if (left[column] === right[column]) return 0;
        if (left[column] == null) return ascending ? 1 : -1;
        if (right[column] == null) return ascending ? -1 : 1;
        return left[column] > right[column] ? (ascending ? 1 : -1) : ascending ? -1 : 1;
      });
    }

    return Number.isInteger(limitValue) ? rows.slice(0, limitValue) : rows;
  }

  function mergeRows(table, rows) {
    const current = tables[table] || [];
    const byId = new Map(current.map((row) => [row.id, { ...row }]));
    rows.forEach((row) => {
      byId.set(row.id, { ...(byId.get(row.id) || {}), ...row });
    });
    tables[table] = Array.from(byId.values());
  }

  return {
    operations,
    tables,
    from(table) {
      return {
        select() {
          const filters = [];
          let orderBy = null;
          let limitValue = null;

          const execute = () => Promise.resolve({ data: selectRows(table, filters, orderBy, limitValue), error: null });

          const builder = {
            eq(key, value) {
              filters.push({ key, value });
              return builder;
            },
            order(column, { ascending = true } = {}) {
              orderBy = { column, ascending };
              return builder;
            },
            limit(value) {
              limitValue = value;
              return execute();
            },
            maybeSingle() {
              return execute().then(({ data, error }) => ({ data: data[0] || null, error }));
            },
            then(onFulfilled, onRejected) {
              return execute().then(onFulfilled, onRejected);
            },
          };

          return builder;
        },
        upsert(rows) {
          operations.push({ type: "upsert", table, rows: rows.map((row) => ({ ...row })) });
          mergeRows(table, rows);
          return Promise.resolve({ data: rows, error: null });
        },
        delete() {
          const state = { userId: null };

          return {
            eq(key, value) {
              if (key === "user_id") {
                state.userId = value;
              }
              return this;
            },
            in(key, ids) {
              operations.push({ type: "delete", table, userId: state.userId, ids: [...ids] });
              tables[table] = (tables[table] || []).filter((row) => {
                const sameUser = state.userId == null || row.user_id === state.userId;
                return !(sameUser && key === "id" && ids.includes(row.id));
              });
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };
}

{
  const currentRows = [
    { id: "position-1", user_id: "demo-user", ticker: "0700", market_value: 100, updated_at: "old" },
    { id: "position-2", user_id: "demo-user", ticker: "1810", market_value: 200, updated_at: "old" },
    { id: "position-3", user_id: "demo-user", ticker: "9988", market_value: 300, updated_at: "old" },
  ];

  const nextRows = [
    { id: "position-1", user_id: "demo-user", ticker: "0700", market_value: 100, updated_at: "new" },
    { id: "position-2", user_id: "demo-user", ticker: "1810", market_value: 260, updated_at: "new" },
    { id: "position-4", user_id: "demo-user", ticker: "3690", market_value: 80, updated_at: "new" },
  ];

  const { upserts, deletes } = diffRowsById(currentRows, nextRows);

  assert.deepEqual(
    upserts.map((row) => row.id),
    ["position-2", "position-4"],
  );
  assert.deepEqual(deletes, ["position-3"]);
}

{
  const client = createMockClient({
    positions: [
      { id: "position-1", user_id: "demo-user", ticker: "0700", market_value: 100, updated_at: "old" },
      { id: "position-2", user_id: "demo-user", ticker: "1810", market_value: 200, updated_at: "old" },
      { id: "position-3", user_id: "demo-user", ticker: "9988", market_value: 300, updated_at: "old" },
    ],
  });

  const repo = createEntityRepository({
    table: "positions",
    toRow(item, userId) {
      return {
        id: item.id,
        user_id: userId,
        ticker: item.ticker,
        market_value: item.marketValue,
        updated_at: item.updatedAt,
      };
    },
    fromRow(row) {
      return {
        id: row.id,
        ticker: row.ticker,
        marketValue: row.market_value,
        updatedAt: row.updated_at,
      };
    },
    orderBy: { column: "updated_at", ascending: false },
  });

  await repo.syncByUser(client, "demo-user", [
    { id: "position-1", ticker: "0700", marketValue: 100, updatedAt: "new" },
    { id: "position-2", ticker: "1810", marketValue: 260, updatedAt: "new" },
    { id: "position-4", ticker: "3690", marketValue: 80, updatedAt: "new" },
  ]);

  const upsertOperation = client.operations.find((item) => item.type === "upsert");
  const deleteOperation = client.operations.find((item) => item.type === "delete");

  assert.ok(upsertOperation, "expected an upsert operation");
  assert.deepEqual(
    upsertOperation.rows.map((row) => row.id),
    ["position-2", "position-4"],
  );
  assert.ok(deleteOperation, "expected a delete operation");
  assert.deepEqual(deleteOperation.ids, ["position-3"]);
}

{
  const storage = createStorage();
  const calls = [];
  const repositories = {
    userConfigRepo: {
      async loadByUser() {
        calls.push("userConfigRepo.loadByUser");
        return {
          goal: "Protect capital",
          style: "Thesis driven",
          competence: "Know the edge",
          bans: "No revenge trades",
          core_max: 12,
          probe_max: 4,
          theme_max: 25,
          single_position_warn: 0.12,
          large_reallocation: 0.05,
          allow_instrument_mismatch: false,
          missing_target_weight_action: "block",
          updated_at: "2026-03-27T00:00:00.000Z",
        };
      },
      async upsertByUser(_client, userId, state) {
        calls.push(["userConfigRepo.upsertByUser", userId, state.constitution.goal]);
      },
    },
    positionsRepo: {
      async listByUser() {
        calls.push("positionsRepo.listByUser");
        return [{ id: "position-1", ticker: "0700" }];
      },
      async syncByUser(userId, items) {
        calls.push(["positionsRepo.syncByUser", userId, items.length]);
      },
    },
    thesisSnapshotsRepo: {
      async listByUser() {
        return [{ id: "snapshot-1", positionId: "position-1" }];
      },
      async syncByUser(userId, items) {
        calls.push(["thesisSnapshotsRepo.syncByUser", userId, items.length]);
      },
    },
    watchlistRepo: {
      async listByUser() {
        return [{ id: "watch-1", ticker: "1810" }];
      },
      async syncByUser(userId, items) {
        calls.push(["watchlistRepo.syncByUser", userId, items.length]);
      },
    },
    reviewsRepo: {
      async listByUser() {
        return [{ id: "review-1", lesson: "Stay patient" }];
      },
      async syncByUser(userId, items) {
        calls.push(["reviewsRepo.syncByUser", userId, items.length]);
      },
    },
    tradeReviewRecordsRepo: {
      async listByUser() {
        return [{ id: "record-1", finalAction: "review" }];
      },
      async syncByUser(userId, items) {
        calls.push(["tradeReviewRecordsRepo.syncByUser", userId, items.length]);
      },
    },
    behaviorProfilesRepo: {
      async listByUser() {
        return [{ id: "profile-1", profileKey: "hesitation" }];
      },
      async syncByUser(userId, items) {
        calls.push(["behaviorProfilesRepo.syncByUser", userId, items.length]);
      },
    },
    eventsRepo: {
      async listByUser() {
        return [{ id: "event-1", title: "Loaded" }];
      },
      async syncByUser(userId, items) {
        calls.push(["eventsRepo.syncByUser", userId, items.length]);
      },
    },
  };

  const gateway = createAppStateGateway({
    storage,
    repositories,
    isSupabaseEnabled: true,
    userIdFactory: () => "demo-user",
  });

  const loaded = await gateway.loadAppState();

  assert.equal(loaded.source, "supabase");
  assert.equal(loaded.state.positions.length, 1);
  assert.equal(loaded.state.thesisSnapshots.length, 1);
  assert.equal(loaded.state.tradeReviewRecords.length, 1);
  assert.equal(loaded.state.behaviorProfiles.length, 1);
  assert.equal(loaded.state.constitution.goal, "Protect capital");
  assert.ok(storage.dump("portfolio-control-react-v1"), "expected loadAppState to refresh local cache");

  await gateway.saveAppState(loaded.state);

  assert.ok(calls.includes("userConfigRepo.loadByUser"));
  assert.ok(calls.includes("positionsRepo.listByUser"));
  assert.ok(calls.some((item) => Array.isArray(item) && item[0] === "positionsRepo.syncByUser"));
  assert.ok(calls.some((item) => Array.isArray(item) && item[0] === "eventsRepo.syncByUser"));
}

{
  const storage = createStorage();
  const calls = [];
  const repositories = {
    userConfigRepo: {
      async loadByUser() {
        return null;
      },
      async upsertByUser(_client, userId, state) {
        calls.push(["userConfigRepo.upsertByUser", userId, state.constitution.goal]);
      },
    },
    positionsRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("positionsRepo.syncByUser"); } },
    thesisSnapshotsRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("thesisSnapshotsRepo.syncByUser"); } },
    watchlistRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("watchlistRepo.syncByUser"); } },
    reviewsRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("reviewsRepo.syncByUser"); } },
    tradeReviewRecordsRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("tradeReviewRecordsRepo.syncByUser"); } },
    behaviorProfilesRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("behaviorProfilesRepo.syncByUser"); } },
    eventsRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("eventsRepo.syncByUser"); } },
  };

  const gateway = createAppStateGateway({
    storage,
    repositories,
    isSupabaseEnabled: true,
    userIdFactory: () => "demo-user",
  });

  await gateway.saveConstitutionState({
    ...gateway.loadLocalState(),
    constitution: {
      ...gateway.loadLocalState().constitution,
      goal: "Protect downside first",
    },
  });

  assert.ok(calls.some((item) => Array.isArray(item) && item[0] === "userConfigRepo.upsertByUser"));
  assert.ok(!calls.includes("positionsRepo.syncByUser"));
  assert.ok(!calls.includes("watchlistRepo.syncByUser"));
}

{
  const storage = createStorage();
  const calls = [];
  const repositories = {
    userConfigRepo: { async loadByUser() { return null; }, async upsertByUser() { calls.push("userConfigRepo.upsertByUser"); } },
    positionsRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("positionsRepo.syncByUser"); } },
    thesisSnapshotsRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("thesisSnapshotsRepo.syncByUser"); } },
    watchlistRepo: {
      async listByUser() { return []; },
      async syncByUser(_client, userId, items) { calls.push(["watchlistRepo.syncByUser", userId, items.length]); },
    },
    reviewsRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("reviewsRepo.syncByUser"); } },
    tradeReviewRecordsRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("tradeReviewRecordsRepo.syncByUser"); } },
    behaviorProfilesRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("behaviorProfilesRepo.syncByUser"); } },
    eventsRepo: {
      async listByUser() { return []; },
      async syncByUser(_client, userId, items) { calls.push(["eventsRepo.syncByUser", userId, items.length]); },
    },
  };

  const gateway = createAppStateGateway({
    storage,
    repositories,
    isSupabaseEnabled: true,
    userIdFactory: () => "demo-user",
  });

  await gateway.saveWatchlistState({
    ...gateway.loadLocalState(),
    watchlist: [{ id: "watch-1", ticker: "0700" }],
    events: [{ id: "event-1", title: "Watchlist updated", createdAt: "2026-03-27T00:00:00.000Z" }],
  });

  assert.ok(calls.some((item) => Array.isArray(item) && item[0] === "watchlistRepo.syncByUser"));
  assert.ok(calls.some((item) => Array.isArray(item) && item[0] === "eventsRepo.syncByUser"));
  assert.ok(!calls.includes("positionsRepo.syncByUser"));
  assert.ok(!calls.includes("reviewsRepo.syncByUser"));
}

{
  const storage = createStorage();
  storage.setItem(
    "portfolio-control-react-v1",
    JSON.stringify({
      positions: [{ id: "local-position-1", ticker: "0700" }],
    }),
  );

  const gateway = createAppStateGateway({
    storage,
    repositories: {
      userConfigRepo: {
        async loadByUser() {
          throw new Error("network request failed");
        },
      },
      positionsRepo: { async listByUser() { return []; } },
      thesisSnapshotsRepo: { async listByUser() { return []; } },
      watchlistRepo: { async listByUser() { return []; } },
      reviewsRepo: { async listByUser() { return []; } },
      tradeReviewRecordsRepo: { async listByUser() { return []; } },
      behaviorProfilesRepo: { async listByUser() { return []; } },
      eventsRepo: { async listByUser() { return []; } },
    },
    isSupabaseEnabled: true,
    userIdFactory: () => "demo-user",
  });

  const loaded = await gateway.loadAppState();

  assert.equal(loaded.source, "local");
  assert.equal(loaded.state.positions[0].id, "local-position-1");
  assert.match(loaded.error?.message || "", /network request failed/);
}

{
  const storage = createStorage();
  const calls = [];
  const gateway = createAppStateGateway({
    storage,
    isSupabaseEnabled: true,
    isDemoMode: true,
    demoStateFactory: () => ({
      constitution: { goal: "Demo capital protection" },
      positions: [{ id: "demo-position-1", ticker: "0700" }],
      watchlist: [{ id: "demo-watch-1", ticker: "BABA" }],
      events: [{ id: "demo-event-1", title: "Demo loaded" }],
    }),
    repositories: {
      userConfigRepo: { async loadByUser() { calls.push("userConfigRepo.loadByUser"); return null; } },
      positionsRepo: { async listByUser() { calls.push("positionsRepo.listByUser"); return []; }, async syncByUser() { calls.push("positionsRepo.syncByUser"); } },
      thesisSnapshotsRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("thesisSnapshotsRepo.syncByUser"); } },
      watchlistRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("watchlistRepo.syncByUser"); } },
      reviewsRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("reviewsRepo.syncByUser"); } },
      tradeReviewRecordsRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("tradeReviewRecordsRepo.syncByUser"); } },
      behaviorProfilesRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("behaviorProfilesRepo.syncByUser"); } },
      eventsRepo: { async listByUser() { return []; }, async syncByUser() { calls.push("eventsRepo.syncByUser"); } },
    },
  });

  const loaded = await gateway.loadAppState();
  assert.equal(loaded.source, "demo");
  assert.equal(loaded.state.positions[0].id, "demo-position-1");
  assert.equal(calls.length, 0, "demo mode should not query Supabase repositories");

  await gateway.saveWatchlistState({
    ...loaded.state,
    watchlist: [...loaded.state.watchlist, { id: "demo-watch-2", ticker: "TSLA" }],
  });

  const stored = JSON.parse(storage.dump(DEMO_STORAGE_KEY));
  assert.equal(stored.watchlist.length, 2);
  assert.equal(calls.length, 0, "demo mode should not sync repositories on save");
}

{
  const storage = createStorage();
  const calls = [];
  const gateway = createAppStateGateway({
    storage,
    isSupabaseEnabled: true,
    userIdFactory: async () => null,
    repositories: {
      userConfigRepo: { async loadByUser() { calls.push("userConfigRepo.loadByUser"); return null; }, async upsertByUser() { calls.push("userConfigRepo.upsertByUser"); } },
      positionsRepo: { async listByUser() { calls.push("positionsRepo.listByUser"); return []; }, async syncByUser() { calls.push("positionsRepo.syncByUser"); } },
      thesisSnapshotsRepo: { async listByUser() { calls.push("thesisSnapshotsRepo.listByUser"); return []; }, async syncByUser() { calls.push("thesisSnapshotsRepo.syncByUser"); } },
      watchlistRepo: { async listByUser() { calls.push("watchlistRepo.listByUser"); return []; }, async syncByUser() { calls.push("watchlistRepo.syncByUser"); } },
      reviewsRepo: { async listByUser() { calls.push("reviewsRepo.listByUser"); return []; }, async syncByUser() { calls.push("reviewsRepo.syncByUser"); } },
      tradeReviewRecordsRepo: { async listByUser() { calls.push("tradeReviewRecordsRepo.listByUser"); return []; }, async syncByUser() { calls.push("tradeReviewRecordsRepo.syncByUser"); } },
      behaviorProfilesRepo: { async listByUser() { calls.push("behaviorProfilesRepo.listByUser"); return []; }, async syncByUser() { calls.push("behaviorProfilesRepo.syncByUser"); } },
      eventsRepo: { async listByUser() { calls.push("eventsRepo.listByUser"); return []; }, async syncByUser() { calls.push("eventsRepo.syncByUser"); } },
    },
  });

  const loaded = await gateway.loadAppState();
  assert.equal(loaded.source, "local");
  assert.equal(loaded.authRequired, true);
  assert.equal(calls.length, 0, "signed-out mode should not hit Supabase repositories");

  const saved = await gateway.savePositionsState({
    ...gateway.loadLocalState(),
    positions: [{ id: "local-only-position", ticker: "AAPL" }],
  });
  assert.equal(saved.source, "local");
  assert.equal(saved.authRequired, true);
  assert.equal(calls.length, 0, "signed-out save should stay local only");
}

console.log("repository refactor check passed");
