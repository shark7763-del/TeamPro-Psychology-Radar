(function () {
  "use strict";

  const {
    APP_MODE,
    ATHLETE_SESSION_KEY,
    assessmentTemplates,
    buildCoachRows,
    createRepositories,
    dashboardStats,
    daysBetween,
    getTemplate,
    highConcernAnswers,
    interpretationBand,
    strengthsAndPriorities,
    readJson,
    statusLabel,
    todayISO,
    validateAnswers,
    writeJson
  } = window.WenMindCore;

  const app = document.querySelector("#app");
  const radarTemplate = document.querySelector("#radarTemplate");
  const coachLink = document.querySelector("#coachLoginLink");
  const homeButton = document.querySelector("#homeButton");
  const repos = createRepositories();

  const state = {
    route: "/",
    routeParams: {},
    athleteName: "",
    athlete: null,
    currentAthleteName: "",
    currentCoachRecord: null,
    activeSession: null,
    templateId: assessmentTemplates[0].id,
    startedAt: null,
    questionIndex: 0,
    submitStatus: "idle",
    submitError: "",
    filter: "all",
    search: "",
    dateFilter: "all",
    customStart: "",
    customEnd: "",
    loading: false,
    error: ""
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function routePath(path) {
    return `#${path}`;
  }

  function navigate(path) {
    window.location.hash = routePath(path);
  }

  function currentHashPath() {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash || hash === "/") return "/";
    return hash.startsWith("/") ? hash : `/${hash}`;
  }

  function parseRoute(path) {
    const [pathname, queryString = ""] = path.split("?");
    const query = Object.fromEntries(new URLSearchParams(queryString));
    if (pathname.startsWith("/coach/athletes/")) {
      return { name: "/coach/athletes/:athleteId", params: { athleteId: pathname.split("/").pop(), ...query } };
    }
    return { name: pathname, params: query };
  }

  async function bootstrap() {
    homeButton.addEventListener("click", () => navigate("/"));
    coachLink.addEventListener("click", (event) => {
      event.preventDefault();
      navigate("/coach/login");
    });
    window.addEventListener("hashchange", renderRoute);
    await renderRoute();
  }

  const routeHandlers = {
    "/": renderAthleteName,
    "/assessment": renderAssessmentEntry,
    "/coach/login": renderCoachLogin,
    "/coach/dashboard": renderCoachDashboard,
    "/coach/athletes": renderAllAthletes,
    "/coach/athletes/:athleteId": renderAthleteDetail,
    "/coach/assessments": renderAssessmentManagement,
    "/coach/follow-ups": renderFollowUps
  };
  // 背景同步完成後可安全自動刷新的唯讀清單頁（避免刷掉正在輸入的表單）
  const REFRESHABLE_ROUTES = new Set(["/coach/dashboard", "/coach/athletes", "/coach/follow-ups"]);
  let renderToken = 0;

  // 畫面先用本機快取即時渲染，再背景與後台同步；清單頁同步完成後才自動刷新。
  function backgroundSync(routeName, params, token) {
    if (typeof repos.store.pull !== "function") return;
    repos.store.pull().then(() => {
      if (token === renderToken && REFRESHABLE_ROUTES.has(routeName)) {
        (routeHandlers[routeName] || renderNotFound)(params);
      }
    }).catch(() => {});
  }

  async function syncFlush() {
    if (typeof repos.store.flush === "function") {
      try {
        await repos.store.flush();
      } catch {
        /* 送出失敗會保留在本機快取，下次寫入時重送 */
      }
    }
  }

  async function renderRoute() {
    const parsed = parseRoute(currentHashPath());
    state.route = parsed.name;
    state.routeParams = parsed.params;
    state.error = "";
    const token = ++renderToken;
    coachLink.hidden = parsed.name.startsWith("/coach/") && parsed.name !== "/coach/login";
    if (parsed.name.startsWith("/coach/") && parsed.name !== "/coach/login") {
      const session = await repos.auth.currentSession();
      if (!session) {
        navigate("/coach/login");
        return;
      }
    }
    const handler = routeHandlers[parsed.name] || renderNotFound;
    await handler(parsed.params); // 先用本機快取即時渲染，手機點擊立刻有反應
    app.focus({ preventScroll: true });
    backgroundSync(parsed.name, parsed.params, token); // 再背景與後台同步、清單頁自動刷新
  }

  function shell(content, options = {}) {
    app.className = options.narrow ? "screen narrow-screen" : "screen";
    app.innerHTML = content;
  }

  function showLoading(title = "資料載入中") {
    shell(`<section class="empty-state"><h1>${title}</h1><p>請稍候。</p></section>`);
  }

  function renderNotFound() {
    shell(`
      <section class="empty-state">
        <h1>找不到頁面</h1>
        <p>請回到心理雷達首頁重新開始。</p>
        <button class="primary" type="button" data-nav="/">回首頁</button>
      </section>
    `, { narrow: true });
    bindNav();
  }

  async function getAssessmentContext(params = {}) {
    const session = await repos.assessments.getActiveSession(params);
    state.activeSession = session;
    state.templateId = params.template || state.templateId || session.templateId || assessmentTemplates[0].id;
    return { session, template: getTemplate(state.templateId) };
  }

  async function renderAthleteName(params = {}) {
    await getAssessmentContext(params);
    const previous = readJson(ATHLETE_SESSION_KEY, null);
    const previousAthlete = previous?.athleteId ? await repos.athletes.findById(previous.athleteId) : null;
    shell(`
      <section class="athlete-hero">
        <div class="hero-copy">
          <p class="eyebrow">WenMind × TeamPro</p>
          <h1>運動心理雷達</h1>
          <p>透過心理量表，掌握近期心理狀態，作為後續心理訓練的重要參考。</p>
        </div>
        <form class="entry-form" id="nameForm" novalidate>
          <label class="field">姓名
            <input id="athleteName" autocomplete="name" placeholder="例如：王小明" value="${escapeHtml(previousAthlete?.name || previous?.name || "")}">
          </label>
          <label class="field">運動項目
            <input id="athleteSport" placeholder="例如：籃球、游泳、跆拳道、田徑、羽球、體操" value="${escapeHtml(previousAthlete?.sport || "")}">
          </label>
          <p class="form-error" id="nameError" aria-live="polite"></p>
          <button class="primary" type="submit">開始使用</button>
        </form>
      </section>
    `, { narrow: true });
    document.querySelector("#nameForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = document.querySelector("#athleteName").value.trim();
      const sport = document.querySelector("#athleteSport").value.trim();
      if (!name) {
        document.querySelector("#nameError").textContent = "請先輸入姓名。";
        return;
      }
      if (!sport) {
        document.querySelector("#nameError").textContent = "請輸入運動項目。";
        return;
      }
      state.athleteName = name;
      const savedSession = readJson(ATHLETE_SESSION_KEY, null);
      const savedAthlete = savedSession?.athleteId ? await repos.athletes.findById(savedSession.athleteId) : null;
      if (savedAthlete && savedAthlete.name === name) {
        state.athlete = await repos.athletes.upsertProfile({ ...savedAthlete, name, sport });
        navigate(`/assessment${queryFromParams(state.routeParams)}`);
        return;
      }
      const matches = await repos.athletes.findByName(name);
      if (matches.length === 1) {
        state.athlete = await repos.athletes.upsertProfile({ ...matches[0], name, sport });
        writeJson(ATHLETE_SESSION_KEY, { athleteId: state.athlete.id, name, updatedAt: new Date().toISOString() });
        navigate(`/assessment${queryFromParams(state.routeParams)}`);
        return;
      }
      state.athlete = await repos.athletes.upsertProfile({
        name,
        sport,
        groupId: state.activeSession?.groupId || state.routeParams.group || "local-group",
        inviteToken: state.routeParams.token || ""
      });
      navigate(`/assessment${queryFromParams(state.routeParams)}`);
    });
  }

  function queryFromParams(params) {
    const query = new URLSearchParams(params || {}).toString();
    return query ? `?${query}` : "";
  }

  async function renderProfileSetup() {
    shell(`
      <section class="panel-flow">
        <p class="eyebrow">個人資料設定</p>
        <h1>確認你的基本資料</h1>
        <form class="entry-form" id="profileForm" novalidate>
          <label class="field">姓名
            <input id="profileName" value="${escapeHtml(state.athleteName || state.athlete?.name || "")}">
          </label>
          <label class="field">運動項目
            <input id="profileSport" placeholder="例如：籃球、游泳、跆拳道、田徑、羽球、體操" value="${escapeHtml(state.athlete?.sport || "")}">
          </label>
          <p class="form-error" id="profileError" aria-live="polite"></p>
          <button class="primary" type="submit">繼續</button>
        </form>
      </section>
    `, { narrow: true });
    document.querySelector("#profileForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = document.querySelector("#profileName").value.trim();
      const sport = document.querySelector("#profileSport").value.trim();
      if (!name) {
        document.querySelector("#profileError").textContent = "請先輸入姓名。";
        return;
      }
      if (!sport) {
        document.querySelector("#profileError").textContent = "請輸入運動項目。";
        return;
      }
      const groupId = state.activeSession?.groupId || state.routeParams.group || "local-group";
      state.athlete = await repos.athletes.upsertProfile({
        id: state.athlete?.id,
        name,
        sport,
        groupId,
        inviteToken: state.routeParams.token || ""
      });
      await renderAssessmentEntry(state.routeParams);
    });
  }

  async function renderAssessmentEntry(params = {}) {
    const { session, template } = await getAssessmentContext(params);
    if (!state.athlete) {
      const saved = readJson(ATHLETE_SESSION_KEY, null);
      state.athlete = saved?.athleteId ? await repos.athletes.findById(saved.athleteId) : null;
    }
    if (!state.athlete) {
      await renderAthleteName(params);
      return;
    }
    if (!state.athlete.sport) {
      await renderProfileSetup();
      return;
    }
    shell(`
      <section class="panel-flow">
        <p class="eyebrow">${escapeHtml(state.athlete.name)}｜${escapeHtml(state.athlete.sport)}</p>
        <p>請選擇本次要填寫的心理量表。系統會依各量表的題目、量尺與構面建立獨立歷史紀錄。</p>
        <div class="assessment-grid">
          ${assessmentTemplates.map((item) => {
            const active = item.id === template.id;
            return `
              <button class="assessment-card ${active ? "active" : ""}" data-template="${item.id}" type="button">
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.description)}</span>
              </button>
            `;
          }).join("")}
        </div>
      </section>
    `, { narrow: true });
    document.querySelectorAll("[data-template]").forEach((button) => {
      button.addEventListener("click", async () => {
        state.templateId = button.dataset.template;
        const selectedTemplate = getTemplate(state.templateId);
        const draft = await repos.assessments.readDraft(state.athlete.id, state.activeSession.id, selectedTemplate.id);
        state.startedAt = draft?.startedAt || new Date().toISOString();
        state.questionIndex = firstUnansweredIndex(selectedTemplate, draft?.answers || {});
        await renderQuestion();
      });
    });
  }

  function renderConsent(template) {
    shell(`
      <section class="panel-flow">
        <p class="eyebrow">${escapeHtml(template.name)}</p>
        <h1>開始前請閱讀</h1>
        <p>本結果僅供自我了解及後續心理訓練內容規劃與討論之參考。</p>
        <p>心理教練後台會看到構面分數、狀態變化與追蹤紀錄，不會在一般頁面公開你的完整個人資料。</p>
        <label class="check-row">
          <input id="agreeCheck" type="checkbox">
          <span>我已了解並願意開始作答。</span>
        </label>
        <div class="toolbar">
          <button class="ghost" type="button" data-nav="/assessment${queryFromParams(state.routeParams)}">返回</button>
          <button class="primary" type="button" id="beginQuestions" disabled>開始測驗</button>
        </div>
      </section>
    `, { narrow: true });
    bindNav();
    document.querySelector("#agreeCheck").addEventListener("change", (event) => {
      document.querySelector("#beginQuestions").disabled = !event.target.checked;
    });
    document.querySelector("#beginQuestions").addEventListener("click", async () => {
      const draft = await repos.assessments.readDraft(state.athlete.id, state.activeSession.id, template.id);
      state.startedAt = draft?.startedAt || new Date().toISOString();
      state.questionIndex = firstUnansweredIndex(template, draft?.answers || {});
      renderQuestion();
    });
  }

  function firstUnansweredIndex(template, answers) {
    const index = template.questions.findIndex((question) => !answers[question.id]);
    return index === -1 ? 0 : index;
  }

  async function currentDraft() {
    const existing = await repos.assessments.readDraft(state.athlete.id, state.activeSession.id, state.templateId);
    return existing || { answers: {}, startedAt: state.startedAt || new Date().toISOString() };
  }

  async function renderQuestion() {
    const template = getTemplate(state.templateId);
    const draft = await currentDraft();
    state.startedAt = draft.startedAt;
    const question = template.questions[state.questionIndex];
    const answered = Object.keys(draft.answers || {}).length;
    const percent = Math.round((answered / template.questions.length) * 100);
    shell(`
      <section class="question-flow">
        <div class="progress-wrap">
          <div class="progress-meta">
            <span>第${state.questionIndex + 1}題／${template.questions.length}題</span>
            <span>${answered}/${template.questions.length}</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>
        </div>
        <article class="question-card">
          <p class="question-text">${escapeHtml(question.text)}</p>
          <div class="answers">
            ${template.optionLabels.map((label, index) => `
              <button class="answer-option ${draft.answers[question.id] === index + 1 ? "selected" : ""}" data-value="${index + 1}" type="button">
                <span>${index + 1}</span>${escapeHtml(label)}
              </button>
            `).join("")}
          </div>
        </article>
        <p class="form-error" id="answerError" aria-live="polite"></p>
        <div class="bottom-actions">
          <button class="ghost" id="prevQuestion" type="button" ${state.questionIndex === 0 ? "disabled" : ""}>上一題</button>
          <button class="primary" id="nextQuestion" type="button">${state.questionIndex === template.questions.length - 1 ? "送出" : "下一題"}</button>
        </div>
      </section>
    `, { narrow: true });
    document.querySelectorAll(".answer-option").forEach((button) => {
      button.addEventListener("click", async () => {
        const nextDraft = await currentDraft();
        nextDraft.answers[question.id] = Number(button.dataset.value);
        await repos.assessments.saveDraft(state.athlete.id, state.activeSession.id, nextDraft, template.id);
        await renderQuestion();
      });
    });
    document.querySelector("#prevQuestion").addEventListener("click", () => {
      state.questionIndex = Math.max(0, state.questionIndex - 1);
      renderQuestion();
    });
    document.querySelector("#nextQuestion").addEventListener("click", async () => {
      const nextDraft = await currentDraft();
      if (!nextDraft.answers[question.id]) {
        document.querySelector("#answerError").textContent = "請先選擇本題答案。";
        return;
      }
      if (state.questionIndex === template.questions.length - 1) await submitCurrentAssessment();
      else {
        state.questionIndex += 1;
        await renderQuestion();
      }
    });
  }

  async function submitCurrentAssessment() {
    const template = getTemplate(state.templateId);
    const draft = await currentDraft();
    const validation = validateAnswers(template, draft.answers || {});
    if (!validation.complete) {
      state.questionIndex = template.questions.findIndex((question) => question.id === validation.missing[0].id);
      renderQuestion();
      return;
    }
    state.submitStatus = "submitting";
    state.submitError = "";
    shell(`
      <section class="panel-flow">
        <p class="eyebrow">${escapeHtml(template.name)}</p>
        <h1>送出中</h1>
        <p>正在儲存你的測驗結果。</p>
      </section>
    `, { narrow: true });
    try {
      const record = await repos.assessments.submit({
        athleteId: state.athlete.id,
        groupId: state.athlete.groupId,
        sessionId: state.activeSession.id,
        templateId: template.id,
        answers: draft.answers,
        startedAt: draft.startedAt
      });
      // 確認本次填報已送達後台，再帶選手到結果頁。
      await syncFlush();
      state.submitStatus = "success";
      state.submitError = "";
      renderAthleteResult(record.id);
    } catch (error) {
      state.submitStatus = "error";
      state.submitError = error.message || "送出失敗，請稍後重新送出。";
      shell(`
        <section class="panel-flow">
          <p class="eyebrow">${escapeHtml(template.name)}</p>
          <h1>送出失敗</h1>
          <p class="form-error">${escapeHtml(state.submitError)}</p>
          <button class="primary" type="button" id="retrySubmit">重新送出</button>
        </section>
      `, { narrow: true });
      document.querySelector("#retrySubmit").addEventListener("click", submitCurrentAssessment);
    }
  }

  function bandClass(key) {
    return { strong: "band-strong", stable: "band-stable", developing: "band-developing", priority: "band-priority" }[key] || "band-developing";
  }

  function dimensionBreakdown(scores, template) {
    const points = template?.points || 7;
    return `
      <div class="dimension-list">
        ${scores.map((item) => {
          const band = interpretationBand(item.score);
          const avg = typeof item.average === "number" ? `${item.average.toFixed(2)} / ${item.pointScale || points}` : "—";
          return `
            <article class="dimension-card ${bandClass(band.key)}">
              <div class="dimension-head">
                <strong>${escapeHtml(item.name)}</strong>
                <span class="band-chip">${escapeHtml(band.level)}</span>
              </div>
              <div class="dimension-scores">
                <span>原始平均 ${avg}</span>
                <span>換算分數 ${item.score} / 100</span>
              </div>
              <p class="dimension-note">${escapeHtml(band.note)}</p>
              ${item.train ? `<p class="dimension-train">建議：${escapeHtml(item.train)}</p>` : ""}
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function strengthPriorityBlock(scores) {
    const { strengths, priorities } = strengthsAndPriorities(scores);
    const strengthText = strengths.length
      ? `<ul class="sp-list">${strengths.map((item) => `<li>${escapeHtml(item.name)}（${item.score}）</li>`).join("")}</ul>`
      : `<p class="dimension-note">本次尚未出現明確高分優勢，可先從分數相對穩定的能力持續培養。</p>`;
    const priorityText = priorities.length
      ? `<ul class="sp-list">${priorities.map((item) => `<li>${escapeHtml(item.name)}（${item.score}）</li>`).join("")}</ul>`
      : `<p class="dimension-note">本次沒有明顯需要優先處理的項目，可依近期比賽需求選擇進階訓練方向。</p>`;
    return `
      <div class="sp-grid">
        <section class="report-section"><h2>相對優勢</h2>${strengthText}</section>
        <section class="report-section"><h2>優先訓練方向</h2>${priorityText}</section>
      </div>
    `;
  }

  async function renderAthleteResult(recordId) {
    const records = await repos.assessments.recordsForAthlete(state.athlete.id);
    const record = records.find((item) => item.id === recordId) || records[0];
    const template = getTemplate(record.assessmentTemplateId);
    shell(`
      <section class="result-flow">
        <div class="callout">
          <p class="eyebrow">${escapeHtml(template.name)}</p>
          <h1>已完成本次自評</h1>
          ${template.subtitle ? `<p class="small-muted">${escapeHtml(template.subtitle)}</p>` : ""}
        </div>
        <div id="resultRadar"></div>
        <p class="radar-hint">分數越高，代表目前自評的心理技能越成熟。本圖用於觀察個人能力分布，不代表與其他選手的排名。</p>
        ${strengthPriorityBlock(record.dimensionScores)}
        <section class="report-section">
          <h2>各項能力</h2>
          ${dimensionBreakdown(record.dimensionScores, template)}
        </section>
        <p class="result-disclaimer">${escapeHtml(template.resultNote || "本結果為選手當下的自我評估，不代表人格定型、心理疾病或比賽結果預測。")}</p>
        <div class="toolbar">
          <button class="primary" type="button" data-nav="/">完成並離開</button>
        </div>
      </section>
    `, { narrow: true });
    bindNav();
    drawRadarInto("#resultRadar", record.dimensionScores, null, "0～100為線性換算分數，不是百分位排名。");
  }

  async function renderCoachLogin() {
    const session = await repos.auth.currentSession();
    if (session) {
      navigate("/coach/dashboard");
      return;
    }
    shell(`
      <section class="login-layout">
        <div>
          <p class="eyebrow">運動心理教練後台</p>
          <h1>登入後查看今日心理狀態</h1>
          <p>目前為展示模式，正式上線需串接帳號驗證與資料庫權限。正式架構建議支援 Supabase Auth 或 Firebase Auth。</p>
        </div>
        <form class="entry-form" id="coachLoginForm" novalidate>
          <label class="field">教練帳號
            <input id="coachAccount" autocomplete="username" placeholder="mind123">
          </label>
          <label class="field">密碼
            <input id="coachPassword" type="password" autocomplete="current-password" placeholder="mind123">
          </label>
          <p class="form-error" id="loginError" aria-live="polite"></p>
          <button class="primary" type="submit">登入後台</button>
        </form>
      </section>
    `, { narrow: true });
    document.querySelector("#coachLoginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await repos.auth.login({
          account: document.querySelector("#coachAccount").value,
          password: document.querySelector("#coachPassword").value
        });
        navigate("/coach/dashboard");
      } catch (error) {
        document.querySelector("#loginError").textContent = error.message;
      }
    });
  }

  function coachShell(active, content) {
    const links = [
      ["/coach/dashboard", "今日狀態"],
      ["/coach/assessments", "測驗管理"],
      ["/coach/athletes", "填報結果"]
    ];
    shell(`
      <section class="coach-shell">
        <header class="coach-header">
          <div class="coach-brand">
            <div class="meta-row">
              <p class="eyebrow">運動心理教練後台</p>
              <span class="mode-chip">${APP_MODE === "demo" ? "展示模式" : "正式模式"}</span>
            </div>
            <h2>WenMind × TeamPro</h2>
            <p class="small-muted">${repos.synced ? "後台資料已連線同步。" : "資料目前儲存在本瀏覽器 localStorage。"}</p>
          </div>
          <button class="ghost" id="logoutButton" type="button">登出</button>
        </header>
        <nav class="coach-tabs" aria-label="教練導覽">
          ${links.map(([path, label]) => `<a class="${active === path ? "active" : ""}" href="#${path}">${label}</a>`).join("")}
        </nav>
        <div class="coach-content">${content}</div>
      </section>
    `);
    document.querySelector("#logoutButton").addEventListener("click", async () => {
      await repos.auth.logout();
      navigate("/coach/login");
    });
  }

  async function getCoachData() {
    const [athletes, records, followUps] = await Promise.all([
      repos.athletes.list(),
      repos.assessments.records(),
      repos.followUps.list()
    ]);
    const rows = buildCoachRows({ athletes, records, followUps });
    return { athletes, records, followUps, rows, stats: dashboardStats(rows, followUps) };
  }

  async function renderCoachDashboard() {
    const { rows, stats } = await getCoachData();
    const attention = rows.filter((row) => row.record && (row.status === "red" || row.status === "orange" || row.overdue || row.dueToday));
    coachShell("/coach/dashboard", `
      <section class="report-section">
        <h2>今日狀態</h2>
        <div class="dashboard-stats">
          ${statCard("選手總數", stats.total)}
          ${statCard("完成填報", stats.completed)}
          ${statCard("尚未填報", stats.pending)}
          ${statCard("需優先關心", stats.priority)}
          ${statCard("今日待追蹤", stats.dueToday)}
          ${statCard("逾期未追蹤", stats.overdue)}
        </div>
      </section>
      <section class="report-section">
        <h2>需優先關心（${attention.length}）</h2>
        ${attention.length
          ? `<div class="priority-list">${attention.map(priorityCard).join("")}</div>`
          : empty("目前沒有需要優先關心的選手，狀態穩定。")}
      </section>
    `);
    bindCoachActions();
  }

  function statCard(label, value) {
    return `<div class="stat-card"><strong>${value}</strong><span>${label}</span></div>`;
  }

  function empty(text) {
    return `<div class="empty-inline">${escapeHtml(text)}</div>`;
  }

  function assessmentName(record) {
    return record && record.assessmentTemplateId
      ? (getTemplate(record.assessmentTemplateId)?.name || "未命名量表")
      : "";
  }

  // 選手做過的所有測驗紀錄（含不同量表），可點選切換查看，預設看最新一筆。
  function recordHistoryList(records, selectedId, athleteId) {
    if (!records || records.length <= 1) return "";
    return `
      <section class="report-section">
        <h2>測驗紀錄（${records.length}）</h2>
        <p class="small-muted">同一位選手做過的每份量表都會保留，點選即可切換查看。</p>
        <div class="record-history">
          ${records.map((rec) => `
            <button class="record-chip ${rec.id === selectedId ? "active" : ""}" type="button" data-nav="/coach/athletes/${athleteId}?record=${rec.id}">
              <strong>${escapeHtml(assessmentName(rec))}</strong>
              <span>${formatDateTime(rec.completedAt)}｜${escapeHtml(statusLabel(rec.overallStatus))}</span>
            </button>
          `).join("")}
        </div>
      </section>
    `;
  }

  function latestRecordsByTemplate(records) {
    const map = new Map();
    [...(records || [])]
      .filter((record) => record && record.assessmentTemplateId)
      .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))
      .forEach((record) => {
        if (!map.has(record.assessmentTemplateId)) map.set(record.assessmentTemplateId, record);
      });
    return map;
  }

  function scoreValue(record, ids) {
    const list = Array.isArray(ids) ? ids : [ids];
    for (const id of list) {
      const found = record?.dimensionScores?.find((item) => item.id === id);
      if (found && Number.isFinite(found.score)) return found.score;
    }
    return null;
  }

  function meanScore(values) {
    const nums = values.filter((value) => Number.isFinite(value));
    if (!nums.length) return null;
    return Math.round(nums.reduce((sum, value) => sum + value, 0) / nums.length);
  }

  function compositeLabel(count, total) {
    if (count >= total) return "完整綜合";
    if (count >= 2) return "初步交叉";
    if (count === 1) return "單份結果";
    return "尚無資料";
  }

  function buildCompositeProfile(records) {
    const latest = latestRecordsByTemplate(records);
    const byId = (id) => latest.get(id) || null;
    const teampro = byId("teampro-mental-skills-v2");
    const ottawa = byId("ottawa-mental-skills-v1");
    const toughness = byId("trait-mental-toughness-v1");
    const anxiety = byId("competition-state-anxiety-v1");
    const total = assessmentTemplates.length;
    const completed = [...latest.values()].length;
    const axes = [
      {
        id: "drive",
        name: "方向與投入",
        score: meanScore([
          scoreValue(teampro, ["goalSetting", "commitment"]),
          scoreValue(ottawa, ["goal", "commitment"]),
          scoreValue(toughness, "striving")
        ])
      },
      {
        id: "confidence",
        name: "自信與把握感",
        score: meanScore([
          scoreValue(teampro, "selfConfidence"),
          scoreValue(ottawa, "confidence"),
          scoreValue(anxiety, "stateConfidence")
        ])
      },
      {
        id: "regulation",
        name: "壓力調節",
        score: meanScore([
          scoreValue(teampro, ["stressRegulation", "emotionRegulation"]),
          scoreValue(ottawa, ["relaxation", "stress", "fear"]),
          scoreValue(toughness, "pressureControl"),
          scoreValue(anxiety, ["cognitiveAnxiety", "somaticAnxiety"])
        ])
      },
      {
        id: "focus",
        name: "專注再專注",
        score: meanScore([
          scoreValue(teampro, ["focus", "refocus"]),
          scoreValue(ottawa, ["concentration", "refocus"])
        ])
      },
      {
        id: "imagery",
        name: "意象與預演",
        score: meanScore([
          scoreValue(teampro, ["imageryAbility", "imageryPractice"]),
          scoreValue(ottawa, ["imagery", "mentalPractice"])
        ])
      },
      {
        id: "preparation",
        name: "競賽準備",
        score: meanScore([
          scoreValue(teampro, "competitionPlan"),
          scoreValue(ottawa, "competitionPlan")
        ])
      }
    ].filter((axis) => Number.isFinite(axis.score));

    const metric = {
      commitment: meanScore([scoreValue(teampro, "commitment"), scoreValue(ottawa, "commitment"), scoreValue(toughness, "striving")]),
      confidence: meanScore([scoreValue(teampro, "selfConfidence"), scoreValue(ottawa, "confidence")]),
      stateConfidence: scoreValue(anxiety, "stateConfidence"),
      anxietyControl: meanScore([scoreValue(anxiety, "cognitiveAnxiety"), scoreValue(anxiety, "somaticAnxiety")]),
      relaxation: meanScore([scoreValue(teampro, "relaxation"), scoreValue(ottawa, "relaxation")]),
      focus: meanScore([scoreValue(teampro, "focus"), scoreValue(ottawa, "concentration")]),
      refocus: meanScore([scoreValue(teampro, "refocus"), scoreValue(ottawa, "refocus")]),
      pressure: meanScore([scoreValue(teampro, "stressRegulation"), scoreValue(toughness, "pressureControl")]),
      pain: scoreValue(toughness, "painTolerance"),
      plan: meanScore([scoreValue(teampro, "competitionPlan"), scoreValue(ottawa, "competitionPlan")]),
      imagery: meanScore([scoreValue(teampro, ["imageryAbility", "imageryPractice"]), scoreValue(ottawa, ["imagery", "mentalPractice"])])
    };

    const insights = [];
    if (completed < 2) {
      insights.push({
        title: "目前先看單份結果",
        text: "已有結果可以用於晤談，但尚不足以判斷不同量表之間是否互相支持或矛盾。建議再完成至少一份量表後啟用初步交叉觀察。"
      });
    } else {
      if (metric.stateConfidence != null && metric.confidence != null && metric.confidence >= 70 && metric.stateConfidence < 55) {
        insights.push({ title: "平時把握感尚可，上場自信偏弱", text: `一般自信約 ${metric.confidence}，但競賽狀態自信 ${metric.stateConfidence}。建議追問近期比賽經驗、對手壓力與賽前想法，並用成功片段建立上場提示。` });
      }
      if (metric.anxietyControl != null && metric.anxietyControl < 55 && metric.relaxation != null && metric.relaxation < 60) {
        insights.push({ title: "賽前緊繃與放鬆能力需一起處理", text: `競賽焦慮調節約 ${metric.anxietyControl}、放鬆約 ${metric.relaxation}。建議先固定呼吸與身體放鬆流程，再接近比賽情境練習。` });
      }
      if (metric.commitment != null && metric.commitment >= 75 && metric.pressure != null && metric.pressure < 55) {
        insights.push({ title: "投入高，但壓力調節未跟上", text: `投入與奮鬥約 ${metric.commitment}，壓力調節約 ${metric.pressure}。這類選手常願意撐，但需要學會回報疲勞、設定安全界線與賽後恢復。` });
      }
      if (metric.focus != null && metric.refocus != null && (metric.focus < 60 || metric.refocus < 60)) {
        insights.push({ title: "注意力重點在失誤後拉回", text: `專注約 ${metric.focus ?? "—"}、再專注約 ${metric.refocus ?? "—"}。建議建立「失誤後一個動作＋一句提示語」的重置流程。` });
      }
      if (metric.imagery != null && metric.plan != null && metric.imagery < 60 && metric.plan < 60) {
        insights.push({ title: "賽前預演與計畫要一起補", text: `意象與預演約 ${metric.imagery}、競賽準備約 ${metric.plan}。建議把比賽流程、突發狀況與關鍵動作做成固定腳本。` });
      }
      if (metric.pain != null && metric.pain >= 80 && metric.pressure != null && metric.pressure < 60) {
        insights.push({ title: "忍耐度高，要避免硬撐", text: `傷痛忍受 ${metric.pain}，壓力調節約 ${metric.pressure}。建議教練明確建立傷痛與疲勞回報規則，避免把忍耐誤當穩定。` });
      }
      if (!insights.length) {
        const low = [...axes].sort((a, b) => a.score - b.score)[0];
        const high = [...axes].sort((a, b) => b.score - a.score)[0];
        insights.push({
          title: "目前量表訊號大致一致",
          text: high && low
            ? `相對優勢是「${high.name}」${high.score}，優先補強是「${low.name}」${low.score}。建議以晤談確認是否符合日常觀察。`
            : "目前可用資料有限，建議搭配教練觀察與選手晤談。"
        });
      }
    }

    const nextSteps = completed >= total
      ? ["用最低的 1-2 個綜合構面安排四週心理技能訓練。", "兩週後重測同一份最低構面相關量表，確認變化。", "把綜合版報告作為教練、選手、家長溝通共同語言。"]
      : completed >= 2
        ? ["先用初步交叉觀察安排晤談。", "補齊尚未完成的量表後再看完整綜合。", "不要只看單一分數，優先確認量表訊號是否符合實際訓練觀察。"]
        : ["先完成第二份量表以啟用交叉比對。", "目前仍可針對單份量表的低分構面做簡短晤談。"];

    return { latest, completed, total, stage: compositeLabel(completed, total), axes, insights: insights.slice(0, 5), nextSteps };
  }

  function compositeAnalysisSection(records) {
    const profile = buildCompositeProfile(records);
    const statusRows = assessmentTemplates.map((template) => {
      const record = profile.latest.get(template.id);
      return `
        <div class="composite-status ${record ? "done" : ""}">
          <strong>${escapeHtml(template.name)}</strong>
          <span>${record ? `完成 ${formatDate(record.completedAt)}` : "尚未完成"}</span>
        </div>
      `;
    }).join("");
    const axisRows = profile.axes.length
      ? profile.axes.map((axis) => `
        <div class="composite-axis">
          <div class="split-row"><strong>${escapeHtml(axis.name)}</strong><span>${axis.score}</span></div>
          <div class="composite-track"><i style="width:${Math.max(2, Math.min(100, axis.score))}%"></i></div>
        </div>
      `).join("")
      : empty("尚無足夠資料建立綜合構面。");
    return `
      <section class="report-section composite-section">
        <div class="split-row">
          <div>
            <h2>綜合分析</h2>
            <p class="small-muted">使用每份量表最新一次結果進行交叉比對；完成越多份，判讀越完整。</p>
          </div>
          <span class="status-dot ${profile.completed >= profile.total ? "green" : profile.completed >= 2 ? "orange" : "gray"}">${profile.stage} ${profile.completed}/${profile.total}</span>
        </div>
        <div class="composite-status-grid">${statusRows}</div>
        <div class="grid-2">
          <div class="composite-panel">
            <h3>綜合心理雷達</h3>
            ${axisRows}
          </div>
          <div class="composite-panel">
            <h3>${profile.completed >= 2 ? "交叉觀察" : "下一步"}</h3>
            <div class="composite-insights">
              ${profile.insights.map((item) => `<article><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.text)}</p></article>`).join("")}
            </div>
          </div>
        </div>
        <div class="composite-next">
          ${profile.nextSteps.map((step) => `<span>${escapeHtml(step)}</span>`).join("")}
        </div>
      </section>
    `;
  }

  function compositeReportHtml(athlete, records) {
    const profile = buildCompositeProfile(records);
    const completedRows = assessmentTemplates.map((template) => {
      const record = profile.latest.get(template.id);
      return `<tr><td>${escapeHtml(template.name)}</td><td>${record ? formatDateTime(record.completedAt) : "尚未完成"}</td></tr>`;
    }).join("");
    const axisRows = profile.axes.length
      ? profile.axes.map((axis) => `<tr><td>${escapeHtml(axis.name)}</td><td>${axis.score}</td></tr>`).join("")
      : `<tr><td colspan="2">尚無足夠資料建立綜合構面</td></tr>`;
    return `
      <div class="rep-doc rep-coach">
        <header class="rep-head">
          <h1>${escapeHtml(athlete.name || "選手")}｜綜合心理雷達報告</h1>
          <p class="rep-sub">${escapeHtml(athlete.sport || "")}　｜　完成量表 ${profile.completed}/${profile.total}　｜　${escapeHtml(profile.stage)}</p>
        </header>
        <section class="rep-block">
          <h2>量表完成狀態</h2>
          <table class="rep-table"><thead><tr><th>量表</th><th>最新完成時間</th></tr></thead><tbody>${completedRows}</tbody></table>
        </section>
        <section class="rep-block">
          <h2>綜合構面</h2>
          <table class="rep-table"><thead><tr><th>構面</th><th>綜合分數</th></tr></thead><tbody>${axisRows}</tbody></table>
        </section>
        <section class="rep-block">
          <h2>${profile.completed >= 2 ? "交叉觀察" : "下一步"}</h2>
          <table class="rep-table"><tbody>${profile.insights.map((item) => `<tr><td class="rep-th">${escapeHtml(item.title)}</td><td>${escapeHtml(item.text)}</td></tr>`).join("")}</tbody></table>
        </section>
        <section class="rep-block">
          <h2>建議處理</h2>
          <table class="rep-table"><tbody>${profile.nextSteps.map((step) => `<tr><td>${escapeHtml(step)}</td></tr>`).join("")}</tbody></table>
        </section>
        <footer class="rep-foot">本綜合報告使用每份量表最新一次結果進行規則式交叉比對，僅供心理技能訓練、晤談與追蹤參考，不作為醫療或心理診斷依據。</footer>
      </div>
    `;
  }

  function priorityCard(row) {
    const record = row.record;
    const changes = record?.changeFromPrevious?.filter((item) => item.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 2) || [];
    const watch = record?.dimensionScores ? [...record.dimensionScores].sort((a, b) => a.score - b.score).slice(0, 3) : [];
    return `
      <article class="status-card ${row.status}">
        <div class="split-row">
          <div>
            <h3>${escapeHtml(row.athlete.name)}｜${escapeHtml(row.athlete.sport || "未設定")}</h3>
            <span class="status-dot ${row.status}">${escapeHtml(statusLabel(row.status))}</span>
            ${record ? `<span class="scale-tag">${escapeHtml(assessmentName(record))}</span>` : ""}
          </div>
          <span class="small-muted">${record ? formatDateTime(record.completedAt) : "尚未完成"}</span>
        </div>
        ${record ? `
          <dl class="status-details">
            <dt>本次最需要注意</dt><dd>${watch.map((item) => escapeHtml(item.name)).join("、") || "資料不足"}</dd>
            <dt>與上次相比</dt><dd>${changes.length ? changes.map((item) => `${escapeHtml(item.name)}下降${Math.abs(item.delta)}%`).join("；") : "尚無明顯下降或無前次資料"}</dd>
            <dt>是否連續下降</dt><dd>${record.alertReasons.filter((reason) => reason.includes("連續")).join("；") || "未達提醒條件"}</dd>
            <dt>一句話摘要</dt><dd>${escapeHtml(record.aiSummary)}</dd>
            <dt>建議詢問</dt><dd>${escapeHtml(record.suggestedQuestion)}</dd>
            <dt>追蹤日期</dt><dd>${row.followUp?.followUpDate || "尚未設定"}${row.overdue ? "｜已逾期" : ""}</dd>
          </dl>
          <div class="meta-row">
            <span class="meta-pill">${record.viewed ? "已查看" : "尚未查看"}</span>
            <span class="meta-pill">${row.cared ? "已關心" : "尚未關心"}</span>
          </div>
          <div class="toolbar">
            <button class="ghost" data-nav="/coach/athletes/${record.athleteId}" type="button">查看完整狀態</button>
            <button class="ghost" data-viewed="${record.id}" type="button">標記已查看</button>
            <button class="ghost" data-care="${record.id}:${record.athleteId}" type="button">開始關心</button>
            <button class="primary" data-follow="${record.id}:${record.athleteId}" type="button">設定追蹤</button>
          </div>
        ` : `
          <p>尚未完成本次測驗，暫不產生分數、雷達圖或AI摘要。</p>
          <button class="ghost" data-nav="/coach/athletes/${row.athlete.id}" type="button">查看資料</button>
        `}
      </article>
    `;
  }

  async function renderAllAthletes() {
    const { rows, stats } = await getCoachData();
    const filtered = filterRows(rows);
    coachShell("/coach/athletes", `
      <div class="page-heading">
        <div>
          <p class="eyebrow">填報結果</p>
          <h1>結果清單</h1>
          <p class="small-muted">共 ${rows.length} 位，符合目前條件 ${filtered.length} 位。</p>
        </div>
      </div>
      <section class="report-section">
        <div class="dashboard-stats">
          ${statCard("選手總數", stats.total)}
          ${statCard("完成填報", stats.completed)}
          ${statCard("尚未填報", stats.pending)}
          ${statCard("需優先關心", stats.priority)}
          ${statCard("今日待追蹤", stats.dueToday)}
          ${statCard("逾期未追蹤", stats.overdue)}
        </div>
      </section>
      <section class="report-section">
        <h2>篩選</h2>
        <div class="filter-bar" role="toolbar" aria-label="結果篩選">
          ${filterButton("all", "全部")}
          ${filterButton("red", "優先關心")}
          ${filterButton("orange", "觀察中")}
          ${filterButton("green", "穩定")}
          ${filterButton("gray", "尚未填報")}
          ${filterButton("unviewed", "尚未查看")}
          ${filterButton("uncared", "尚未關心")}
          ${filterButton("today", "今日追蹤")}
          ${filterButton("overdue", "逾期追蹤")}
        </div>
        <form class="search-row" id="athleteFilterForm">
          <label class="field">搜尋
            <input id="athleteSearch" value="${escapeHtml(state.search)}" placeholder="姓名或運動項目">
          </label>
          <label class="field">日期
            <select id="athleteDateFilter">
              ${dateOption("all", "全部日期")}
              ${dateOption("7", "最近7天")}
              ${dateOption("30", "最近30天")}
              ${dateOption("custom", "自訂區間")}
            </select>
          </label>
          <label class="field">起日
            <input id="athleteStartDate" type="date" value="${escapeHtml(state.customStart)}" ${state.dateFilter === "custom" ? "" : "disabled"}>
          </label>
          <label class="field">迄日
            <input id="athleteEndDate" type="date" value="${escapeHtml(state.customEnd)}" ${state.dateFilter === "custom" ? "" : "disabled"}>
          </label>
          <div class="toolbar filter-actions">
            <button class="primary" type="submit">套用</button>
            <button class="ghost" type="button" id="clearAthleteFilters">清除</button>
          </div>
        </form>
      </section>
      <section class="report-section">
        <h2>選手結果</h2>
        ${filtered.length ? `
          <div class="athlete-table-wrap">
            <table class="score-table athlete-table">
              <thead>
                <tr>
                  <th>姓名</th><th>項目</th><th>量表</th><th>完成時間</th><th>狀態</th>
                  <th>最低構面</th><th>與上次相比</th><th>查看</th><th>關心</th><th>追蹤日</th>
                </tr>
              </thead>
              <tbody>${filtered.map(tableRow).join("")}</tbody>
            </table>
          </div>
          <div class="mobile-card-list">${filtered.map(mobileAthleteCard).join("")}</div>
        ` : empty("目前沒有符合條件的選手結果。")}
      </section>
    `);
    bindCoachActions();
    bindAthleteListControls();
  }

  function filterButton(value, label) {
    return `<button class="${state.filter === value ? "active" : ""}" type="button" data-filter="${value}">${escapeHtml(label)}</button>`;
  }

  function dateOption(value, label) {
    return `<option value="${value}" ${state.dateFilter === value ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function filterRows(rows) {
    const search = state.search.trim().toLowerCase();
    return rows.filter((row) => {
      const recordDate = row.record?.completedAt?.slice(0, 10) || "";
      if (state.filter === "red" && row.status !== "red") return false;
      if (state.filter === "orange" && row.status !== "orange") return false;
      if (state.filter === "green" && row.status !== "green") return false;
      if (state.filter === "gray" && row.record) return false;
      if (state.filter === "unviewed" && row.viewed) return false;
      if (state.filter === "uncared" && row.cared) return false;
      if (state.filter === "today" && !row.dueToday) return false;
      if (state.filter === "overdue" && !row.overdue) return false;
      if (search && !`${row.athlete.name} ${row.athlete.sport}`.toLowerCase().includes(search)) return false;
      if (state.dateFilter === "7" && (!recordDate || daysBetween(recordDate, todayISO()) > 7)) return false;
      if (state.dateFilter === "30" && (!recordDate || daysBetween(recordDate, todayISO()) > 30)) return false;
      if (state.dateFilter === "custom") {
        if (state.customStart && recordDate < state.customStart) return false;
        if (state.customEnd && recordDate > state.customEnd) return false;
      }
      return true;
    });
  }

  function scoreById(record, id) {
    return record?.dimensionScores?.find((item) => item.id === id)?.score ?? "—";
  }

  function tableRow(row) {
    const record = row.record;
    const lowScores = record?.dimensionScores
      ? [...record.dimensionScores].sort((a, b) => a.score - b.score).slice(0, 2).map((item) => `${item.name}${item.score}`).join("、")
      : "—";
    const compare = record?.changeFromPrevious
      ? record.changeFromPrevious.filter((item) => item.delta < 0).slice(0, 2).map((item) => `${item.name}${item.delta}%`).join("；") || "無明顯下降"
      : "—";
    return `
      <tr data-nav="/coach/athletes/${row.athlete.id}">
        <td>${escapeHtml(row.athlete.name)}</td>
        <td>${escapeHtml(row.athlete.sport || "未設定")}</td>
        <td>${record ? escapeHtml(assessmentName(record)) : "—"}</td>
        <td>${record ? formatDateTime(record.completedAt) : "尚未完成"}</td>
        <td>${escapeHtml(statusLabel(row.status))}</td>
        <td>${escapeHtml(lowScores)}</td>
        <td>${escapeHtml(compare)}</td>
        <td>${row.viewed ? "是" : "否"}</td>
        <td>${row.cared ? "是" : "否"}</td>
        <td>${row.followUp?.followUpDate || "—"}</td>
      </tr>
    `;
  }

  function mobileAthleteCard(row) {
    const record = row.record;
    return `
      <article class="mobile-athlete-card">
        <div class="split-row">
          <h3>${escapeHtml(row.athlete.name)}</h3>
          <span class="status-dot ${row.status}">${escapeHtml(statusLabel(row.status))}</span>
        </div>
        <p>${escapeHtml(row.athlete.sport || "未設定")}｜${record ? `${escapeHtml(assessmentName(record))}｜${formatDateTime(record.completedAt)}` : "尚未完成"}</p>
        <div class="meta-row">
          <span class="meta-pill">已查看：${row.viewed ? "是" : "否"}</span>
          <span class="meta-pill">已關心：${row.cared ? "是" : "否"}</span>
          <span class="meta-pill">追蹤：${row.followUp?.followUpDate || "—"}</span>
        </div>
        <button class="ghost" data-nav="/coach/athletes/${row.athlete.id}" type="button">查看完整狀態</button>
      </article>
    `;
  }

  function bindAthleteListControls() {
    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", async () => {
        state.filter = button.dataset.filter || "all";
        await renderAllAthletes();
      });
    });
    document.querySelector("#athleteDateFilter")?.addEventListener("change", (event) => {
      state.dateFilter = event.target.value;
      const custom = state.dateFilter === "custom";
      document.querySelector("#athleteStartDate").disabled = !custom;
      document.querySelector("#athleteEndDate").disabled = !custom;
    });
    document.querySelector("#athleteFilterForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      state.search = document.querySelector("#athleteSearch").value.trim();
      state.dateFilter = document.querySelector("#athleteDateFilter").value;
      state.customStart = document.querySelector("#athleteStartDate").value;
      state.customEnd = document.querySelector("#athleteEndDate").value;
      await renderAllAthletes();
    });
    document.querySelector("#clearAthleteFilters")?.addEventListener("click", async () => {
      state.filter = "all";
      state.search = "";
      state.dateFilter = "all";
      state.customStart = "";
      state.customEnd = "";
      await renderAllAthletes();
    });
  }

  async function renderAthleteDetail(params) {
    const athlete = await repos.athletes.findById(params.athleteId);
    if (!athlete) {
      coachShell("/coach/athletes", empty("找不到選手資料。"));
      return;
    }
    const [records, followUps] = await Promise.all([
      repos.assessments.recordsForAthlete(athlete.id),
      repos.followUps.forAthlete(athlete.id)
    ]);
    const record = records.find((item) => item.id === params.record) || records[0];
    if (!record) {
      coachShell("/coach/athletes", `
        <section class="panel-flow">
          <p class="eyebrow">${escapeHtml(athlete.sport || "未設定")}</p>
          <h1>${escapeHtml(athlete.name)}</h1>
          ${empty("尚未有選手完成本次測驗。")}
        </section>
      `);
      return;
    }
    state.currentAthleteName = athlete.name;
    state.currentCoachRecord = record;
    coachShell("/coach/athletes", `
      <section class="athlete-detail">
        <div class="page-heading">
          <div>
            <p class="eyebrow">${escapeHtml(athlete.sport || "未設定")}</p>
            <h1>${escapeHtml(athlete.name)}</h1>
            <p class="small-muted">本次量表：${escapeHtml(assessmentName(record))}｜完成 ${formatDateTime(record.completedAt)}</p>
          </div>
          <div class="toolbar">
            <button class="primary" id="genAthleteReport" type="button">產出報告</button>
            <button class="ghost" data-nav="/coach/athletes" type="button">回結果清單</button>
          </div>
        </div>
        ${recordHistoryList(records, record.id, athlete.id)}
        ${compositeAnalysisSection(records)}
        <section class="report-section">
          <h2>雷達圖</h2>
          <div id="detailRadar"></div>
          <div class="score-badges">
            ${scoreBadges(record.dimensionScores)}
          </div>
        </section>
        <section class="report-section">
          <h2>分數</h2>
          ${scoreTable(record.dimensionScores)}
        </section>
        <section class="report-section">
          <h2>回饋與分析</h2>
          ${followUpForm(record, athlete)}
        </section>
      </section>
    `);
    drawRadarInto("#detailRadar", record.dimensionScores, null, "雷達圖範圍固定為0至100。");
    bindNav();
    bindFollowUpForm();
    document.querySelector("#genAthleteReport")?.addEventListener("click", () => {
      showAthleteReport(athlete, record, records, followUps);
    });
  }

  function athleteReportText(athlete, record, followUps) {
    const scores = record.dimensionScores || [];
    const watch = [...scores].sort((a, b) => a.score - b.score).slice(0, 3).map((item) => item.name).join("、") || "資料不足";
    const drops = (record.changeFromPrevious || []).filter((item) => item.delta < 0)
      .sort((a, b) => a.delta - b.delta).slice(0, 2)
      .map((item) => `${item.name}下降${Math.abs(item.delta)}%`).join("；") || "尚無明顯下降或無前次資料";
    const latest = followUps[0];
    return [
      "【心理狀態報告】",
      `選手：${athlete.name}｜${athlete.sport || "未設定"}`,
      `完成時間：${formatDateTime(record.completedAt)}`,
      `整體狀態：${statusLabel(record.overallStatus)}`,
      `最需要注意：${watch}`,
      `與上次相比：${drops}`,
      `一句話摘要：${record.aiSummary || "—"}`,
      `建議詢問：${record.suggestedQuestion || "—"}`,
      `分數：${scores.map((item) => `${item.name}${item.score}`).join("、") || "無"}`,
      latest ? `最近關心：${followStatusLabel(latest.status)}｜${latest.note || "—"}` : "最近關心：尚無紀錄"
    ].join("\n");
  }

  function showAthleteReport(athlete, record, records, followUps) {
    const scores = record.dimensionScores || [];
    const watch = [...scores].sort((a, b) => a.score - b.score).slice(0, 3).map((item) => escapeHtml(item.name)).join("、") || "資料不足";
    const changes = record.changeFromPrevious || [];
    const changeRows = changes.length
      ? changes.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.delta > 0 ? "+" : ""}${item.delta}%</td></tr>`).join("")
      : `<tr><td colspan="2">尚無前次資料可比較</td></tr>`;
    const historyRows = followUps.length
      ? followUps.map((item) => `<tr><td>${item.updatedAt ? formatDate(item.updatedAt) : "—"}</td><td>${escapeHtml(followStatusLabel(item.status))}</td><td>${escapeHtml(item.note || "—")}</td><td>${escapeHtml(item.nextAction || "—")}</td><td>${item.followUpDate || "—"}</td></tr>`).join("")
      : `<tr><td colspan="5">尚無關心與追蹤紀錄</td></tr>`;
    const completedCount = (records || []).length;
    let reportAudience = "coach";
    const renderReportBody = () => {
      const engine = window.WenMindReport;
      const host = document.querySelector("#repBody");
      if (!host) return;
      if (reportAudience === "composite") {
        host.innerHTML = compositeReportHtml(athlete, records || []);
        return;
      }
      if (!engine) { host.innerHTML = "<p class=\"report-note\">報告引擎未載入（請確認 reportEngine.js）。</p>"; return; }
      const rep = engine.buildReport({
        athlete, record,
        assessmentName: assessmentName(record),
        completedAt: formatDateTime(record.completedAt),
        audience: reportAudience
      });
      host.innerHTML = rep.html;
    };
    shell(`
      <section class="athlete-report report-print">
        <div class="toolbar no-print">
          <button class="ghost" type="button" id="reportBack">返回</button>
          <div class="rep-tabs">
            <button class="rep-tab" type="button" data-aud="composite">綜合版</button>
            <button class="rep-tab active" type="button" data-aud="coach">教練版</button>
            <button class="rep-tab" type="button" data-aud="parent">家長版</button>
            <button class="rep-tab" type="button" data-aud="athlete">選手版</button>
          </div>
          <button class="ghost" type="button" id="reportCopy">複製文字（給LINE）</button>
          <button class="primary" type="button" id="reportPrint">列印／儲存PDF</button>
        </div>
        <section class="report-block">
          <h2>雷達圖</h2>
          <div id="reportRadar"></div>
        </section>
        <div id="repBody"></div>
        <section class="report-block no-print report-extra">
          <h2>與上次相比</h2>
          <table class="score-table"><thead><tr><th>構面</th><th>變化</th></tr></thead><tbody>${changeRows}</tbody></table>
          <h2>關心與追蹤紀錄</h2>
          <table class="score-table"><thead><tr><th>日期</th><th>狀態</th><th>紀錄</th><th>後續處理</th><th>下次追蹤</th></tr></thead><tbody>${historyRows}</tbody></table>
        </section>
      </section>
    `);
    drawRadarInto("#reportRadar", scores, null, "雷達圖範圍固定為0至100。");
    renderReportBody();
    document.querySelector("#reportBack").addEventListener("click", () => renderAthleteDetail({ athleteId: athlete.id }));
    document.querySelector("#reportPrint").addEventListener("click", () => window.print());
    document.querySelectorAll(".rep-tab").forEach((btn) => btn.addEventListener("click", () => {
      reportAudience = btn.dataset.aud || "coach";
      document.querySelectorAll(".rep-tab").forEach((b) => b.classList.toggle("active", b === btn));
      renderReportBody();
    }));
    document.querySelector("#reportCopy").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      try {
        await navigator.clipboard.writeText(athleteReportText(athlete, record, followUps));
        button.textContent = "已複製";
        setTimeout(() => { button.textContent = "複製文字（給LINE）"; }, 1500);
      } catch {
        button.textContent = "請手動複製";
      }
    });
  }

  function scoreComparisonTable(record, previous) {
    return `
      <table class="score-table">
        <thead><tr><th>構面</th><th>本次</th><th>上次</th><th>變化</th></tr></thead>
        <tbody>${record.dimensionScores.map((score) => {
          const prev = previous.dimensionScores.find((item) => item.id === score.id);
          const delta = prev ? score.score - prev.score : null;
          return `<tr><td>${escapeHtml(score.name)}</td><td>${score.score}</td><td>${prev?.score ?? "—"}</td><td>${delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta}%`}</td></tr>`;
        }).join("")}</tbody>
      </table>
    `;
  }

  function trendList(records) {
    const recent = records.slice(0, 4).reverse();
    return `<div class="trend-list">${recent.map((record) => {
      const avg = Math.round(record.dimensionScores.reduce((sum, item) => sum + item.score, 0) / record.dimensionScores.length);
      return `<div><span>${formatDate(record.completedAt)}</span><strong style="width:${avg}%">${avg}</strong></div>`;
    }).join("")}</div>`;
  }

  function scoreTable(scores) {
    return `
      <table class="score-table">
        <thead><tr><th>構面</th><th>分數</th></tr></thead>
        <tbody>${scores.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.score}</td></tr>`).join("")}</tbody>
      </table>
    `;
  }

  function scoreBadges(scores) {
    return scores.map((item) => `
      <div class="score-badge">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${item.score}</span>
      </div>
    `).join("");
  }

  function dimensionName(template, id) {
    return template.dimensions?.find((item) => item.id === id)?.name || id;
  }

  function followUpItem(item) {
    return `
      <article class="follow-item">
        <strong>回饋與分析｜${item.updatedAt ? formatDateTime(item.updatedAt) : "未設定時間"}</strong>
        <p>${escapeHtml(item.note || "未填寫紀錄")}</p>
      </article>
    `;
  }

  function followStatusLabel(status) {
    return {
      observing: "持續觀察",
      improved: "已有改善",
      closed: "結束追蹤",
      contacted: "已關心"
    }[status] || "持續觀察";
  }

  function followUpForm(record, athlete) {
    return `
      <form class="follow-form" id="followUpForm">
        <h3>回饋與分析</h3>
        <input type="hidden" id="followAthleteId" value="${escapeHtml(athlete.id)}">
        <input type="hidden" id="followAssessmentId" value="${escapeHtml(record.id)}">
        <label class="field">內容
          <textarea id="followNote" placeholder="記錄教練的回饋與分析"></textarea>
        </label>
        <div class="toolbar">
          <button class="ghost" type="button" id="generateFollowReport">帶入摘要</button>
          <button class="primary" type="submit">儲存</button>
        </div>
      </form>
    `;
  }

  async function renderAssessmentManagement() {
    const sessions = await repos.groups.sessions();
    coachShell("/coach/assessments", `
      <div class="page-heading">
        <div>
          <p class="eyebrow">測驗管理</p>
          <h1>建立連結與QR Code</h1>
        </div>
      </div>
      <section class="report-section">
        <h2>測驗連結</h2>
        <p>把連結或 QR Code 給選手，選手開啟後可自行選擇要填寫的心理量表。</p>
        ${sessions.map((session) => {
          const link = `${location.origin}${location.pathname}#/assessment?group=${encodeURIComponent(session.groupId)}&assessment=${encodeURIComponent(session.id)}&token=${encodeURIComponent(session.token)}`;
          // 預設場次用資料夾內離線 QR 圖（QR 碼.png，已確認指向同一連結）；其他場次才即時產生。
          const staticLink = "https://shark7763-del.github.io/TeamPro-Psychology-Radar/#/assessment?group=local-group&assessment=local-session&token=local-link";
          const qrSrc = link === staticLink
            ? encodeURI("QR 碼.png")
            : `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(link)}`;
          return `
            <article class="session-card">
              <h3>${escapeHtml(session.name)}</h3>
              <p>測驗期間：${session.startDate || "未設定"} 至 ${session.endDate || "未設定"}</p>
              <input readonly value="${escapeHtml(link)}">
              <div class="toolbar">
                <button class="ghost" type="button" data-copy="${escapeHtml(link)}">複製連結</button>
              </div>
              <img class="qr-code-img" src="${escapeHtml(qrSrc)}" alt="${escapeHtml(session.name)} 測驗連結 QR Code" width="176" height="176" loading="lazy">
              <p class="small-muted">選手掃描 QR Code 或開啟連結即可填寫；每份量表會建立獨立歷史紀錄。</p>
            </article>
          `;
        }).join("")}
      </section>
    `);
    document.querySelectorAll("[data-copy]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(button.dataset.copy);
          button.textContent = "已複製";
          setTimeout(() => { button.textContent = "複製連結"; }, 1500);
        } catch {
          button.textContent = "請手動複製";
        }
      });
    });
  }

  async function renderFollowUps() {
    navigate("/coach/athletes");
  }

  function bindNav() {
    document.querySelectorAll("[data-nav]").forEach((item) => {
      item.addEventListener("click", () => navigate(item.dataset.nav));
    });
  }

  function bindCoachActions() {
    bindNav();
    document.querySelectorAll("[data-viewed]").forEach((button) => {
      button.addEventListener("click", async () => {
        await repos.assessments.markViewed(button.dataset.viewed);
        await renderRoute();
      });
    });
    document.querySelectorAll("[data-care], [data-follow]").forEach((button) => {
      button.addEventListener("click", () => {
        const payload = button.dataset.care || button.dataset.follow;
        const [recordId, athleteId] = payload.split(":");
        navigate(`/coach/athletes/${athleteId}?record=${recordId}`);
      });
    });
  }

  function bindFollowUpForm() {
    bindNav();
    document.querySelector("#generateFollowReport")?.addEventListener("click", () => {
      const textarea = document.querySelector("#followNote");
      if (!textarea) return;
      const scores = state.currentCoachRecord?.dimensionScores || [];
      const summary = state.currentCoachRecord?.aiSummary || "目前資料不足，尚無法產生趨勢摘要。";
      const question = state.currentCoachRecord?.suggestedQuestion || "建議先持續觀察。";
      textarea.value = [
        `選手：${state.currentAthleteName || "未命名"}`,
        `狀態：${state.currentCoachRecord ? statusLabel(state.currentCoachRecord.overallStatus) : "資料不足"}`,
        `摘要：${summary}`,
        `建議詢問：${question}`,
        `分數：${scores.map((item) => `${item.name}${item.score}`).join("、") || "無"}`
      ].join("\n");
    });
    document.querySelector("#followUpForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      await repos.followUps.save({
        athleteId: document.querySelector("#followAthleteId").value,
        assessmentId: document.querySelector("#followAssessmentId").value,
        note: document.querySelector("#followNote").value
      });
      await renderRoute();
    });
  }

  function drawRadarInto(selector, current, previous, caption) {
    const host = document.querySelector(selector);
    if (!host) return;
    host.innerHTML = "";
    const node = radarTemplate.content.cloneNode(true);
    host.appendChild(node);
    const canvas = host.querySelector("canvas");
    host.querySelector(".radar-caption").textContent = caption;
    drawRadar(canvas, current, previous);
  }

  function drawRadar(canvas, current, previous) {
    const axes = current || [];
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.33;
    ctx.clearRect(0, 0, width, height);
    ctx.font = "22px Microsoft JhengHei, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let ring = 1; ring <= 5; ring += 1) polygon(ctx, axes.length, cx, cy, radius * ring / 5, null, "rgba(170,205,220,.22)");
    axes.forEach((axis, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / axes.length;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.strokeStyle = "rgba(170,205,220,.18)";
      ctx.stroke();
      ctx.fillStyle = "#e7fbff";
      wrapLabel(ctx, axis.name, cx + Math.cos(angle) * (radius + 64), cy + Math.sin(angle) * (radius + 48), 110);
    });
    if (previous) scorePolygon(ctx, axes, previous, cx, cy, radius, "rgba(169,191,212,.42)", "rgba(169,191,212,.10)", [8, 7]);
    scorePolygon(ctx, axes, current, cx, cy, radius, "#19d8ff", "rgba(25,216,255,.25)");
    drawScoreLabels(ctx, axes, current, cx, cy, radius);
  }

  function polygon(ctx, sides, cx, cy, radius, fill, stroke) {
    if (!sides) return;
    ctx.beginPath();
    for (let i = 0; i < sides; i += 1) {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / sides;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  function scorePolygon(ctx, axes, scores, cx, cy, radius, stroke, fill, dash = []) {
    if (!axes.length) return;
    ctx.save();
    ctx.setLineDash(dash);
    ctx.beginPath();
    axes.forEach((axis, index) => {
      const item = scores.find((score) => score.id === axis.id);
      const ratio = Math.max(0, Math.min(1, (item?.score || 0) / (item?.max || 100)));
      const angle = -Math.PI / 2 + index * Math.PI * 2 / axes.length;
      const x = cx + Math.cos(angle) * radius * ratio;
      const y = cy + Math.sin(angle) * radius * ratio;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }

  function drawScoreLabels(ctx, axes, scores, cx, cy, radius) {
    if (!axes.length) return;
    ctx.save();
    ctx.font = "700 18px Microsoft JhengHei, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    axes.forEach((axis, index) => {
      const value = scores.find((item) => item.id === axis.id)?.score;
      if (value == null) return;
      const angle = -Math.PI / 2 + index * Math.PI * 2 / axes.length;
      const pointRadius = radius * value / 100;
      const pointX = cx + Math.cos(angle) * pointRadius;
      const pointY = cy + Math.sin(angle) * pointRadius;
      const labelDistance = 18;
      const x = pointX + Math.cos(angle) * labelDistance;
      const y = pointY + Math.sin(angle) * labelDistance;
      const text = String(value);
      const width = Math.max(30, ctx.measureText(text).width + 16);
      const height = 28;
      roundRect(ctx, x - width / 2, y - height / 2, width, height, 10);
      ctx.fillStyle = "rgba(6,18,32,.92)";
      ctx.fill();
      ctx.strokeStyle = "rgba(25,216,255,.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#9cf1ff";
      ctx.fillText(text, x, y + 1);
    });
    ctx.restore();
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function wrapLabel(ctx, text, x, y, maxWidth) {
    const chars = [...text];
    let line = "";
    const lines = [];
    chars.forEach((char) => {
      const test = line + char;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = char;
      } else {
        line = test;
      }
    });
    lines.push(line);
    lines.forEach((item, index) => ctx.fillText(item, x, y + (index - (lines.length - 1) / 2) * 26));
  }

  function exportRows(rows) {
    const header = ["姓名", "運動項目", "最新回報時間", "整體狀態", "自信心", "專注力", "訓練動機", "壓力調節", "心理疲勞恢復", "已查看", "已關心", "下次追蹤"];
    const lines = rows.map((row) => [
      row.athlete.name,
      row.athlete.sport || "",
      row.record?.completedAt || "",
      statusLabel(row.status),
      scoreById(row.record, "confidence"),
      scoreById(row.record, "focus"),
      scoreById(row.record, "motivation"),
      scoreById(row.record, "pressure"),
      scoreById(row.record, "recovery"),
      row.viewed ? "是" : "否",
      row.cared ? "是" : "否",
      row.followUp?.followUpDate || ""
    ]);
    const csv = [header, ...lines].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wenmind-status-${todayISO()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit" }).format(new Date(value));
  }

  function formatDateTime(value) {
    return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  bootstrap();
})();
