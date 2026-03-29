const STATUS_COPY = {
  aligned: "一致",
  conflict: "有冲突",
  missing: "未引用",
  complete: "完整",
  incomplete: "不完整",
};

function normalizeWeight(value) {
  const numeric = Number(String(value ?? "").replace(/[,%$\s]/g, "")) || 0;
  return numeric > 1 ? numeric / 100 : numeric;
}

function buildResult(status, title, detail) {
  return {
    status,
    label: STATUS_COPY[status] || status,
    title,
    detail,
  };
}

function evaluateMacroAlignment(macroFramework, action, targetWeightAfterTrade) {
  if (!macroFramework?.summary && !macroFramework?.marketStance) {
    return buildResult("missing", "宏观一致性", "当前交易没有引用明确的宏观框架。");
  }

  const stance = macroFramework.marketStance || "balanced";
  const isRiskAdding = ["buy", "add"].includes(action);
  const targetWeight = normalizeWeight(targetWeightAfterTrade);

  if (stance === "defensive" && isRiskAdding && targetWeight >= 0.05) {
    return buildResult("conflict", "宏观一致性", "当前宏观框架偏防守，这笔交易仍在增加风险暴露。");
  }

  if (stance === "balanced" && isRiskAdding && targetWeight >= 0.15) {
    return buildResult("conflict", "宏观一致性", "当前宏观框架偏均衡，这笔交易的目标仓位偏激进。");
  }

  return buildResult("aligned", "宏观一致性", "这笔交易与当前宏观框架没有明显冲突。");
}

function evaluateIndustryAlignment(industryView, action, targetPositionType) {
  if (!industryView) {
    return buildResult("missing", "产业一致性", "当前交易没有绑定明确的产业判断。");
  }

  const isRiskAdding = ["buy", "add"].includes(action);
  if (industryView.status === "headwind" && isRiskAdding) {
    return buildResult("conflict", "产业一致性", "当前产业判断为逆风，不支持继续增加风险暴露。");
  }

  if (industryView.status === "observe" && isRiskAdding && targetPositionType === "core_midterm") {
    return buildResult("conflict", "产业一致性", "当前产业仍处于观察状态，不适合直接建立核心仓位。");
  }

  return buildResult("aligned", "产业一致性", "这笔交易与当前产业判断基本一致。");
}

function evaluateThesisCompleteness(position, reviewForm, industryView) {
  const thesisText = String(reviewForm?.thesisReference || position?.entryReasonSummary || "").trim();
  const invalidationText = String(reviewForm?.wrongIf || position?.exitInvalidatorsSummary || "").trim();

  const missing = [];
  if (!industryView) missing.push("产业判断");
  if (!thesisText) missing.push("thesis");
  if (!invalidationText) missing.push("失效条件");

  if (!missing.length) {
    return buildResult("complete", "个股依据完整性", "已具备产业锚点、个股 thesis 和失效条件。");
  }

  return buildResult("incomplete", "个股依据完整性", `当前仍缺少：${missing.join("、")}。`);
}

export function evaluateTopdownReview({ macroFramework, industryView, position, reviewForm }) {
  const action = reviewForm?.tradeAction || "hold";
  const targetPositionType = reviewForm?.targetPositionType || position?.positionType || "core_midterm";
  const targetWeightAfterTrade = reviewForm?.targetWeightAfterTrade || position?.portfolioWeight || 0;

  return {
    macroAlignment: evaluateMacroAlignment(macroFramework, action, targetWeightAfterTrade),
    industryAlignment: evaluateIndustryAlignment(industryView, action, targetPositionType),
    thesisCompleteness: evaluateThesisCompleteness(position, reviewForm, industryView),
  };
}
