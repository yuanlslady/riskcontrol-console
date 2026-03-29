export const LOCAL_STORAGE_KEY = "portfolio-control-react-v1";
export const DEMO_STORAGE_KEY = "portfolio-control-demo-v1";
export const WATCH_COOLDOWN_DAYS = 7;

export const defaultState = {
  macroFramework: {
    summary: "",
    marketStance: "balanced",
    liquidityView: "neutral",
    ratesView: "sideways",
    riskAppetite: "neutral",
    policyView: "",
    portfolioPlaybook: "",
    focusAreas: "",
    avoidAreas: "",
    invalidation: "",
    reviewDate: "",
    updatedAt: "",
  },
  constitution: {
    goal: "Reduce major mistakes / 减少重大错误",
    style: "Thesis-driven mid-term positions / 基于逻辑的中期持仓",
    competence: "Know the catalyst, invalidation, and time horizon / 先说清楚逻辑、失效和周期",
    bans: "No new thesis, no invalidation, no revenge trades / 没有逻辑、没有失效条件、禁止情绪交易",
    coreMax: 15,
    probeMax: 5,
    themeMax: 30,
    lastEditedAt: "",
  },
  rules: {
    singlePositionWarn: 15,
    largeReallocation: 5,
    allowInstrumentMismatch: true,
    missingTargetWeightAction: "warn",
  },
  positions: [],
  industryViews: [],
  thesisSnapshots: [],
  watchlist: [],
  reviews: [],
  tradeReviewRecords: [],
  behaviorProfiles: [],
  lastReview: null,
  events: [],
};
