const STORAGE_KEY = "portfolio-control-v2";
const WATCHLIST_COOLDOWN_DAYS = 7;
const EVENT_LIMIT = 12;

const defaultState = {
  constitution: {
    goal: "减少重大错误，在波动里不破坏原有逻辑。",
    style: "产业趋势驱动的中线持有，少量熟悉标的波段处理。",
    competence: "能独立说清赚钱机制、关键变量、风险与未来 6-12 个月验证指标，才算能力圈内。",
    bans: "无 thesis 建仓；无失效条件长期持有；非能力圈连续加仓；为了回本继续持有。",
    coreMax: 15,
    probeMax: 5,
    themeMax: 30,
    cooldownMinutes: 30,
  },
  rules: {
    nonCompetenceMaxDays: 7,
    singlePositionWarn: 15,
    themeWarn: 30,
    largeReallocation: 5,
    allowInstrumentMismatch: true,
    missingTargetWeightAction: "warn",
  },
  positions: [],
  watchlist: [],
  reviews: [],
  lastReview: null,
  memoryDraft: null,
  importDrafts: [],
  events: [],
};

let state = loadState();
let editingPositionId = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    return mergeState(JSON.parse(raw));
  } catch {
    return structuredClone(defaultState);
  }
}

function mergeState(data) {
  return {
    constitution: { ...defaultState.constitution, ...(data.constitution || {}) },
    rules: { ...defaultState.rules, ...(data.rules || {}) },
    positions: Array.isArray(data.positions) ? data.positions : [],
    watchlist: Array.isArray(data.watchlist) ? data.watchlist : [],
    reviews: Array.isArray(data.reviews) ? data.reviews : [],
    lastReview: data.lastReview || null,
    memoryDraft: data.memoryDraft || null,
    importDrafts: Array.isArray(data.importDrafts) ? data.importDrafts : [],
    events: Array.isArray(data.events) ? data.events : [],
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  q("saveStatus").textContent = `已保存到本地：${formatDateTime(new Date().toISOString())}`;
}

function q(id) {
  return document.getElementById(id);
}

function initTabs() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });
}

function activateTab(tab) {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tab}`);
  });
}

function bindTopActions() {
  q("saveAllButton").addEventListener("click", () => {
    syncFormsToState();
    saveState();
    renderDashboard();
  });

  q("exportButton").addEventListener("click", () => {
    syncFormsToState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "portfolio-control-export.json";
    link.click();
    URL.revokeObjectURL(url);
  });

  q("seedButton").addEventListener("click", () => {
    loadDemoState();
    renderAll();
    saveState();
  });
}

function bindConstitution() {
  [
    "constitutionGoal",
    "constitutionStyle",
    "constitutionCompetence",
    "constitutionBans",
    "constitutionCoreMax",
    "constitutionProbeMax",
    "constitutionThemeMax",
    "constitutionCooldown",
  ].forEach((id) => q(id).addEventListener("change", syncFormsToState));
}

function bindRules() {
  [
    "ruleNonCompetenceDays",
    "ruleSinglePositionWarn",
    "ruleThemeWarn",
    "ruleLargeReallocation",
    "ruleAllowInstrumentMismatch",
    "ruleMissingTargetWeightAction",
  ].forEach((id) => q(id).addEventListener("change", syncFormsToState));
}

function bindImportTools() {
  q("importScreenshot").addEventListener("change", handleScreenshotPreview);
  q("parseImportButton").addEventListener("click", () => {
    state.importDrafts = parsePositionBatch(q("importText").value.trim()).map((draft) => ({
      ...draft,
      draftId: crypto.randomUUID(),
    }));
    renderImportDrafts();
    q("importPreview").className = "import-preview";
    q("importPreview").innerHTML = state.importDrafts.length
      ? `<strong>已识别 ${state.importDrafts.length} 条草稿</strong><p>可以逐条填入表单，或者批量导入到台账。</p>`
      : "没有识别出可用字段，请补充代码、名称、成本、现价或持股数。";
    saveState();
  });
  q("importAllDraftsButton").addEventListener("click", importAllDrafts);
}

function bindPositionForm() {
  q("positionForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const position = {
      id: editingPositionId || crypto.randomUUID(),
      ticker: q("positionTicker").value.trim().toUpperCase(),
      name: q("positionName").value.trim(),
      market: q("positionMarket").value,
      instrumentType: q("positionInstrumentType").value,
      positionType: q("positionType").value,
      circleClass: q("positionCircleClass").value,
      inCompetenceCircle: q("positionCompetence").value === "true",
      swingAllowed: q("positionSwingAllowed").value === "true",
      shares: num(q("positionShares").value),
      avgCost: num(q("positionAvgCost").value),
      lastPrice: num(q("positionLastPrice").value),
      portfolioWeight: percentToRatio(q("positionWeight").value),
      maxWeightAllowed: percentToRatio(q("positionMaxWeight").value),
      plannedHoldingDays: intOrNull(q("positionHoldingDays").value),
      openedAt: q("positionOpenedAt").value || null,
      thesisHorizonLabel: q("positionThesisHorizon").value,
      instrumentStructureNote: q("positionInstrumentNote").value.trim(),
      entryReasonSummary: q("positionEntryReason").value.trim(),
      exitInvalidatorsSummary: q("positionInvalidator").value.trim(),
    };

    const existingIndex = state.positions.findIndex((item) => item.id === position.id);
    if (existingIndex >= 0) {
      state.positions[existingIndex] = position;
      logEvent("position", "info", `${position.ticker} 持仓已更新`, "持仓台账已同步最新参数。", position.ticker);
    } else {
      state.positions.unshift(position);
      logEvent("position", "info", `${position.ticker} 加入持仓台账`, "新增持仓已进入后续纪律审查范围。", position.ticker);
    }

    editingPositionId = null;
    resetPositionForm();
    renderAll();
    saveState();
  });

  q("resetPositionButton").addEventListener("click", () => {
    editingPositionId = null;
    resetPositionForm();
  });
}

function bindWatchlistForm() {
  q("watchlistForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const ticker = q("watchlistTicker").value.trim().toUpperCase();
    if (!ticker) return;

    const existing = findWatchlistItem(ticker);
    const item = {
      id: existing?.id || crypto.randomUUID(),
      ticker,
      name: q("watchlistName").value.trim(),
      market: q("watchlistMarket").value,
      source: q("watchlistSource").value,
      thesis: q("watchlistThesis").value.trim(),
      catalyst: q("watchlistCatalyst").value.trim(),
      addedAt: existing?.addedAt || new Date().toISOString(),
      status: "watching",
    };

    if (existing) {
      state.watchlist = state.watchlist.map((entry) => (entry.id === existing.id ? item : entry));
      logEvent("watchlist", "info", `${ticker} 观察条目已更新`, "thesis 或催化信号已补充。", ticker);
    } else {
      state.watchlist.unshift(item);
      logEvent("watchlist", "warning", `${ticker} 进入观察池`, `开始计算 ${WATCHLIST_COOLDOWN_DAYS} 天冷静期。`, ticker);
    }

    q("watchlistForm").reset();
    q("watchlistMarket").value = "HK";
    q("watchlistSource").value = "manual";
    renderAll();
    saveState();
  });
}

function bindReviewForm() {
  q("reviewTradeAction").addEventListener("change", updateReviewMode);
  q("reviewPositionSelect").addEventListener("change", updateReviewMode);

  q("parseReviewTextButton").addEventListener("click", () => {
    const parsed = parseReviewNarrative(q("reviewNaturalLanguage").value.trim());
    if (!parsed) return;
    q("reviewTradeAction").value = parsed.tradeAction;
    q("reviewTriggerType").value = parsed.triggerType;
    q("reviewEmotionRisk").value = parsed.emotionRisk;
    q("reviewWhyNow").value = parsed.whyNow;
    q("reviewWhatChanged").value = parsed.whatChanged;
    q("reviewWrongIf").value = parsed.wrongIf;
    q("reviewHoldingPlan").value = parsed.holdingPlanAfterTrade;
    q("reviewAlternativeAction").value = parsed.alternativeAction;
    updateReviewMode();
  });

  q("loadReviewDemoButton").addEventListener("click", loadReviewDemo);

  q("reviewForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const selectedId = q("reviewPositionSelect").value;
    const input = {
      tradeAction: q("reviewTradeAction").value,
      targetWeightAfterTrade: ratioOrNull(q("reviewTargetWeight").value),
      emotionRisk: q("reviewEmotionRisk").value,
      triggerType: q("reviewTriggerType").value,
      thesisStatus: q("reviewThesisStatus").value,
      whyNow: q("reviewWhyNow").value.trim(),
      whatChanged: q("reviewWhatChanged").value.trim(),
      wrongIf: q("reviewWrongIf").value.trim(),
      holdingPlanAfterTrade: q("reviewHoldingPlan").value.trim(),
      alternativeAction: q("reviewAlternativeAction").value.trim(),
    };

    const position =
      selectedId === "__new__"
        ? buildNewReviewPosition(input)
        : state.positions.find((item) => item.id === selectedId);

    if (!position) {
      renderReviewResult({
        disciplineScore: 0,
        matchedRules: [],
        riskFlags: ["missing_position"],
        finalAction: "block",
        requiredNextStep: "请先在持仓台账里建立至少一条持仓，或使用新建仓模式。",
        why: "当前没有可审查的标的。",
      });
      return;
    }

    const result = runReview(position, input, state.rules, state.watchlist);
    state.lastReview = {
      createdAt: new Date().toISOString(),
      positionId: position.id,
      positionName: `${position.ticker} ${position.name || ""}`.trim(),
      input,
      result,
    };

    logEvent(
      "review",
      result.finalAction === "block" ? "danger" : result.finalAction === "delay" ? "warning" : "info",
      `${position.ticker} 审查结论：${toChineseFinalAction(result.finalAction)}`,
      result.why,
      position.ticker
    );

    renderAll();
    renderReviewResult(result);
    saveState();
  });

  q("pushToMemoryButton").addEventListener("click", pushLastReviewToMemoryDraft);
}

function bindMemoryForm() {
  q("memoryForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const record = {
      id: crypto.randomUUID(),
      positionId: q("memoryPositionSelect").value,
      tradeAction: q("memoryTradeAction").value,
      resultQuality: q("memoryResultQuality").value,
      followedAgent: q("memoryFollowedAgent").value === "true",
      reason: q("memoryReason").value.trim(),
      mistakeTags: q("memoryMistakeTags")
        .value.split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      lesson: q("memoryLesson").value.trim(),
      createdAt: new Date().toISOString(),
    };

    state.reviews.unshift(record);
    state.memoryDraft = null;
    q("memoryForm").reset();
    logEvent("memory", "info", "新增一条复盘记录", "交易复盘已进入记忆模块。");
    renderAll();
    saveState();
  });
}

function syncFormsToState() {
  state.constitution = {
    goal: q("constitutionGoal").value.trim(),
    style: q("constitutionStyle").value.trim(),
    competence: q("constitutionCompetence").value.trim(),
    bans: q("constitutionBans").value.trim(),
    coreMax: num(q("constitutionCoreMax").value),
    probeMax: num(q("constitutionProbeMax").value),
    themeMax: num(q("constitutionThemeMax").value),
    cooldownMinutes: intOrNull(q("constitutionCooldown").value) ?? 30,
  };

  state.rules = {
    nonCompetenceMaxDays: intOrNull(q("ruleNonCompetenceDays").value) ?? 7,
    singlePositionWarn: num(q("ruleSinglePositionWarn").value) ?? 15,
    themeWarn: num(q("ruleThemeWarn").value) ?? 30,
    largeReallocation: num(q("ruleLargeReallocation").value) ?? 5,
    allowInstrumentMismatch: q("ruleAllowInstrumentMismatch").value === "true",
    missingTargetWeightAction: q("ruleMissingTargetWeightAction").value,
  };
}

function renderAll() {
  renderConstitution();
  renderRules();
  renderPositions();
  renderWatchlist();
  renderReviewSelects();
  renderMemory();
  renderImportDrafts();
  renderDashboard();
  renderMemoryDraft();
  if (state.lastReview) renderReviewResult(state.lastReview.result);
  updateReviewMode();
}

function renderConstitution() {
  q("constitutionGoal").value = state.constitution.goal || "";
  q("constitutionStyle").value = state.constitution.style || "";
  q("constitutionCompetence").value = state.constitution.competence || "";
  q("constitutionBans").value = state.constitution.bans || "";
  q("constitutionCoreMax").value = state.constitution.coreMax ?? "";
  q("constitutionProbeMax").value = state.constitution.probeMax ?? "";
  q("constitutionThemeMax").value = state.constitution.themeMax ?? "";
  q("constitutionCooldown").value = state.constitution.cooldownMinutes ?? "";
}

function renderRules() {
  q("ruleNonCompetenceDays").value = state.rules.nonCompetenceMaxDays ?? "";
  q("ruleSinglePositionWarn").value = state.rules.singlePositionWarn ?? "";
  q("ruleThemeWarn").value = state.rules.themeWarn ?? "";
  q("ruleLargeReallocation").value = state.rules.largeReallocation ?? "";
  q("ruleAllowInstrumentMismatch").value = String(state.rules.allowInstrumentMismatch);
  q("ruleMissingTargetWeightAction").value = state.rules.missingTargetWeightAction;
}

function renderPositions() {
  q("positionsCount").textContent = `${state.positions.length} 条`;
  const container = q("positionsList");
  container.innerHTML = "";

  if (!state.positions.length) {
    container.innerHTML = `<p class="save-status">还没有持仓，先录入 3-5 个最重要的标的。</p>`;
    return;
  }

  state.positions.forEach((position) => {
    const pnl = computePositionPnlPercent(position);
    const card = document.createElement("article");
    card.className = "position-card";
    card.innerHTML = `
      <h5>${escapeHtml(position.ticker)} ${position.name ? `· ${escapeHtml(position.name)}` : ""}</h5>
      <div class="card-meta">
        <span>${escapeHtml(position.market)}</span>
        <span>${escapeHtml(position.positionType)}</span>
        <span>${escapeHtml(position.instrumentType)}</span>
        <span>仓位 ${formatPercent(position.portfolioWeight)}</span>
      </div>
      <div class="chip-row">
        <span class="chip ${position.inCompetenceCircle ? "safe" : "warning"}">${position.inCompetenceCircle ? "能力圈内" : "能力圈外"}</span>
        <span class="chip">${escapeHtml(position.thesisHorizonLabel || "n/a")}</span>
        <span class="chip ${pnl <= -20 ? "danger" : pnl >= 10 ? "safe" : ""}">浮盈亏 ${pnl.toFixed(1)}%</span>
      </div>
      <div class="position-actions">
        <button class="button button-secondary" data-edit-position="${position.id}">编辑</button>
        <button class="button button-ghost" data-delete-position="${position.id}">删除</button>
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll("[data-edit-position]").forEach((button) => {
    button.addEventListener("click", () => editPosition(button.dataset.editPosition));
  });
  container.querySelectorAll("[data-delete-position]").forEach((button) => {
    button.addEventListener("click", () => deletePosition(button.dataset.deletePosition));
  });
}

function renderWatchlist() {
  q("watchlistCount").textContent = `${state.watchlist.length} 条`;
  const container = q("watchlistList");
  container.innerHTML = "";

  if (!state.watchlist.length) {
    container.innerHTML = `<p class="save-status">观察池为空。把你想研究但还不该立刻买的标的放进来。</p>`;
    return;
  }

  state.watchlist.forEach((item) => {
    const cooling = daysSince(item.addedAt) < WATCHLIST_COOLDOWN_DAYS;
    const daysLeft = Math.max(0, WATCHLIST_COOLDOWN_DAYS - daysSince(item.addedAt));
    const card = document.createElement("article");
    card.className = "watch-item";
    card.innerHTML = `
      <h5>${escapeHtml(item.ticker)} ${item.name ? `· ${escapeHtml(item.name)}` : ""}</h5>
      <div class="card-meta">
        <span>${escapeHtml(item.market)}</span>
        <span>来源 ${escapeHtml(item.source)}</span>
        <span>加入于 ${formatDate(item.addedAt)}</span>
      </div>
      <div class="chip-row">
        <span class="chip ${cooling ? "warning" : "safe"}">${cooling ? `冷静期剩余 ${daysLeft} 天` : "可进入审查"}</span>
      </div>
      <p>${escapeHtml(item.thesis || "尚未填写 thesis。")}</p>
      <p class="helper">${escapeHtml(item.catalyst || "尚未填写催化或验证信号。")}</p>
      <div class="position-actions">
        <button class="button button-secondary" data-review-watchlist="${item.ticker}">去做审查</button>
        <button class="button button-ghost" data-delete-watchlist="${item.id}">移出观察池</button>
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll("[data-delete-watchlist]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = state.watchlist.find((entry) => entry.id === button.dataset.deleteWatchlist);
      state.watchlist = state.watchlist.filter((entry) => entry.id !== button.dataset.deleteWatchlist);
      if (item) logEvent("watchlist", "info", `${item.ticker} 已移出观察池`, "该标的不再处于观察状态。", item.ticker);
      renderAll();
      saveState();
    });
  });

  container.querySelectorAll("[data-review-watchlist]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = findWatchlistItem(button.dataset.reviewWatchlist);
      if (!item) return;
      activateTab("review");
      q("reviewPositionSelect").value = "__new__";
      q("reviewTradeAction").value = "buy";
      q("reviewNewTicker").value = item.ticker;
      q("reviewNewName").value = item.name || "";
      q("reviewNewMarket").value = item.market || "HK";
      q("reviewWhyNow").value = item.thesis || "";
      q("reviewWhatChanged").value = item.catalyst || "";
      updateReviewMode();
    });
  });
}

function renderImportDrafts() {
  const root = q("importDrafts");
  root.innerHTML = "";
  if (!state.importDrafts.length) return;

  state.importDrafts.forEach((draft) => {
    const item = document.createElement("article");
    item.className = "draft-item";
    item.innerHTML = `
      <h5>${escapeHtml(draft.ticker || "未知代码")} ${draft.name ? `· ${escapeHtml(draft.name)}` : ""}</h5>
      <div class="chip-row">
        ${draft.avgCost !== null ? `<span class="chip">成本 ${draft.avgCost}</span>` : ""}
        ${draft.lastPrice !== null ? `<span class="chip">现价 ${draft.lastPrice}</span>` : ""}
        ${draft.shares !== null ? `<span class="chip">持股 ${draft.shares}</span>` : ""}
        ${draft.portfolioWeight !== null ? `<span class="chip">仓位 ${draft.portfolioWeight}%</span>` : ""}
      </div>
      <div class="position-actions">
        <button class="button button-secondary" data-apply-draft="${draft.draftId}">填入表单</button>
        <button class="button button-ghost" data-import-draft="${draft.draftId}">导入台账</button>
      </div>
    `;
    root.appendChild(item);
  });

  root.querySelectorAll("[data-apply-draft]").forEach((button) => {
    button.addEventListener("click", () => {
      const draft = state.importDrafts.find((item) => item.draftId === button.dataset.applyDraft);
      if (draft) applyPositionDraft(draft);
    });
  });

  root.querySelectorAll("[data-import-draft]").forEach((button) => {
    button.addEventListener("click", () => importDraftToLedger(button.dataset.importDraft));
  });
}

function renderReviewSelects() {
  const reviewSelect = q("reviewPositionSelect");
  reviewSelect.innerHTML = `<option value="__new__">新建仓（持仓为空）</option>`;
  state.positions.forEach((position) => {
    const option = document.createElement("option");
    option.value = position.id;
    option.textContent = `${position.ticker} ${position.name || ""}`.trim();
    reviewSelect.appendChild(option);
  });

  const memorySelect = q("memoryPositionSelect");
  memorySelect.innerHTML = "";
  if (!state.positions.length) {
    memorySelect.innerHTML = `<option value="">请先录入持仓</option>`;
  } else {
    state.positions.forEach((position) => {
      const option = document.createElement("option");
      option.value = position.id;
      option.textContent = `${position.ticker} ${position.name || ""}`.trim();
      memorySelect.appendChild(option);
    });
  }
}

function renderReviewResult(result) {
  q("reviewActionBadge").textContent = toChineseFinalAction(result.finalAction || "review");
  q("reviewActionBadge").className = `badge ${badgeTone(result.finalAction)}`;
  q("reviewResult").innerHTML = `
    <div class="result-grid">
      <div class="result-card">
        <div class="result-row">
          <span class="result-label">纪律分</span>
          <strong>${result.disciplineScore ?? 0}</strong>
        </div>
        <div class="result-row">
          <span class="result-label">结论</span>
          <strong>${escapeHtml(toChineseFinalAction(result.finalAction || "review"))}</strong>
        </div>
      </div>
      <div class="result-card">
        <div class="result-row">
          <span class="result-label">风险标签</span>
          <div class="chip-row">${(result.riskFlags || [])
            .map((flag) => `<span class="chip warning">${escapeHtml(toChineseRiskFlag(flag))}</span>`)
            .join("") || `<span class="chip safe">无</span>`}</div>
        </div>
      </div>
      <div class="result-card">
        <div class="result-row">
          <span class="result-label">命中规则</span>
          <div class="chip-row">${(result.matchedRules || [])
            .map((rule) => `<span class="chip ${chipTone(rule.level)}">${escapeHtml(toChineseRuleText(rule))}</span>`)
            .join("") || `<span class="chip safe">无</span>`}</div>
        </div>
      </div>
      <div class="result-card">
        <div class="result-row">
          <span class="result-label">下一步</span>
          <p>${escapeHtml(result.requiredNextStep || "")}</p>
        </div>
        <div class="result-row">
          <span class="result-label">为什么</span>
          <p>${escapeHtml(result.why || "")}</p>
        </div>
      </div>
    </div>
  `;

  if (result.reviewCard) {
    q("reviewDraftCard").classList.remove("hidden");
    q("reviewDraftCard").innerHTML = `
      <div class="draft-sections">
        <section class="draft-section">
          <h5>当时逻辑</h5>
          <p>${escapeHtml(result.reviewCard.logic)}</p>
        </section>
        <section class="draft-section">
          <h5>风险点</h5>
          <p>${escapeHtml(result.reviewCard.risks)}</p>
        </section>
        <section class="draft-section">
          <h5>Agent 提示</h5>
          <p>${escapeHtml(result.reviewCard.agentHint)}</p>
        </section>
        <section class="draft-section">
          <h5>下一次怎么改</h5>
          <p>${escapeHtml(result.reviewCard.improvement)}</p>
        </section>
      </div>
    `;
  } else {
    q("reviewDraftCard").classList.add("hidden");
    q("reviewDraftCard").innerHTML = "";
  }
}

function renderMemory() {
  q("memoryCount").textContent = `${state.reviews.length} 条`;
  const container = q("memoryList");
  container.innerHTML = "";

  if (!state.reviews.length) {
    container.innerHTML = `<p class="save-status">还没有复盘记录。</p>`;
    return;
  }

  state.reviews.forEach((review) => {
    const position = state.positions.find((item) => item.id === review.positionId);
    const card = document.createElement("article");
    card.className = "memory-card";
    card.innerHTML = `
      <h5>${escapeHtml(position ? `${position.ticker} ${position.name || ""}` : "未关联持仓")}</h5>
      <div class="memory-meta">
        <span>${escapeHtml(review.tradeAction)}</span>
        <span>${escapeHtml(review.resultQuality)}</span>
        <span>${review.followedAgent ? "执行了 Agent" : "没有执行 Agent"}</span>
        <span>${formatDate(review.createdAt)}</span>
      </div>
      <div class="chip-row">${review.mistakeTags
        .map((tag) => `<span class="chip danger">${escapeHtml(toChineseRiskFlag(tag))}</span>`)
        .join("")}</div>
      <p>${escapeHtml(review.reason || "")}</p>
      <p class="helper">${escapeHtml(review.lesson || "")}</p>
    `;
    container.appendChild(card);
  });
}

function renderMemoryDraft() {
  if (!state.memoryDraft) {
    q("memoryDraftNotice").classList.add("hidden");
    return;
  }

  q("memoryDraftNotice").classList.remove("hidden");
  q("memoryPositionSelect").value = state.memoryDraft.positionId || "";
  q("memoryTradeAction").value = state.memoryDraft.tradeAction || "hold";
  q("memoryResultQuality").value = state.memoryDraft.resultQuality || "bad_process_good_outcome";
  q("memoryFollowedAgent").value = String(state.memoryDraft.followedAgent ?? false);
  q("memoryReason").value = state.memoryDraft.reason || "";
  q("memoryMistakeTags").value = (state.memoryDraft.mistakeTags || []).join(", ");
  q("memoryLesson").value = state.memoryDraft.lesson || "";
}

function renderDashboard() {
  const model = buildDashboardModel();
  q("heroActiveAlerts").textContent = String(model.highPriorityAlerts);
  q("heroWatchlistCount").textContent = String(state.watchlist.length);
  q("heroLastReview").textContent = state.lastReview ? formatDateTime(state.lastReview.createdAt) : "未运行";

  q("dashboardHealthBadge").textContent = model.healthLabel;
  q("dashboardHealthBadge").className = `badge ${model.healthTone}`;

  q("dashboardSummaryCards").innerHTML = `
    <div class="summary-card">
      <span class="result-label">持仓数</span>
      <strong>${state.positions.length}</strong>
      <p>${formatPercent(model.totalWeight)} 已登记仓位</p>
    </div>
    <div class="summary-card">
      <span class="result-label">观察池</span>
      <strong>${state.watchlist.length}</strong>
      <p>${model.coolingCount} 个仍在冷静期</p>
    </div>
    <div class="summary-card">
      <span class="result-label">复盘记录</span>
      <strong>${state.reviews.length}</strong>
      <p>${model.badProcessCount} 条坏过程</p>
    </div>
    <div class="summary-card">
      <span class="result-label">超限仓位</span>
      <strong>${model.overweightCount}</strong>
      <p>${model.drawdownCount} 个深度回撤标的</p>
    </div>
  `;

  q("dashboardDisciplineSnapshot").innerHTML = `
    <strong>当前状态</strong>
    <p>${escapeHtml(model.snapshot)}</p>
  `;

  q("dashboardAlertList").innerHTML = model.alerts.length
    ? model.alerts
        .map(
          (alert) => `
            <article class="stack-item ${alert.tone}">
              <strong>${escapeHtml(alert.title)}</strong>
              <p>${escapeHtml(alert.detail)}</p>
            </article>
          `
        )
        .join("")
    : `<p class="save-status">当前没有实时风险提醒。</p>`;

  q("dashboardEventList").innerHTML = state.events.length
    ? state.events
        .slice(0, EVENT_LIMIT)
        .map(
          (event) => `
            <article class="event-item">
              <div class="event-head">
                <strong>${escapeHtml(event.title)}</strong>
                <span class="badge ${event.severity}">${escapeHtml(formatDateTime(event.createdAt))}</span>
              </div>
              <p>${escapeHtml(event.detail)}</p>
            </article>
          `
        )
        .join("")
    : `<p class="save-status">还没有纪律事件。</p>`;
}

function handleScreenshotPreview(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    q("importPreview").className = "import-preview";
    q("importPreview").innerHTML = `
      <strong>已上传截图：${escapeHtml(file.name)}</strong>
      <p>当前版本先做留档和预览。若要自动导入，请把 OCR 文本粘贴到右侧文本框。</p>
      <img src="${reader.result}" alt="持仓截图预览" />
    `;
  };
  reader.readAsDataURL(file);
}

function editPosition(id) {
  const position = state.positions.find((item) => item.id === id);
  if (!position) return;
  editingPositionId = id;
  q("positionFormTitle").textContent = `编辑持仓 · ${position.ticker}`;
  q("positionTicker").value = position.ticker || "";
  q("positionName").value = position.name || "";
  q("positionMarket").value = position.market || "HK";
  q("positionInstrumentType").value = position.instrumentType || "single_stock";
  q("positionType").value = position.positionType || "core_midterm";
  q("positionCircleClass").value = position.circleClass || "A";
  q("positionCompetence").value = String(position.inCompetenceCircle ?? true);
  q("positionSwingAllowed").value = String(position.swingAllowed ?? false);
  q("positionShares").value = position.shares ?? "";
  q("positionAvgCost").value = position.avgCost ?? "";
  q("positionLastPrice").value = position.lastPrice ?? "";
  q("positionWeight").value = position.portfolioWeight !== null ? ratioToPercent(position.portfolioWeight) : "";
  q("positionMaxWeight").value = position.maxWeightAllowed !== null ? ratioToPercent(position.maxWeightAllowed) : "";
  q("positionHoldingDays").value = position.plannedHoldingDays ?? "";
  q("positionOpenedAt").value = position.openedAt || "";
  q("positionThesisHorizon").value = position.thesisHorizonLabel || "midterm";
  q("positionInstrumentNote").value = position.instrumentStructureNote || "";
  q("positionEntryReason").value = position.entryReasonSummary || "";
  q("positionInvalidator").value = position.exitInvalidatorsSummary || "";
  activateTab("positions");
}

function deletePosition(id) {
  const position = state.positions.find((item) => item.id === id);
  state.positions = state.positions.filter((item) => item.id !== id);
  if (editingPositionId === id) resetPositionForm();
  if (position) logEvent("position", "warning", `${position.ticker} 已从持仓台账删除`, "后续风控将不再跟踪该仓位。", position.ticker);
  renderAll();
  saveState();
}

function resetPositionForm() {
  q("positionForm").reset();
  q("positionFormTitle").textContent = "新增持仓";
  q("positionMarket").value = "HK";
  q("positionInstrumentType").value = "single_stock";
  q("positionType").value = "core_midterm";
  q("positionCircleClass").value = "A";
  q("positionCompetence").value = "true";
  q("positionSwingAllowed").value = "false";
  q("positionThesisHorizon").value = "midterm";
}

function updateReviewMode() {
  const isNew = q("reviewTradeAction").value === "buy" || q("reviewPositionSelect").value === "__new__";
  q("reviewNewPositionPanel").classList.toggle("hidden", !isNew);
}

function pushLastReviewToMemoryDraft() {
  if (!state.lastReview) return;
  const { positionId, input, result } = state.lastReview;
  const processBad = ["block", "delay", "review", "reduce_size"].includes(result.finalAction);
  state.memoryDraft = {
    positionId,
    tradeAction: input.tradeAction,
    resultQuality: processBad ? "bad_process_good_outcome" : "good_process_good_outcome",
    followedAgent: false,
    reason: result.reviewCard?.logic || input.whyNow,
    mistakeTags: result.riskFlags || [],
    lesson: result.reviewCard?.improvement || result.why,
  };
  renderMemoryDraft();
  activateTab("memory");
  saveState();
}

function buildNewReviewPosition(input) {
  const inCompetenceCircle = q("reviewNewCompetence").value === "true";
  const initialWeight = ratioOrNull(q("reviewNewInitialWeight").value) || input.targetWeightAfterTrade || null;
  return {
    id: "__new__",
    ticker: q("reviewNewTicker").value.trim().toUpperCase(),
    name: q("reviewNewName").value.trim(),
    market: q("reviewNewMarket").value,
    instrumentType: q("reviewNewInstrumentType").value,
    positionType: q("reviewNewPositionType").value,
    circleClass: q("reviewNewCircleClass").value,
    inCompetenceCircle,
    swingAllowed: q("reviewNewPositionType").value === "swing",
    shares: null,
    avgCost: null,
    lastPrice: null,
    portfolioWeight: initialWeight,
    maxWeightAllowed: percentToRatio(inCompetenceCircle ? state.constitution.coreMax : state.constitution.probeMax),
    plannedHoldingDays: intOrNull(q("reviewNewHoldingDays").value),
    openedAt: null,
    thesisHorizonLabel: q("reviewNewThesisHorizon").value,
    instrumentStructureNote: q("reviewNewInstrumentNote").value.trim(),
    entryReasonSummary: input.whyNow,
    exitInvalidatorsSummary: input.wrongIf,
  };
}

function parsePositionBatch(text) {
  if (!text) return [];
  const chunks = text.includes("\n\n")
    ? text.split(/\n\s*\n/)
    : text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
  return chunks.map(parsePositionText).filter(Boolean);
}

function parsePositionText(text) {
  if (!text) return null;
  const normalized = text.replaceAll(",", "");
  const tickerMatch = normalized.match(/\b(\d{4,5}|[A-Z]{1,6})\b/);
  const numbers = normalized.match(/[0-9]+(?:\.[0-9]+)?/g) || [];
  const weightMatch = normalized.match(/仓位[:：]?\s*([0-9]+(?:\.[0-9]+)?)%/);

  return {
    ticker: tickerMatch ? tickerMatch[1].toUpperCase() : "",
    name: normalized.replace(tickerMatch?.[0] || "", "").split(/[，,\n]/)[0].trim(),
    avgCost: numbers.length >= 2 ? Number(numbers[numbers.length - 2]) : null,
    lastPrice: numbers.length >= 3 ? Number(numbers[numbers.length - 3]) : null,
    shares: numbers.length >= 1 ? Number(numbers[numbers.length - 1]) : null,
    portfolioWeight: weightMatch ? Number(weightMatch[1]) : null,
  };
}

function applyPositionDraft(draft) {
  q("positionTicker").value = draft.ticker || "";
  q("positionName").value = draft.name || "";
  q("positionAvgCost").value = draft.avgCost ?? "";
  q("positionLastPrice").value = draft.lastPrice ?? "";
  q("positionShares").value = draft.shares ?? "";
  q("positionWeight").value = draft.portfolioWeight ?? "";
  activateTab("positions");
}

function importDraftToLedger(draftId) {
  const draft = state.importDrafts.find((item) => item.draftId === draftId);
  if (!draft) return;
  state.positions.unshift({
    id: crypto.randomUUID(),
    ticker: draft.ticker || "",
    name: draft.name || "",
    market: "HK",
    instrumentType: "single_stock",
    positionType: "probe",
    circleClass: "B",
    inCompetenceCircle: true,
    swingAllowed: false,
    shares: draft.shares,
    avgCost: draft.avgCost,
    lastPrice: draft.lastPrice,
    portfolioWeight: draft.portfolioWeight !== null ? draft.portfolioWeight / 100 : null,
    maxWeightAllowed: percentToRatio(state.constitution.coreMax),
    plannedHoldingDays: null,
    openedAt: null,
    thesisHorizonLabel: "midterm",
    instrumentStructureNote: "",
    entryReasonSummary: "",
    exitInvalidatorsSummary: "",
  });
  state.importDrafts = state.importDrafts.filter((item) => item.draftId !== draftId);
  logEvent("position", "info", `${draft.ticker || "新标的"} 已导入持仓台账`, "由截图 / OCR 草稿导入。", draft.ticker);
  renderAll();
  saveState();
}

function importAllDrafts() {
  state.importDrafts.slice().forEach((draft) => importDraftToLedger(draft.draftId));
}

function parseReviewNarrative(text) {
  if (!text) return null;
  let tradeAction = "hold";
  if (/(加仓|补仓|继续买|再买)/.test(text)) tradeAction = "add";
  else if (/(减仓|卖出部分)/.test(text)) tradeAction = "reduce";
  else if (/(卖出|清仓)/.test(text)) tradeAction = "sell";
  else if (/(买入|建仓)/.test(text)) tradeAction = "buy";

  let triggerType = "manual";
  if (/(大涨|新高|拉升|上涨)/.test(text)) triggerType = "price_spike";
  else if (/(大跌|回调|下跌|暴跌)/.test(text)) triggerType = "price_drop";
  else if (/(公告|新闻|消息)/.test(text)) triggerType = "news";
  else if (/(宏观|利率|政策)/.test(text)) triggerType = "macro";

  let emotionRisk = "low";
  if (/(怕错过|fomo|着急|冲动)/i.test(text)) emotionRisk = "medium";
  if (/(焦虑|扛不住|受不了|必须马上)/.test(text)) emotionRisk = "high";

  return {
    tradeAction,
    triggerType,
    emotionRisk,
    whyNow: text,
    whatChanged: "请补充：相比上次决策，这次新增了什么事实？",
    wrongIf: "请补充：什么情况说明这次判断错了？",
    holdingPlanAfterTrade: "请补充：交易后准备按什么周期持有？",
    alternativeAction: "请补充：如果不交易，替代方案是什么？",
  };
}

function runReview(position, input, rules, watchlist) {
  let score = 100;
  const matchedRules = [];
  const riskFlags = [];
  const watchMeta = inspectWatchlist(position.ticker, watchlist);

  if (!input.tradeAction || !position.ticker || !input.whyNow || !input.whatChanged) {
    return {
      disciplineScore: 0,
      matchedRules: [{ id: "INPUT_INCOMPLETE", level: "block" }],
      riskFlags: ["missing_trade_action", "missing_why_now"],
      finalAction: "block",
      requiredNextStep: "先补齐交易动作、标的、why now 和变化说明。",
      why: "当前输入不完整，无法给出有效纪律结论。",
    };
  }

  if (!position.entryReasonSummary) {
    matchedRules.push({ id: "R001_missing_thesis", level: "block" });
    riskFlags.push("missing_thesis");
    score -= 35;
  }

  if (!position.exitInvalidatorsSummary) {
    matchedRules.push({ id: "R002_missing_invalidator", level: "warn" });
    riskFlags.push("missing_invalidator");
    score -= 12;
  }

  if (position.inCompetenceCircle === false && (position.plannedHoldingDays || 0) > rules.nonCompetenceMaxDays) {
    matchedRules.push({ id: "R003_non_competence_long_hold", level: "block" });
    riskFlags.push("non_competence_trade");
    score -= 25;
  }

  if (position.inCompetenceCircle === false && input.tradeAction === "add") {
    matchedRules.push({ id: "R004_non_competence_add", level: "block" });
    riskFlags.push("non_competence_trade");
    score -= 20;
  }

  if (!input.targetWeightAfterTrade) {
    matchedRules.push({ id: "INPUT_MISSING_TARGET_WEIGHT", level: rules.missingTargetWeightAction });
    riskFlags.push("missing_size");
    score -= 8;
  }

  if (
    ["leveraged_product", "inverse_product"].includes(position.instrumentType) &&
    ["midterm", "long_term"].includes(position.thesisHorizonLabel || "")
  ) {
    matchedRules.push({ id: "R206_instrument_horizon_mismatch", level: rules.allowInstrumentMismatch ? "review" : "block" });
    riskFlags.push("instrument_horizon_mismatch");
    score -= 18;
  }

  if (["buy", "add"].includes(input.tradeAction) && watchMeta.exists === false) {
    matchedRules.push({ id: "R301_watchlist_missing", level: "block" });
    riskFlags.push("not_in_watchlist");
    score -= 25;
  }

  if (["buy", "add"].includes(input.tradeAction) && watchMeta.cooling) {
    matchedRules.push({ id: "R302_watchlist_cooldown", level: "delay" });
    riskFlags.push("watchlist_cooldown");
    score -= 20;
  }

  const changedText = `${input.whatChanged} ${input.whyNow}`.toLowerCase();
  if (["buy", "add"].includes(input.tradeAction) && /(only price|price|回调|上涨|走强|反弹|怕错过|miss)/.test(changedText)) {
    matchedRules.push({ id: "R102_price_only_reasoning", level: "delay" });
    riskFlags.push("no_new_information");
    score -= 15;
  }

  if (input.emotionRisk === "high") {
    matchedRules.push({ id: "HIGH_EMOTION_RISK", level: "delay" });
    riskFlags.push("emotion_driven");
    score -= 20;
  } else if (input.emotionRisk === "medium" && /(fomo|怕错过|不想错过)/i.test(input.whyNow)) {
    riskFlags.push("emotion_driven");
    score -= 10;
  }

  if (position.maxWeightAllowed && input.targetWeightAfterTrade && input.targetWeightAfterTrade > position.maxWeightAllowed) {
    matchedRules.push({ id: "R201_single_position_overweight", level: "warn" });
    riskFlags.push("overweight_position");
    score -= 15;
  }

  if (input.thesisStatus === "weakened" && input.tradeAction === "add") {
    matchedRules.push({ id: "R104_weakened_thesis_delay", level: "delay" });
    score -= 20;
  }

  const finalAction = chooseFinalAction(matchedRules, score);
  const result = {
    disciplineScore: Math.max(0, Math.round(score)),
    matchedRules,
    riskFlags: [...new Set(riskFlags)],
    finalAction,
    requiredNextStep: buildNextStep(finalAction, matchedRules, watchMeta),
    why: buildWhy(matchedRules, watchMeta),
  };

  result.reviewCard = buildReviewCard(input, result, watchMeta);
  return result;
}

function buildReviewCard(input, result, watchMeta) {
  return {
    logic: `这次动作是“${toChineseAction(input.tradeAction)}”。当前理由为：${input.whyNow}`,
    risks: [
      result.riskFlags.length ? `风险标签：${result.riskFlags.map(toChineseRiskFlag).join("、")}` : "当前没有明显风险标签。",
      watchMeta.exists ? `观察池状态：${watchMeta.cooling ? `仍在冷静期，剩余 ${watchMeta.daysLeft} 天` : "已满足冷静期"}` : "该标的不在观察列表内。",
    ].join(" "),
    agentHint: `系统结论：${toChineseFinalAction(result.finalAction)}。${result.why}`,
    improvement: result.requiredNextStep,
  };
}

function buildDashboardModel() {
  const alerts = [];
  let overweightCount = 0;
  let drawdownCount = 0;
  let highPriorityAlerts = 0;

  state.positions.forEach((position) => {
    const pnl = computePositionPnlPercent(position);
    if (position.portfolioWeight && ratioToPercent(position.portfolioWeight) > state.rules.singlePositionWarn) {
      overweightCount += 1;
      alerts.push({
        tone: "warning",
        title: `${position.ticker} 仓位偏大`,
        detail: `当前仓位 ${formatPercent(position.portfolioWeight)}，超过警示线 ${state.rules.singlePositionWarn.toFixed(1)}%。`,
      });
    }
    if (pnl <= -20) {
      drawdownCount += 1;
      highPriorityAlerts += 1;
      alerts.push({
        tone: "danger",
        title: `${position.ticker} 深度回撤`,
        detail: `当前浮盈亏 ${pnl.toFixed(1)}%，已经触发止损红线参考。`,
      });
    }
  });

  const coolingCount = state.watchlist.filter((item) => daysSince(item.addedAt) < WATCHLIST_COOLDOWN_DAYS).length;
  const badProcessCount = state.reviews.filter((item) => item.resultQuality.startsWith("bad_process")).length;
  const totalWeight = state.positions.reduce((sum, position) => sum + (position.portfolioWeight || 0), 0);

  if (state.lastReview?.result?.finalAction === "block") highPriorityAlerts += 1;

  const healthLabel = highPriorityAlerts
    ? "高压状态"
    : alerts.length
      ? "需要收敛"
      : state.positions.length
        ? "可控"
        : "待建档";

  const healthTone = highPriorityAlerts ? "danger" : alerts.length ? "warning" : state.positions.length ? "safe" : "muted";

  return {
    alerts,
    overweightCount,
    drawdownCount,
    coolingCount,
    badProcessCount,
    totalWeight,
    highPriorityAlerts,
    healthLabel,
    healthTone,
    snapshot: state.positions.length
      ? `当前共 ${state.positions.length} 个持仓，已登记仓位 ${formatPercent(totalWeight)}。观察池中有 ${coolingCount} 个标的仍处于冷静期。`
      : "先把最重要的 3-5 个仓位和 2-3 个潜在观察标的录进去，再让纪律系统开始工作。",
  };
}

function chooseFinalAction(matchedRules, score) {
  const levels = matchedRules.map((item) => item.level);
  if (levels.includes("block")) return "block";
  if (levels.includes("delay")) return "delay";
  if (levels.includes("review")) return "review";
  if (levels.includes("warn")) return score < 70 ? "review" : "reduce_size";
  return score < 70 ? "review" : "allow";
}

function buildNextStep(finalAction, matchedRules, watchMeta) {
  if (matchedRules.some((rule) => rule.id === "R301_watchlist_missing")) {
    return "先加入观察列表，写清 thesis 与催化，再回来做交易审查。";
  }
  if (matchedRules.some((rule) => rule.id === "R302_watchlist_cooldown")) {
    return `继续观察 ${watchMeta.daysLeft} 天，除非出现新的高质量事实，不要提前动手。`;
  }
  if (finalAction === "block") return "先补齐硬约束缺口，再重新发起审查。";
  if (finalAction === "delay") return "延迟执行，让情绪和信息再沉淀一轮。";
  if (finalAction === "reduce_size") return "缩小目标仓位后再审一次。";
  if (finalAction === "review") return "把 thesis、失效条件和目标仓位写得更清楚后再判断。";
  return "可以执行，但执行后仍应生成复盘记录。";
}

function buildWhy(matchedRules, watchMeta) {
  if (!matchedRules.length) return "当前输入没有命中明显纪律冲突。";
  const first = matchedRules[0];
  if (first.id === "R302_watchlist_cooldown") {
    return `该标的在观察池中未满 ${WATCHLIST_COOLDOWN_DAYS} 天，存在冲动交易风险。`;
  }
  if (first.id === "R301_watchlist_missing") {
    return "新标的没有经过观察池沉淀，容易跳过研究和冷静期。";
  }
  return toChineseRuleText(first);
}

function inspectWatchlist(ticker, watchlist) {
  const item = watchlist.find((entry) => entry.ticker === ticker);
  if (!item) return { exists: false, cooling: false, daysLeft: 0 };
  const age = daysSince(item.addedAt);
  return {
    exists: true,
    cooling: age < WATCHLIST_COOLDOWN_DAYS,
    daysLeft: Math.max(0, WATCHLIST_COOLDOWN_DAYS - age),
    item,
  };
}

function logEvent(type, severity, title, detail, ticker = "") {
  state.events.unshift({
    id: crypto.randomUUID(),
    type,
    severity,
    title,
    detail,
    ticker,
    createdAt: new Date().toISOString(),
  });
  state.events = state.events.slice(0, EVENT_LIMIT);
}

function findWatchlistItem(ticker) {
  return state.watchlist.find((entry) => entry.ticker === ticker.toUpperCase());
}

function computePositionPnlPercent(position) {
  if (!position.avgCost || !position.lastPrice) return 0;
  return ((position.lastPrice - position.avgCost) / position.avgCost) * 100;
}

function loadDemoState() {
  const now = new Date();
  const tenDaysAgo = new Date(now);
  tenDaysAgo.setDate(now.getDate() - 10);
  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(now.getDate() - 3);

  state = mergeState({
    constitution: defaultState.constitution,
    rules: defaultState.rules,
    positions: [
      {
        id: crypto.randomUUID(),
        ticker: "7709",
        name: "两倍做多海力士",
        market: "HK",
        instrumentType: "leveraged_product",
        positionType: "swing",
        circleClass: "B",
        inCompetenceCircle: true,
        swingAllowed: true,
        shares: 800,
        avgCost: 8.763,
        lastPrice: 26.4,
        portfolioWeight: 0.089,
        maxWeightAllowed: 0.12,
        plannedHoldingDays: 30,
        openedAt: "2026-03-15",
        thesisHorizonLabel: "midterm",
        instrumentStructureNote: "HK listed daily 2x product.",
        entryReasonSummary: "AI 需求仍强，存储周期改善。",
        exitInvalidatorsSummary: "若 AI 需求转弱或产品结构不再适合表达观点则退出。",
      },
      {
        id: crypto.randomUUID(),
        ticker: "AAPL",
        name: "Apple",
        market: "US",
        instrumentType: "single_stock",
        positionType: "core_midterm",
        circleClass: "A",
        inCompetenceCircle: true,
        swingAllowed: false,
        shares: 40,
        avgCost: 225,
        lastPrice: 176,
        portfolioWeight: 0.16,
        maxWeightAllowed: 0.15,
        plannedHoldingDays: 180,
        openedAt: "2026-01-10",
        thesisHorizonLabel: "midterm",
        instrumentStructureNote: "US single stock.",
        entryReasonSummary: "生态壁垒稳定，现金流强。",
        exitInvalidatorsSummary: "若硬件更新周期和服务业务持续恶化则退出。",
      },
    ],
    watchlist: [
      {
        id: crypto.randomUUID(),
        ticker: "NVDA",
        name: "NVIDIA",
        market: "US",
        source: "manual",
        thesis: "AI 基础设施景气度仍强，但估值与仓位纪律要更谨慎。",
        catalyst: "等待下一次财报与 capex 指引验证。",
        addedAt: tenDaysAgo.toISOString(),
        status: "watching",
      },
      {
        id: crypto.randomUUID(),
        ticker: "TSLA",
        name: "Tesla",
        market: "US",
        source: "news",
        thesis: "市场情绪很强，但基本面分歧仍大。",
        catalyst: "等交付数据和毛利率更新。",
        addedAt: threeDaysAgo.toISOString(),
        status: "watching",
      },
    ],
    reviews: [],
    lastReview: null,
    memoryDraft: null,
    importDrafts: [],
    events: [
      {
        id: crypto.randomUUID(),
        type: "system",
        severity: "info",
        title: "Demo 数据已加载",
        detail: "你现在可以直接体验观察列表、交易审查与事件流。",
        createdAt: now.toISOString(),
      },
    ],
  });
}

function loadReviewDemo() {
  if (!state.positions.length) loadDemoState();
  const target = state.positions[0];
  q("reviewPositionSelect").value = target.id;
  q("reviewTradeAction").value = "add";
  q("reviewTargetWeight").value = "13";
  q("reviewEmotionRisk").value = "medium";
  q("reviewTriggerType").value = "price_spike";
  q("reviewThesisStatus").value = "active";
  q("reviewNaturalLanguage").value = "我想给 7709 加仓，因为我担心后面继续拉升错过行情，但也知道它是 2x 工具。";
  q("reviewWhyNow").value = "我担心错过后续上涨。";
  q("reviewWhatChanged").value = "价格继续走强，但没有新的产业数据确认。";
  q("reviewWrongIf").value = "如果 AI 需求和存储价格没有继续改善，说明我看错了。";
  q("reviewHoldingPlan").value = "继续按上半年逻辑持有，但会缩短评估周期。";
  q("reviewAlternativeAction").value = "先不加仓，等新的基本面数据。";
  updateReviewMode();
}

function toChineseRiskFlag(flag) {
  const map = {
    missing_position: "没有可审查的标的",
    missing_trade_action: "缺少交易动作",
    missing_why_now: "缺少 why now",
    missing_thesis: "缺少 thesis",
    missing_invalidator: "缺少失效条件",
    non_competence_trade: "超出能力圈",
    missing_size: "缺少目标仓位",
    instrument_horizon_mismatch: "工具与持有周期错配",
    not_in_watchlist: "未进入观察列表",
    watchlist_cooldown: "仍在观察冷静期",
    no_new_information: "没有新的事实变化",
    emotion_driven: "情绪驱动",
    overweight_position: "单票仓位偏大",
  };
  return map[flag] || flag;
}

function toChineseRuleText(rule) {
  const key = typeof rule === "string" ? rule : rule.id;
  const map = {
    INPUT_INCOMPLETE: "核心输入不完整",
    R001_missing_thesis: "没有 thesis 就不该交易",
    R002_missing_invalidator: "缺少失效条件",
    R003_non_competence_long_hold: "非能力圈标的不适合长持",
    R004_non_competence_add: "非能力圈标的不应继续加仓",
    INPUT_MISSING_TARGET_WEIGHT: "缺少目标仓位",
    R206_instrument_horizon_mismatch: "工具属性与 thesis 时间窗错配",
    R301_watchlist_missing: "未经过观察列表就直接交易",
    R302_watchlist_cooldown: "观察期未满",
    R102_price_only_reasoning: "当前更像价格驱动而非事实驱动",
    HIGH_EMOTION_RISK: "情绪风险过高",
    R201_single_position_overweight: "交易后仓位会超上限",
    R104_weakened_thesis_delay: "thesis 已弱化，不适合加仓",
  };
  return map[key] || key;
}

function toChineseAction(action) {
  const map = { buy: "新建仓", add: "加仓", reduce: "减仓", sell: "卖出", hold: "继续持有" };
  return map[action] || action;
}

function toChineseFinalAction(action) {
  const map = { allow: "允许执行", delay: "建议延迟", block: "直接阻断", reduce_size: "缩小仓位", review: "先复核" };
  return map[action] || action;
}

function badgeTone(action) {
  if (action === "block") return "danger";
  if (action === "delay" || action === "review" || action === "reduce_size") return "warning";
  if (action === "allow") return "safe";
  return "muted";
}

function chipTone(level) {
  if (level === "block") return "danger";
  if (level === "delay" || level === "warn" || level === "review") return "warning";
  return "safe";
}

function ratioToPercent(value) {
  return Number(((value || 0) * 100).toFixed(2));
}

function percentToRatio(value) {
  const number = typeof value === "number" ? value : num(value);
  return number === null ? null : number / 100;
}

function ratioOrNull(value) {
  const number = num(value);
  return number === null ? null : number / 100;
}

function num(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function intOrNull(value) {
  const parsed = num(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function daysSince(isoDate) {
  if (!isoDate) return 999;
  const diff = Date.now() - new Date(isoDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatPercent(ratio) {
  if (ratio === null || ratio === undefined) return "0.0%";
  return `${(ratio * 100).toFixed(1)}%`;
}

function formatDate(isoDate) {
  if (!isoDate) return "-";
  return new Date(isoDate).toLocaleDateString("zh-CN");
}

function formatDateTime(isoDate) {
  if (!isoDate) return "-";
  return new Date(isoDate).toLocaleString("zh-CN", { hour12: false });
}

function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function init() {
  initTabs();
  bindTopActions();
  bindConstitution();
  bindRules();
  bindImportTools();
  bindPositionForm();
  bindWatchlistForm();
  bindReviewForm();
  bindMemoryForm();
  renderAll();
}

init();
