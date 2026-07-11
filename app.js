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
    dimensionCatalog,
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
    activeSession: null,
    templateId: "quick-state-v1",
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
    state.templateId = session.templateId || "quick-state-v1";
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
    const draft = await repos.assessments.readDraft(state.athlete.id, session.id);
    const answered = Object.keys(draft?.answers || {}).length;
    shell(`
      <section class="panel-flow">
        <p class="eyebrow">${escapeHtml(state.athlete.name)}｜${escapeHtml(state.athlete.sport)}</p>
        <h1>${escapeHtml(template.name)}</h1>
        <p>${escapeHtml(template.description)}</p>
        <p class="notice">${escapeHtml(template.disclaimer)}</p>
        <div class="steps-list">
          <span>閱讀簡短使用與隱私說明</span>
          <span>逐題作答並自動暫存</span>
          <span>送出後同步到心理教練後台</span>
        </div>
        <div class="toolbar">
          <button class="ghost" type="button" id="editProfile">修改運動項目</button>
          <button class="primary" type="button" id="startAssessment">${answered ? "繼續" : "開始測驗"}</button>
        </div>
      </section>
    `, { narrow: true });
    document.querySelector("#editProfile").addEventListener("click", renderProfileSetup);
    document.querySelector("#startAssessment").addEventListener("click", () => renderConsent(template));
  }

  function renderConsent(template) {
    shell(`
      <section class="panel-flow">
        <p class="eyebrow">${escapeHtml(template.name)}</p>
        <h1>開始前請閱讀</h1>
        <p>這份結果提供自我了解與後續溝通參考，不代表醫療或心理疾病診斷。</p>
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
      const draft = await repos.assessments.readDraft(state.athlete.id, state.activeSession.id);
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
    const existing = await repos.assessments.readDraft(state.athlete.id, state.activeSession.id);
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
            <strong>${escapeHtml(template.name)}</strong>
            <span>第${state.questionIndex + 1}題／${template.questions.length}題</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>
          <div class="progress-meta"><span>自動暫存</span><span>已完成 ${answered}/${template.questions.length}</span></div>
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
          <button class="primary" id="nextQuestion" type="button">${state.questionIndex === template.questions.length - 1 ? "送出前檢查" : "下一題"}</button>
        </div>
      </section>
    `, { narrow: true });
    document.querySelectorAll(".answer-option").forEach((button) => {
      button.addEventListener("click", async () => {
        const nextDraft = await currentDraft();
        nextDraft.answers[question.id] = Number(button.dataset.value);
        await repos.assessments.saveDraft(state.athlete.id, state.activeSession.id, nextDraft);
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
      if (state.questionIndex === template.questions.length - 1) await renderSubmitConfirm();
      else {
        state.questionIndex += 1;
        await renderQuestion();
      }
    });
  }

  async function renderSubmitConfirm() {
    const template = getTemplate(state.templateId);
    const draft = await currentDraft();
    const validation = validateAnswers(template, draft.answers || {});
    shell(`
      <section class="panel-flow">
        <p class="eyebrow">送出前檢查</p>
        <h1>${validation.complete ? "你已完成全部題目" : `你還有${validation.missing.length}題尚未完成。`}</h1>
        <p>${validation.complete ? "請確認送出，本次心理狀態會建立一筆新的歷史紀錄。" : "點擊未完成題目可直接回到該題。"}</p>
        ${validation.missing.length ? `
          <div class="missing-grid">
            ${validation.missing.map((question) => {
              const index = template.questions.findIndex((item) => item.id === question.id);
              return `<button class="ghost" data-missing="${index}" type="button">第${index + 1}題</button>`;
            }).join("")}
          </div>
        ` : ""}
        <p class="form-error" id="submitError" aria-live="polite">${escapeHtml(state.submitError)}</p>
        <div class="toolbar">
          <button class="ghost" id="returnCheck" type="button">返回檢查</button>
          <button class="primary" id="confirmSubmit" type="button" ${validation.complete && state.submitStatus !== "submitting" ? "" : "disabled"}>
            ${state.submitStatus === "submitting" ? "送出中" : "確認送出"}
          </button>
        </div>
      </section>
    `, { narrow: true });
    document.querySelectorAll("[data-missing]").forEach((button) => {
      button.addEventListener("click", () => {
        state.questionIndex = Number(button.dataset.missing);
        renderQuestion();
      });
    });
    document.querySelector("#returnCheck").addEventListener("click", () => {
      state.questionIndex = validation.complete ? 0 : template.questions.findIndex((question) => question.id === validation.missing[0].id);
      renderQuestion();
    });
    document.querySelector("#confirmSubmit").addEventListener("click", async () => {
      state.submitStatus = "submitting";
      state.submitError = "";
      await renderSubmitConfirm();
      try {
        const record = await repos.assessments.submit({
          athleteId: state.athlete.id,
          groupId: state.athlete.groupId,
          sessionId: state.activeSession.id,
          templateId: template.id,
          answers: draft.answers,
          startedAt: draft.startedAt
        });
        state.submitStatus = "success";
        state.submitError = "";
        renderAthleteResult(record.id);
      } catch (error) {
        state.submitStatus = "error";
        state.submitError = error.message || "送出失敗，請稍後重新送出。";
        await renderSubmitConfirm();
      }
    });
  }

  async function renderAthleteResult(recordId) {
    const records = await repos.assessments.recordsForAthlete(state.athlete.id);
    const record = records.find((item) => item.id === recordId) || records[0];
    const sorted = [...record.dimensionScores].sort((a, b) => b.score - a.score);
    const strengths = sorted.slice(0, 2);
    const watch = [...record.dimensionScores].sort((a, b) => a.score - b.score).slice(0, 2);
    const hasPrevious = !!record.changeFromPrevious;
    shell(`
      <section class="result-flow">
        <div class="callout">
          <p class="eyebrow">本次心理狀態已完成送出</p>
          <h1>${escapeHtml(statusLabel(record.overallStatus))}</h1>
          <p>這份結果提供自我了解與後續溝通參考，不代表醫療或心理疾病診斷。</p>
        </div>
        <div class="grid-2">
          <section class="report-section">
            <h2>你的相對優勢</h2>
            <ul class="rank-list compact">${strengths.map((item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${item.score}</span></li>`).join("")}</ul>
          </section>
          <section class="report-section">
            <h2>近期可以留意</h2>
            <ul class="rank-list compact">${watch.map((item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${item.score}</span></li>`).join("")}</ul>
          </section>
        </div>
        <div class="toolbar">
          <button class="ghost" id="showRadar" type="button">查看我的心理雷達</button>
          <button class="ghost" id="showAdvice" type="button">查看簡短建議</button>
          <button class="primary" type="button" data-nav="/">完成並離開</button>
        </div>
        <div id="resultDetail" class="result-detail"></div>
        <p class="small-muted">${hasPrevious ? "本次已使用真實前次紀錄比較。" : "尚無前次資料，本次結果將作為個人基準。"}</p>
      </section>
    `, { narrow: true });
    bindNav();
    document.querySelector("#showRadar").addEventListener("click", () => {
      document.querySelector("#resultDetail").innerHTML = `<div id="resultRadar"></div>`;
      drawRadarInto("#resultRadar", record.dimensionScores, null, "雷達圖範圍固定為0至100。");
    });
    document.querySelector("#showAdvice").addEventListener("click", () => {
      document.querySelector("#resultDetail").innerHTML = `
        <section class="report-section">
          <h2>簡短建議</h2>
          <p>${escapeHtml(record.aiSummary)}</p>
          <p><strong>可以先想想：</strong>${escapeHtml(record.suggestedQuestion)}</p>
        </section>
      `;
    });
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
            <input id="coachAccount" autocomplete="username" placeholder="demo">
          </label>
          <label class="field">密碼
            <input id="coachPassword" type="password" autocomplete="current-password" placeholder="任意展示密碼">
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
    shell(`
      <section class="coach-shell">
        <aside class="coach-nav">
          <div>
            <p class="eyebrow">心理教練後台</p>
            <h2>WenMind × TeamPro</h2>
            <p class="small-muted">展示模式：資料目前儲存在本瀏覽器 localStorage。</p>
          </div>
          <nav>
            ${[
              ["/coach/dashboard", "今日狀態"],
              ["/coach/athletes", "所有選手"],
              ["/coach/assessments", "測驗管理"],
              ["/coach/follow-ups", "追蹤紀錄"]
            ].map(([path, label]) => `<a class="${active === path ? "active" : ""}" href="#${path}">${label}</a>`).join("")}
          </nav>
          <button class="ghost" id="logoutButton" type="button">登出</button>
        </aside>
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
    showLoading();
    const { rows, followUps, stats } = await getCoachData();
    const priorityRows = rows.filter((row) => row.status === "red" || row.status === "orange" || row.overdue).slice(0, 8);
    const pendingRows = rows.filter((row) => !row.record);
    const dueRows = rows.filter((row) => row.dueToday || row.overdue);
    coachShell("/coach/dashboard", `
      <div class="page-heading">
        <div>
          <p class="eyebrow">今日心理狀態</p>
          <h1>先看誰需要關心</h1>
        </div>
        <button class="ghost" type="button" id="exportStatus">匯出CSV</button>
      </div>
      <div class="stats-grid wide">
        ${statCard("選手總數", stats.total)}
        ${statCard("本次已完成", stats.completed)}
        ${statCard("尚未完成", stats.pending)}
        ${statCard("狀態穩定", stats.stable)}
        ${statCard("建議留意", stats.watch)}
        ${statCard("優先關心", stats.priority)}
        ${statCard("今日待追蹤", stats.dueToday)}
        ${statCard("已逾期未追蹤", stats.overdue)}
      </div>
      <section>
        <h2>優先關心</h2>
        ${priorityRows.length ? `<div class="priority-list">${priorityRows.map(priorityCard).join("")}</div>` : empty("目前沒有需要優先關心的選手。")}
      </section>
      <div class="grid-2">
        <section class="report-section">
          <h2>尚未完成</h2>
          ${pendingRows.length ? `<div class="mini-list">${pendingRows.map((row) => `<span>${escapeHtml(row.athlete.name)}｜${escapeHtml(row.athlete.sport || "未設定")}</span>`).join("")}</div>` : empty("尚未有未完成名單。")}
        </section>
        <section class="report-section">
          <h2>今天要追蹤</h2>
          ${dueRows.length ? `<div class="mini-list">${dueRows.map((row) => `<span>${escapeHtml(row.athlete.name)}｜${row.overdue ? "已逾期" : "今日追蹤"}</span>`).join("")}</div>` : empty("今天沒有需要追蹤的紀錄。")}
        </section>
      </div>
      <section class="report-section">
        <h2>追蹤概況</h2>
        <div class="meta-row">
          <span class="meta-pill">尚未完成第一次關心：${stats.notCared}</span>
          <span class="meta-pill">持續觀察中：${stats.observing}</span>
          <span class="meta-pill">已改善：${stats.improved}</span>
        </div>
      </section>
    `);
    bindCoachActions();
    document.querySelector("#exportStatus").addEventListener("click", () => exportRows(rows, followUps));
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
    const filtered = filterRows(rows);
    coachShell("/coach/athletes", `
      <div class="page-heading">
        <div>
          <p class="eyebrow">所有選手</p>
          <h1>依狀態排序檢視</h1>
        </div>
        <button class="ghost" id="exportAthletes" type="button">匯出CSV</button>
      </div>
      <div class="filter-bar">
        ${["all:全部", "red:優先關心", "orange:建議留意", "green:狀態穩定", "gray:尚未完成", "unviewed:尚未查看", "uncared:尚未關心", "today:今日待追蹤", "overdue:已逾期追蹤"].map((entry) => {
          const [value, label] = entry.split(":");
          return `<button class="${state.filter === value ? "active" : ""}" data-filter="${value}" type="button">${label}</button>`;
        }).join("")}
      </div>
      <div class="search-row">
        <input id="searchInput" placeholder="搜尋姓名或運動項目" value="${escapeHtml(state.search)}">
        <select id="dateFilter">
          <option value="all" ${state.dateFilter === "all" ? "selected" : ""}>全部日期</option>
          <option value="7" ${state.dateFilter === "7" ? "selected" : ""}>最近7天</option>
          <option value="30" ${state.dateFilter === "30" ? "selected" : ""}>最近30天</option>
          <option value="custom" ${state.dateFilter === "custom" ? "selected" : ""}>自訂日期</option>
        </select>
        <input id="customStart" type="date" value="${escapeHtml(state.customStart)}">
        <input id="customEnd" type="date" value="${escapeHtml(state.customEnd)}">
      </div>
      ${filtered.length ? `
        <div class="athlete-table-wrap">
          <table class="score-table athlete-table">
            <thead><tr><th>姓名</th><th>運動項目</th><th>最新回報時間</th><th>整體狀態</th><th>自信心</th><th>專注力</th><th>訓練動機</th><th>壓力／焦慮調節</th><th>心理疲勞／恢復</th><th>與上次比較</th><th>已查看</th><th>已關心</th><th>下次追蹤</th></tr></thead>
            <tbody>${filtered.map(tableRow).join("")}</tbody>
          </table>
        </div>
        <div class="mobile-card-list">${filtered.map(mobileAthleteCard).join("")}</div>
      ` : empty("目前沒有符合條件的選手。")}
    `);
    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.filter = button.dataset.filter;
        renderAllAthletes();
      });
    });
    ["searchInput", "dateFilter", "customStart", "customEnd"].forEach((id) => {
      document.querySelector(`#${id}`).addEventListener("input", (event) => {
        if (id === "searchInput") state.search = event.target.value;
        if (id === "dateFilter") state.dateFilter = event.target.value;
        if (id === "customStart") state.customStart = event.target.value;
        if (id === "customEnd") state.customEnd = event.target.value;
        renderAllAthletes();
      });
    });
    document.querySelector("#exportAthletes").addEventListener("click", () => exportRows(filtered, followUps));
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
      : "尚無前次資料";
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
    const template = getTemplate(record.assessmentTemplateId);
    const concerns = highConcernAnswers(template, record.answers);
    const previous = records[1];
    coachShell("/coach/athletes", `
      <section class="athlete-detail">
        <div class="page-heading">
          <div>
            <p class="eyebrow">${escapeHtml(athlete.sport || "未設定")}</p>
            <h1>${escapeHtml(athlete.name)}</h1>
          </div>
          <button class="ghost" data-nav="/coach/athletes" type="button">回所有選手</button>
        </div>
        <section class="callout">
          <h2>${escapeHtml(record.aiSummary)}</h2>
          <span class="status-dot ${record.overallStatus}">${escapeHtml(statusLabel(record.overallStatus))}</span>
        </section>
        <div class="grid-2">
          <section class="report-section">
            <h2>為什麼被提醒</h2>
            ${record.alertReasons.length ? `<ul class="rank-list compact">${record.alertReasons.map((reason) => `<li><strong>${escapeHtml(reason)}</strong></li>`).join("")}</ul>` : empty("目前沒有達到提醒條件。")}
          </section>
          <section class="report-section">
            <h2>建議先詢問</h2>
            <p>${escapeHtml(record.suggestedQuestion)}</p>
          </section>
        </div>
        <div class="report-grid">
          <div id="detailRadar"></div>
          <section class="report-section">
            <h2>與上一次雷達圖比較</h2>
            ${previous ? scoreComparisonTable(record, previous) : empty("尚無前次資料，本次結果將作為個人基準。")}
          </section>
        </div>
        <section class="report-section">
          <h2>最近四週趨勢</h2>
          ${records.length > 1 ? trendList(records) : empty("尚無歷史資料，本次將作為個人基準。")}
        </section>
        <div class="grid-2">
          <section class="report-section">
            <h2>各構面詳細分數</h2>
            ${scoreTable(record.dimensionScores)}
          </section>
          <section class="report-section">
            <h2>高關注答案摘要</h2>
            ${concerns.length ? `<ul class="rank-list compact">${concerns.map((item) => `<li><strong>${escapeHtml(dimensionName(item.dimension))}</strong><span>${escapeHtml(item.text)}</span></li>`).join("")}</ul>` : empty("目前沒有達到高關注題目提醒。")}
          </section>
        </div>
        <div class="grid-2">
          <section class="report-section">
            <h2>個人優勢</h2>
            <ul class="rank-list compact">${[...record.dimensionScores].sort((a, b) => b.score - a.score).slice(0, 2).map((item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${item.score}</span></li>`).join("")}</ul>
          </section>
          <section class="report-section">
            <h2>需要持續觀察</h2>
            <ul class="rank-list compact">${[...record.dimensionScores].sort((a, b) => a.score - b.score).slice(0, 2).map((item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${item.score}</span></li>`).join("")}</ul>
          </section>
        </div>
        <section class="report-section">
          <h2>教練關心紀錄</h2>
          ${followUps.length ? `<div class="follow-list">${followUps.map(followUpItem).join("")}</div>` : empty("尚無關心紀錄。")}
          ${followUpForm(record, athlete)}
        </section>
      </section>
    `);
    drawRadarInto("#detailRadar", record.dimensionScores, previous?.dimensionScores || null, previous ? "亮色為本次，淡色虛線為真實前次紀錄。" : "尚無前次資料，本次結果將作為個人基準。");
    bindNav();
    bindFollowUpForm();
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

  function dimensionName(id) {
    return dimensionCatalog.find((item) => item.id === id)?.name || id;
  }

  function followUpItem(item) {
    return `
      <article class="follow-item">
        <strong>${escapeHtml(followStatusLabel(item.status))}｜${item.followUpDate || "未設定日期"}</strong>
        <p>${escapeHtml(item.note || "未填寫紀錄")}</p>
        <p class="small-muted">選手回應：${escapeHtml(item.athleteResponse || "未填寫")}｜後續處理：${escapeHtml(item.nextAction || "未填寫")}</p>
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
        <h3>新增關心紀錄</h3>
        <input type="hidden" id="followAthleteId" value="${escapeHtml(athlete.id)}">
        <input type="hidden" id="followAssessmentId" value="${escapeHtml(record.id)}">
        <label class="field">狀態
          <select id="followStatus">
            <option value="contacted">標記已關心</option>
            <option value="observing">標記持續觀察</option>
            <option value="improved">標記已有改善</option>
            <option value="closed">結束本次追蹤</option>
          </select>
        </label>
        <label class="field">關心紀錄
          <textarea id="followNote" placeholder="記錄本次了解重點"></textarea>
        </label>
        <label class="field">選手回應
          <textarea id="athleteResponse" placeholder="記錄選手回應"></textarea>
        </label>
        <label class="field">後續處理
          <textarea id="nextAction" placeholder="記錄後續安排"></textarea>
        </label>
        <label class="field">下次追蹤日期
          <input id="followDate" type="date">
        </label>
        <button class="primary" type="submit">儲存追蹤</button>
      </form>
    `;
  }

  async function renderAssessmentManagement() {
    const sessions = await repos.groups.sessions();
    const template = assessmentTemplates[0];
    coachShell("/coach/assessments", `
      <div class="page-heading">
        <div>
          <p class="eyebrow">測驗管理</p>
          <h1>建立連結與QR Code</h1>
        </div>
      </div>
      <section class="report-section">
        <h2>${escapeHtml(template.name)}</h2>
        <p>${escapeHtml(template.disclaimer)}</p>
        ${sessions.map((session) => {
          const link = `${location.origin}${location.pathname}#/assessment?group=${encodeURIComponent(session.groupId)}&assessment=${encodeURIComponent(session.id)}&token=${encodeURIComponent(session.token)}`;
          return `
            <article class="session-card">
              <h3>${escapeHtml(session.name)}</h3>
              <p>測驗期間：${session.startDate || "未設定"} 至 ${session.endDate || "未設定"}</p>
              <input readonly value="${escapeHtml(link)}">
              <div class="qr-box" aria-label="QR Code預留">QR</div>
              <p class="small-muted">正式版本應由後端建立團隊、測驗活動、專屬連結與QR Code，並以 token 對應資料權限。</p>
            </article>
          `;
        }).join("")}
      </section>
    `);
  }

  async function renderFollowUps() {
    const { rows, followUps } = await getCoachData();
    coachShell("/coach/follow-ups", `
      <div class="page-heading">
        <div>
          <p class="eyebrow">追蹤紀錄</p>
          <h1>今日與逾期追蹤</h1>
        </div>
      </div>
      <div class="stats-grid">
        ${statCard("今日待追蹤", rows.filter((row) => row.dueToday).length)}
        ${statCard("已逾期未追蹤", rows.filter((row) => row.overdue).length)}
        ${statCard("持續觀察中", followUps.filter((item) => item.status === "observing").length)}
        ${statCard("已改善", followUps.filter((item) => item.status === "improved").length)}
      </div>
      <section class="report-section">
        <h2>全部追蹤紀錄</h2>
        ${followUps.length ? `<div class="follow-list">${followUps.map((item) => {
          const row = rows.find((candidate) => candidate.athlete.id === item.athleteId);
          return `<article class="follow-item"><strong>${escapeHtml(row?.athlete.name || "未知選手")}｜${escapeHtml(followStatusLabel(item.status))}</strong><p>${escapeHtml(item.note || "未填寫紀錄")}</p><p class="small-muted">追蹤日期：${item.followUpDate || "未設定"}</p></article>`;
        }).join("")}</div>` : empty("今天沒有需要追蹤的紀錄。")}
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
    document.querySelector("#followUpForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      await repos.followUps.save({
        athleteId: document.querySelector("#followAthleteId").value,
        assessmentId: document.querySelector("#followAssessmentId").value,
        status: document.querySelector("#followStatus").value,
        note: document.querySelector("#followNote").value,
        athleteResponse: document.querySelector("#athleteResponse").value,
        nextAction: document.querySelector("#nextAction").value,
        followUpDate: document.querySelector("#followDate").value
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
