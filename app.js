const app = document.querySelector("#app");
const radarTemplate = document.querySelector("#radarTemplate");

const dimensions = [
  { id: "goal", name: "目標設定", group: "基礎心理能力", strength: "你能清楚知道自己希望達成的訓練目標。", stable: "可繼續透過短期目標維持訓練動力。", train: "建議將大目標拆成每週可完成的小目標。" },
  { id: "confidence", name: "自信", group: "基礎心理能力", strength: "你通常能相信自己的準備與能力。", stable: "目前可維持穩定自我提醒。", train: "建議建立賽前自我肯定語句。" },
  { id: "commitment", name: "承諾", group: "基礎心理能力", strength: "即使訓練辛苦，你仍願意持續投入。", stable: "目前投入程度相對穩定。", train: "建議記錄每週完成的訓練承諾。" },
  { id: "relax", name: "放鬆", group: "身心調節能力", strength: "你能在壓力情境下逐步調整身體緊繃。", stable: "可持續使用既有放鬆流程。", train: "建議練習賽前呼吸與肌肉放鬆流程。" },
  { id: "refocus", name: "再專注", group: "身心調節能力", strength: "你能在失誤或干擾後重新投入下一個動作。", stable: "目前重新進入比賽狀態的能力相對穩定。", train: "建議練習失誤後提示語與重新啟動流程。" },
  { id: "pressure", name: "壓力調節", group: "身心調節能力", strength: "你能在比分或評分壓力下保持基本節奏。", stable: "可透過模擬賽維持壓力適應。", train: "建議加入比分落後與判決干擾情境練習。" },
  { id: "imagery", name: "意象能力", group: "競賽認知能力", strength: "你能在腦中想像動作及比賽情境。", stable: "目前意象使用相對穩定。", train: "建議在訓練前用30秒預演關鍵動作。" },
  { id: "strategy", name: "競賽計畫", group: "競賽認知能力", strength: "你能理解比賽中的執行重點。", stable: "可持續在賽前確認兩個戰術重點。", train: "建議把比賽計畫拆成開局、中段與收尾。" },
  { id: "focus", name: "專注", group: "競賽認知能力", strength: "你能把注意力放回當下動作。", stable: "目前專注狀態相對穩定。", train: "建議練習固定注視點與關鍵字提醒。" },
  { id: "activation", name: "活化程度", group: "身心調節能力", strength: "你能讓身體進入合適的比賽準備狀態。", stable: "目前暖身與心理啟動相對穩定。", train: "建議建立固定賽前啟動流程。" },
  { id: "competition", name: "競賽投入", group: "基礎心理能力", strength: "你在比賽中通常能維持投入。", stable: "目前競賽投入程度相對穩定。", train: "建議設定每回合可執行的行為目標。" },
  { id: "emotion", name: "情緒調節", group: "身心調節能力", strength: "你能覺察情緒並讓自己回到可比賽狀態。", stable: "目前情緒調整相對穩定。", train: "建議練習情緒命名與呼吸重置。" }
];

const scales = [
  {
    id: "omsat",
    name: "心理技能檢測",
    description: "了解自信、專注、目標及競賽準備",
    count: 48,
    minutes: "約8至12分鐘",
    points: 7,
    dimensions: dimensions.map((item) => item.id),
    questions: makeQuestions(4)
  },
  {
    id: "toughness",
    name: "心理堅韌性檢測",
    description: "了解積極奮鬥、抗壓及面對困難的傾向",
    count: 32,
    minutes: "約5至8分鐘",
    points: 5,
    dimensions: ["effort", "stress", "pain"],
    customDimensions: [
      { id: "effort", name: "積極奮鬥", group: "堅韌性", strength: "你能在辛苦訓練中維持投入。", stable: "目前努力投入程度相對穩定。", train: "建議設定可追蹤的小挑戰。" },
      { id: "stress", name: "抗壓性", group: "堅韌性", strength: "你能在壓力下維持基本表現。", stable: "目前壓力適應相對穩定。", train: "建議進行模擬壓力情境訓練。" },
      { id: "pain", name: "忍受傷痛", group: "堅韌性", strength: "你能在合理範圍內面對身體不適。", stable: "目前身體不適下的調整相對穩定。", train: "建議和教練確認安全界線與恢復流程。" }
    ],
    questions: makeToughnessQuestions()
  }
];

const athletes = [
  { id: "a01", name: "王○○", grade: "國中二年級", group: "對練選手" },
  { id: "a02", name: "林○○", grade: "國中三年級", group: "品勢選手" },
  { id: "a03", name: "陳○○", grade: "國中一年級", group: "對練選手" }
];

const state = {
  role: "athlete",
  athlete: null,
  coachView: "dashboard",
  selectedScaleId: "omsat",
  questionIndex: 0,
  radarMode: "simple",
  selectedReportAthleteId: "a01"
};

function makeQuestions(repeat) {
  const stems = [
    "最近訓練時，我能清楚知道自己要改善的重點。",
    "比賽前，我相信自己已經做好準備。",
    "訓練遇到困難時，我仍願意完成該做的內容。",
    "重要測驗前，我能讓身體逐漸放鬆。",
    "失誤後，我能把注意力帶回下一個動作。",
    "比分落後時，我仍能維持基本節奏。",
    "我能在腦中預演比賽或動作情境。",
    "比賽前，我知道自己要執行的策略。",
    "訓練時，我能把注意力放在當下動作。",
    "比賽前，我能讓自己進入合適的準備狀態。",
    "進入比賽後，我能持續投入每一回合。",
    "受到判決或他人影響時，我能逐步穩定情緒。"
  ];
  const items = [];
  for (let round = 0; round < repeat; round += 1) {
    dimensions.forEach((dimension, index) => {
      items.push({
        id: `q${items.length + 1}`,
        dimension: dimension.id,
        text: stems[index],
        reverse: round === 2 && [3, 4, 5, 11].includes(index)
      });
    });
  }
  return items;
}

function makeToughnessQuestions() {
  const source = [
    ["effort", "訓練疲累時，我仍會完成重要的基本要求。"],
    ["stress", "面對壓力情境時，我能維持可以執行的狀態。"],
    ["pain", "身體不適時，我會和教練確認安全界線並調整。"],
    ["effort", "遇到進步停滯時，我仍願意持續嘗試。"],
    ["stress", "比賽關鍵時刻，我能把注意力放在下一個動作。"],
    ["pain", "恢復訓練時，我能遵守安排，不急著硬撐。"],
    ["effort", "我會主動完成自己承諾的訓練內容。"],
    ["stress", "受到干擾時，我能逐步回到比賽節奏。"]
  ];
  return Array.from({ length: 4 }).flatMap((_, round) =>
    source.map(([dimension, text], index) => ({
      id: `tq${round * source.length + index + 1}`,
      dimension,
      text,
      reverse: round === 1 && index % 3 === 1
    }))
  );
}

function storageKey(athleteId, scaleId) {
  return `teampro-radar:${athleteId}:${scaleId}`;
}

function readAttempt(athleteId, scaleId) {
  const raw = localStorage.getItem(storageKey(athleteId, scaleId));
  if (raw) return JSON.parse(raw);
  return { answers: {}, submittedAt: null, note: "", scaleVersion: "2026.07.mvp", scoringVersion: "v1" };
}

function writeAttempt(athleteId, scaleId, attempt) {
  localStorage.setItem(storageKey(athleteId, scaleId), JSON.stringify(attempt));
}

function seedDemoData() {
  athletes.forEach((athlete, athleteIndex) => {
    scales.forEach((scale) => {
      const attempt = readAttempt(athlete.id, scale.id);
      if (athleteIndex === 0 && Object.keys(attempt.answers).length === 0) {
        scale.questions.forEach((question, index) => {
          attempt.answers[question.id] = Math.max(1, Math.min(scale.points, scale.points - ((index + athleteIndex) % 3)));
        });
        attempt.submittedAt = "2026-07-07T09:10:00.000Z";
        writeAttempt(athlete.id, scale.id, attempt);
      }
      if (athleteIndex === 1 && scale.id === "omsat" && Object.keys(attempt.answers).length === 0) {
        scale.questions.slice(0, 31).forEach((question, index) => {
          attempt.answers[question.id] = 4 + (index % 3);
        });
        writeAttempt(athlete.id, scale.id, attempt);
      }
    });
  });
}

function getScale() {
  return scales.find((scale) => scale.id === state.selectedScaleId);
}

function getDimensionList(scale) {
  return scale.customDimensions || dimensions.filter((item) => scale.dimensions.includes(item.id));
}

function labels(points) {
  return points === 7
    ? ["非常不同意", "不同意", "有點不同意", "普通", "有點同意", "同意", "非常同意"]
    : ["非常不同意", "不同意", "普通", "同意", "非常同意"];
}

function setRole(role) {
  state.role = role;
  document.querySelector("#athleteTab").classList.toggle("active", role === "athlete");
  document.querySelector("#coachTab").classList.toggle("active", role === "coach");
  render();
}

function render() {
  if (state.role === "coach") renderCoach();
  else if (!state.athlete) renderAthleteLogin();
  else renderAthleteHome();
  app.focus({ preventScroll: true });
}

function renderAthleteLogin() {
  app.innerHTML = `
    <section class="hero-grid">
      <div class="panel login-panel">
        <div>
          <p class="eyebrow">WenMind × TeamPro 選手端</p>
          <h1>看見心理狀態<br>找到下一步訓練方向</h1>
          <p>所有填答內容僅作為運動心理評估與回饋使用，請安心填寫。</p>
          <form class="login-form" id="loginForm">
            <label class="field">選手姓名
              <input id="athleteName" autocomplete="name" placeholder="例如：王○○" required>
            </label>
            <label class="field">訓練項目
              <select id="athleteProgram" required>
                <option value="對練選手">對練</option>
                <option value="品勢選手">品勢</option>
                <option value="體能訓練">體能訓練</option>
                <option value="團隊課程">團隊課程</option>
              </select>
            </label>
            <button class="primary" type="submit">進入系統</button>
          </form>
        </div>
      </div>
      <div class="panel logo-hero">
        <img src="wen logo.png" alt="WenMind">
        <div class="logo-hero-copy">
          <div>
            <strong>Focus.</strong>
            <strong>Perform.</strong>
            <strong>Evolve.</strong>
          </div>
          <span>心理能力雷達 App 原型</span>
        </div>
      </div>
    </section>
  `;
  document.querySelector("#loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.querySelector("#athleteName").value.trim();
    const program = document.querySelector("#athleteProgram").value;
    const existingAthlete = athletes.find((item) => item.name === name);
    state.athlete = existingAthlete ? { ...existingAthlete, group: existingAthlete.group || program } : { id: `guest-${Date.now()}`, name, grade: "未設定", group: program };
    render();
  });
}

function renderAthleteHome() {
  const scale = getScale();
  const attempt = readAttempt(state.athlete.id, scale.id);
  app.innerHTML = `
    <section class="summary">
      <div class="panel">
        <p class="eyebrow">WenMind 心理雷達｜${state.athlete.name}｜${state.athlete.grade}｜${state.athlete.group}</p>
        <h2>測驗首頁</h2>
        <div class="grid-2">
          ${scales.map((item) => testCard(item)).join("")}
        </div>
      </div>
      <div class="panel">
        <h2>${scale.name}</h2>
        <p>本次測驗目的：${scale.description}。教練預設只會看到構面分數、雷達圖、歷次變化、系統解讀與訓練建議，不會逐題查看答案。</p>
        <div class="toolbar">
          <button class="ghost" id="instructionButton" type="button">閱讀測驗說明</button>
          <button class="primary" id="startButton" type="button">${attempt.submittedAt ? "查看結果" : "開始或繼續測驗"}</button>
        </div>
      </div>
    </section>
  `;
  document.querySelectorAll("[data-scale]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedScaleId = button.dataset.scale;
      state.questionIndex = 0;
      renderAthleteHome();
    });
  });
  document.querySelector("#instructionButton").addEventListener("click", renderInstructions);
  document.querySelector("#startButton").addEventListener("click", () => {
    if (attempt.submittedAt) renderAthleteResult();
    else renderQuestion();
  });
}

function testCard(scale) {
  const attempt = readAttempt(state.athlete.id, scale.id);
  const answered = Object.keys(attempt.answers).length;
  const done = !!attempt.submittedAt;
  return `
    <article class="test-card">
      <h3>${scale.name}</h3>
      <p>${scale.description}</p>
      <div class="meta-row">
        <span class="meta-pill">${scale.count}題</span>
        <span class="meta-pill">${scale.minutes}</span>
        <span class="status-pill ${done ? "done" : ""}">${done ? "已完成" : `尚未完成 ${answered}/${scale.count}`}</span>
      </div>
      <button class="${state.selectedScaleId === scale.id ? "primary" : "ghost"}" data-scale="${scale.id}" type="button">${state.selectedScaleId === scale.id ? "目前選取" : "選擇量表"}</button>
    </article>
  `;
}

function renderInstructions() {
  const scale = getScale();
  app.innerHTML = `
    <section class="panel">
      <p class="eyebrow">${scale.name}</p>
      <h2>開始前請先閱讀</h2>
      <p>這份測驗沒有標準答案。請依照最近訓練與比賽時的真實感受作答。</p>
      <ul class="notice-list">
        <li>了解目前心理能力</li>
        <li>安排心理技能訓練</li>
        <li>比較自己的歷次變化</li>
      </ul>
      <p>測驗結果不會單獨作為出賽資格或懲處依據。</p>
      <label class="check-row">
        <input id="agreeCheck" type="checkbox">
        <span>我已了解並願意開始作答。</span>
      </label>
      <div class="toolbar">
        <button class="ghost" type="button" id="backHome">返回</button>
        <button class="primary" type="button" id="beginQuestions" disabled>開始測驗</button>
      </div>
    </section>
  `;
  document.querySelector("#agreeCheck").addEventListener("change", (event) => {
    document.querySelector("#beginQuestions").disabled = !event.target.checked;
  });
  document.querySelector("#backHome").addEventListener("click", renderAthleteHome);
  document.querySelector("#beginQuestions").addEventListener("click", renderQuestion);
}

function renderQuestion() {
  const scale = getScale();
  const attempt = readAttempt(state.athlete.id, scale.id);
  const question = scale.questions[state.questionIndex];
  const percent = Math.round(((state.questionIndex + 1) / scale.questions.length) * 100);
  app.innerHTML = `
    <section>
      <div class="progress-wrap">
        <div class="progress-meta">
          <strong>${scale.name}</strong>
          <span>第${state.questionIndex + 1}題／${scale.questions.length}題</span>
        </div>
        <div class="progress-bar" aria-label="作答進度"><div class="progress-fill" style="width:${percent}%"></div></div>
        <div class="progress-meta"><span>自動暫存</span><span>${percent}%</span></div>
      </div>
      <article class="question-card">
        <p class="question-text">${question.text}</p>
        <div class="answers">
          ${labels(scale.points).map((label, index) => `
            <button class="answer-option ${attempt.answers[question.id] === index + 1 ? "selected" : ""}" data-value="${index + 1}" type="button">${label}</button>
          `).join("")}
        </div>
      </article>
      <div class="bottom-actions">
        <button class="ghost" id="prevQuestion" type="button" ${state.questionIndex === 0 ? "disabled" : ""}>上一題</button>
        <button class="primary" id="nextQuestion" type="button">${state.questionIndex === scale.questions.length - 1 ? "完成作答" : "下一題"}</button>
      </div>
    </section>
  `;
  document.querySelectorAll(".answer-option").forEach((button) => {
    button.addEventListener("click", () => {
      attempt.answers[question.id] = Number(button.dataset.value);
      writeAttempt(state.athlete.id, scale.id, attempt);
      renderQuestion();
    });
  });
  document.querySelector("#prevQuestion").addEventListener("click", () => {
    state.questionIndex = Math.max(0, state.questionIndex - 1);
    renderQuestion();
  });
  document.querySelector("#nextQuestion").addEventListener("click", () => {
    if (!attempt.answers[question.id]) return;
    if (state.questionIndex === scale.questions.length - 1) renderSubmitConfirm();
    else {
      state.questionIndex += 1;
      renderQuestion();
    }
  });
}

function renderSubmitConfirm() {
  const scale = getScale();
  const attempt = readAttempt(state.athlete.id, scale.id);
  const missing = scale.questions.filter((question) => !attempt.answers[question.id]);
  app.innerHTML = `
    <section class="panel">
      <p class="eyebrow">${scale.name}</p>
      <h2>${missing.length ? `尚有 ${missing.length} 題未完成` : `你已完成全部${scale.questions.length}題`}</h2>
      <p>${missing.length ? "請返回完成所有題目後再送出。" : "請確認送出後，系統將立即產生你的心理能力雷達圖。本次所有題目皆已完成。"}</p>
      <div class="toolbar">
        <button class="ghost" id="returnCheck" type="button">返回檢查</button>
        <button class="primary" id="confirmSubmit" type="button" ${missing.length ? "disabled" : ""}>確認送出</button>
      </div>
    </section>
  `;
  document.querySelector("#returnCheck").addEventListener("click", () => {
    if (missing.length) state.questionIndex = scale.questions.findIndex((question) => question.id === missing[0].id);
    renderQuestion();
  });
  document.querySelector("#confirmSubmit").addEventListener("click", () => {
    attempt.submittedAt = new Date().toISOString();
    writeAttempt(state.athlete.id, scale.id, attempt);
    renderAthleteResult();
  });
}

function scoreAttempt(scale, attempt) {
  const list = getDimensionList(scale);
  return list.map((dimension) => {
    const items = scale.questions.filter((question) => question.dimension === dimension.id);
    const values = items.map((question) => {
      const raw = attempt.answers[question.id] || 1;
      return question.reverse ? scale.points + 1 - raw : raw;
    });
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    return { ...dimension, score: Math.round(((avg - 1) / (scale.points - 1)) * 100) };
  });
}

function resultSummary(scores) {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  return {
    strengths: sorted.slice(0, 3),
    priorities: sorted.slice(-2).reverse(),
    watch: scores.filter((item, index) => index % 5 === 1).slice(0, 2)
  };
}

function renderAthleteResult() {
  const scale = getScale();
  const attempt = readAttempt(state.athlete.id, scale.id);
  const scores = scoreAttempt(scale, attempt);
  const summary = resultSummary(scores);
  const displayScores = state.radarMode === "simple" && scale.id === "omsat" ? groupScores(scores) : scores;
  app.innerHTML = `
    <section class="summary">
      <div class="callout">
        <p class="eyebrow">本次${scale.name}完成</p>
        <h2>你的整體狀態</h2>
        <p>具備穩定的${summary.strengths[0].name}與${summary.strengths[1].name}，可優先加強${summary.priorities[0].name}及${summary.priorities[1].name}能力。</p>
      </div>
      <div class="grid-2">
        <div id="resultRadar"></div>
        <div class="report-section">
          <h3>雷達圖模式</h3>
          <div class="toolbar">
            <button class="${state.radarMode === "simple" ? "primary" : "ghost"}" id="simpleMode" type="button">簡易模式</button>
            <button class="${state.radarMode === "full" ? "primary" : "ghost"}" id="fullMode" type="button">完整分析</button>
          </div>
          <table class="score-table">
            <thead><tr><th>構面</th><th>分數</th><th>狀態</th></tr></thead>
            <tbody>${scores.map((item) => `<tr><td>${item.name}</td><td>${item.score}</td><td>${labelForScore(item, summary)}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>
      <div class="grid-2">
        <section class="report-section">
          <h3>你的心理優勢</h3>
          <ul class="rank-list compact">${summary.strengths.map((item) => `<li><strong>${item.name}</strong></li>`).join("")}</ul>
        </section>
        <section class="report-section">
          <h3>本次建議優先訓練</h3>
          <ul class="rank-list compact">${summary.priorities.map((item) => `<li><strong>${item.name}</strong></li>`).join("")}</ul>
        </section>
      </div>
      <section class="task-box">
        <h3>本週心理訓練</h3>
        <p>每天訓練結束後：深呼吸三次，寫下一個今天做好的動作，再寫下一個下次要改進的重點。預計時間：3分鐘。</p>
        <button class="primary" type="button">我完成了</button>
      </section>
    </section>
  `;
  drawRadarInto("#resultRadar", displayScores, displayScores, previousScores(displayScores), "雷達圖範圍固定為0至100，本次使用亮色實線，上次使用淡色虛線。");
  document.querySelector("#simpleMode").addEventListener("click", () => { state.radarMode = "simple"; renderAthleteResult(); });
  document.querySelector("#fullMode").addEventListener("click", () => { state.radarMode = "full"; renderAthleteResult(); });
}

function labelForScore(item, summary) {
  if (summary.strengths.some((score) => score.id === item.id)) return "個人優勢";
  if (summary.priorities.some((score) => score.id === item.id)) return "優先訓練";
  return "穩定發展";
}

function groupScores(scores) {
  const groups = ["基礎心理能力", "身心調節能力", "競賽認知能力"];
  return groups.map((group) => {
    const items = scores.filter((item) => item.group === group);
    return { id: group, name: group, score: Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length) };
  });
}

function previousScores(scores) {
  return scores.map((item, index) => ({ ...item, score: Math.max(0, item.score - (index % 2 ? 8 : -4)) }));
}

function renderCoach() {
  const scale = getScale();
  app.innerHTML = `
    <section class="coach-layout">
      <aside class="panel">
        <p class="eyebrow">WenMind Coach Console｜育林國中跆拳道隊</p>
        <h2>心理測驗儀表板</h2>
        <div class="side-list">
          ${["dashboard:團隊儀表板", "list:選手名單", "report:個人心理報告", "team:全隊分析"].map((entry) => {
            const [id, label] = entry.split(":");
            return `<button class="${state.coachView === id ? "active" : ""}" data-coach-view="${id}" type="button">${label}</button>`;
          }).join("")}
        </div>
      </aside>
      <div id="coachContent"></div>
    </section>
  `;
  document.querySelectorAll("[data-coach-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.coachView = button.dataset.coachView;
      renderCoach();
    });
  });
  if (state.coachView === "dashboard") renderCoachDashboard(scale);
  if (state.coachView === "list") renderAthleteList(scale);
  if (state.coachView === "report") renderCoachReport(scale);
  if (state.coachView === "team") renderTeamAnalysis(scale);
}

function completionStats(scale) {
  const rows = athletes.map((athlete) => ({ athlete, attempt: readAttempt(athlete.id, scale.id) }));
  const completed = rows.filter((row) => row.attempt.submittedAt).length;
  return { rows, completed, pending: rows.length - completed };
}

function renderCoachDashboard(scale) {
  const { completed, pending } = completionStats(scale);
  const teamScores = averageScores(scale);
  document.querySelector("#coachContent").innerHTML = `
    <div class="summary">
      <div class="stats-grid">
        <div class="card stat-card"><strong>${athletes.length}</strong><span>選手總數</span></div>
        <div class="card stat-card"><strong>${completed}</strong><span>已完成</span></div>
        <div class="card stat-card"><strong>${pending}</strong><span>未完成</span></div>
        <div class="card stat-card"><strong>2</strong><span>本週需關注</span></div>
      </div>
      <div class="grid-2">
        <div id="teamRadar"></div>
        <section class="report-section">
          <h3>共同需求</h3>
          <ul class="rank-list">
            ${teamScores.slice(-3).map((item) => `<li><strong>${item.name}</strong><span>${item.train || "建議安排對應心理技能訓練。"}</span></li>`).join("")}
          </ul>
        </section>
      </div>
    </div>
  `;
  drawRadarInto("#teamRadar", teamScores, teamScores, previousScores(teamScores), "可切換本次平均、上次平均、品勢組、對練組、年級與性別。");
}

function renderAthleteList(scale) {
  const { rows } = completionStats(scale);
  document.querySelector("#coachContent").innerHTML = `
    <section class="panel">
      <div class="split-row">
        <h2>選手名單</h2>
        <span class="meta-pill">篩選：已完成｜未完成｜有變化提醒｜品勢｜對練｜年級</span>
      </div>
      <div class="side-list">
        ${rows.map(({ athlete, attempt }) => {
          const scores = scoreAttempt(scale, fillAttempt(scale, attempt));
          const priorities = resultSummary(scores).priorities;
          return `
            <button class="athlete-row" data-report-athlete="${athlete.id}" type="button">
              <span><strong>${athlete.name}</strong><br><span class="small-muted">${attempt.submittedAt ? "已完成" : "未完成"}｜整體狀態：${attempt.submittedAt ? "穩定" : "待完成"}</span></span>
              <span class="status-pill watch">變化提醒：${priorities[0].name}</span>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
  document.querySelectorAll("[data-report-athlete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedReportAthleteId = button.dataset.reportAthlete;
      state.coachView = "report";
      renderCoach();
    });
  });
}

function renderCoachReport(scale) {
  const athlete = athletes.find((item) => item.id === state.selectedReportAthleteId) || athletes[0];
  const attempt = fillAttempt(scale, readAttempt(athlete.id, scale.id));
  const scores = scoreAttempt(scale, attempt);
  const summary = resultSummary(scores);
  document.querySelector("#coachContent").innerHTML = `
    <section class="summary">
      <div class="panel">
        <p class="eyebrow">${athlete.grade}｜${athlete.group}</p>
        <h2>${athlete.name}</h2>
        <p>測驗日期：${formatDate(attempt.submittedAt || new Date().toISOString())}｜量表版本：${attempt.scaleVersion}｜計分版本：${attempt.scoringVersion}</p>
      </div>
      <div class="report-grid">
        <div id="coachRadar"></div>
        <section class="report-section">
          <h3>分數變化</h3>
          <table class="score-table">
            <thead><tr><th>構面</th><th>本次</th><th>上次</th></tr></thead>
            <tbody>${scores.map((item, index) => `<tr><td>${item.name}</td><td>${item.score}</td><td>${previousScores(scores)[index].score}</td></tr>`).join("")}</tbody>
          </table>
        </section>
      </div>
      <div class="grid-2">
        <section class="report-section"><h3>三項優勢</h3><ul class="rank-list compact">${summary.strengths.map((item) => `<li><strong>${item.name}</strong></li>`).join("")}</ul></section>
        <section class="report-section"><h3>兩項優先訓練</h3><ul class="rank-list compact">${summary.priorities.map((item) => `<li><strong>${item.name}</strong></li>`).join("")}</ul></section>
      </div>
    </section>
  `;
  drawRadarInto("#coachRadar", scores, scores, previousScores(scores), "教練預設查看構面分數、雷達圖、前後測比較、系統解讀與訓練方向。");
}

function renderTeamAnalysis(scale) {
  const scores = averageScores(scale);
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  document.querySelector("#coachContent").innerHTML = `
    <section class="summary">
      <div class="grid-2">
        <section class="report-section">
          <h3>全隊相對優勢</h3>
          <ul class="rank-list">${sorted.slice(0, 3).map((item) => `<li><strong>${item.name}</strong><span>${item.stable || "目前表現相對穩定。"}</span></li>`).join("")}</ul>
        </section>
        <section class="report-section">
          <h3>全隊優先訓練</h3>
          <ul class="rank-list">${sorted.slice(-3).reverse().map((item) => `<li><strong>${item.name}</strong><span>${item.train || "建議安排對應心理技能訓練。"}</span></li>`).join("")}</ul>
        </section>
      </div>
      <section class="task-box">
        <h3>本週全隊可安排</h3>
        <p>1. 賽前呼吸流程<br>2. 模擬比分落後情境<br>3. 失誤後提示語練習</p>
      </section>
    </section>
  `;
}

function averageScores(scale) {
  const all = athletes.map((athlete) => scoreAttempt(scale, fillAttempt(scale, readAttempt(athlete.id, scale.id))));
  const list = getDimensionList(scale);
  return list.map((dimension, index) => ({
    ...dimension,
    score: Math.round(all.reduce((sum, scores) => sum + scores[index].score, 0) / all.length)
  }));
}

function fillAttempt(scale, attempt) {
  if (Object.keys(attempt.answers).length === scale.questions.length) return attempt;
  const copy = JSON.parse(JSON.stringify(attempt));
  scale.questions.forEach((question, index) => {
    if (!copy.answers[question.id]) copy.answers[question.id] = Math.max(1, Math.min(scale.points, Math.ceil(scale.points * .58) + (index % 2)));
  });
  return copy;
}

function drawRadarInto(selector, dimensionsToDraw, current, previous, caption) {
  const host = document.querySelector(selector);
  host.innerHTML = "";
  const node = radarTemplate.content.cloneNode(true);
  host.appendChild(node);
  const canvas = host.querySelector("canvas");
  host.querySelector(".radar-caption").textContent = caption;
  drawRadar(canvas, dimensionsToDraw, current, previous);
}

function drawRadar(canvas, axes, current, previous) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * .34;
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1;
  ctx.font = "24px Microsoft JhengHei, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let ring = 1; ring <= 5; ring += 1) {
    polygon(ctx, axes.length, cx, cy, radius * ring / 5, null, "rgba(168,189,193,.22)");
  }
  axes.forEach((axis, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / axes.length;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "rgba(168,189,193,.18)";
    ctx.stroke();
    const lx = cx + Math.cos(angle) * (radius + 52);
    const ly = cy + Math.sin(angle) * (radius + 42);
    ctx.fillStyle = "#d9f7f7";
    wrapLabel(ctx, axis.name, lx, ly, axes.length > 8 ? 72 : 120);
  });
  if (previous) scorePolygon(ctx, axes, previous, cx, cy, radius, "rgba(168,189,193,.30)", "rgba(168,189,193,.10)", [9, 8]);
  scorePolygon(ctx, axes, current, cx, cy, radius, "#22d3ee", "rgba(34,211,238,.24)");
}

function polygon(ctx, sides, cx, cy, radius, fill, stroke) {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / sides;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function scorePolygon(ctx, axes, scores, cx, cy, radius, stroke, fill, dash = []) {
  ctx.save();
  ctx.setLineDash(dash);
  ctx.beginPath();
  axes.forEach((axis, index) => {
    const value = scores.find((item) => item.id === axis.id)?.score || axis.score || 0;
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
    } else line = test;
  });
  lines.push(line);
  lines.forEach((item, index) => ctx.fillText(item, x, y + (index - (lines.length - 1) / 2) * 26));
}

function demoScores() {
  return dimensions.map((item, index) => ({ ...item, score: [78, 72, 84, 58, 55, 61, 80, 69, 63, 60, 77, 66][index] }));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium" }).format(new Date(value));
}

document.querySelector("#athleteTab").addEventListener("click", () => setRole("athlete"));
document.querySelector("#coachTab").addEventListener("click", () => setRole("coach"));
document.querySelector("#homeButton").addEventListener("click", () => {
  state.athlete = null;
  state.coachView = "dashboard";
  setRole(state.role);
});

seedDemoData();
render();
