/**
 * scoringVersion 2.0 驗收測試（對應規格第十六節）
 * 執行：npm run test:scoring（或 npm test 會一併執行）
 */
const assert = require("assert");

global.localStorage = (() => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear()
  };
})();
global.location = { search: "", origin: "http://localhost", pathname: "/index.html" };
global.crypto = { randomUUID: () => `test-${Math.random().toString(16).slice(2)}` };
global.WENMIND_FORCE_LOCAL = true; // 測試一律純本機，絕不可打到正式 GAS 後台

const core = require("../core.js");

function answersAll(template, value) {
  return Object.fromEntries(template.questions.map((q) => [q.id, value]));
}

async function run() {
  const template = core.getTemplate("teampro-mental-skills-v2");
  const child = core.getTemplate("teampro-mental-skills-v2-child");

  // 測試11 + 12：題庫結構（48題／12構面／每構面4題／id唯一／無重複題／全正向）
  const vb = core.validateQuestionBank("standard");
  assert(vb.ok, "題庫檢核失敗：" + vb.errors.join("；"));
  const vbc = core.validateQuestionBank("child");
  assert(vbc.ok, "兒童版題庫檢核失敗：" + vbc.errors.join("；"));
  assert.strictEqual(template.questions.length, 48, "測試11：總題數需為48");
  assert.strictEqual(template.dimensions.length, 12, "測試11：需為12構面");
  const perDim = {};
  template.questions.forEach((q) => { perDim[q.dimension] = (perDim[q.dimension] || 0) + 1; });
  assert(Object.values(perDim).every((n) => n === 4), "測試11：每構面需剛好4題");
  assert(template.questions.every((q) => q.reverse === false && q.reverseScored === false), "2.0需全部正向題");

  // 測試1/2/3：0～100線性換算
  assert(core.scoreAnswers(template, answersAll(template, 1)).every((s) => s.score === 0), "測試1：全1需為0分");
  assert(core.scoreAnswers(template, answersAll(template, 4)).every((s) => s.score === 50), "測試2：全4需為50分");
  assert(core.scoreAnswers(template, answersAll(template, 7)).every((s) => s.score === 100), "測試3：全7需為100分");
  const one = core.scoreAnswers(template, answersAll(template, 5))[0];
  assert.strictEqual(one.max, 100, "換算分數上限需為100");
  assert(one.score >= 0 && one.score <= 100, "分數不得超出0~100");
  assert(typeof one.average === "number", "需提供原始平均供報告顯示");

  // 測試4：缺一題不得計分
  const incomplete = answersAll(template, 4);
  delete incomplete[template.questions[0].id];
  assert.strictEqual(core.validateAnswers(template, incomplete).complete, false, "測試4：缺題需判定未完成");
  assert.throws(() => core.scoreAnswers(template, incomplete), /Incomplete/, "測試4：缺題不得計分");

  // 測試7：最高只有70 → 不得標為明確優勢
  const mk = (arr) => arr.map((s, i) => ({ id: "d" + i, name: "D" + i, score: s }));
  assert.strictEqual(core.strengthsAndPriorities(mk([70, 66, 62, 58, 50])).strengths.length, 0, "測試7：無>=75不得產生優勢");
  // 測試8：全部>60 → 不得強制產生弱項
  assert.strictEqual(core.strengthsAndPriorities(mk([88, 80, 74, 66, 61])).priorities.length, 0, "測試8：全部>=60不得產生弱項");

  // 測試10：兒童版需顯示兒童版提醒文字
  assert(/兒童版/.test(child.resultNote), "測試10：兒童版需有兒童版提醒");
  assert.strictEqual(child.points, 7, "兒童版計分方式需一致（7點）");
  assert.strictEqual(child.questions.length, 48, "兒童版需同為48題");

  // 測試5/6：歷史比較（需同一選手、同版本、至少兩筆才比較；首筆為null）
  const repos = core.createRepositories();
  const session = await repos.assessments.getActiveSession({});
  const athlete = await repos.athletes.upsertProfile({ name: "測試選手", sport: "籃球", groupId: session.groupId });
  const r1 = await repos.assessments.submit({ athleteId: athlete.id, groupId: athlete.groupId, sessionId: session.id, templateId: template.id, answers: answersAll(template, 5), startedAt: new Date().toISOString() });
  assert.strictEqual(r1.changeFromPrevious, null, "測試5：首次不得顯示假的上次分數");
  assert.strictEqual(r1.scoringVersion, "2.0", "紀錄需存 scoringVersion 2.0");
  assert.strictEqual(r1.completed, true, "紀錄需標記 completed");
  // 不同量表（不同版本）不得直接比較：先提交一筆舊版 ottawa，teampro 第二筆的比較僅來自 teampro 自己
  const ott = core.getTemplate("ottawa-mental-skills-v1");
  await repos.assessments.submit({ athleteId: athlete.id, groupId: athlete.groupId, sessionId: session.id, templateId: ott.id, answers: answersAll(ott, 3), startedAt: new Date().toISOString() });
  const r2 = await repos.assessments.submit({ athleteId: athlete.id, groupId: athlete.groupId, sessionId: session.id, templateId: template.id, answers: answersAll(template, 4), startedAt: new Date().toISOString() });
  assert(Array.isArray(r2.changeFromPrevious), "測試6：同版本第二筆需有真實比較");
  assert(r2.changeFromPrevious.every((c) => c.previous != null), "測試6：比較的上次分數需來自同版本 teampro 紀錄");

  console.log("scoring 2.0 tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
