import { DEMO_STORAGE_KEY, LOCAL_STORAGE_KEY, defaultState } from "./constants.js";
import { createDemoState } from "./demo-state.js";
import { getPortfolioControlUserId, isPublicDemoModeEnabled, isSupabaseEnabled, supabase } from "./supabase.js";
import { behaviorProfilesRepo } from "./repositories/behavior-profiles-repo.js";
import { eventsRepo } from "./repositories/events-repo.js";
import { positionsRepo } from "./repositories/positions-repo.js";
import { reviewsRepo } from "./repositories/reviews-repo.js";
import { thesisSnapshotsRepo } from "./repositories/thesis-snapshots-repo.js";
import { tradeReviewRecordsRepo } from "./repositories/trade-review-records-repo.js";
import { userConfigRepo, mapConfigRowToState } from "./repositories/user-config-repo.js";
import { watchlistRepo } from "./repositories/watchlist-repo.js";

const defaultRepositories = {
  userConfigRepo,
  positionsRepo,
  thesisSnapshotsRepo,
  watchlistRepo,
  reviewsRepo,
  tradeReviewRecordsRepo,
  behaviorProfilesRepo,
  eventsRepo,
};

export function mergeState(raw) {
  return {
    ...defaultState,
    ...raw,
    macroFramework: { ...defaultState.macroFramework, ...(raw?.macroFramework || {}) },
    constitution: { ...defaultState.constitution, ...(raw?.constitution || {}) },
    rules: { ...defaultState.rules, ...(raw?.rules || {}) },
    industryViews: Array.isArray(raw?.industryViews) ? raw.industryViews : [],
    positions: Array.isArray(raw?.positions) ? raw.positions : [],
    thesisSnapshots: Array.isArray(raw?.thesisSnapshots) ? raw.thesisSnapshots : [],
    watchlist: Array.isArray(raw?.watchlist) ? raw.watchlist : [],
    reviews: Array.isArray(raw?.reviews) ? raw.reviews : [],
    tradeReviewRecords: Array.isArray(raw?.tradeReviewRecords) ? raw.tradeReviewRecords : [],
    behaviorProfiles: Array.isArray(raw?.behaviorProfiles) ? raw.behaviorProfiles : [],
    events: Array.isArray(raw?.events) ? raw.events : [],
  };
}

function readStoredState(storage, key, fallbackState) {
  try {
    const raw = storage?.getItem?.(key);
    return raw ? mergeState(JSON.parse(raw)) : mergeState(fallbackState);
  } catch {
    return mergeState(fallbackState);
  }
}

function writeStoredState(storage, key, state) {
  if (!storage?.setItem) return;
  storage.setItem(key, JSON.stringify(state));
}

function readLocalState(storage) {
  return readStoredState(storage, LOCAL_STORAGE_KEY, defaultState);
}

function writeLocalState(storage, state) {
  writeStoredState(storage, LOCAL_STORAGE_KEY, state);
}

function readDemoState(storage, demoStateFactory = createDemoState) {
  const seeded = mergeState(demoStateFactory());
  return readStoredState(storage, DEMO_STORAGE_KEY, seeded);
}

function writeDemoState(storage, state) {
  writeStoredState(storage, DEMO_STORAGE_KEY, state);
}

export function createAppStateGateway(options = {}) {
  const {
    storage = globalThis.localStorage,
    repositories = defaultRepositories,
    client = supabase,
    isSupabaseEnabled: enabled = isSupabaseEnabled,
    isDemoMode = isPublicDemoModeEnabled,
    demoStateFactory = createDemoState,
    userIdFactory = getPortfolioControlUserId,
  } = options;

  async function resolveUserId() {
    return (await userIdFactory?.()) || null;
  }

  function readActiveLocalState() {
    return isDemoMode ? readDemoState(storage, demoStateFactory) : readLocalState(storage);
  }

  function writeActiveLocalState(state) {
    if (isDemoMode) {
      writeDemoState(storage, state);
      return;
    }
    writeLocalState(storage, state);
  }

  async function loadAppState() {
    if (isDemoMode) {
      const state = readDemoState(storage, demoStateFactory);
      writeDemoState(storage, state);
      return { state, source: "demo" };
    }

    const userId = enabled ? await resolveUserId() : null;

    if (enabled && !userId) {
      return {
        state: readLocalState(storage),
        source: "local",
        authRequired: true,
      };
    }

    if (!enabled) {
      return { state: readLocalState(storage), source: "local" };
    }

    try {
      const [
        config,
        positions,
        thesisSnapshots,
        watchlist,
        reviews,
        tradeReviewRecords,
        behaviorProfiles,
        events,
      ] = await Promise.all([
        repositories.userConfigRepo.loadByUser(client, userId),
        repositories.positionsRepo.listByUser(client, userId),
        repositories.thesisSnapshotsRepo.listByUser(client, userId),
        repositories.watchlistRepo.listByUser(client, userId),
        repositories.reviewsRepo.listByUser(client, userId),
        repositories.tradeReviewRecordsRepo.listByUser(client, userId),
        repositories.behaviorProfilesRepo.listByUser(client, userId),
        repositories.eventsRepo.listByUser(client, userId),
      ]);

      const merged = mergeState({
        ...mapConfigRowToState(config),
        positions,
        thesisSnapshots,
        watchlist,
        reviews,
        tradeReviewRecords,
        behaviorProfiles,
        events,
      });

      writeLocalState(storage, merged);
      return { state: merged, source: "supabase" };
    } catch (error) {
      return {
        state: readLocalState(storage),
        source: "local",
        error: {
          message: error?.message || "Unknown Supabase load error",
        },
      };
    }
  }

  async function saveAppState(state) {
    writeActiveLocalState(state);

    if (isDemoMode) {
      return { source: "demo" };
    }

    const userId = enabled ? await resolveUserId() : null;
    if (enabled && !userId) {
      return { source: "local", authRequired: true };
    }

    if (!enabled) {
      return { source: "local" };
    }

    await repositories.userConfigRepo.upsertByUser(client, userId, state);

    await Promise.all([
      repositories.positionsRepo.syncByUser(client, userId, state.positions),
      repositories.thesisSnapshotsRepo.syncByUser(client, userId, state.thesisSnapshots),
      repositories.watchlistRepo.syncByUser(client, userId, state.watchlist),
      repositories.reviewsRepo.syncByUser(client, userId, state.reviews),
      repositories.tradeReviewRecordsRepo.syncByUser(client, userId, state.tradeReviewRecords),
      repositories.behaviorProfilesRepo.syncByUser(client, userId, state.behaviorProfiles),
      repositories.eventsRepo.syncByUser(client, userId, state.events),
    ]);

    return { source: "supabase" };
  }

  async function saveConstitutionState(state) {
    writeActiveLocalState(state);
    if (isDemoMode) return { source: "demo" };
    const userId = enabled ? await resolveUserId() : null;
    if (enabled && !userId) return { source: "local", authRequired: true };
    if (!enabled) return { source: "local" };

    await repositories.userConfigRepo.upsertByUser(client, userId, state);
    return { source: "supabase" };
  }

  async function saveMacroFrameworkState(state) {
    return saveConstitutionState(state);
  }

  async function saveIndustryViewsState(state) {
    return saveConstitutionState(state);
  }

  async function savePositionsState(state) {
    writeActiveLocalState(state);
    if (isDemoMode) return { source: "demo" };
    const userId = enabled ? await resolveUserId() : null;
    if (enabled && !userId) return { source: "local", authRequired: true };
    if (!enabled) return { source: "local" };

    await Promise.all([
      repositories.positionsRepo.syncByUser(client, userId, state.positions),
      repositories.thesisSnapshotsRepo.syncByUser(client, userId, state.thesisSnapshots),
      repositories.eventsRepo.syncByUser(client, userId, state.events),
    ]);
    return { source: "supabase" };
  }

  async function saveWatchlistState(state) {
    writeActiveLocalState(state);
    if (isDemoMode) return { source: "demo" };
    const userId = enabled ? await resolveUserId() : null;
    if (enabled && !userId) return { source: "local", authRequired: true };
    if (!enabled) return { source: "local" };

    await Promise.all([
      repositories.watchlistRepo.syncByUser(client, userId, state.watchlist),
      repositories.eventsRepo.syncByUser(client, userId, state.events),
    ]);
    return { source: "supabase" };
  }

  async function saveReviewState(state) {
    writeActiveLocalState(state);
    if (isDemoMode) return { source: "demo" };
    const userId = enabled ? await resolveUserId() : null;
    if (enabled && !userId) return { source: "local", authRequired: true };
    if (!enabled) return { source: "local" };

    await Promise.all([
      repositories.reviewsRepo.syncByUser(client, userId, state.reviews),
      repositories.tradeReviewRecordsRepo.syncByUser(client, userId, state.tradeReviewRecords),
      repositories.eventsRepo.syncByUser(client, userId, state.events),
    ]);
    return { source: "supabase" };
  }

  async function saveFeedbackState(state) {
    writeActiveLocalState(state);
    if (isDemoMode) return { source: "demo" };
    const userId = enabled ? await resolveUserId() : null;
    if (enabled && !userId) return { source: "local", authRequired: true };
    if (!enabled) return { source: "local" };

    await Promise.all([
      repositories.reviewsRepo.syncByUser(client, userId, state.reviews),
      repositories.tradeReviewRecordsRepo.syncByUser(client, userId, state.tradeReviewRecords),
      repositories.behaviorProfilesRepo.syncByUser(client, userId, state.behaviorProfiles),
      repositories.eventsRepo.syncByUser(client, userId, state.events),
    ]);
    return { source: "supabase" };
  }

  function resetDemoState() {
    const seeded = mergeState(demoStateFactory());
    writeDemoState(storage, seeded);
    return seeded;
  }

  return {
    loadLocalState() {
      return readActiveLocalState();
    },
    saveLocalState(state) {
      writeActiveLocalState(state);
    },
    loadAppState,
    saveAppState,
    saveConstitutionState,
    saveMacroFrameworkState,
    saveIndustryViewsState,
    savePositionsState,
    saveWatchlistState,
    saveReviewState,
    saveFeedbackState,
    resetDemoState,
  };
}

export function loadLocalState() {
  return createAppStateGateway().loadLocalState();
}

export function saveLocalState(state) {
  return createAppStateGateway().saveLocalState(state);
}

export function loadAppState() {
  return createAppStateGateway().loadAppState();
}

export function saveAppState(state) {
  return createAppStateGateway().saveAppState(state);
}

export function saveConstitutionState(state) {
  return createAppStateGateway().saveConstitutionState(state);
}

export function saveMacroFrameworkState(state) {
  return createAppStateGateway().saveMacroFrameworkState(state);
}

export function saveIndustryViewsState(state) {
  return createAppStateGateway().saveIndustryViewsState(state);
}

export function savePositionsState(state) {
  return createAppStateGateway().savePositionsState(state);
}

export function saveWatchlistState(state) {
  return createAppStateGateway().saveWatchlistState(state);
}

export function saveReviewState(state) {
  return createAppStateGateway().saveReviewState(state);
}

export function saveFeedbackState(state) {
  return createAppStateGateway().saveFeedbackState(state);
}

export function resetDemoState() {
  return createAppStateGateway().resetDemoState();
}
