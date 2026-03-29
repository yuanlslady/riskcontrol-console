import { defaultState } from "../constants.js";

function numberOrDefault(value, fallback) {
  return Number(value ?? fallback);
}

function mapMacroFramework(value) {
  return {
    ...defaultState.macroFramework,
    ...(value || {}),
  };
}

function mapIndustryView(value) {
  return {
    id: value?.id || "",
    name: value?.name || "",
    status: value?.status || "observe",
    cycle: value?.cycle || "sideways",
    thesis: value?.thesis || "",
    keySignals: value?.keySignals || "",
    conclusion: value?.conclusion || "",
    risks: value?.risks || "",
    invalidation: value?.invalidation || "",
    reviewDate: value?.reviewDate || "",
    relatedTickers: value?.relatedTickers || "",
    updatedAt: value?.updatedAt || "",
  };
}

export function mapConfigRowToState(row) {
  if (!row) return {};

  return {
    macroFramework: mapMacroFramework(row.macro_framework),
    constitution: {
      goal: row.goal || defaultState.constitution.goal,
      style: row.style || defaultState.constitution.style,
      competence: row.competence || defaultState.constitution.competence,
      bans: row.bans || defaultState.constitution.bans,
      coreMax: numberOrDefault(row.core_max, defaultState.constitution.coreMax),
      probeMax: numberOrDefault(row.probe_max, defaultState.constitution.probeMax),
      themeMax: numberOrDefault(row.theme_max, defaultState.constitution.themeMax),
      lastEditedAt: row.updated_at || defaultState.constitution.lastEditedAt,
    },
    rules: {
      singlePositionWarn: numberOrDefault(row.single_position_warn, defaultState.rules.singlePositionWarn),
      largeReallocation: numberOrDefault(row.large_reallocation, defaultState.rules.largeReallocation),
      allowInstrumentMismatch: Boolean(row.allow_instrument_mismatch ?? defaultState.rules.allowInstrumentMismatch),
      missingTargetWeightAction: row.missing_target_weight_action || defaultState.rules.missingTargetWeightAction,
    },
    industryViews: Array.isArray(row.industry_views) ? row.industry_views.map((item) => mapIndustryView(item)) : [],
  };
}

export function mapStateToConfigRow(state, userId) {
  return {
    user_id: userId,
    macro_framework: mapMacroFramework(state.macroFramework),
    goal: state.constitution.goal,
    style: state.constitution.style,
    competence: state.constitution.competence,
    bans: state.constitution.bans,
    core_max: state.constitution.coreMax,
    probe_max: state.constitution.probeMax,
    theme_max: state.constitution.themeMax,
    single_position_warn: state.rules.singlePositionWarn,
    large_reallocation: state.rules.largeReallocation,
    allow_instrument_mismatch: state.rules.allowInstrumentMismatch,
    missing_target_weight_action: state.rules.missingTargetWeightAction,
    industry_views: Array.isArray(state.industryViews) ? state.industryViews.map((item) => mapIndustryView(item)) : [],
    updated_at: new Date().toISOString(),
  };
}

async function resolveQuery(queryPromise) {
  const result = await queryPromise;
  if (result?.error) throw result.error;
  return result?.data ?? null;
}

export const userConfigRepo = {
  async loadByUser(client, userId) {
    return resolveQuery(client.from("user_config").select("*").eq("user_id", userId).maybeSingle());
  },

  async upsertByUser(client, userId, state) {
    const row = mapStateToConfigRow(state, userId);
    await resolveQuery(client.from("user_config").upsert(row));
    return row;
  },
};
