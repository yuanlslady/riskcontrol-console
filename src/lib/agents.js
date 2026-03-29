import { normalizeImportedPositions, parseBrokerScreenshotResponse } from "./importers.js";
import { getSupabaseAccessToken, isSupabaseEnabled } from "./supabase.js";

const env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
const functionName = env.VITE_AGENT_FUNCTION_NAME || "investment-agent";
const supabaseUrl = env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || "";

export const isAgentApiEnabled = Boolean(isSupabaseEnabled && supabaseUrl && supabaseAnonKey && functionName);
export const isVisionImportEnabled = isAgentApiEnabled;

const ACTION_COPY = {
  block: { zh: "暂不执行", en: "Do Not Proceed", sentenceEn: "blocked from execution" },
  delay: { zh: "延后复核", en: "Delay and Reassess", sentenceEn: "delayed for further review" },
  proceed: { zh: "可以执行", en: "Proceed", sentenceEn: "approved to proceed" },
  review: { zh: "需要复核", en: "Review Required", sentenceEn: "flagged for review" },
};

const RISK_FLAG_COPY = {
  not_on_watchlist: {
    zh: "标的尚未进入观察名单，前置观察不足。",
    en: "The idea has not gone through the watchlist observation step.",
    nextZh: "先纳入观察池并完成观察期，再进入正式交易审查。",
    nextEn: "Add the idea to the watchlist and finish the observation window before execution.",
  },
  missing_invalidator: {
    zh: "退出条件或失效条件不清晰。",
    en: "Exit and invalidation conditions are still unclear.",
    nextZh: "补全失效条件，明确什么事实会推翻当前判断。",
    nextEn: "Define explicit invalidation conditions before taking the trade.",
  },
  missing_thesis: {
    zh: "当前交易缺少完整 thesis 支撑。",
    en: "The trade still lacks a complete thesis.",
    nextZh: "先写清 thesis、催化因素和验证路径。",
    nextEn: "Document the thesis, catalyst, and validation path before execution.",
  },
  non_competence_trade: {
    zh: "这笔交易偏离能力圈。",
    en: "The trade sits outside the current circle of competence.",
    nextZh: "先补研究或缩小仓位，避免超出认知边界。",
    nextEn: "Do more work or reduce size before trading outside the current edge.",
  },
  panic_sell_risk: {
    zh: "当前卖出决策可能受情绪扰动。",
    en: "The sell decision may be driven by emotion rather than process.",
    nextZh: "重新核对 thesis 是否失效，再决定是否执行。",
    nextEn: "Re-check whether the thesis is invalidated before acting.",
  },
  emotion_driven: {
    zh: "本次判断受到明显情绪影响。",
    en: "The current decision shows clear emotional pressure.",
    nextZh: "先降温，再回到既定规则做判断。",
    nextEn: "Pause, cool down, and return to the written process.",
  },
  chasing_risk: {
    zh: "存在追涨或冲动追价风险。",
    en: "There is a chasing-risk element in the setup.",
    nextZh: "回到计划价位和仓位边界，再考虑是否执行。",
    nextEn: "Return to planned entry levels and size limits before acting.",
  },
  large_reallocation: {
    zh: "这笔交易涉及较大幅度调仓。",
    en: "The trade involves a meaningful portfolio reallocation.",
    nextZh: "先做冷静期复核，再确认是否真的需要调仓。",
    nextEn: "Use a cooling-off review before committing to a large reallocation.",
  },
  overweight_position: {
    zh: "目标仓位接近或超过单一仓位上限。",
    en: "The target size is close to or above the single-position limit.",
    nextZh: "先压回仓位上限以内，再考虑执行。",
    nextEn: "Bring the size back within portfolio limits before execution.",
  },
  theme_concentration: {
    zh: "同主题敞口偏高，组合集中度上升。",
    en: "Theme exposure is already high and concentration risk is rising.",
    nextZh: "先核对组合集中度，再决定是否继续增加暴露。",
    nextEn: "Reassess portfolio concentration before adding more exposure.",
  },
};

function getActionCopy(action) {
  return ACTION_COPY[action] || { zh: "需要复核", en: "Review Required", sentenceEn: "flagged for review" };
}

function describeRiskFlags(flags, language) {
  if (!flags?.length) {
    return language === "zh" ? "当前未发现新增纪律风险。" : "No additional discipline risks were identified.";
  }

  return flags
    .map((flag) => {
      const copy = RISK_FLAG_COPY[flag];
      if (!copy) return language === "zh" ? `需进一步核查 ${flag}` : `Further review needed for ${flag}`;
      return language === "zh" ? copy.zh : copy.en;
    })
    .join(language === "zh" ? "；" : "; ");
}

function buildNextStepFromFlags(flags, language) {
  const steps = (flags || [])
    .map((flag) => {
      const copy = RISK_FLAG_COPY[flag];
      if (!copy) return null;
      return language === "zh" ? copy.nextZh : copy.nextEn;
    })
    .filter(Boolean);

  if (!steps.length) {
    return language === "zh" ? "继续按既定计划执行，并保留复核记录。" : "Proceed with the written plan and keep the review record on file.";
  }

  return Array.from(new Set(steps)).join(language === "zh" ? "；" : "; ");
}

function buildPreTradeFallback(input) {
  const { position, reviewResult, watchlist } = input;
  const inWatchlist = watchlist.some((item) => item.ticker === position.ticker);
  const action = getActionCopy(reviewResult.finalAction);
  const observationZh = inWatchlist ? "标的已在观察名单内，可继续完成交易前复核。" : "标的尚未进入观察名单，应先观察、后交易。";
  const observationEn = inWatchlist
    ? "The name is already on the watchlist and can move through pre-trade review."
    : "The name is not yet on the watchlist and should be observed before execution.";
  const riskSummaryZh = describeRiskFlags(reviewResult.riskFlags, "zh");
  const riskSummaryEn = describeRiskFlags(reviewResult.riskFlags, "en");
  const nextStepZh = reviewResult.requiredNextStep || buildNextStepFromFlags(reviewResult.riskFlags, "zh");
  const nextStepEn = buildNextStepFromFlags(reviewResult.riskFlags, "en");

  return {
    mode: "local",
    text: [
      "Investment Committee Pre-trade Memo / 投前纪要",
      `标的 / Ticker: ${position.ticker || "unknown"}${position.name ? ` ${position.name}` : ""}`,
      `投资结论 / Investment Conclusion: ${action.zh} / ${action.en}`,
      `纪律分 / Discipline Score: ${reviewResult.disciplineScore}`,
      `观察状态 / Observation Status: ${observationZh} / ${observationEn}`,
      `核心依据 / Core Basis: ${reviewResult.why}`,
      "关键风险 / Key Risks:",
      `中文：${riskSummaryZh}`,
      `English: ${riskSummaryEn}`,
      "下一步动作 / Next Step:",
      `中文：${nextStepZh}`,
      `English: ${nextStepEn}`,
    ].join("\n"),
  };
}

function buildPostTradeFallback(input) {
  const { reviewInput, reviewResult, memoryDraft } = input;
  const action = getActionCopy(reviewResult.finalAction);
  const riskSummaryZh = describeRiskFlags(reviewResult.riskFlags, "zh");
  const riskSummaryEn = describeRiskFlags(reviewResult.riskFlags, "en");
  const reasonZh = `本次交易被${action.zh}，核心原因是：${riskSummaryZh}`;
  const reasonEn = `This trade was ${action.sentenceEn} because ${riskSummaryEn}`;
  const lessonZh = buildNextStepFromFlags(reviewResult.riskFlags, "zh");
  const lessonEn = buildNextStepFromFlags(reviewResult.riskFlags, "en");

  return {
    mode: "local",
    text: [
      "Investment Committee Post-trade Memo / 投后复盘纪要",
      `操作回顾 / Trade Action: ${reviewInput.tradeAction}`,
      `执行结论 / Review Status: ${action.zh} / ${action.en}`,
      `核心依据 / Core Basis: ${reviewResult.why}`,
      "原因归纳 / Core Reason:",
      `中文：${reasonZh}`,
      `English: ${reasonEn}`,
      "后续改进 / Improvement Focus:",
      `中文：${memoryDraft.lesson || lessonZh}`,
      `English: ${lessonEn}`,
    ].join("\n"),
    suggestedReason: memoryDraft.reason
      ? `原因归纳 / Core Reason\n中文：${memoryDraft.reason}\nEnglish: Review why this happened and connect it back to the written process.`
      : `原因归纳 / Core Reason\n中文：${reasonZh}\nEnglish: ${reasonEn}`,
    suggestedTags: reviewResult.riskFlags.length ? reviewResult.riskFlags : ["needs review"],
    suggestedLesson: memoryDraft.lesson
      ? `复盘教训 / Lesson\n中文：${memoryDraft.lesson}\nEnglish: Turn this lesson into a repeatable execution rule.`
      : `复盘教训 / Lesson\n中文：${reviewResult.requiredNextStep || lessonZh}\nEnglish: ${lessonEn}`,
  };
}

async function invokeAgentFunction(action, payload) {
  return invokeAgentFunctionOnce(action, payload, false);
}

async function invokeAgentFunctionOnce(action, payload, forceRefreshToken) {
  if (!supabaseUrl || !supabaseAnonKey || !functionName) {
    throw new Error("Agent Edge Function is not configured.");
  }

  const accessToken = await getSupabaseAccessToken({ forceRefresh: forceRefreshToken });
  if (!accessToken) {
    throw new Error("Cloud session missing. Please sign in again before using the Edge Function.");
  }

  let response;
  try {
    response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action, payload }),
    });
  } catch (error) {
    throw new Error(normalizeFunctionErrorMessage(error?.message || "Agent Edge Function request failed."));
  }

  if (!response.ok) {
    const message = await extractResponseErrorMessage(response);
    if (!forceRefreshToken && isJwtErrorMessage(message)) {
      return invokeAgentFunctionOnce(action, payload, true);
    }

    throw new Error(message);
  }

  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isJwtErrorMessage(message) {
  return message === "Invalid JWT" || message === "Cloud session expired or invalid. Please sign out and sign in again.";
}

function normalizeFunctionErrorMessage(message) {
  if (message === "Invalid JWT") {
    return "Cloud session expired or invalid. Please sign out and sign in again.";
  }

  if (message === "Failed to send a request to the Edge Function") {
    return "Screenshot payload was too large or the function relay rejected the request. Crop tighter around the holdings table, then try again.";
  }

  return message;
}

async function extractResponseErrorMessage(response) {
  try {
    const parsed = await response.clone().json();
    const detail = parsed?.error || parsed?.message;
    if (detail) return normalizeFunctionErrorMessage(detail);
  } catch {
    // Fall through to text body parsing.
  }

  try {
    const text = await response.clone().text();
    if (text) return normalizeFunctionErrorMessage(text);
  } catch {
    // Ignore body parse failures.
  }

  return normalizeFunctionErrorMessage(`Edge Function request failed with status ${response.status}.`);
}

export async function generatePreTradeAssessment(input) {
  if (!isAgentApiEnabled) return buildPreTradeFallback(input);

  try {
    const data = await invokeAgentFunction("generate_pre_trade_assessment", input);
    return {
      mode: data?.mode || "edge",
      text: data?.text || buildPreTradeFallback(input).text,
    };
  } catch {
    return buildPreTradeFallback(input);
  }
}

export async function generatePostTradeReflection(input) {
  if (!isAgentApiEnabled) return buildPostTradeFallback(input);

  try {
    const data = await invokeAgentFunction("generate_post_trade_reflection", input);
    return {
      mode: data?.mode || "edge",
      text: data?.text || buildPostTradeFallback(input).text,
      suggestedReason: data?.suggestedReason || input.memoryDraft.reason || "",
      suggestedTags: Array.isArray(data?.suggestedTags) ? data.suggestedTags : input.reviewResult.riskFlags || [],
      suggestedLesson: data?.suggestedLesson || input.memoryDraft.lesson || input.reviewResult.requiredNextStep || "",
    };
  } catch {
    return buildPostTradeFallback(input);
  }
}

export async function importBrokerPositionsFromImage(imageDataUrl, options = {}) {
  if (!isVisionImportEnabled) {
    throw new Error("Screenshot import needs Supabase Edge Function support.");
  }

  const imageDataUrls = Array.isArray(imageDataUrl) ? imageDataUrl.filter(Boolean) : [imageDataUrl].filter(Boolean);
  const data = await invokeAgentFunction("import_positions_from_image", {
    imageDataUrl: imageDataUrls[0] || "",
    imageDataUrls,
    options,
  });

  const parsed = parseBrokerScreenshotResponse(data);
  return {
    totalPortfolioAmount: parsed.totalPortfolioAmount ?? options.totalPortfolioAmount ?? "",
    positions: normalizeImportedPositions(parsed.positions, {
      totalPortfolioAmount: parsed.totalPortfolioAmount ?? options.totalPortfolioAmount,
    }),
  };
}
