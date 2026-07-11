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

  async function syncPull() {
    if (typeof repos.store.pull === "function") {
      try {
        await repos.store.pull();
      } catch {
        /* 離線時沿用本機快取，不阻斷畫面 */
      }
    }
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
    coachLink.hidden = parsed.name.startsWith("/coach/") && parsed.name !== "/coach/login";
    if (parsed.name.startsWith("/coach/") && parsed.name !== "/coach/login") {
      const session = await repos.auth.currentSession();
      if (!session) {
        navigate("/coach/login");
        return;
      }
    }
    // 每次切換畫面先與後台同步一次，確保教練看到選手最新填報、選手拿到最新測驗設定。
    await syncPull();
    const handlers = {
      "/": renderAthleteName,
      "/assessment": renderAssessmentEntry,
      "/coach/login": renderCoachLogin,
      "/coach/dashboard": renderCoachDashboard,
      "/coach/athletes": renderAllAthletes,
      "/coach/athletes/:athleteId": renderAthleteDetail,
      "/coach/assessments": renderAssessmentManagement,
      "/coach/follow-ups": renderFollowUps
    };
    const handler = handlers[parsed.name] || renderNotFound;
    await handler(parsed.params);
    app.focus({ preventScroll: true });
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

  async function renderAthleteResult(recordId) {
    const records = await repos.assessments.recordsForAthlete(state.athlete.id);
    const record = records.find((item) => item.id === recordId) || records[0];
    shell(`
      <section class="result-flow">
        <div class="callout">
          <p class="eyebrow">本次心理狀態已完成送出｜${escapeHtml(statusLabel(record.overallStatus))}</p>
          <h1>恭喜你完成測驗</h1>
        </div>
        <div id="resultRadar"></div>
        <div class="score-badges">
          ${scoreBadges(record.dimensionScores)}
        </div>
        <section class="report-section">
          <h2>分數</h2>
          ${scoreTable(record.dimensionScores)}
        </section>
        <div class="toolbar">
          <button class="primary" type="button" data-nav="/">完成並離開</button>
        </div>
      </section>
    `, { narrow: true });
    bindNav();
    drawRadarInto("#resultRadar", record.dimensionScores, null, "雷達圖範圍固定為0至100。");
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
      ["/coach/athletes", "填報結果"],
      ["/coach/follow-ups", "教練回覆"]
    ];
    shell(`
      <section class="coach-shell">
        <header class="coach-header">
          <div class="coach-brand">
            <p class="eyebrow">運動心理教練後台</p>
            <h2>WenMind × TeamPro</h2>
            <p class="small-muted">展示模式：資料目前儲存在本瀏覽器 localStorage。</p>
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
    coachShell("/coach/dashboard", `
      <div class="assessment-grid coach-workspace">
        ${[
          ["/coach/assessments", "測驗管理", "建立測驗連結與 QR Code。"],
          ["/coach/athletes", "填報結果", "查看選手雷達圖與分數。"],
          ["/coach/follow-ups", "教練回覆", "回覆內容與後續紀錄。"]
        ].map(([path, title, desc]) => `
          <button class="assessment-card" data-nav="${path}" type="button">
            <strong>${title}</strong>
            <span>${desc}</span>
          </button>
        `).join("")}
      </div>
    `);
    bindNav();
  }

  function statCard(label, value) {
    return `<div class="stat-card"><strong>${value}</strong><span>${label}</span></div>`;
  }

  function empty(text) {
    return `<div class="empty-inline">${escapeHtml(text)}</div>`;
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
    const { rows, followUps } = await getCoachData();
    const completed = rows.filter((row) => row.record);
    coachShell("/coach/athletes", `
      <div class="page-heading">
        <div>
          <p class="eyebrow">填報結果</p>
          <h1>結果清單</h1>
        </div>
      </div>
      ${completed.length ? `
        <div class="priority-list">${completed.map((row) => `
          <article class="status-card ${row.status}">
            <div class="split-row">
              <div>
                <h3>${escapeHtml(row.athlete.name)}｜${escapeHtml(row.athlete.sport || "未設定")}</h3>
                <span class="status-dot ${row.status}">${escapeHtml(statusLabel(row.status))}</span>
              </div>
              <span class="small-muted">${formatDateTime(row.record.completedAt)}</span>
            </div>
            <div class="toolbar">
              <button class="primary" data-nav="/coach/athletes/${row.athlete.id}" type="button">查看結果</button>
            </div>
          </article>
        `).join("")}</div>
      ` : empty("目前沒有填報結果。")}
    `);
    bindCoachActions();
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
    const compare = record?.changeFromPrevious
      ? record.changeFromPrevious.filter((item) => item.delta < 0).slice(0, 2).map((item) => `${item.name}${item.delta}%`).join("；") || "無明顯下降"
      : "—";
    return `
      <tr data-nav="/coach/athletes/${row.athlete.id}">
        <td>${escapeHtml(row.athlete.name)}</td>
        <td>${escapeHtml(row.athlete.sport || "未設定")}</td>
        <td>${record ? formatDateTime(record.completedAt) : "尚未完成"}</td>
        <td>${escapeHtml(statusLabel(row.status))}</td>
        <td>${scoreById(record, "confidence")}</td>
        <td>${scoreById(record, "focus")}</td>
        <td>${scoreById(record, "motivation")}</td>
        <td>${scoreById(record, "pressure")}</td>
        <td>${scoreById(record, "recovery")}</td>
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
        <p>${escapeHtml(row.athlete.sport || "未設定")}｜${record ? formatDateTime(record.completedAt) : "尚未完成"}</p>
        <div class="meta-row">
          <span class="meta-pill">已查看：${row.viewed ? "是" : "否"}</span>
          <span class="meta-pill">已關心：${row.cared ? "是" : "否"}</span>
          <span class="meta-pill">追蹤：${row.followUp?.followUpDate || "—"}</span>
        </div>
        <button class="ghost" data-nav="/coach/athletes/${row.athlete.id}" type="button">查看完整狀態</button>
      </article>
    `;
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
    const record = records[0];
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
          </div>
          <div class="toolbar">
            <button class="primary" id="genAthleteReport" type="button">產出報告</button>
            <button class="ghost" data-nav="/coach/athletes" type="button">回結果清單</button>
          </div>
        </div>
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
    shell(`
      <section class="athlete-report report-print">
        <div class="toolbar no-print">
          <button class="ghost" type="button" id="reportBack">返回</button>
          <button class="ghost" type="button" id="reportCopy">複製文字（給LINE）</button>
          <button class="primary" type="button" id="reportPrint">列印／儲存PDF</button>
        </div>
        <header class="report-head">
          <h1>心理狀態報告</h1>
          <p class="report-name">${escapeHtml(athlete.name)}｜${escapeHtml(athlete.sport || "未設定")}</p>
          <p class="report-meta">完成時間：${formatDateTime(record.completedAt)}　｜　整體狀態：${escapeHtml(statusLabel(record.overallStatus))}　｜　累計填報：${completedCount} 次</p>
        </header>
        <section class="report-block">
          <h2>雷達圖</h2>
          <div id="reportRadar"></div>
        </section>
        <section class="report-block">
          <h2>構面分數</h2>
          ${scoreTable(scores)}
          <p class="report-note"><strong>本次最需要注意：</strong>${watch}</p>
        </section>
        <section class="report-block">
          <h2>與上次相比</h2>
          <table class="score-table"><thead><tr><th>構面</th><th>變化</th></tr></thead><tbody>${changeRows}</tbody></table>
        </section>
        <section class="report-block">
          <h2>摘要與建議</h2>
          <p class="report-note"><strong>一句話摘要：</strong>${escapeHtml(record.aiSummary || "—")}</p>
          <p class="report-note"><strong>建議詢問：</strong>${escapeHtml(record.suggestedQuestion || "—")}</p>
        </section>
        <section class="report-block">
          <h2>關心與追蹤紀錄</h2>
          <table class="score-table"><thead><tr><th>日期</th><th>狀態</th><th>紀錄</th><th>後續處理</th><th>下次追蹤</th></tr></thead><tbody>${historyRows}</tbody></table>
        </section>
        <footer class="report-foot">本報告僅供自我了解與後續心理訓練規劃、溝通參考，不作為醫療或心理診斷依據。</footer>
      </section>
    `);
    drawRadarInto("#reportRadar", scores, null, "雷達圖範圍固定為0至100。");
    document.querySelector("#reportBack").addEventListener("click", () => renderAthleteDetail({ athleteId: athlete.id }));
    document.querySelector("#reportPrint").addEventListener("click", () => window.print());
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
    const { rows, followUps } = await getCoachData();
    coachShell("/coach/follow-ups", `
      <div class="page-heading">
        <div>
          <p class="eyebrow">回饋與分析</p>
          <h1>回饋內容</h1>
        </div>
      </div>
      <section class="report-section">
        <h2>回饋列表</h2>
        ${followUps.length ? `<div class="follow-list">${followUps.map((item) => {
          const row = rows.find((candidate) => candidate.athlete.id === item.athleteId);
          return `<article class="follow-item"><strong>${escapeHtml(row?.athlete.name || "未知選手")}</strong><p>${escapeHtml(item.note || "未填寫回饋")}</p></article>`;
        }).join("")}</div>` : empty("尚無回覆內容。")}
      </section>
    `);
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
      const value = scores.find((item) => item.id === axis.id)?.score || 0;
      const angle = -Math.PI / 2 + index * Math.PI * 2 / axes.length;
      const x = cx + Math.cos(angle) * radius * value / 100;
      const y = cy + Math.sin(angle) * radius * value / 100;
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
