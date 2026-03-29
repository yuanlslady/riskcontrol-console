import { useEffect, useMemo, useState } from "react";
import { buildAutomationDigest } from "./lib/automation";
import { evaluateTopdownReview } from "./lib/topdown-review";
import {
  generatePostTradeReflection,
  generatePreTradeAssessment,
  importBrokerPositionsFromImage,
  isAgentApiEnabled,
  isVisionImportEnabled,
} from "./lib/agents";
import { defaultState, WATCH_COOLDOWN_DAYS } from "./lib/constants";
import {
  loadAppState,
  resetDemoState,
  saveConstitutionState,
  saveFeedbackState,
  saveIndustryViewsState,
  saveLocalState,
  saveMacroFrameworkState,
  savePositionsState,
  saveReviewState,
  saveWatchlistState,
} from "./lib/repository";
import { recalculateImportedDraftWeights, updateImportedDraft } from "./lib/importers";
import { evaluateTradeReview } from "./lib/rule-engine";
import {
  convertToBaseCurrency,
  DEFAULT_FX_RATES,
  filterPositions,
  formatReviewDate,
  getMarketCurrency,
  REVIEW_ACTION_LABELS,
  REVIEW_FIELD_PLACEHOLDERS,
  REVIEW_TAG_OPTIONS,
} from "./lib/presentation";
import {
  getSupabaseUser,
  isPublicDemoModeEnabled,
  isSupabaseEnabled,
  requestPasswordReset,
  signInWithPassword,
  signOutSupabaseUser,
  signUpWithPassword,
  subscribeToSupabaseAuth,
} from "./lib/supabase";
import { APP_INTRO_COPY } from "./lib/dashboard-copy";

const NAV = [
  ["intro", "Guide / 控制台说明"],
  ["positions-rationale", "Portfolio Overview / 持仓概览"],
  ["macro-framework", "Macro Framework / 宏观框架"],
  ["industry-map", "Industry Map / 产业地图"],
  ["review-gate", "Trade Review / 交易审查"],
  ["feedback", "Attribution Analysis / 复盘归因"],
];

const POSITION_DEFAULT = {
  ticker: "",
  name: "",
  market: "HK",
  theme: "",
  industryViewId: "",
  instrumentType: "single_stock",
  positionType: "core_midterm",
  inCompetenceCircle: true,
  shareCount: "",
  marketValue: "",
  lastPrice: "",
  avgCost: "",
  portfolioWeight: "",
  maxWeightAllowed: "",
  thesisHorizonLabel: "midterm",
  entryReasonSummary: "",
  exitInvalidatorsSummary: "",
};

const WATCH_DEFAULT = { ticker: "", name: "", market: "HK", source: "manual", thesis: "", catalyst: "" };
const REVIEW_DEFAULT = {
  positionId: "__new__",
  industryViewId: "",
  newTicker: "",
  newName: "",
  tradeAction: "buy",
  targetPositionType: "core_midterm",
  targetWeightAfterTrade: "",
  emotionRisk: "medium",
  thesisStatus: "active",
  triggerType: "manual",
  plannedHoldingDays: "",
  reviewDueAt: "",
  sameThemeWeight: "",
  cooldownUntil: "",
  referencePrice: "",
  whyNow: "",
  thesisReference: "",
  whatChanged: "",
  wrongIf: "",
  holdingPlanAfterTrade: "",
  alternativeAction: "",
};
const MEMORY_DEFAULT = { reviewDate: "", actionReview: "", reason: "", mistakeTags: [], lesson: "" };
const INDUSTRY_DEFAULT = {
  name: "",
  status: "observe",
  cycle: "sideways",
  thesis: "",
  keySignals: "",
  conclusion: "",
  risks: "",
  invalidation: "",
  reviewDate: "",
  relatedTickers: "",
};
const BEHAVIOR_PROFILE_LABELS = {
  not_on_watchlist: "未观察即交易",
  missing_thesis: "缺少 thesis",
  missing_invalidator: "失效条件缺失",
  non_competence_trade: "非能力圈交易",
  panic_sell_risk: "情绪化卖出",
  emotion_driven: "情绪驱动交易",
  chasing_risk: "追高风险",
  no_new_information: "缺少新增事实",
  large_reallocation: "大幅调仓",
  weakened_thesis: "thesis 弱化",
  overweight_position: "仓位超限",
  theme_concentration: "主题过度集中",
  realized_thesis: "thesis 已兑现",
  plan_drift: "计划漂移",
  instrument_horizon_mismatch: "工具与时间窗错配",
  invalidated_thesis: "thesis 被证伪",
  review_overdue: "复核已逾期",
  probe_to_long_hold_drift: "试错仓漂移",
  cooldown_active: "冷静期内交易",
};

const uid = () => globalThis.crypto?.randomUUID?.() || `id_${Math.random().toString(36).slice(2)}`;
const n = (v) => Number(String(v ?? "").replace(/[,%$\s]/g, "")) || 0;
const fmt = (v) => (v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-");
const pct = (v) => `${((Number(v) || 0) * 100).toFixed(1)}%`;
const pnl = (p) => (!p.avgCost || !p.lastPrice ? 0 : ((Number(p.lastPrice) - Number(p.avgCost)) / Number(p.avgCost)) * 100);
const toWeight = (v) => {
  const numeric = n(v);
  return numeric > 1 ? numeric / 100 : numeric;
};
const reviewDateLabel = (value) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-US") : "未设定");
const isReviewDue = (value) => Boolean(value) && new Date(`${value}T23:59:59`).getTime() <= Date.now();
const MACRO_STANCE_LABELS = {
  offensive: "进攻",
  balanced: "均衡",
  defensive: "防守",
};
const MACRO_VIEW_LABELS = {
  loose: "宽松",
  neutral: "中性",
  tight: "收紧",
  down: "下行",
  sideways: "震荡",
  up: "上行",
  improving: "回升",
  weakening: "走弱",
};
const INDUSTRY_STATUS_LABELS = {
  tailwind: "顺风",
  observe: "观察",
  headwind: "逆风",
  inflection: "拐点验证",
};
const INDUSTRY_CYCLE_LABELS = {
  upcycle: "上行",
  sideways: "震荡",
  downcycle: "下行",
  stabilizing: "修复中",
};
const REVIEW_STATUS_BADGE_CLASS = {
  aligned: "safe",
  complete: "safe",
  conflict: "warning",
  incomplete: "warning",
  missing: "info",
};

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

async function normalizeImageForVisionImport(file) {
  const sourceDataUrl = await readFileAsDataUrl(file);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const maxDimension = 2560;
      const minShortEdge = 1080;
      const maxUpscale = 1.6;
      const maxAnalysisBytes = 1_800_000;
      const longestEdge = Math.max(image.width || 1, image.height || 1);
      const shortestEdge = Math.min(image.width || 1, image.height || 1);
      const downscale = Math.min(1, maxDimension / longestEdge);
      const upscale = Math.min(maxUpscale, Math.max(1, minShortEdge / shortestEdge));
      const scale = longestEdge > maxDimension ? downscale : upscale;
      const width = Math.max(1, Math.round((image.width || 1) * scale));
      const height = Math.max(1, Math.round((image.height || 1) * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Failed to prepare image for OCR."));
        return;
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, width, height);
      const previewDataUrl = canvas.toDataURL("image/png");
      const aspectRatio = width / Math.max(height, 1);
      const tileSpecs = [{ startX: 0, width, height }];

      if (aspectRatio >= 2.4) {
        const tileWidth = Math.min(width, Math.round(height * 2.1));
        const overlap = Math.round(tileWidth * 0.14);
        const step = Math.max(1, tileWidth - overlap);
        const startXs = [];

        for (let startX = 0; startX < width; startX += step) {
          startXs.push(startX);
          if (startX + tileWidth >= width) break;
        }

        const normalizedStarts = Array.from(
          new Set(startXs.map((startX) => Math.max(0, Math.min(startX, width - tileWidth)))),
        );

        if (normalizedStarts.length > 1) {
          tileSpecs.length = 0;
          normalizedStarts.forEach((startX) => {
            tileSpecs.push({ startX, width: Math.min(tileWidth, width), height });
          });
        }
      }

      const estimateDataUrlBytes = (dataUrl) => {
        const encoded = String(dataUrl || "").split(",")[1] || "";
        return Math.ceil((encoded.length * 3) / 4);
      };

      const renderAnalysisTiles = (scaleFactor, quality) =>
        tileSpecs.map((tile) => {
          const tileCanvas = document.createElement("canvas");
          tileCanvas.width = Math.max(1, Math.round(tile.width * scaleFactor));
          tileCanvas.height = Math.max(1, Math.round(tile.height * scaleFactor));
          const tileContext = tileCanvas.getContext("2d");

          if (!tileContext) {
            throw new Error("Failed to prepare image tile for OCR.");
          }

          tileContext.imageSmoothingEnabled = true;
          tileContext.imageSmoothingQuality = "high";
          tileContext.drawImage(
            canvas,
            tile.startX,
            0,
            tile.width,
            tile.height,
            0,
            0,
            tileCanvas.width,
            tileCanvas.height,
          );
          return tileCanvas.toDataURL("image/jpeg", quality);
        });

      let analysisScale = 1;
      let analysisQuality = 0.9;
      let analysisImageDataUrls = renderAnalysisTiles(analysisScale, analysisQuality);

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const totalBytes = analysisImageDataUrls.reduce((sum, dataUrl) => sum + estimateDataUrlBytes(dataUrl), 0);
        if (totalBytes <= maxAnalysisBytes) break;

        const shrinkRatio = Math.max(0.72, Math.min(0.9, Math.sqrt(maxAnalysisBytes / totalBytes) * 0.98));
        analysisScale *= shrinkRatio;
        analysisQuality = Math.max(0.68, analysisQuality - 0.08);
        analysisImageDataUrls = renderAnalysisTiles(analysisScale, analysisQuality);
      }

      const finalBytes = analysisImageDataUrls.reduce((sum, dataUrl) => sum + estimateDataUrlBytes(dataUrl), 0);
      if (finalBytes > maxAnalysisBytes * 1.15) {
        reject(new Error("Screenshot is still too large to send. Crop tighter around the holdings table, then try again."));
        return;
      }

      resolve({ previewDataUrl, analysisImageDataUrls });
    };
    image.onerror = () => reject(new Error("The uploaded image could not be decoded. Please try another screenshot."));
    image.src = sourceDataUrl;
  });
}

function buildThesisSnapshot(position) {
  const hasRationale = position.entryReasonSummary || position.exitInvalidatorsSummary;
  if (!hasRationale) return null;
  return {
    id: uid(),
    positionId: position.id,
    ticker: position.ticker,
    title: `${position.ticker} thesis snapshot`,
    thesisSummary: position.entryReasonSummary || "",
    catalystSummary: "",
    invalidationSummary: position.exitInvalidatorsSummary || "",
    horizonLabel: position.thesisHorizonLabel || "midterm",
    evidenceList: [],
    notes: "",
    snapshotDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

function mergeBehaviorProfiles(currentProfiles, riskFlags) {
  const nextProfiles = [...currentProfiles];
  riskFlags.forEach((flag) => {
    const existingIndex = nextProfiles.findIndex((item) => item.profileKey === flag);
    if (existingIndex >= 0) {
      nextProfiles[existingIndex] = {
        ...nextProfiles[existingIndex],
        signalCount: Number(nextProfiles[existingIndex].signalCount || 0) + 1,
        severity: nextProfiles[existingIndex].severity === "high" ? "high" : riskFlags.length >= 3 ? "high" : "medium",
        updatedAt: new Date().toISOString(),
      };
      return;
    }
    nextProfiles.unshift({
      id: uid(),
      profileKey: flag,
      profileName: BEHAVIOR_PROFILE_LABELS[flag] || flag,
      profileSummary: `最近的复盘中多次出现“${BEHAVIOR_PROFILE_LABELS[flag] || flag}”倾向，需要持续压制坏过程。`,
      signalCount: 1,
      severity: riskFlags.length >= 3 ? "high" : "medium",
      evidenceList: [],
      updatedAt: new Date().toISOString(),
    });
  });
  return nextProfiles;
}

function applyImportedWeightsByFx(drafts, totalAmount, totalCurrency) {
  const totalBase = convertToBaseCurrency(totalAmount, totalCurrency, "HKD", DEFAULT_FX_RATES);
  if (!totalBase) return drafts;
  return drafts.map((draft) => {
    const draftCurrency = getMarketCurrency(draft.market || "HK");
    const marketValueBase = convertToBaseCurrency(draft.marketValue, draftCurrency, "HKD", DEFAULT_FX_RATES);
    return {
      ...draft,
      portfolioWeight: marketValueBase > 0 ? marketValueBase / totalBase : draft.portfolioWeight,
    };
  });
}

function Header({ eyebrow, title, copy }) {
  return (
    <div className="panel-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <p className="panel-copy">{copy}</p>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(defaultState);
  const [dataSource, setDataSource] = useState("local");
  const [loaded, setLoaded] = useState(false);
  const [authReady, setAuthReady] = useState(!isSupabaseEnabled || isPublicDemoModeEnabled);
  const [authUser, setAuthUser] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [tab, setTab] = useState("intro");
  const [saveText, setSaveText] = useState("Loading...");
  const [constitutionEditing, setConstitutionEditing] = useState(false);
  const [positionForm, setPositionForm] = useState(POSITION_DEFAULT);
  const [watchForm, setWatchForm] = useState(WATCH_DEFAULT);
  const [reviewForm, setReviewForm] = useState(REVIEW_DEFAULT);
  const [reviewAdvancedOpen, setReviewAdvancedOpen] = useState(false);
  const [memoryForm, setMemoryForm] = useState(MEMORY_DEFAULT);
  const [industryForm, setIndustryForm] = useState(INDUSTRY_DEFAULT);
  const [agentStatus, setAgentStatus] = useState("idle");
  const [reflectionStatus, setReflectionStatus] = useState("idle");
  const [importStatus, setImportStatus] = useState("idle");
  const [importMessage, setImportMessage] = useState("");
  const [importPreview, setImportPreview] = useState("");
  const [importAnalysisImages, setImportAnalysisImages] = useState([]);
  const [importDrafts, setImportDrafts] = useState([]);
  const [importTotalAmount, setImportTotalAmount] = useState("");
  const [importTotalCurrency, setImportTotalCurrency] = useState("HKD");
  const [positionSort, setPositionSort] = useState("value_desc");
  const [marketFilter, setMarketFilter] = useState("all");
  const [themeFilter, setThemeFilter] = useState("all");

  useEffect(() => {
    if (!isSupabaseEnabled || isPublicDemoModeEnabled) return undefined;
    let active = true;

    getSupabaseUser()
      .then((user) => {
        if (!active) return;
        setAuthUser(user);
        setAuthReady(true);
      })
      .catch((error) => {
        if (!active) return;
        setAuthReady(true);
        setAuthStatus(`Auth failed / 认证失败: ${error?.message || "unknown error"}`);
      });

    const unsubscribe = subscribeToSupabaseAuth((user) => {
      if (!active) return;
      setAuthUser(user);
      setAuthReady(true);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady) return undefined;
    let active = true;
    setLoaded(false);
    loadAppState()
      .then(({ state: nextState, source, error, authRequired }) => {
        if (!active) return;
        setState(nextState);
        setDataSource(source);
        setSaveText(
          error?.message
            ? `Supabase failed: ${error.message}`
            : authRequired
              ? "Cloud sync requires sign-in / 登录后可同步到云端"
              : `Loaded from ${source}.`,
        );
        setLoaded(true);
      })
      .catch((error) => {
        if (!active) return;
        setLoaded(true);
        setSaveText(`Load failed: ${error?.message || "unknown error"}`);
      });
    return () => {
      active = false;
    };
  }, [authReady, authUser?.id]);

  const automation = useMemo(() => buildAutomationDigest(state), [state]);
  const sortedPositions = useMemo(() => {
    const next = [...filterPositions(state.positions, { market: marketFilter, theme: themeFilter })];
    if (positionSort === "value_desc") {
      next.sort((a, b) => Number(b.marketValue || 0) - Number(a.marketValue || 0));
    } else if (positionSort === "cost_desc") {
      next.sort((a, b) => Number(b.avgCost || 0) - Number(a.avgCost || 0));
    }
    return next;
  }, [marketFilter, positionSort, state.positions, themeFilter]);
  const portfolioCashRatio = useMemo(() => {
    const baseAmount = convertToBaseCurrency(importTotalAmount, importTotalCurrency, "HKD", DEFAULT_FX_RATES);
    if (!baseAmount) return 0;
    const positionsValue = state.positions.reduce((sum, item) => {
      const currency = getMarketCurrency(item.market);
      return sum + convertToBaseCurrency(item.marketValue, currency, "HKD", DEFAULT_FX_RATES);
    }, 0);
    return Math.max(0, (baseAmount - positionsValue) / baseAmount);
  }, [importTotalAmount, importTotalCurrency, state.positions]);
  const activePosition = state.positions.find((item) => item.id === reviewForm.positionId);
  const industryReviewDueCount = useMemo(
    () => state.industryViews.filter((item) => isReviewDue(item.reviewDate)).length,
    [state.industryViews],
  );
  const macroReviewDue = isReviewDue(state.macroFramework.reviewDate);
  const latestTradeReviewRecord = state.tradeReviewRecords?.[0] || null;
  const reviewPosition =
    reviewForm.positionId === "__new__"
      ? {
          id: "__new__",
          ticker: reviewForm.newTicker.trim().toUpperCase(),
          name: reviewForm.newName.trim(),
          industryViewId: reviewForm.industryViewId,
          entryReasonSummary: "",
          exitInvalidatorsSummary: "",
          maxWeightAllowed: n(reviewForm.targetWeightAfterTrade) || state.rules.singlePositionWarn,
          positionType: reviewForm.targetPositionType,
        }
      : activePosition || null;
  const selectedIndustryView =
    state.industryViews.find(
      (item) => item.id === (reviewForm.positionId === "__new__" ? reviewForm.industryViewId : reviewPosition?.industryViewId),
    ) || null;
  const topdownPreview = reviewPosition
    ? evaluateTopdownReview({
        macroFramework: state.macroFramework,
        industryView: selectedIndustryView,
        position: reviewPosition,
        reviewForm,
      })
    : null;
  const lastReview = state.lastReview;
  const dataSourceLabel =
    dataSource === "supabase" ? "Supabase" : dataSource === "demo" ? "Demo" : authUser ? "Local" : "Local (Signed-out) / 本地（未登录）";
  const canUseVisionImport = isVisionImportEnabled && Boolean(authUser);

  async function persist(nextState, saveFn, message) {
    setState(nextState);
    if (message) setSaveText(message);
    const result = await saveFn(nextState);
    setDataSource(result.source);
    if (result.authRequired) {
      setSaveText("Saved locally only / 当前仅保存到本地，登录后可同步云端");
    }
  }

  function persistLocal(nextState, message) {
    setState(nextState);
    if (message) setSaveText(message);
    saveLocalState(nextState);
  }

  function restoreDemoState() {
    const nextState = resetDemoState();
    setState(nextState);
    setDataSource("demo");
    setSaveText("Demo data reset / 演示数据已重置");
    setPositionForm(POSITION_DEFAULT);
    setWatchForm(WATCH_DEFAULT);
    setReviewForm(REVIEW_DEFAULT);
    setMemoryForm(MEMORY_DEFAULT);
  }

  function validateAuthForm() {
    if (!authEmail.trim()) {
      setAuthStatus("Email is required / 请输入邮箱");
      return false;
    }
    if (!authPassword.trim()) {
      setAuthStatus("Password is required / 请输入密码");
      return false;
    }
    if (authPassword.trim().length < 8) {
      setAuthStatus("Password must be at least 8 characters / 密码至少 8 位");
      return false;
    }
    return true;
  }

  function validateAuthEmail() {
    if (!authEmail.trim()) {
      setAuthStatus("Email is required / 请输入邮箱");
      return false;
    }
    return true;
  }

  async function handlePasswordSignIn(event) {
    event.preventDefault();
    if (!validateAuthForm()) return;
    setAuthBusy(true);
    setAuthStatus("");
    try {
      await signInWithPassword({ email: authEmail.trim(), password: authPassword });
      setAuthStatus("Signed in / 已登录");
    } catch (error) {
      setAuthStatus(`Sign-in failed / 登录失败: ${error?.message || "unknown error"}`);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handlePasswordSignUp(event) {
    event.preventDefault();
    if (!validateAuthForm()) return;
    setAuthBusy(true);
    setAuthStatus("");
    try {
      const result = await signUpWithPassword({ email: authEmail.trim(), password: authPassword });
      if (result?.user && !result?.session) {
        setAuthStatus("Sign-up successful. Please confirm your email before signing in / 注册成功，请先去邮箱确认，再登录");
      } else {
        setAuthStatus("Sign-up successful / 注册成功");
      }
    } catch (error) {
      setAuthStatus(`Sign-up failed / 注册失败: ${error?.message || "unknown error"}`);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handlePasswordReset() {
    if (!validateAuthEmail()) return;
    setAuthBusy(true);
    setAuthStatus("");
    try {
      await requestPasswordReset({ email: authEmail.trim() });
      setAuthStatus("Password reset email sent / 重置密码邮件已发送，请检查邮箱");
    } catch (error) {
      setAuthStatus(`Reset failed / 重置失败: ${error?.message || "unknown error"}`);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    setAuthBusy(true);
    try {
      saveLocalState(defaultState);
      setState(defaultState);
      await signOutSupabaseUser();
      setAuthStatus("Signed out / 已退出登录");
    } catch (error) {
      setAuthStatus(`Sign-out failed / 退出失败: ${error?.message || "unknown error"}`);
    } finally {
      setAuthBusy(false);
    }
  }

  function patchConstitution(field, value) {
    setState((current) => ({
      ...current,
      constitution: {
        ...current.constitution,
        [field]: value,
      },
    }));
  }

  async function saveConstitutionSettings() {
    const nextState = {
      ...state,
      constitution: {
        ...state.constitution,
        lastEditedAt: new Date().toISOString(),
      },
    };
    await persist(nextState, saveConstitutionState, "Constitution saved / 宪法参数已保存");
    setConstitutionEditing(false);
  }

  function patchMacroFramework(field, value) {
    setState((current) => ({
      ...current,
      macroFramework: {
        ...current.macroFramework,
        [field]: value,
      },
    }));
  }

  async function saveMacroFrameworkSettings() {
    const nextState = {
      ...state,
      macroFramework: {
        ...state.macroFramework,
        updatedAt: new Date().toISOString(),
      },
    };
    await persist(nextState, saveMacroFrameworkState, "Macro framework saved / 宏观框架已保存");
  }

  function patchPositionField(positionId, field, value) {
    setState((current) => ({
      ...current,
      positions: current.positions.map((item) => (item.id === positionId ? { ...item, [field]: value } : item)),
    }));
  }

  async function savePositionTable() {
    await persist({ ...state }, savePositionsState, "Position table saved / 持仓表已保存");
  }

  async function removePosition(positionId) {
    const nextState = {
      ...state,
      positions: state.positions.filter((item) => item.id !== positionId),
      thesisSnapshots: state.thesisSnapshots.filter((item) => item.positionId !== positionId),
    };
    await persist(nextState, savePositionsState, "Position deleted / 持仓已删除");
  }

  function toggleMemoryTag(tag) {
    setMemoryForm((current) => ({
      ...current,
      mistakeTags: current.mistakeTags.includes(tag) ? current.mistakeTags.filter((item) => item !== tag) : [...current.mistakeTags, tag],
    }));
  }

  function pushEvent(nextState, title, detail, severity = "info") {
    nextState.events = [{ id: uid(), title, detail, severity, createdAt: new Date().toISOString() }, ...nextState.events].slice(0, 12);
  }
  async function submitPosition(event) {
    event.preventDefault();
    const newPosition = {
      id: uid(),
      ticker: positionForm.ticker.trim().toUpperCase(),
      name: positionForm.name.trim(),
      market: positionForm.market,
      theme: positionForm.theme.trim(),
      industryViewId: positionForm.industryViewId,
      instrumentType: positionForm.instrumentType,
      positionType: positionForm.positionType,
      inCompetenceCircle: Boolean(positionForm.inCompetenceCircle),
      shareCount: n(positionForm.shareCount),
      marketValue: n(positionForm.marketValue),
      lastPrice: n(positionForm.lastPrice),
      avgCost: n(positionForm.avgCost),
      portfolioWeight: toWeight(positionForm.portfolioWeight),
      maxWeightAllowed: toWeight(positionForm.maxWeightAllowed),
      thesisHorizonLabel: positionForm.thesisHorizonLabel,
      entryReasonSummary: positionForm.entryReasonSummary.trim(),
      exitInvalidatorsSummary: positionForm.exitInvalidatorsSummary.trim(),
    };
    const thesisSnapshot = buildThesisSnapshot(newPosition);
    const nextState = {
      ...state,
      positions: [newPosition, ...state.positions],
      thesisSnapshots: thesisSnapshot ? [thesisSnapshot, ...state.thesisSnapshots] : state.thesisSnapshots,
    };
    pushEvent(nextState, "Position saved", `${positionForm.ticker || "New position"} added.`);
    await persist(nextState, savePositionsState, "Position saved / 持仓已保存");
    setPositionForm(POSITION_DEFAULT);
  }

  async function submitWatch(event) {
    event.preventDefault();
    const nextState = {
      ...state,
      watchlist: [
        {
          id: uid(),
          ticker: watchForm.ticker.trim().toUpperCase(),
          name: watchForm.name.trim(),
          market: watchForm.market,
          source: watchForm.source,
          thesis: watchForm.thesis.trim(),
          catalyst: watchForm.catalyst.trim(),
          addedAt: new Date().toISOString(),
        },
        ...state.watchlist,
      ],
    };
    pushEvent(nextState, "Watchlist updated", `${watchForm.ticker || "New watch"} added.`);
    await persist(nextState, saveWatchlistState, "Watchlist saved / 观察池已保存");
    setWatchForm(WATCH_DEFAULT);
  }

  async function submitIndustryView(event) {
    event.preventDefault();
    if (!industryForm.name.trim()) return;

    const nextState = {
      ...state,
      industryViews: [
        {
          id: uid(),
          name: industryForm.name.trim(),
          status: industryForm.status,
          cycle: industryForm.cycle,
          thesis: industryForm.thesis.trim(),
          keySignals: industryForm.keySignals.trim(),
          conclusion: industryForm.conclusion.trim(),
          risks: industryForm.risks.trim(),
          invalidation: industryForm.invalidation.trim(),
          reviewDate: industryForm.reviewDate,
          relatedTickers: industryForm.relatedTickers.trim(),
          updatedAt: new Date().toISOString(),
        },
        ...state.industryViews,
      ],
    };
    pushEvent(nextState, "Industry map updated", `${industryForm.name.trim()} added to the industry map.`);
    await persist(nextState, saveIndustryViewsState, "Industry map saved / 产业地图已保存");
    setIndustryForm(INDUSTRY_DEFAULT);
  }

  function patchIndustryViewField(industryId, field, value) {
    setState((current) => ({
      ...current,
      industryViews: current.industryViews.map((item) => (item.id === industryId ? { ...item, [field]: value } : item)),
    }));
  }

  async function saveIndustryViewsTable() {
    const updatedAt = new Date().toISOString();
    const nextState = {
      ...state,
      industryViews: state.industryViews.map((item) => ({
        ...item,
        updatedAt,
      })),
    };
    await persist(nextState, saveIndustryViewsState, "Industry map saved / 产业地图已保存");
  }

  async function removeIndustryView(industryId) {
    const nextState = {
      ...state,
      industryViews: state.industryViews.filter((item) => item.id !== industryId),
    };
    await persist(nextState, saveIndustryViewsState, "Industry removed / 产业判断已删除");
  }

  async function submitReview(event) {
    event.preventDefault();
    const position = reviewPosition || {
      id: "__new__",
      ticker: reviewForm.newTicker.trim().toUpperCase(),
      name: reviewForm.newName.trim(),
      industryViewId: reviewForm.industryViewId,
      entryReasonSummary: "",
      exitInvalidatorsSummary: "",
      maxWeightAllowed: n(reviewForm.targetWeightAfterTrade) || state.rules.singlePositionWarn,
    };
    const result = evaluateTradeReview(position, reviewForm, state);
    const industryView =
      state.industryViews.find(
        (item) => item.id === (reviewForm.positionId === "__new__" ? reviewForm.industryViewId : position.industryViewId),
      ) || null;
    result.topdown = evaluateTopdownReview({
      macroFramework: state.macroFramework,
      industryView,
      position,
      reviewForm,
    });
    const reviewRecord = {
      id: uid(),
      positionId: position.id,
      positionName: position.name ? `${position.ticker} ${position.name}`.trim() : position.ticker,
      tradeAction: reviewForm.tradeAction,
      resultQuality: result.finalAction,
      followedAgent: false,
      reason: reviewForm.whyNow.trim(),
      mistakeTags: result.riskFlags,
      lesson: reviewForm.whatChanged.trim() || result.requiredNextStep,
      reviewPayload: { reviewForm, result },
      createdAt: new Date().toISOString(),
    };
    const tradeReviewRecord = {
      id: uid(),
      positionId: position.id === "__new__" ? null : position.id,
      thesisSnapshotId: state.thesisSnapshots.find((item) => item.positionId === position.id)?.id || null,
      reviewTargetType: reviewForm.positionId === "__new__" ? "new_position" : "position",
      reviewStage: "pre_trade",
      actionLabel: reviewForm.tradeAction,
      finalAction: result.finalAction,
      matchedRules: result.matchedRules,
      decisionSummary: result.why,
      agentSummary: "",
      userNote: reviewForm.whyNow.trim(),
      executed: false,
      executionNote: "",
      outcomeLabel: "",
      createdAt: new Date().toISOString(),
    };
    const nextState = {
      ...state,
      reviews: [reviewRecord, ...state.reviews],
      tradeReviewRecords: [tradeReviewRecord, ...state.tradeReviewRecords],
      lastReview: {
        id: reviewRecord.id,
        reviewInput: { ...reviewForm },
        positionName: reviewRecord.positionName,
        result,
        agentReview: lastReview?.agentReview || null,
        agentReflection: lastReview?.agentReflection || null,
      },
    };
    pushEvent(nextState, "Review completed", `${reviewRecord.positionName} -> ${result.finalAction}.`);
    await persist(nextState, saveReviewState, "Review saved / 审查纪要已保存");
    setReviewForm(REVIEW_DEFAULT);
  }

  async function submitMemory(event) {
    event.preventDefault();
    if (!state.lastReview) return;
    const riskFlags = state.lastReview.result.riskFlags || [];
    const nextState = {
      ...state,
      reviews: [
        {
          id: uid(),
          positionId: state.lastReview.reviewInput.positionId,
          positionName: state.lastReview.positionName || "",
          tradeAction: state.lastReview.reviewInput.tradeAction,
          resultQuality: state.lastReview.result.finalAction,
          followedAgent: Boolean(state.lastReview.agentReview),
          reviewDate: memoryForm.reviewDate || formatReviewDate(new Date().toISOString()),
          actionReview: memoryForm.actionReview.trim(),
          reason: memoryForm.reason.trim() || state.lastReview.reviewInput.whyNow.trim(),
          mistakeTags: memoryForm.mistakeTags,
          lesson: memoryForm.lesson.trim(),
          reviewPayload: state.lastReview,
          createdAt: new Date().toISOString(),
        },
        ...state.reviews,
      ],
      behaviorProfiles: mergeBehaviorProfiles(state.behaviorProfiles || [], riskFlags),
      tradeReviewRecords: state.tradeReviewRecords.map((item, index) =>
        index === 0
          ? {
              ...item,
              reviewStage: "post_trade",
              executed: true,
              executionNote: memoryForm.lesson.trim(),
              outcomeLabel: state.lastReview.result.finalAction,
            }
          : item,
      ),
    };
    pushEvent(nextState, "Memory saved", "Review memory added.");
    await persist(nextState, saveFeedbackState, "Memory saved / 投后复盘已保存");
    setMemoryForm(MEMORY_DEFAULT);
  }

  async function runAgentReview() {
    if (!state.lastReview) return;
    setAgentStatus("loading");
    try {
      const text = await generatePreTradeAssessment({ position: reviewPosition || { ticker: reviewForm.newTicker.trim().toUpperCase(), name: reviewForm.newName.trim() }, reviewResult: state.lastReview.result, watchlist: state.watchlist });
      persistLocal({ ...state, lastReview: { ...state.lastReview, agentReview: text } }, "Pre-trade memo updated / 投前纪要已更新");
    } finally {
      setAgentStatus("idle");
    }
  }

  async function runAgentReflection() {
    if (!state.lastReview) return;
    setReflectionStatus("loading");
    try {
      const text = await generatePostTradeReflection({ reviewInput: state.lastReview.reviewInput, reviewResult: state.lastReview.result, memoryDraft: memoryForm });
      persistLocal({ ...state, lastReview: { ...state.lastReview, agentReflection: text } }, "Post-trade memo updated / 投后纪要已更新");
      if (text.suggestedReason) setMemoryForm((c) => ({ ...c, reason: text.suggestedReason }));
      if (text.suggestedLesson) setMemoryForm((c) => ({ ...c, lesson: text.suggestedLesson }));
      if (Array.isArray(text.suggestedTags)) setMemoryForm((c) => ({ ...c, mistakeTags: text.suggestedTags }));
    } finally {
      setReflectionStatus("idle");
    }
  }
  async function onImportFileChange(event) {
    const file = event.target.files?.[0] || null;
    setImportMessage("");
    setImportStatus("idle");
    setImportDrafts([]);
    setImportTotalAmount("");
    if (!file) {
      setImportPreview("");
      setImportAnalysisImages([]);
      return;
    }

    try {
      const normalizedPreview = await normalizeImageForVisionImport(file);
      setImportPreview(normalizedPreview.previewDataUrl);
      setImportAnalysisImages(normalizedPreview.analysisImageDataUrls || []);
      setImportMessage(
        (normalizedPreview.analysisImageDataUrls || []).length > 1
          ? "Wide screenshot detected. OCR will analyze multiple tiles and merge them automatically."
          : "",
      );
    } catch (error) {
      setImportPreview("");
      setImportAnalysisImages([]);
      setImportMessage(error?.message || "Image preprocessing failed.");
      setImportStatus("error");
    }
  }

  async function analyzeImportImage() {
    if (!canUseVisionImport) {
      setImportStatus("error");
      setImportMessage("Please sign in again before using screenshot OCR.");
      return;
    }

    if (!importPreview) {
      setImportMessage("Please upload a screenshot first.");
      return;
    }
    setImportStatus("loading");
    try {
      const result = await importBrokerPositionsFromImage(
        importAnalysisImages.length ? importAnalysisImages : importPreview,
        { totalPortfolioAmount: importTotalAmount },
      );
      setImportDrafts(applyImportedWeightsByFx(result.positions || [], result.totalPortfolioAmount || importTotalAmount, importTotalCurrency));
      setImportTotalAmount(String(result.totalPortfolioAmount || importTotalAmount || ""));
      setImportMessage(
        result.positions.length
          ? `Detected ${result.positions.length} positions. Review each row before import.`
          : "No positions detected from screenshot. Try a tighter crop around the holdings table, then upload again.",
      );
      setImportStatus("ready");
    } catch (error) {
      setImportStatus("error");
      setImportMessage(error.message || "Screenshot import failed.");
    }
  }

  function updateDraftField(index, field, value) {
    setImportDrafts((current) => updateImportedDraft(current, index, { [field]: value }, { totalPortfolioAmount: importTotalAmount }));
  }

  function recalculateDraftWeights() {
    setImportDrafts((current) => applyImportedWeightsByFx(recalculateImportedDraftWeights(current, importTotalAmount), importTotalAmount, importTotalCurrency));
    setImportMessage("Draft weights recalculated from total portfolio amount and previous-close FX.");
  }

  async function importDraftPositions() {
    if (!importDrafts.length) return;
    const imported = importDrafts.map((draft) => ({
      id: uid(),
      ticker: String(draft.ticker || "").trim().toUpperCase(),
      name: String(draft.name || "").trim(),
      market: draft.market || "HK",
      theme: draft.theme || "",
      instrumentType: draft.instrumentType || "single_stock",
      positionType: draft.positionType || "core_midterm",
      inCompetenceCircle: true,
      shareCount: n(draft.shareCount),
      marketValue: n(draft.marketValue),
      lastPrice: n(draft.lastPrice),
      avgCost: n(draft.avgCost),
      portfolioWeight: toWeight(draft.portfolioWeight),
      maxWeightAllowed: toWeight(draft.maxWeightAllowed) || state.rules.singlePositionWarn,
      thesisHorizonLabel: draft.thesisHorizonLabel || "midterm",
      entryReasonSummary: draft.entryReasonSummary || "Imported from broker screenshot",
      exitInvalidatorsSummary: draft.exitInvalidatorsSummary || "",
    }));
    const importedSnapshots = imported.map(buildThesisSnapshot).filter(Boolean);
    const nextState = {
      ...state,
      positions: [...imported, ...state.positions],
      thesisSnapshots: [...importedSnapshots, ...state.thesisSnapshots],
    };
    pushEvent(nextState, "Broker screenshot imported", `${imported.length} rows were confirmed and imported.`);
    await persist(nextState, savePositionsState, "Import complete / 导入完成");
    setImportDrafts([]);
    setImportPreview("");
    setImportAnalysisImages([]);
    setImportTotalAmount("");
    setImportMessage("");
  }

  if (!loaded) {
    return <div className="shell"><main className="main"><section className="card">Loading...</section></main></div>;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <p className="eyebrow">Portfolio Control</p>
        <h1>Investment Discipline Console / 投资纪律控制台</h1>
        <p className="brand-copy">Watchlist first, review before execution, memory after execution.</p>
        <nav className="nav">
          {NAV.map(([key, label], index) => (
            <button key={key} className={`nav-item ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
              <span className="nav-index">{index}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="meta-card"><span className="meta-label">Data Source / 数据源</span><strong>{dataSourceLabel}</strong></div>
        <div className="meta-card"><span className="meta-label">Agent Mode / Agent 模式</span><strong>{isAgentApiEnabled ? "Edge Function" : "Local Fallback"}</strong></div>
        <div className="meta-card auth-card">
          <span className="meta-label">Cloud Account / 云端账户</span>
          {isPublicDemoModeEnabled ? (
            <div className="auth-stack">
              <strong>Demo Mode / 演示模式</strong>
              <p className="helper">This build runs in public demo mode, so cloud sign-in is hidden here. Use the real test site to register and sync data.</p>
            </div>
          ) : isSupabaseEnabled ? (
            authUser ? (
              <div className="auth-stack">
                <strong>{authUser.email || "Signed in / 已登录"}</strong>
                <p className="helper">Cloud sync is active. Your data now loads and saves under this account.</p>
                <button className="button button-secondary" type="button" onClick={handleSignOut} disabled={authBusy}>Sign Out / 退出登录</button>
              </div>
            ) : (
              <form className="auth-form" onSubmit={handlePasswordSignIn}>
                <p className="helper">Register or sign in with email and password. Without sign-in, changes stay local only.</p>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
                <input
                  type="password"
                  placeholder="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
                <div className="auth-actions">
                  <button className="button button-secondary" type="submit" disabled={authBusy}>
                    {authBusy ? "Signing in... / 登录中" : "Sign In / 登录"}
                  </button>
                  <button className="button button-primary" type="button" onClick={handlePasswordSignUp} disabled={authBusy}>
                    {authBusy ? "Creating... / 创建中" : "Sign Up / 注册"}
                  </button>
                  <button className="button button-secondary" type="button" onClick={handlePasswordReset} disabled={authBusy}>
                    {authBusy ? "Sending... / 发送中" : "Forgot Password / 找回密码"}
                  </button>
                </div>
              </form>
            )
          ) : (
            <div className="auth-stack">
              <strong>Auth Unavailable / 登录不可用</strong>
              <p className="helper">This build is missing Supabase configuration, so cloud sign-in cannot be used here.</p>
            </div>
          )}
          {authStatus ? <p className="save-status">{authStatus}</p> : null}
        </div>
        {dataSource === "demo" ? <button className="button button-secondary" type="button" onClick={restoreDemoState}>Reset Demo Data / 重置演示数据</button> : null}
        <p className="save-status">{saveText}</p>
        <article className="sidebar-signature">
          <strong>Lusi work with Codex</strong>
          <p>Welcome to connect wechat：<span>Circmuggle</span></p>
        </article>
      </aside>

      <main className="main">
        <section className="hero">
          <div>
            <p className="eyebrow">Discipline System</p>
            <h2>Review the process, not just the price.</h2>
          </div>
          <div className="hero-meta">
            <div className="meta-card"><span className="meta-label">Risk / 风险</span><strong>{automation.summary.riskLevel}</strong></div>
            <div className="meta-card"><span className="meta-label">Watchlist Ready / 到期</span><strong>{automation.summary.watchlistReadyCount}</strong></div>
            <div className="meta-card"><span className="meta-label">Drafts / 草稿</span><strong>{automation.reviewDrafts.length}</strong></div>
          </div>
        </section>

        {tab === "intro" && (
          <section className="tab-panel">
            <Header eyebrow="Guide / 控制台说明" title="Control Guide / 控制台说明" copy="先看投资宪法和组合体检，再决定今天该更新哪一层判断。" />
            <article className="card" style={{ marginBottom: "18px" }}>
              <div className="form-header">
                <h4>Guide / 控制台说明</h4>
                <span className="badge info">Start Here</span>
              </div>
              <p>{APP_INTRO_COPY.title}</p>
              <p className="panel-copy">{APP_INTRO_COPY.body}</p>
              <p className="panel-copy" style={{ marginBottom: 0 }}>推荐顺序：{APP_INTRO_COPY.steps.join(" → ")}</p>
            </article>
          </section>
        )}

        {tab === "macro-framework" && (
          <section className="tab-panel">
            <Header eyebrow="Macro Framework / 宏观框架" title="Top-Down View / 上层市场判断" copy="这一页不直接决定买什么，而是先定义当前组合该偏进攻、均衡还是防守。" />
            <article className="card" style={{ marginBottom: "18px" }}>
              <strong>步骤 2</strong>
              <p className="panel-copy">先固定当前宏观框架，再决定需要用什么节奏、什么仓位去面对市场。它是全局背景，不是交易按钮。</p>
            </article>
            <div className="dashboard-grid" style={{ gridTemplateColumns: "minmax(320px, 1fr) minmax(0, 1.5fr)" }}>
              <article className="card">
                <div className="form-header"><h4>Macro Snapshot / 宏观摘要</h4><span className={`badge ${macroReviewDue ? "warning" : "safe"}`}>{macroReviewDue ? "待复核" : "有效"}</span></div>
                <div className="stack-list">
                  <article className="stack-item">
                    <strong>当前市场状态</strong>
                    <p>{MACRO_STANCE_LABELS[state.macroFramework.marketStance] || state.macroFramework.marketStance}</p>
                  </article>
                  <article className="stack-item">
                    <strong>一句话结论</strong>
                    <p>{state.macroFramework.summary || "先写清楚当前市场环境，再决定仓位和节奏。"}</p>
                  </article>
                  <article className="stack-item">
                    <strong>当前组合原则</strong>
                    <p>{state.macroFramework.portfolioPlaybook || "尚未填写组合原则"}</p>
                  </article>
                  <article className="stack-item">
                    <strong>优先关注方向</strong>
                    <p>{state.macroFramework.focusAreas || "尚未填写"}</p>
                  </article>
                  <article className="stack-item warning">
                    <strong>暂不做方向</strong>
                    <p>{state.macroFramework.avoidAreas || "尚未填写"}</p>
                  </article>
                  <article className="stack-item">
                    <strong>失效条件</strong>
                    <p>{state.macroFramework.invalidation || "尚未定义失效条件"}</p>
                  </article>
                </div>
                <div className="card-meta" style={{ marginTop: "14px" }}>
                  <span>上次更新：{fmt(state.macroFramework.updatedAt)}</span>
                  <span>复核日期：{reviewDateLabel(state.macroFramework.reviewDate)}</span>
                </div>
              </article>
              <article className="card">
                <div className="form-header"><h4>Macro Inputs / 宏观输入</h4><span className="badge">Framework</span></div>
                <div className="grid two">
                  <label className="field"><span>Market Stance / 市场状态</span><select value={state.macroFramework.marketStance} onChange={(e) => patchMacroFramework("marketStance", e.target.value)}><option value="offensive">进攻</option><option value="balanced">均衡</option><option value="defensive">防守</option></select></label>
                  <label className="field"><span>Review Date / 复核日期</span><input type="date" value={state.macroFramework.reviewDate} onChange={(e) => patchMacroFramework("reviewDate", e.target.value)} /></label>
                  <label className="field"><span>Liquidity / 流动性</span><select value={state.macroFramework.liquidityView} onChange={(e) => patchMacroFramework("liquidityView", e.target.value)}><option value="loose">宽松</option><option value="neutral">中性</option><option value="tight">收紧</option></select></label>
                  <label className="field"><span>Rates / 利率判断</span><select value={state.macroFramework.ratesView} onChange={(e) => patchMacroFramework("ratesView", e.target.value)}><option value="down">下行</option><option value="sideways">震荡</option><option value="up">上行</option></select></label>
                  <label className="field"><span>Risk Appetite / 风险偏好</span><select value={state.macroFramework.riskAppetite} onChange={(e) => patchMacroFramework("riskAppetite", e.target.value)}><option value="improving">回升</option><option value="neutral">中性</option><option value="weakening">走弱</option></select></label>
                  <label className="field"><span>Policy & FX / 政策与汇率</span><input value={state.macroFramework.policyView} onChange={(e) => patchMacroFramework("policyView", e.target.value)} placeholder="例如：政策托底但汇率仍偏紧" /></label>
                </div>
                <div className="grid one">
                  <label className="field"><span>One-Line View / 一句话结论</span><textarea rows="2" value={state.macroFramework.summary} onChange={(e) => patchMacroFramework("summary", e.target.value)} /></label>
                  <label className="field"><span>Portfolio Playbook / 当前组合原则</span><textarea rows="3" value={state.macroFramework.portfolioPlaybook} onChange={(e) => patchMacroFramework("portfolioPlaybook", e.target.value)} /></label>
                  <label className="field"><span>Focus Areas / 优先关注方向</span><textarea rows="2" value={state.macroFramework.focusAreas} onChange={(e) => patchMacroFramework("focusAreas", e.target.value)} /></label>
                  <label className="field"><span>Avoid Areas / 暂不做方向</span><textarea rows="2" value={state.macroFramework.avoidAreas} onChange={(e) => patchMacroFramework("avoidAreas", e.target.value)} /></label>
                  <label className="field"><span>Invalidation / 失效条件</span><textarea rows="2" value={state.macroFramework.invalidation} onChange={(e) => patchMacroFramework("invalidation", e.target.value)} /></label>
                </div>
                <div className="form-actions"><button className="button button-primary" type="button" onClick={saveMacroFrameworkSettings}>Save Macro Framework / 保存宏观框架</button></div>
              </article>
            </div>
          </section>
        )}

        {tab === "industry-map" && (
          <section className="tab-panel">
            <Header eyebrow="Industry Map / 产业地图" title="Sector View / 行业判断地图" copy="产业判断可以独立于宏观存在，但一旦进入交易审查，就应该被显性引用和复核。" />
            <article className="card" style={{ marginBottom: "18px" }}>
              <strong>步骤 3</strong>
              <p className="panel-copy">这里不是做行业百科，而是把你当前真正会拿来指导配置的产业判断固定下来，并给每个判断设复核日期。</p>
            </article>
            <div className="summary-grid" style={{ marginBottom: "18px" }}>
              <div className="summary-card"><span className="result-label">Tailwind / 顺风</span><strong>{state.industryViews.filter((item) => item.status === "tailwind").length}</strong><p>可继续跟踪和复核机会</p></div>
              <div className="summary-card"><span className="result-label">Observe / 观察</span><strong>{state.industryViews.filter((item) => item.status === "observe").length}</strong><p>判断尚未完全定型</p></div>
              <div className="summary-card"><span className="result-label">Headwind / 逆风</span><strong>{state.industryViews.filter((item) => item.status === "headwind").length}</strong><p>不宜重仓进攻</p></div>
              <div className="summary-card"><span className="result-label">Due For Review / 待复核</span><strong>{industryReviewDueCount}</strong><p>已到复核日期的产业判断</p></div>
            </div>
            <article className="card" style={{ marginBottom: "18px" }}>
              <div className="form-header"><h4>Add Industry View / 新增产业判断</h4><span className="badge">Map</span></div>
              <form className="form-card compact-form" onSubmit={submitIndustryView}>
                <div className="grid four">
                  <label className="field"><span>Industry / 产业名称</span><input value={industryForm.name} onChange={(e) => setIndustryForm({ ...industryForm, name: e.target.value })} /></label>
                  <label className="field"><span>Status / 产业状态</span><select value={industryForm.status} onChange={(e) => setIndustryForm({ ...industryForm, status: e.target.value })}><option value="tailwind">顺风</option><option value="observe">观察</option><option value="headwind">逆风</option><option value="inflection">拐点验证</option></select></label>
                  <label className="field"><span>Cycle / 景气阶段</span><select value={industryForm.cycle} onChange={(e) => setIndustryForm({ ...industryForm, cycle: e.target.value })}><option value="upcycle">上行</option><option value="stabilizing">修复中</option><option value="sideways">震荡</option><option value="downcycle">下行</option></select></label>
                  <label className="field"><span>Review Date / 复核日期</span><input type="date" value={industryForm.reviewDate} onChange={(e) => setIndustryForm({ ...industryForm, reviewDate: e.target.value })} /></label>
                </div>
                <div className="grid one">
                  <label className="field"><span>Core Thesis / 核心逻辑</span><textarea rows="2" value={industryForm.thesis} onChange={(e) => setIndustryForm({ ...industryForm, thesis: e.target.value })} /></label>
                  <label className="field"><span>Key Signals / 关键跟踪指标</span><textarea rows="2" value={industryForm.keySignals} onChange={(e) => setIndustryForm({ ...industryForm, keySignals: e.target.value })} /></label>
                  <label className="field"><span>Current Conclusion / 当前结论</span><textarea rows="2" value={industryForm.conclusion} onChange={(e) => setIndustryForm({ ...industryForm, conclusion: e.target.value })} /></label>
                  <label className="field"><span>Main Risks / 主要风险</span><textarea rows="2" value={industryForm.risks} onChange={(e) => setIndustryForm({ ...industryForm, risks: e.target.value })} /></label>
                  <label className="field"><span>Invalidation / 失效条件</span><textarea rows="2" value={industryForm.invalidation} onChange={(e) => setIndustryForm({ ...industryForm, invalidation: e.target.value })} /></label>
                  <label className="field"><span>Related Tickers / 相关标的</span><input value={industryForm.relatedTickers} onChange={(e) => setIndustryForm({ ...industryForm, relatedTickers: e.target.value })} placeholder="例如：0700, NVDA" /></label>
                </div>
                <div className="form-actions"><button className="button button-primary" type="submit">Add Industry View / 加入产业地图</button></div>
              </form>
            </article>
            <div className="stack-list">
              {state.industryViews.length ? state.industryViews.map((item) => (
                <article key={item.id} className="card">
                  <div className="form-header"><h4>{item.name || "未命名产业"}</h4><span className={`badge ${isReviewDue(item.reviewDate) ? "warning" : item.status === "tailwind" ? "safe" : item.status === "headwind" ? "danger" : "info"}`}>{INDUSTRY_STATUS_LABELS[item.status] || item.status}</span></div>
                  <div className="grid three">
                    <label className="field"><span>状态</span><select value={item.status} onChange={(e) => patchIndustryViewField(item.id, "status", e.target.value)}><option value="tailwind">顺风</option><option value="observe">观察</option><option value="headwind">逆风</option><option value="inflection">拐点验证</option></select></label>
                    <label className="field"><span>景气阶段</span><select value={item.cycle} onChange={(e) => patchIndustryViewField(item.id, "cycle", e.target.value)}><option value="upcycle">上行</option><option value="stabilizing">修复中</option><option value="sideways">震荡</option><option value="downcycle">下行</option></select></label>
                    <label className="field"><span>复核日期</span><input type="date" value={item.reviewDate || ""} onChange={(e) => patchIndustryViewField(item.id, "reviewDate", e.target.value)} /></label>
                  </div>
                  <div className="grid one">
                    <label className="field"><span>产业名称</span><input value={item.name || ""} onChange={(e) => patchIndustryViewField(item.id, "name", e.target.value)} /></label>
                    <label className="field"><span>核心逻辑</span><textarea rows="2" value={item.thesis || ""} onChange={(e) => patchIndustryViewField(item.id, "thesis", e.target.value)} /></label>
                    <label className="field"><span>关键跟踪指标</span><textarea rows="2" value={item.keySignals || ""} onChange={(e) => patchIndustryViewField(item.id, "keySignals", e.target.value)} /></label>
                    <label className="field"><span>当前结论</span><textarea rows="2" value={item.conclusion || ""} onChange={(e) => patchIndustryViewField(item.id, "conclusion", e.target.value)} /></label>
                    <label className="field"><span>主要风险</span><textarea rows="2" value={item.risks || ""} onChange={(e) => patchIndustryViewField(item.id, "risks", e.target.value)} /></label>
                    <label className="field"><span>失效条件</span><textarea rows="2" value={item.invalidation || ""} onChange={(e) => patchIndustryViewField(item.id, "invalidation", e.target.value)} /></label>
                    <label className="field"><span>相关标的</span><input value={item.relatedTickers || ""} onChange={(e) => patchIndustryViewField(item.id, "relatedTickers", e.target.value)} /></label>
                  </div>
                  <div className="card-meta" style={{ marginTop: "14px" }}>
                    <span>景气阶段：{INDUSTRY_CYCLE_LABELS[item.cycle] || item.cycle}</span>
                    <span>上次更新：{fmt(item.updatedAt)}</span>
                  </div>
                  <div className="form-actions">
                    <button className="button button-secondary" type="button" onClick={() => removeIndustryView(item.id)}>Delete Industry View / 删除产业判断</button>
                  </div>
                </article>
              )) : <p className="save-status">Industry map is empty / 还没有产业判断</p>}
            </div>
            {state.industryViews.length ? <div className="form-actions"><button className="button button-primary" type="button" onClick={saveIndustryViewsTable}>Save Industry Map / 保存产业地图</button></div> : null}
          </section>
        )}

        {(tab === "intro" || tab === "constitution") && (
          <section className="tab-panel">
            <Header eyebrow="Dashboard / 决策总览" title="Constitution & Portfolio Check / 宪法与体检" copy="先固定仓位边界和禁令，再看组合体检给出的今日动作建议。" />
            <article className="card" style={{ marginBottom: "18px" }}>
              <strong>Dashboard Core / 总览核心</strong>
              <p className="panel-copy">先确认你的风险边界和仓位预算。只有先把这里定清楚，后面的持仓、审查和复盘才有统一标准。</p>
            </article>
            <div className="dashboard-grid" style={{ gridTemplateColumns: "minmax(320px, 1fr) minmax(0, 1.5fr)" }}>
              <article className="card">
                <div className="form-header"><h4>Constitution / 宪法摘要</h4><span className="badge">4 rules</span></div>
                <div className="stack-list">
                  <article className="stack-item"><strong>目标</strong><p>{state.constitution.goal}</p></article>
                  <article className="stack-item"><strong>风格</strong><p>{state.constitution.style}</p></article>
                  <article className="stack-item"><strong>能力圈</strong><p>{state.constitution.competence}</p></article>
                  <article className="stack-item warning"><strong>禁令</strong><p>{state.constitution.bans}</p></article>
                  <article className="stack-item">
                    <strong>上限数据</strong>
                    <div className="chip-row" style={{ marginTop: "10px" }}>
                      <span className="chip safe">核心仓位上限 {state.constitution.coreMax}%</span>
                      <span className="chip safe">试错仓位上限 {state.constitution.probeMax}%</span>
                      <span className="chip safe">主题集中上限 {state.constitution.themeMax}%</span>
                    </div>
                  </article>
                </div>
                <div className="card-meta" style={{ marginTop: "14px" }}>
                  <span>最近修改：{state.constitution.lastEditedAt ? formatReviewDate(state.constitution.lastEditedAt) : "尚未记录"}</span>
                </div>
                {!constitutionEditing ? (
                  <div className="form-actions">
                    <button className="button button-secondary" type="button" onClick={() => setConstitutionEditing(true)}>Edit Constitution Summary / 编辑宪法摘要</button>
                  </div>
                ) : (
                  <>
                    <div className="grid two" style={{ marginTop: "18px" }}>
                      <label className="field"><span>Core Max % / 核心仓位上限</span><input type="number" value={state.constitution.coreMax} onChange={(e) => patchConstitution("coreMax", n(e.target.value))} /></label>
                      <label className="field"><span>Probe Max % / 试错仓位上限</span><input type="number" value={state.constitution.probeMax} onChange={(e) => patchConstitution("probeMax", n(e.target.value))} /></label>
                      <label className="field"><span>Theme Max % / 主题集中上限</span><input type="number" value={state.constitution.themeMax} onChange={(e) => patchConstitution("themeMax", n(e.target.value))} /></label>
                    </div>
                    <div className="form-actions">
                      <button className="button button-secondary" type="button" onClick={() => setConstitutionEditing(false)}>Cancel / 取消</button>
                      <button className="button button-primary" type="button" onClick={saveConstitutionSettings}>Save Constitution / 保存宪法参数</button>
                    </div>
                  </>
                )}
              </article>
              <article className="card">
                <div className="form-header"><h4>Portfolio Check / 组合体检</h4><span className={`badge ${automation.summary.riskLevel}`}>{automation.summary.riskLevel}</span></div>
                <div className="summary-grid">
                  <div className="summary-card"><span className="result-label">Check Summary / 体检结论</span><strong>{automation.summary.riskLevel}</strong><p>{automation.headline}</p></div>
                  <div className="summary-card"><span className="result-label">Overweight / 超限仓位</span><strong>{automation.summary.overweightCount}</strong><p>{automation.summary.deepDrawdownCount} 笔深度回撤需复核</p></div>
                  <div className="summary-card"><span className="result-label">Watchlist Ready / 观察池到期</span><strong>{automation.summary.watchlistReadyCount}</strong><p>{automation.counts.cooling} 个仍在观察期</p></div>
                  <div className="summary-card"><span className="result-label">Framework Review / 上层复核</span><strong>{automation.summary.frameworkReviewCount}</strong><p>{automation.summary.macroReviewDue ? "宏观待复核" : "宏观有效"}，产业待复核 {automation.summary.industryReviewDueCount} 个</p></div>
                </div>
                <article className="stack-item" style={{ marginTop: "14px" }}>
                  <strong>今日动作建议</strong>
                  <p>{automation.actionRecommendation}</p>
                </article>
                <div className="stack-list">
                  {automation.watchAlerts.length ? automation.watchAlerts.map((item) => <article key={item.id} className="stack-item warning"><strong>{item.title}</strong><p>{item.detail}</p></article>) : <p className="save-status">No watchlist reminders today.</p>}
                </div>
              </article>
            </div>
          </section>
        )}
        {tab === "positions-rationale" && (
          <section className="tab-panel">
            <Header eyebrow="Portfolio Overview / 持仓概览" title="Position Book / 持仓概览" copy="这里先把现有持仓、仓位边界和持有依据记完整，再进入上层框架或交易动作。" />
            <article className="card" style={{ marginBottom: "18px" }}>
              <strong>步骤 1</strong>
              <p className="panel-copy">先把现有持仓、仓位边界和持有依据录完整。这个页面只负责持仓台账，观察名单会放到交易审查页里处理。</p>
            </article>
            <article className="card">
              <div className="form-header"><h4>Manual Entry / 手工录入</h4><span className="badge">Step 1</span></div>
              <form className="form-card compact-form" onSubmit={submitPosition}>
                <div className="grid four">
                  <label className="field"><span>Ticker/代码</span><input value={positionForm.ticker} onChange={(e) => setPositionForm({ ...positionForm, ticker: e.target.value })} /></label>
                  <label className="field"><span>Name/名称</span><input value={positionForm.name} onChange={(e) => setPositionForm({ ...positionForm, name: e.target.value })} /></label>
                  <label className="field"><span>Market/市场</span><select value={positionForm.market} onChange={(e) => setPositionForm({ ...positionForm, market: e.target.value })}><option value="HK">HK / 港股</option><option value="US">US / 美股</option><option value="CN">CN / A股</option></select></label>
                  <label className="field"><span>Theme/主题</span><input value={positionForm.theme} onChange={(e) => setPositionForm({ ...positionForm, theme: e.target.value })} /></label>
                  <label className="field"><span>Industry View / 产业判断</span><select value={positionForm.industryViewId} onChange={(e) => setPositionForm({ ...positionForm, industryViewId: e.target.value })}><option value="">Unlinked / 未绑定</option>{state.industryViews.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                </div>
                <div className="grid six">
                  <label className="field"><span>Share Count/持仓数量</span><input type="number" value={positionForm.shareCount} onChange={(e) => setPositionForm({ ...positionForm, shareCount: e.target.value })} /></label>
                  <label className="field"><span>Market Value/持仓市值</span><input type="number" value={positionForm.marketValue} onChange={(e) => setPositionForm({ ...positionForm, marketValue: e.target.value })} /></label>
                  <label className="field"><span>Last Price/最新收盘价</span><input type="number" value={positionForm.lastPrice} onChange={(e) => setPositionForm({ ...positionForm, lastPrice: e.target.value })} /></label>
                  <label className="field"><span>Avg Cost/持仓成本</span><input type="number" value={positionForm.avgCost} onChange={(e) => setPositionForm({ ...positionForm, avgCost: e.target.value })} /></label>
                  <label className="field"><span>Weight %/仓位占比</span><input type="number" value={positionForm.portfolioWeight} onChange={(e) => setPositionForm({ ...positionForm, portfolioWeight: e.target.value })} /></label>
                  <label className="field"><span>Max Weight %/最大仓位</span><input type="number" value={positionForm.maxWeightAllowed} onChange={(e) => setPositionForm({ ...positionForm, maxWeightAllowed: e.target.value })} /></label>
                </div>
                <div className="grid one">
                  <label className="field"><span>Thesis/逻辑</span><textarea rows="2" value={positionForm.entryReasonSummary} onChange={(e) => setPositionForm({ ...positionForm, entryReasonSummary: e.target.value })} /></label>
                  <label className="field"><span>Invalidation/失效条件</span><textarea rows="2" value={positionForm.exitInvalidatorsSummary} onChange={(e) => setPositionForm({ ...positionForm, exitInvalidatorsSummary: e.target.value })} /></label>
                </div>
                <div className="form-actions"><button className="button button-primary" type="submit">Save Position / 保存持仓</button></div>
              </form>
            </article>
            <article className="card compact-form" style={{ marginTop: "18px" }}>
              <div className="form-header"><h4>Import Screenshot / 截图导入</h4><span className="badge">{canUseVisionImport ? "Vision API" : "Sign In Needed"}</span></div>
              <div className="grid four">
                <label className="field"><span>Broker Screenshot / 券商持仓截图</span><input type="file" accept="image/*" onChange={onImportFileChange} /></label>
                <label className="field"><span>Total Portfolio Amount / 总持仓金额</span><input value={importTotalAmount} onChange={(e) => setImportTotalAmount(e.target.value)} placeholder="221349.68" /></label>
                <label className="field"><span>Total Currency / 总金额币种</span><select value={importTotalCurrency} onChange={(e) => setImportTotalCurrency(e.target.value)}><option value="HKD">HKD</option><option value="USD">USD</option><option value="CNY">CNY</option></select></label>
                <div className="form-actions compact-actions"><button className="button button-secondary" type="button" onClick={analyzeImportImage} disabled={!importPreview || importStatus === "loading"}>{importStatus === "loading" ? "Recognizing... / 识别中..." : "Analyze Screenshot / 识别截图"}</button></div>
              </div>
              {!canUseVisionImport ? <p className="save-status">Sign in first to invoke the OCR Edge Function. 未登录时点击识别会先提示登录。</p> : null}
              <div className="form-actions compact-actions">
                <button className="button button-secondary" type="button" onClick={recalculateDraftWeights} disabled={!importDrafts.length || !importTotalAmount}>Recalculate Weights / 重算仓位</button>
              </div>
              {importMessage ? <p className="save-status">{importMessage}</p> : null}
              {importPreview ? <img className="import-preview" src={importPreview} alt="broker screenshot preview" /> : null}
              {importDrafts.length ? (
                <div className="draft-table">
                  <div className="draft-table-head"><span>Ticker/代码</span><span>Name/名称</span><span>Qty/数量</span><span>Value/市值</span><span>Last/现价</span><span>Cost/成本</span><span>Weight/仓位</span><span>Actions/操作</span></div>
                  {importDrafts.map((draft, index) => (
                    <div key={`${draft.ticker}-${index}`} className="draft-row">
                      <input value={draft.ticker || ""} onChange={(e) => updateDraftField(index, "ticker", e.target.value)} />
                      <input value={draft.name || ""} onChange={(e) => updateDraftField(index, "name", e.target.value)} />
                      <input type="number" value={draft.shareCount ?? ""} onChange={(e) => updateDraftField(index, "shareCount", e.target.value)} />
                      <input type="number" value={draft.marketValue ?? ""} onChange={(e) => updateDraftField(index, "marketValue", e.target.value)} />
                      <input type="number" value={draft.lastPrice ?? ""} onChange={(e) => updateDraftField(index, "lastPrice", e.target.value)} />
                      <input type="number" value={draft.avgCost ?? ""} onChange={(e) => updateDraftField(index, "avgCost", e.target.value)} />
                      <input type="number" step="0.0001" value={draft.portfolioWeight ?? ""} onChange={(e) => updateDraftField(index, "portfolioWeight", e.target.value)} />
                      <button className="button button-secondary" type="button" onClick={() => setImportDrafts((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remove / 删除</button>
                    </div>
                  ))}
                  <div className="form-actions"><button className="button button-primary" type="button" onClick={importDraftPositions}>Confirm Import / 确认导入</button></div>
                </div>
              ) : null}
            </article>
            <div className="card" style={{ marginTop: "18px" }}>
              <div className="form-header"><h4>Position List / 持仓列表</h4><span className="badge">{state.positions.length}</span></div>
              <div className="grid three">
                <label className="field"><span>Sort/排序</span><select value={positionSort} onChange={(e) => setPositionSort(e.target.value)}><option value="value_desc">Market Value Desc / 市值从高到低</option><option value="cost_desc">Avg Cost Desc / 成本从高到低</option></select></label>
                <label className="field"><span>Market Filter/按市场筛选</span><select value={marketFilter} onChange={(e) => setMarketFilter(e.target.value)}><option value="all">All / 全部</option><option value="HK">HK / 港股</option><option value="US">US / 美股</option><option value="CN">CN / A股</option></select></label>
                <label className="field"><span>Theme Filter/按主题筛选</span><select value={themeFilter} onChange={(e) => setThemeFilter(e.target.value)}><option value="all">All / 全部</option>{[...new Set(state.positions.map((item) => item.theme).filter(Boolean))].map((theme) => <option key={theme} value={theme}>{theme}</option>)}</select></label>
              </div>
              <div className="summary-grid" style={{ margin: "12px 0" }}>
                <div className="summary-card"><span className="result-label">Cash Ratio / 现金占比</span><strong>{pct(portfolioCashRatio)}</strong><p>总金额 {importTotalAmount || "-"} {importTotalCurrency}，按前一交易日汇率折算</p></div>
              </div>
              {sortedPositions.length ? (
                <>
                  <div className="position-table">
                    <div className="position-table-head">
                      <span>Ticker/代码</span>
                      <span>Name/名称</span>
                      <span>Market/市场</span>
                      <span>Currency/币种</span>
                      <span>Theme/主题</span>
                      <span>Industry/产业判断</span>
                      <span>Qty/数量</span>
                      <span>Value/市值</span>
                      <span>Price/现价</span>
                      <span>Cost/成本</span>
                      <span>Weight/仓位</span>
                      <span>Max/上限</span>
                      <span>Thesis/逻辑</span>
                      <span>Invalidation/失效条件</span>
                      <span>Action/操作</span>
                    </div>
                    {sortedPositions.map((item) => (
                      <div key={item.id} className="position-table-row">
                        <input className="ticker-cell" value={item.ticker || ""} onChange={(e) => patchPositionField(item.id, "ticker", e.target.value.toUpperCase())} />
                        <input value={item.name || ""} onChange={(e) => patchPositionField(item.id, "name", e.target.value)} />
                        <select value={item.market || "HK"} onChange={(e) => patchPositionField(item.id, "market", e.target.value)}><option value="HK">HK / 港股</option><option value="US">US / 美股</option><option value="CN">CN / A股</option></select>
                        <span className="table-static">{getMarketCurrency(item.market)}</span>
                        <input value={item.theme || ""} onChange={(e) => patchPositionField(item.id, "theme", e.target.value)} />
                        <select value={item.industryViewId || ""} onChange={(e) => patchPositionField(item.id, "industryViewId", e.target.value)}><option value="">Unlinked / 未绑定</option>{state.industryViews.map((industry) => <option key={industry.id} value={industry.id}>{industry.name}</option>)}</select>
                        <input type="number" value={item.shareCount ?? ""} onChange={(e) => patchPositionField(item.id, "shareCount", n(e.target.value))} />
                        <input type="number" value={item.marketValue ?? ""} onChange={(e) => patchPositionField(item.id, "marketValue", n(e.target.value))} />
                        <input type="number" value={item.lastPrice ?? ""} onChange={(e) => patchPositionField(item.id, "lastPrice", n(e.target.value))} />
                        <input type="number" value={item.avgCost ?? ""} onChange={(e) => patchPositionField(item.id, "avgCost", n(e.target.value))} />
                        <input type="number" value={Number(item.portfolioWeight || 0) * 100} onChange={(e) => patchPositionField(item.id, "portfolioWeight", toWeight(e.target.value))} />
                        <input type="number" value={Number(item.maxWeightAllowed || 0) * 100} onChange={(e) => patchPositionField(item.id, "maxWeightAllowed", toWeight(e.target.value))} />
                        <textarea rows="2" value={item.entryReasonSummary || ""} onChange={(e) => patchPositionField(item.id, "entryReasonSummary", e.target.value)} />
                        <textarea rows="2" value={item.exitInvalidatorsSummary || ""} onChange={(e) => patchPositionField(item.id, "exitInvalidatorsSummary", e.target.value)} />
                        <button className="button button-secondary" type="button" onClick={() => removePosition(item.id)}>Delete / 删除</button>
                      </div>
                    ))}
                  </div>
                  <div className="form-actions"><button className="button button-secondary" type="button" onClick={savePositionTable}>Save Position Table / 保存持仓表</button></div>
                </>
              ) : <p className="save-status">No positions yet / 还没有持仓</p>}
            </div>
          </section>
        )}

        {tab === "review-gate" && (
          <section className="tab-panel">
            <Header eyebrow="Trade Review / 交易审查" title="Trade Review Workspace / 交易审查工作台" copy="纪律规则引擎先给出硬约束，再由 agent 补充解释和复盘建议。" />
            <article className="card" style={{ marginBottom: "18px" }}>
              <strong>步骤 4</strong>
              <p className="panel-copy">{state.positions.length ? "观察名单先行。先确认标的是否已纳入观察，再填最少 3 项：操作、目标仓位、本次操作依据。其余高级项只在必要时展开。" : "如果是新标的，先在本页加入观察名单，再补交易审查；如果是已有持仓，再回“持仓概览”核对持仓台账。"}</p>
            </article>
            <article className="card" style={{ marginBottom: "18px" }}>
              <div className="form-header"><h4>Watchlist / 观察池</h4><span className="badge">{state.watchlist.length}</span></div>
              <p className="panel-copy" style={{ marginBottom: "14px" }}>观察名单先行。新标的先进入观察池、完成观察期，再进入正式交易审查，会比直接下结论更稳。</p>
              <form className="form-card" onSubmit={submitWatch}>
                <div className="grid two">
                  <label className="field"><span>Ticker/代码</span><input value={watchForm.ticker} onChange={(e) => setWatchForm({ ...watchForm, ticker: e.target.value })} /></label>
                  <label className="field"><span>Name/名称</span><input value={watchForm.name} onChange={(e) => setWatchForm({ ...watchForm, name: e.target.value })} /></label>
                </div>
                <div className="grid one">
                  <label className="field"><span>Initial Thesis/初始逻辑</span><textarea rows="3" value={watchForm.thesis} onChange={(e) => setWatchForm({ ...watchForm, thesis: e.target.value })} /></label>
                  <label className="field"><span>Expected Catalyst/催化因素</span><textarea rows="3" value={watchForm.catalyst} onChange={(e) => setWatchForm({ ...watchForm, catalyst: e.target.value })} /></label>
                </div>
                <div className="form-actions"><button className="button button-primary" type="submit">Add to Watchlist / 加入观察池</button></div>
              </form>
              <div className="watchlist-list">
                {state.watchlist.length ? state.watchlist.map((item) => {
                  const cooling = Math.max(0, WATCH_COOLDOWN_DAYS - Math.floor((Date.now() - new Date(item.addedAt).getTime()) / 86400000));
                  return <article key={item.id} className="watch-item"><h5>{item.ticker}{item.name ? ` · ${item.name}` : ""}</h5><div className="card-meta"><span>{fmt(item.addedAt)}</span></div><div className="chip-row"><span className={`chip ${cooling > 0 ? "warning" : "safe"}`}>{cooling > 0 ? `${cooling} days left / 冷静期` : "Ready for review / 可复核"}</span></div><p>{item.thesis || "No thesis yet / 还没有逻辑"}</p></article>;
                }) : <p className="save-status">Watchlist is empty / 观察池为空</p>}
              </div>
            </article>
            <div className="panel-split">
              <form className="card form-card" onSubmit={submitReview}>
                <div className="grid two">
                  <label className="field"><span>Position/持仓</span><select value={reviewForm.positionId} onChange={(e) => setReviewForm({ ...reviewForm, positionId: e.target.value })}><option value="__new__">New Position / 新标的</option>{state.positions.map((item) => <option key={item.id} value={item.id}>{item.ticker} {item.name}</option>)}</select></label>
                  <label className="field"><span>Action/动作</span><select value={reviewForm.tradeAction} onChange={(e) => setReviewForm({ ...reviewForm, tradeAction: e.target.value })}><option value="buy">Buy / 买入</option><option value="add">Add / 加仓</option><option value="reduce">Reduce / 减仓</option><option value="sell">Sell / 卖出</option><option value="hold">Hold / 持有</option></select></label>
                  <label className="field"><span>Target Weight %/目标仓位</span><input type="number" value={reviewForm.targetWeightAfterTrade} onChange={(e) => setReviewForm({ ...reviewForm, targetWeightAfterTrade: e.target.value })} /></label>
                  <label className="field"><span>Target Price/目标价格</span><input type="number" value={reviewForm.referencePrice} onChange={(e) => setReviewForm({ ...reviewForm, referencePrice: e.target.value })} /></label>
                </div>
                {reviewForm.positionId === "__new__" ? <div className="grid two"><label className="field"><span>New Ticker/新代码</span><input value={reviewForm.newTicker} onChange={(e) => setReviewForm({ ...reviewForm, newTicker: e.target.value })} /></label><label className="field"><span>New Name/新名称</span><input value={reviewForm.newName} onChange={(e) => setReviewForm({ ...reviewForm, newName: e.target.value })} /></label><label className="field"><span>Industry View / 产业判断</span><select value={reviewForm.industryViewId} onChange={(e) => setReviewForm({ ...reviewForm, industryViewId: e.target.value })}><option value="">Unlinked / 未绑定</option>{state.industryViews.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div> : null}
                {topdownPreview ? (
                  <article className="result-card topdown-check-card" style={{ marginBottom: "14px" }}>
                    <div className="form-header"><h4>Top-Down Check / 上层一致性检查</h4><span className="badge info">Live</span></div>
                    <div className="topdown-check-grid">
                      <article className="topdown-check-item">
                        <div className="topdown-check-head"><span className="result-label">{topdownPreview.macroAlignment.title}</span><span className={`chip ${REVIEW_STATUS_BADGE_CLASS[topdownPreview.macroAlignment.status]}`}>{topdownPreview.macroAlignment.label}</span></div>
                        <p>{topdownPreview.macroAlignment.detail}</p>
                      </article>
                      <article className="topdown-check-item">
                        <div className="topdown-check-head"><span className="result-label">{topdownPreview.industryAlignment.title}</span><span className={`chip ${REVIEW_STATUS_BADGE_CLASS[topdownPreview.industryAlignment.status]}`}>{topdownPreview.industryAlignment.label}</span></div>
                        <p>{topdownPreview.industryAlignment.detail}</p>
                      </article>
                      <article className="topdown-check-item">
                        <div className="topdown-check-head"><span className="result-label">{topdownPreview.thesisCompleteness.title}</span><span className={`chip ${REVIEW_STATUS_BADGE_CLASS[topdownPreview.thesisCompleteness.status]}`}>{topdownPreview.thesisCompleteness.label}</span></div>
                        <p>{topdownPreview.thesisCompleteness.detail}</p>
                      </article>
                    </div>
                  </article>
                ) : null}
                <div className="grid one">
                  <label className="field"><span>Decision Basis/本次操作依据</span><textarea rows="2" value={reviewForm.thesisReference} placeholder={REVIEW_FIELD_PLACEHOLDERS.thesisReference} onChange={(e) => setReviewForm({ ...reviewForm, thesisReference: e.target.value })} /></label>
                  <label className="field"><span>What Proves You Wrong/什么会证明你错了</span><textarea rows="2" value={reviewForm.wrongIf} placeholder={REVIEW_FIELD_PLACEHOLDERS.wrongIf} onChange={(e) => setReviewForm({ ...reviewForm, wrongIf: e.target.value })} /></label>
                </div>
                <div className="form-actions">
                  <button className="button button-secondary" type="button" onClick={() => setReviewAdvancedOpen((current) => !current)}>{reviewAdvancedOpen ? "Hide Advanced / 收起高级项" : "Show Advanced / 展开高级项"}</button>
                </div>
                {reviewAdvancedOpen ? (
                  <div className="grid one">
                    <div className="grid two">
                      <label className="field"><span>Target Position Type/目标持仓类型</span><select value={reviewForm.targetPositionType} onChange={(e) => setReviewForm({ ...reviewForm, targetPositionType: e.target.value })}><option value="core_midterm">Core Midterm / 核心中线</option><option value="swing">Swing / 波段</option><option value="probe">Probe / 试错</option></select></label>
                      <label className="field"><span>Emotion Risk/情绪风险</span><select value={reviewForm.emotionRisk} onChange={(e) => setReviewForm({ ...reviewForm, emotionRisk: e.target.value })}><option value="low">Low / 低</option><option value="medium">Medium / 中</option><option value="high">High / 高</option></select></label>
                      <label className="field"><span>Thesis Status/thesis 状态</span><select value={reviewForm.thesisStatus} onChange={(e) => setReviewForm({ ...reviewForm, thesisStatus: e.target.value })}><option value="active">Active / 有效</option><option value="weakened">Weakened / 弱化</option><option value="realized">Realized / 已兑现</option><option value="invalidated">Invalidated / 被证伪</option></select></label>
                      <label className="field"><span>Trigger Type/触发类型</span><select value={reviewForm.triggerType} onChange={(e) => setReviewForm({ ...reviewForm, triggerType: e.target.value })}><option value="manual">Manual / 主动发起</option><option value="price_spike">Price Spike / 急涨</option><option value="price_drop">Price Drop / 急跌</option><option value="news">News / 新闻</option><option value="earnings">Earnings / 财报</option><option value="macro">Macro / 宏观</option></select></label>
                      <label className="field"><span>Planned Holding Days/计划持有天数</span><input type="number" value={reviewForm.plannedHoldingDays} onChange={(e) => setReviewForm({ ...reviewForm, plannedHoldingDays: e.target.value })} /></label>
                      <label className="field"><span>Same Theme Weight %/同主题敞口</span><input type="number" value={reviewForm.sameThemeWeight} onChange={(e) => setReviewForm({ ...reviewForm, sameThemeWeight: e.target.value })} /></label>
                      <label className="field"><span>Cooldown Until/冷静期到期</span><input type="datetime-local" value={reviewForm.cooldownUntil} onChange={(e) => setReviewForm({ ...reviewForm, cooldownUntil: e.target.value })} /></label>
                    </div>
                  <label className="field"><span>Why Now/为什么现在</span><textarea rows="3" value={reviewForm.whyNow} placeholder={REVIEW_FIELD_PLACEHOLDERS.whyNow} onChange={(e) => setReviewForm({ ...reviewForm, whyNow: e.target.value })} /></label>
                  <label className="field"><span>What Changed/变化是什么</span><textarea rows="3" value={reviewForm.whatChanged} placeholder={REVIEW_FIELD_PLACEHOLDERS.whatChanged} onChange={(e) => setReviewForm({ ...reviewForm, whatChanged: e.target.value })} /></label>
                  <label className="field"><span>Holding Plan After Trade/交易后持有计划</span><textarea rows="2" value={reviewForm.holdingPlanAfterTrade} placeholder={REVIEW_FIELD_PLACEHOLDERS.holdingPlanAfterTrade} onChange={(e) => setReviewForm({ ...reviewForm, holdingPlanAfterTrade: e.target.value })} /></label>
                  <label className="field"><span>Alternative Action/不交易的替代方案</span><textarea rows="2" value={reviewForm.alternativeAction} placeholder={REVIEW_FIELD_PLACEHOLDERS.alternativeAction} onChange={(e) => setReviewForm({ ...reviewForm, alternativeAction: e.target.value })} /></label>
                  </div>
                ) : null}
                <div className="form-actions"><button className="button button-primary" type="submit">Generate Pre-trade Memo / 生成投前纪要</button></div>
              </form>
              <div className="card">
                <div className="form-header"><h4>Pre-trade Memo / 投前纪要</h4><span className={`badge ${lastReview?.result.finalAction || "info"}`}>{lastReview ? REVIEW_ACTION_LABELS[lastReview.result.finalAction] : "未执行"}</span></div>
                {lastReview ? (
                  <>
                    <div className="result-grid">
                      <div className="result-card"><span className="result-label">纪律分</span><strong>{lastReview.result.disciplineScore}</strong></div>
                      <div className="result-card"><span className="result-label">投资结论</span><strong>{REVIEW_ACTION_LABELS[lastReview.result.finalAction]}</strong></div>
                      <div className="result-card"><span className="result-label">观察期</span><strong>{lastReview.result.delayWindow || "无"}</strong></div>
                      <div className="result-card"><span className="result-label">纪律依据</span><div className="chip-row">{lastReview.result.matchedRules.map((item) => <span key={item.id} className="chip">{item.message}</span>)}</div></div>
                      <div className="result-card"><span className="result-label">下一步动作</span><p>{lastReview.result.requiredNextStep}</p></div>
                      {lastReview.result.topdown ? (
                        <div className="result-card">
                          <span className="result-label">上层一致性</span>
                          <div className="chip-row">
                            <span className={`chip ${REVIEW_STATUS_BADGE_CLASS[lastReview.result.topdown.macroAlignment.status]}`}>宏观：{lastReview.result.topdown.macroAlignment.label}</span>
                            <span className={`chip ${REVIEW_STATUS_BADGE_CLASS[lastReview.result.topdown.industryAlignment.status]}`}>产业：{lastReview.result.topdown.industryAlignment.label}</span>
                            <span className={`chip ${REVIEW_STATUS_BADGE_CLASS[lastReview.result.topdown.thesisCompleteness.status]}`}>个股依据：{lastReview.result.topdown.thesisCompleteness.label}</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="form-actions review-agent-actions">
                      <button className="button button-secondary" type="button" onClick={runAgentReview} disabled={agentStatus === "loading"}>{agentStatus === "loading" ? "Running..." : "Generate Pre-trade Memo / 生成投前纪要"}</button>
                    </div>
                    {lastReview.agentReview ? <article className="result-card"><div className="form-header"><h4>Pre-trade Memo / 投前纪要</h4><span className="badge info">{lastReview.agentReview.mode}</span></div><p className="agent-output">{lastReview.agentReview.text}</p></article> : null}
                    <article className="result-card">
                      <div className="form-header"><h4>核心依据</h4><span className="badge info">{latestTradeReviewRecord?.reviewStage === "pre_trade" ? "交易前" : "交易后"}</span></div>
                      <p>{latestTradeReviewRecord?.decisionSummary || lastReview.result.why}</p>
                    </article>
                  </>
                ) : <p className="save-status">Run one trade review first / 先运行一次复盘</p>}
              </div>
            </div>
          </section>
        )}

        {tab === "feedback" && (
          <section className="tab-panel">
            <Header eyebrow="Attribution Analysis / 复盘归因" title="Attribution Analysis Archive / 复盘归因档案" copy="把执行偏差、错误标签和后续改进沉淀成长期记忆，而不是只看盈亏结果。" />
            <article className="card" style={{ marginBottom: "18px" }}>
              <strong>步骤 5</strong>
              <p className="panel-copy">{state.lastReview ? "交易完成后，先写清操作复盘，再打错误标签和教训。" : "你还没有最近一次交易审查记录。建议先去“Trade Review / 交易审查”完成一笔判断，再回来复盘。"}</p>
            </article>
            <div className="panel-split">
              <div className="card">
                <div className="form-header"><h4>Review Memory / 复盘记录</h4><span className="badge">{state.reviews.length}</span></div>
                {lastReview ? (
                  <form className="form-card" onSubmit={submitMemory}>
                    {lastReview.result.topdown ? (
                      <article className="result-card" style={{ marginBottom: "14px" }}>
                        <div className="form-header"><h4>Decision Snapshot / 决策快照</h4><span className="badge info">Top-Down</span></div>
                        <div className="chip-row">
                          <span className={`chip ${REVIEW_STATUS_BADGE_CLASS[lastReview.result.topdown.macroAlignment.status]}`}>宏观：{lastReview.result.topdown.macroAlignment.label}</span>
                          <span className={`chip ${REVIEW_STATUS_BADGE_CLASS[lastReview.result.topdown.industryAlignment.status]}`}>产业：{lastReview.result.topdown.industryAlignment.label}</span>
                          <span className={`chip ${REVIEW_STATUS_BADGE_CLASS[lastReview.result.topdown.thesisCompleteness.status]}`}>个股依据：{lastReview.result.topdown.thesisCompleteness.label}</span>
                        </div>
                        <p style={{ marginTop: "12px" }}>
                          {lastReview.result.topdown.macroAlignment.detail} {lastReview.result.topdown.industryAlignment.detail}
                        </p>
                      </article>
                    ) : null}
                    <div className="grid one">
                      <label className="field"><span>Review Date/复盘日期</span><input type="date" value={memoryForm.reviewDate} onChange={(e) => setMemoryForm({ ...memoryForm, reviewDate: e.target.value })} /></label>
                      <label className="field"><span>Action Review/操作复盘</span><textarea rows="4" value={memoryForm.actionReview} onChange={(e) => setMemoryForm({ ...memoryForm, actionReview: e.target.value })} placeholder="描述具体做了什么操作，复盘看可能错在哪里，教训是什么" /></label>
                      <label className="field"><span>Reason Summary / 原因归纳</span><textarea rows="3" value={memoryForm.reason} onChange={(e) => setMemoryForm({ ...memoryForm, reason: e.target.value })} /></label>
                      <div className="field"><span>Mistake Tags/错误标签</span><div className="chip-row">{REVIEW_TAG_OPTIONS.map((tag) => <button key={tag} className={`button ${memoryForm.mistakeTags.includes(tag) ? "button-primary" : "button-secondary"}`} type="button" onClick={() => toggleMemoryTag(tag)}>{tag}</button>)}</div></div>
                      <label className="field"><span>Lesson / 复盘教训</span><textarea rows="3" value={memoryForm.lesson} onChange={(e) => setMemoryForm({ ...memoryForm, lesson: e.target.value })} /></label>
                    </div>
                    <div className="form-actions"><button className="button button-secondary" type="submit">Save Review Memory / 保存复盘记忆</button></div>
                    <div className="form-actions">
                      <button className="button button-secondary" type="button" onClick={runAgentReflection} disabled={reflectionStatus === "loading"}>{reflectionStatus === "loading" ? "Running..." : "Generate Post-trade Memo / 生成投后复盘纪要"}</button>
                    </div>
                  </form>
                ) : <p className="save-status">先在“Trade Review / 交易审查”里跑一笔审查，再回来补复盘记录。</p>}
                {lastReview?.agentReflection ? <article className="result-card" style={{ marginBottom: "14px" }}><div className="form-header"><h4>Post-trade Memo / 投后复盘纪要</h4><span className="badge info">{lastReview.agentReflection.mode}</span></div><p className="agent-output">{lastReview.agentReflection.text}</p></article> : null}
                <div className="stack-list">
                  {state.reviews.length ? state.reviews.slice(0, 6).map((item) => (
                    <article key={item.id} className="stack-item">
                      <strong>{item.positionName || "未命名复盘"} · {item.tradeAction || "review"}</strong>
                      <div className="card-meta"><span>Date/日期 {item.reviewDate || formatReviewDate(item.createdAt)}</span><span>Result/结果 {item.resultQuality || "-"}</span></div>
                      <p>{item.actionReview || item.reason || "暂无复盘内容"}</p>
                      <div className="chip-row">{(item.mistakeTags || []).map((tag) => <span key={tag} className="chip warning">{tag}</span>)}</div>
                    </article>
                  )) : <p className="save-status">先完成一次 Trade Review 和复盘，记录才会出现在这里。</p>}
                </div>
              </div>
              <div className="card">
                <div className="form-header"><h4>Behavior Profile / 行为画像</h4><span className="badge">{state.behaviorProfiles.length}</span></div>
                <div className="stack-list">
                  {state.behaviorProfiles.length ? state.behaviorProfiles.map((item) => (
                    <article key={item.id} className={`stack-item ${item.severity === "high" ? "warning" : ""}`}>
                      <strong>{item.profileName || item.profileKey}</strong>
                      <p>{item.profileSummary || "暂无画像摘要"}</p>
                      <div className="card-meta"><span>Signals/触发次数 {item.signalCount || 0}</span><span>Updated/更新 {fmt(item.updatedAt)}</span></div>
                    </article>
                  )) : <p className="save-status">行为画像骨架已就位。后续每次复盘会逐步累积你的错误模式。</p>}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
