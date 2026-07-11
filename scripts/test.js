const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");

function createStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear()
  };
}

global.localStorage = createStorage();
global.location = { search: "", origin: "http://localhost", pathname: "/index.html" };
global.crypto = { randomUUID: () => `test-${Math.random().toString(16).slice(2)}` };

const core = require("../core.js");

async function run() {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const coreText = fs.readFileSync(path.join(root, "core.js"), "utf8");

  assert(!html.includes("athleteTab"), "公開頁不可有選手端切換");
  assert(!html.includes("coachTab"), "公開頁不可有教練端切換");
  assert(!html.includes("role-tabs"), "公開頁不可有角色切換區");
  assert(!coreText.includes("育林國中"), "不可保留特定學校");
  assert(!coreText.includes("對練選手"), "不可保留預設跆拳道項目");
  assert(app.includes("請先輸入姓名。"), "姓名空白錯誤訊息需存在");
  assert(app.includes(".value.trim()"), "姓名需trim");
  assert(app.includes("placeholder=\"例如：籃球、游泳、跆拳道、田徑、羽球、體操\""), "運動項目需自由輸入提示");
  assert(!app.includes("<select id=\"profileSport\""), "運動項目不可使用select");
  assert(app.includes("/coach/login"), "教練登入路由需存在");
  assert(app.includes("/coach/dashboard"), "教練後台路由需存在");
  assert(app.includes("currentSession"), "未登入需檢查session");
  assert(app.includes("尚無前次資料，本次結果將作為個人基準。"), "無前次資料不可顯示假趨勢");
  assert(!coreText.includes("fillAttempt"), "不可自動補答");
  assert(!coreText.includes("previousScores"), "不可製造假前測");
  assert(!app.includes("本週需關注"), "不可寫死關注人數");
  assert(coreText.includes("riskThresholds"), "燈號門檻需集中config");
  assert(coreText.includes("DemoAuthRepository") && coreText.includes("RemoteAuthRepository"), "需有Auth Repository分層");
  assert(coreText.includes("DemoAssessmentRepository") && coreText.includes("RemoteAssessmentRepository"), "需有Assessment Repository分層");
  assert(coreText.includes("DemoFollowUpRepository") && coreText.includes("RemoteFollowUpRepository"), "需有FollowUp Repository分層");
  assert(css.includes("@media (max-width: 430px)") && css.includes("@media (max-width: 760px)"), "需有手機版樣式");
  assert(css.includes("overflow-x: hidden"), "需防止水平捲動");
  assert(css.includes(".mobile-card-list"), "手機版需卡片列表");
  assert(html.includes("#/coach/login"), "GitHub Pages需使用hash router");
  assert(html.includes("core.js") && html.includes("app.js"), "需載入核心與UI");

  const template = core.getTemplate();
  const incomplete = {};
  assert.strictEqual(core.validateAnswers(template, incomplete).complete, false, "未完成題目不可送出");
  assert.throws(() => core.scoreAnswers(template, incomplete), /Incomplete/, "未作答不可計分");

  const answers = Object.fromEntries(template.questions.map((question) => [question.id, 4]));
  const scores = core.scoreAnswers(template, answers);
  assert.strictEqual(scores.length, 5, "需產生五個構面");
  assert(scores.every((score) => Number.isFinite(score.score)), "分數需為數字");

  const repos = core.createRepositories();
  const session = await repos.assessments.getActiveSession({});
  const athlete = await repos.athletes.upsertProfile({ name: "  王小明  ", sport: "籃球", groupId: session.groupId });
  assert.strictEqual(athlete.name, "王小明", "姓名需trim後儲存");
  assert.strictEqual(athlete.sport, "籃球", "運動項目自由輸入需儲存");

  const record1 = await repos.assessments.submit({
    athleteId: athlete.id,
    groupId: athlete.groupId,
    sessionId: session.id,
    templateId: template.id,
    answers,
    startedAt: new Date().toISOString()
  });
  assert.strictEqual(record1.changeFromPrevious, null, "第一筆不可顯示假前次比較");

  const lowerAnswers = Object.fromEntries(template.questions.map((question) => [question.id, question.reverse ? 5 : 2]));
  const record2 = await repos.assessments.submit({
    athleteId: athlete.id,
    groupId: athlete.groupId,
    sessionId: session.id,
    templateId: template.id,
    answers: lowerAnswers,
    startedAt: new Date().toISOString()
  });
  assert(record2.id !== record1.id, "每次送出需建立新紀錄");
  assert(record2.changeFromPrevious, "第二筆需使用真實前次比較");
  assert(["orange", "red", "green"].includes(record2.overallStatus), "狀態需由分數與變化運算");

  await repos.assessments.markViewed(record2.id);
  const viewed = (await repos.assessments.recordsForAthlete(athlete.id))[0];
  assert.strictEqual(viewed.viewed, true, "教練可以標記已查看");

  const followUp = await repos.followUps.save({
    athleteId: athlete.id,
    assessmentId: record2.id,
    status: "observing",
    note: "已關心",
    athleteResponse: "近期壓力較高",
    nextAction: "下週追蹤",
    followUpDate: core.todayISO()
  });
  assert(followUp.id, "教練可以新增關心紀錄");
  assert.strictEqual(followUp.followUpDate, core.todayISO(), "教練可以設定追蹤日期");

  const rows = core.buildCoachRows({
    athletes: await repos.athletes.list(),
    records: await repos.assessments.records(),
    followUps: await repos.followUps.list()
  });
  const stats = core.dashboardStats(rows, await repos.followUps.list());
  assert.strictEqual(stats.total, 1, "選手總數需由資料運算");
  assert.strictEqual(stats.completed, 1, "完成數需由資料運算");
  assert(stats.priority + stats.watch + stats.stable <= stats.completed, "狀態統計不可寫死");

  assert(!/確診|罹患|焦慮症|憂鬱症/.test(app + coreText), "AI摘要與UI不得含診斷詞");
  assert(fs.existsSync(path.join(root, "manifest.webmanifest")), "PWA manifest需保留");

  console.log("All tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
