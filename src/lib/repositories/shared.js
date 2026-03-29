const DEFAULT_IGNORED_KEYS = ["created_at", "updated_at"];

function normalizeValue(value, ignoredKeys) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, ignoredKeys));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (ignoredKeys.has(key)) return result;
        result[key] = normalizeValue(value[key], ignoredKeys);
        return result;
      }, {});
  }

  return value;
}

function areRowsEqual(left, right, ignoreKeys = DEFAULT_IGNORED_KEYS) {
  const ignoredKeys = new Set(ignoreKeys);
  return JSON.stringify(normalizeValue(left, ignoredKeys)) === JSON.stringify(normalizeValue(right, ignoredKeys));
}

export function diffRowsById(currentRows = [], nextRows = [], options = {}) {
  const { idKey = "id", ignoreKeys = DEFAULT_IGNORED_KEYS } = options;
  const currentById = new Map(currentRows.map((row) => [row?.[idKey], row]).filter(([id]) => id != null));
  const upserts = [];

  nextRows.forEach((row) => {
    const id = row?.[idKey];
    if (id == null) {
      upserts.push(row);
      return;
    }

    const current = currentById.get(id);
    if (!current || !areRowsEqual(current, row, ignoreKeys)) {
      upserts.push(row);
    }
    currentById.delete(id);
  });

  return {
    upserts,
    deletes: Array.from(currentById.keys()),
  };
}

async function resolveQuery(queryPromise) {
  const result = await queryPromise;
  if (result?.error) throw result.error;
  return result?.data ?? null;
}

export function createEntityRepository(config) {
  const {
    table,
    toRow,
    fromRow,
    orderBy,
    defaultLimit,
    diffOptions,
    removeMissing = true,
  } = config;

  return {
    async listRowsByUser(client, userId, options = {}) {
      const limitValue = Object.prototype.hasOwnProperty.call(options, "limit") ? options.limit : defaultLimit;
      let query = client.from(table).select("*").eq("user_id", userId);

      if (orderBy?.column) {
        query = query.order(orderBy.column, { ascending: orderBy.ascending ?? false });
      }

      if (Number.isInteger(limitValue)) {
        return (await resolveQuery(query.limit(limitValue))) || [];
      }

      return (await resolveQuery(query)) || [];
    },

    async listByUser(client, userId, options = {}) {
      const rows = await this.listRowsByUser(client, userId, options);
      return rows.map((row) => fromRow(row));
    },

    async upsertRows(client, rows) {
      if (!rows.length) return [];
      await resolveQuery(client.from(table).upsert(rows));
      return rows;
    },

    async upsertMany(client, userId, items) {
      const rows = items.map((item) => toRow(item, userId));
      return this.upsertRows(client, rows);
    },

    async removeMany(client, userId, ids) {
      if (!ids.length) return [];
      await resolveQuery(client.from(table).delete().eq("user_id", userId).in("id", ids));
      return ids;
    },

    async syncByUser(client, userId, items, options = {}) {
      const allowDeletes = Object.prototype.hasOwnProperty.call(options, "removeMissing")
        ? Boolean(options.removeMissing)
        : removeMissing;
      const currentRows = await this.listRowsByUser(client, userId, { limit: undefined });
      const nextRows = items.map((item) => toRow(item, userId));
      const { upserts, deletes } = diffRowsById(currentRows, nextRows, diffOptions);

      if (upserts.length) {
        await this.upsertRows(client, upserts);
      }

      if (allowDeletes && deletes.length) {
        await this.removeMany(client, userId, deletes);
      }

      return {
        upserts,
        deletes: allowDeletes ? deletes : [],
      };
    },
  };
}
