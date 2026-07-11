(function (global) {
  "use strict";

  const APP_MODE_KEY = "wenmind:app-mode";
  const STORE_KEY = "wenmind:radar:v2";
  const SESSION_KEY = "wenmind:coach-session";
  const ATHLETE_SESSION_KEY = "wenmind:athlete-session";

  const APP_MODE = (() => {
    try {
      const params = new URLSearchParams(global.location?.search || "");
      if (params.get("mode") === "demo") return "demo";
      if (params.get("mode") === "production") return "production";
      return global.localStorage?.getItem(APP_MODE_KEY) || "production";
    } catch {
      return "production";
    }
  })();

  const riskThresholds = {
    dimensionLow: 45,
    dimensionDropPercent: 12,
    baselineDropPercent: 15,
    consecutiveDeclineCount: 2,
    multipleRiskDimensionCount: 3,
    overdueFollowUpDays: 1,
    staleAssessmentDays: 30
  };

  const dimensionCatalog = [
    { id: "confidence", name: "自信心", group: "心理準備", positive: true, train: "先從最近做得到的一個動作建立把握感。" },
    { id: "focus", name: "專注力", group: "心理準備", positive: true, train: "練習把注意力拉回下一個可執行動作。" },
    { id: "motivation", name: "訓練動機", group: "投入狀態", positive: true, train: "把大目標拆成一週內可完成的小任務。" },
    { id: "pressure", name: "壓力調節", group: "身心調節", positive: true, train: "建立比賽前與失誤後的呼吸重置流程。" },
    { id: "recovery", name: "心理疲勞／恢復", group: "身心調節", positive: true, train: "觀察睡眠、恢復與訓練負荷是否需要調整。" }
  ];

  const assessmentTemplates = [
    {
      id: "quick-state-v1",
      version: "2026.07.demo",
      scoringVersion: "demo-v2",
      name: "第三代渥太華心理技能量表",
      description: "了解近期專注、自信、動機、壓力調節與心理恢復狀態。",
      disclaimer: "目前為展示題庫，正式使用前需確認量表授權、正式題目與計分規則。",
      points: 5,
      optionLabels: ["非常不同意", "不同意", "普通", "同意", "非常同意"],
      questions: [
        { id: "q01", dimension: "confidence", text: "最近訓練或比賽前，我相信自己有能力完成重點任務。" },
        { id: "q02", dimension: "focus", text: "訓練時，我能把注意力放回當下正在做的動作。" },
        { id: "q03", dimension: "motivation", text: "即使訓練辛苦，我仍清楚知道自己為什麼要持續投入。" },
        { id: "q04", dimension: "pressure", text: "遇到比分、成績或表現壓力時，我能逐步穩住節奏。" },
        { id: "q05", dimension: "recovery", text: "最近我覺得自己有足夠的心理恢復空間。" },
        { id: "q06", dimension: "confidence", text: "最近我常懷疑自己是否做得到。", reverse: true, highConcern: true },
        { id: "q07", dimension: "focus", text: "受到失誤或外在干擾後，我能重新專注在下一個動作。" },
        { id: "q08", dimension: "motivation", text: "最近我對訓練目標感到模糊或提不起勁。", reverse: true, highConcern: true },
        { id: "q09", dimension: "pressure", text: "壓力升高時，我知道可以用什麼方法讓自己回到可執行狀態。" },
        { id: "q10", dimension: "recovery", text: "最近訓練或比賽後，我常覺得心理上很難恢復。", reverse: true, highConcern: true },
        { id: "q11", dimension: "confidence", text: "我能說出最近自己做得好的地方。" },
        { id: "q12", dimension: "focus", text: "我能在練習中維持一段時間的穩定注意力。" },
        { id: "q13", dimension: "motivation", text: "我願意主動完成教練安排的重點練習。" },
        { id: "q14", dimension: "pressure", text: "面對重要測驗或比賽時，我能接受緊張並繼續行動。" },
        { id: "q15", dimension: "recovery", text: "我知道哪些方式能幫助自己從心理疲勞中恢復。" },
        { id: "q16", dimension: "confidence", text: "如果表現不如預期，我仍能看見下一次可以調整的方向。" },
        { id: "q17", dimension: "focus", text: "我最近容易一直想著失誤，影響後面的表現。", reverse: true, highConcern: true },
        { id: "q18", dimension: "motivation", text: "我覺得目前訓練和自己的目標有連結。" },
        { id: "q19", dimension: "pressure", text: "最近我在壓力下比平常更難做出平常會的動作。", reverse: true, highConcern: true },
        { id: "q20", dimension: "recovery", text: "我能和教練或可信任的人討論自己的疲勞與壓力。" }
      ]
    }
  ];

  function uid(prefix) {
    if (global.crypto?.randomUUID) return `${prefix}_${global.crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function daysBetween(a, b) {
    const start = new Date(a).setHours(0, 0, 0, 0);
    const end = new Date(b).setHours(0, 0, 0, 0);
    return Math.round((end - start) / 86400000);
  }

  function readJson(key, fallback) {
    try {
      const raw = global.localStorage?.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    global.localStorage?.setItem(key, JSON.stringify(value));
  }

  function createEmptyStore() {
    return {
      version: 2,
      mode: APP_MODE,
      groups: [],
      assessmentSessions: [],
      athletes: [],
      assessmentRecords: [],
      drafts: {},
      followUps: [],
      auditLogs: []
    };
  }

  function demoSeed() {
    const now = new Date();
    const groupId = "demo-group";
    const sessionId = "demo-session";
    const athletes = [
      { id: "demo-a1", name: "陳安", sport: "籃球", groupId, createdAt: new Date(now - 30 * 86400000).toISOString() },
      { id: "demo-a2", name: "林晴", sport: "游泳", groupId, createdAt: new Date(now - 22 * 86400000).toISOString() },
      { id: "demo-a3", name: "張宇", sport: "田徑", groupId, createdAt: new Date(now - 18 * 86400000).toISOString() },
      { id: "demo-a4", name: "黃寧", sport: "羽球", groupId, createdAt: new Date(now - 12 * 86400000).toISOString() }
    ];
    const records = [
      makeDemoRecord("demo-a1", groupId, sessionId, 16, { confidence: 76, focus: 72, motivation: 70, pressure: 74, recovery: 68 }),
      makeDemoRecord("demo-a1", groupId, sessionId, 4, { confidence: 58, focus: 63, motivation: 66, pressure: 52, recovery: 44 }),
      makeDemoRecord("demo-a2", groupId, sessionId, 9, { confidence: 70, focus: 72, motivation: 75, pressure: 64, recovery: 68 }),
      makeDemoRecord("demo-a2", groupId, sessionId, 2, { confidence: 72, focus: 74, motivation: 77, pressure: 66, recovery: 70 }),
      makeDemoRecord("demo-a3", groupId, sessionId, 5, { confidence: 46, focus: 50, motivation: 48, pressure: 42, recovery: 38 })
    ];
    return {
      ...createEmptyStore(),
      groups: [{ id: groupId, name: "展示團隊", createdAt: new Date(now - 35 * 86400000).toISOString() }],
      assessmentSessions: [{
        id: sessionId,
        groupId,
        templateId: "quick-state-v1",
        name: "第三代渥太華心理技能量表展示活動",
        startDate: todayISO(),
        endDate: todayISO(),
        token: "demo-token",
        createdAt: new Date(now - 7 * 86400000).toISOString()
      }],
      athletes,
      assessmentRecords: records,
      followUps: [{
        id: "demo-fu-1",
        athleteId: "demo-a1",
        assessmentId: records[1].id,
        coachId: "demo-coach",
        status: "observing",
        note: "已先了解近期比賽壓力，安排下次討論賽前重置流程。",
        athleteResponse: "最近關鍵球失誤後比較沒有把握。",
        nextAction: "下次練習後追蹤自信與壓力調節。",
        followUpDate: todayISO(),
        createdAt: new Date(now - 2 * 86400000).toISOString(),
        updatedAt: new Date(now - 2 * 86400000).toISOString()
      }],
      auditLogs: []
    };
  }

  function makeDemoRecord(athleteId, groupId, sessionId, daysAgo, scoreMap) {
    const completedAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
    const dimensionScores = dimensionCatalog.map((dimension) => ({ ...dimension, score: scoreMap[dimension.id] }));
    return {
      id: uid("demo_record"),
      athleteId,
      groupId,
      assessmentSessionId: sessionId,
      assessmentTemplateId: "quick-state-v1",
      assessmentVersion: "2026.07.demo",
      scoringVersion: "demo-v2",
      startedAt: completedAt,
      completedAt,
      answers: {},
      dimensionScores,
      overallStatus: "gray",
      alertReasons: [],
      changeFromPrevious: null,
      changeFromBaseline: null,
      aiSummary: "",
      viewed: false,
      cared: false,
      createdAt: completedAt
    };
  }

  function getTemplate(templateId = "quick-state-v1") {
    return assessmentTemplates.find((template) => template.id === templateId) || assessmentTemplates[0];
  }

  function validateAnswers(template, answers) {
    const missing = template.questions.filter((question) => !Number.isInteger(answers[question.id]));
    return { complete: missing.length === 0, missing };
  }

  function scoreAnswers(template, answers) {
    const validation = validateAnswers(template, answers);
    if (!validation.complete) {
      throw new Error("Incomplete answers cannot be scored.");
    }
    return dimensionCatalog.map((dimension) => {
      const questions = template.questions.filter((question) => question.dimension === dimension.id);
      const values = questions.map((question) => {
        const raw = answers[question.id];
        return question.reverse ? template.points + 1 - raw : raw;
      });
      const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
      return { ...dimension, score: Math.round(((avg - 1) / (template.points - 1)) * 100) };
    });
  }

  function highConcernAnswers(template, answers) {
    return template.questions
      .filter((question) => question.highConcern && Number.isInteger(answers[question.id]))
      .map((question) => {
        const value = answers[question.id];
        const effective = question.reverse ? template.points + 1 - value : value;
        return { id: question.id, dimension: question.dimension, text: question.text, answer: value, effectiveScore: effective };
      })
      .filter((item) => item.effectiveScore <= 2);
  }

  function compareScores(current, previous) {
    if (!previous) return null;
    return current.map((item) => {
      const prev = previous.dimensionScores.find((score) => score.id === item.id);
      const delta = prev ? item.score - prev.score : null;
      return { id: item.id, name: item.name, current: item.score, previous: prev?.score ?? null, delta };
    });
  }

  function baselineCompare(current, history) {
    const completed = history.filter((record) => record.dimensionScores?.length);
    if (!completed.length) return null;
    return current.map((item) => {
      const related = completed
        .map((record) => record.dimensionScores.find((score) => score.id === item.id)?.score)
        .filter((score) => Number.isFinite(score));
      const baseline = Math.round(related.reduce((sum, score) => sum + score, 0) / related.length);
      return { id: item.id, name: item.name, current: item.score, baseline, delta: item.score - baseline };
    });
  }

  function consecutiveDeclines(records, dimensionId) {
    const sorted = [...records]
      .filter((record) => record.dimensionScores?.some((score) => score.id === dimensionId))
      .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
    let count = 0;
    for (let i = sorted.length - 1; i > 0; i -= 1) {
      const current = sorted[i].dimensionScores.find((score) => score.id === dimensionId).score;
      const previous = sorted[i - 1].dimensionScores.find((score) => score.id === dimensionId).score;
      if (current < previous) count += 1;
      else break;
    }
    return count;
  }

  function evaluateRecord(record, previousRecord, athleteHistory, template) {
    const scores = record.dimensionScores || [];
    const previous = compareScores(scores, previousRecord);
    const baseline = baselineCompare(scores, athleteHistory);
    const reasons = [];
    const low = scores.filter((score) => score.score <= riskThresholds.dimensionLow);
    low.forEach((score) => reasons.push(`${score.name}低於目前提醒門檻`));
    if (previous) {
      previous
        .filter((item) => item.delta <= -riskThresholds.dimensionDropPercent)
        .forEach((item) => reasons.push(`${item.name}較上次下降${Math.abs(item.delta)}%`));
    }
    if (baseline) {
      baseline
        .filter((item) => item.delta <= -riskThresholds.baselineDropPercent)
        .forEach((item) => reasons.push(`${item.name}低於個人平均${Math.abs(item.delta)}%`));
    }
    const declineItems = scores.filter((score) => consecutiveDeclines([...athleteHistory, record], score.id) >= riskThresholds.consecutiveDeclineCount);
    declineItems.forEach((score) => reasons.push(`${score.name}連續${riskThresholds.consecutiveDeclineCount}次下降`));
    const worsening = previous ? previous.filter((item) => item.delta < 0) : [];
    if (worsening.length >= riskThresholds.multipleRiskDimensionCount) reasons.push(`${worsening.length}個構面同時惡化`);
    const concernAnswers = highConcernAnswers(template, record.answers || {});
    concernAnswers.forEach((answer) => {
      const dimension = dimensionCatalog.find((item) => item.id === answer.dimension);
      reasons.push(`${dimension?.name || "高關注題目"}出現需要進一步了解的回答`);
    });
    let status = "green";
    if (!scores.length) status = "gray";
    else if (reasons.length >= 3 || low.length >= 2 || declineItems.length >= 2) status = "red";
    else if (reasons.length || low.length) status = "orange";
    return {
      overallStatus: status,
      alertReasons: [...new Set(reasons)],
      changeFromPrevious: previous,
      changeFromBaseline: baseline,
      aiSummary: createSummary(scores, previous, reasons),
      suggestedQuestion: createSuggestedQuestion(scores, reasons)
    };
  }

  function createSummary(scores, previous, reasons) {
    if (!scores?.length) return "目前資料不足，尚無法產生趨勢摘要。";
    const sorted = [...scores].sort((a, b) => a.score - b.score);
    const weak = sorted.slice(0, 2).map((item) => item.name).join("、");
    if (!previous) return `本次結果可作為個人基準，建議先從${weak}了解近期訓練與比賽感受。`;
    const drops = previous.filter((item) => item.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 2);
    if (!drops.length) return "本次與上次相比未見明顯下降，仍可持續觀察近期訓練壓力與恢復狀態。";
    return `近期主要變化集中在${drops.map((item) => item.name).join("、")}，建議先了解最近訓練或比賽中是否有明顯壓力事件。`;
  }

  function createSuggestedQuestion(scores, reasons) {
    if (!scores?.length) return "目前資料不足，建議先確認選手是否已完成測驗。";
    const lowest = [...scores].sort((a, b) => a.score - b.score)[0];
    const map = {
      confidence: "最近訓練或比賽時，哪一件事情最讓你沒有把握？",
      focus: "最近最容易讓你分心的是什麼情境？",
      motivation: "最近訓練中，哪一段讓你最難投入？",
      pressure: "最近壓力升高時，你通常會先出現什麼反應？",
      recovery: "最近你覺得最需要恢復的是身體、心理，還是訓練節奏？"
    };
    return map[lowest.id] || "最近哪一件事情最需要教練先了解？";
  }

  function statusLabel(status) {
    return {
      green: "狀態穩定",
      orange: "建議留意",
      red: "建議優先關心",
      gray: "尚未完成／資料不足"
    }[status] || "尚未完成／資料不足";
  }

  function statusRank(status) {
    return { red: 1, orange: 2, gray: 4, green: 5 }[status] || 4;
  }

  class LocalStore {
    constructor({ seedDemo = false } = {}) {
      this.seedDemo = seedDemo;
      this.ensure();
    }
    ensure() {
      const current = readJson(STORE_KEY, null);
      if (!current) writeJson(STORE_KEY, this.seedDemo ? demoSeed() : createEmptyStore());
    }
    read() {
      return readJson(STORE_KEY, createEmptyStore());
    }
    write(store) {
      writeJson(STORE_KEY, store);
    }
  }

  class DemoAuthRepository {
    constructor(store) {
      this.store = store;
    }
    async login({ account, password }) {
      if (!account?.trim() || !password?.trim()) throw new Error("請輸入教練帳號與密碼。");
      const session = {
        id: uid("session"),
        coachId: "demo-coach",
        coachName: account.trim(),
        demo: true,
        createdAt: new Date().toISOString()
      };
      writeJson(SESSION_KEY, session);
      return session;
    }
    async logout() {
      global.localStorage?.removeItem(SESSION_KEY);
    }
    async currentSession() {
      return readJson(SESSION_KEY, null);
    }
  }

  class RemoteAuthRepository {
    async login() {
      throw new Error("正式帳號驗證尚未串接。建議串接 Supabase Auth 或 Firebase Auth。");
    }
    async logout() {
      global.localStorage?.removeItem(SESSION_KEY);
    }
    async currentSession() {
      return readJson(SESSION_KEY, null);
    }
  }

  class DemoAthleteRepository {
    constructor(store) {
      this.store = store;
    }
    async findById(id) {
      return this.store.read().athletes.find((athlete) => athlete.id === id) || null;
    }
    async findByName(name) {
      return this.store.read().athletes.filter((athlete) => athlete.name === name.trim());
    }
    async upsertProfile(profile) {
      const store = this.store.read();
      const now = new Date().toISOString();
      const existing = store.athletes.find((athlete) => athlete.id === profile.id);
      const next = {
        id: profile.id || uid("athlete"),
        name: profile.name.trim(),
        sport: profile.sport?.trim() || "",
        groupId: profile.groupId || defaultGroup(store).id,
        inviteToken: profile.inviteToken || "",
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };
      if (existing) Object.assign(existing, next);
      else store.athletes.push(next);
      this.store.write(store);
      writeJson(ATHLETE_SESSION_KEY, { athleteId: next.id, name: next.name, updatedAt: now });
      return next;
    }
    async list() {
      return this.store.read().athletes;
    }
  }

  class RemoteAthleteRepository extends DemoAthleteRepository {
    async upsertProfile() {
      throw new Error("正式選手資料庫尚未串接。");
    }
  }

  class DemoGroupRepository {
    constructor(store) {
      this.store = store;
    }
    async list() {
      const store = this.store.read();
      if (!store.groups.length) {
        const group = defaultGroup(store);
        this.store.write(store);
        return [group];
      }
      return store.groups;
    }
    async sessions() {
      const store = this.store.read();
      if (!store.assessmentSessions.length) {
        const group = defaultGroup(store);
        store.assessmentSessions.push(defaultSession(group.id));
        this.store.write(store);
      }
      return store.assessmentSessions;
    }
  }

  class RemoteGroupRepository extends DemoGroupRepository {
    async list() {
      return [];
    }
  }

  class DemoAssessmentRepository {
    constructor(store) {
      this.store = store;
    }
    async templates() {
      return assessmentTemplates;
    }
    async getActiveSession(params = {}) {
      const store = this.store.read();
      const groupId = params.group || defaultGroup(store).id;
      let session = store.assessmentSessions.find((item) => item.id === params.assessment || item.token === params.token);
      if (!session) {
        session = store.assessmentSessions.find((item) => item.groupId === groupId) || defaultSession(groupId);
        if (!store.assessmentSessions.some((item) => item.id === session.id)) store.assessmentSessions.push(session);
        this.store.write(store);
      }
      return session;
    }
    async readDraft(athleteId, sessionId) {
      const store = this.store.read();
      return store.drafts[`${athleteId}:${sessionId}`] || null;
    }
    async saveDraft(athleteId, sessionId, draft) {
      const store = this.store.read();
      const key = `${athleteId}:${sessionId}`;
      store.drafts[key] = { ...draft, athleteId, assessmentSessionId: sessionId, updatedAt: new Date().toISOString() };
      this.store.write(store);
      return store.drafts[key];
    }
    async submit({ athleteId, groupId, sessionId, templateId, answers, startedAt }) {
      const store = this.store.read();
      const template = getTemplate(templateId);
      const validation = validateAnswers(template, answers);
      if (!validation.complete) throw new Error(`你還有${validation.missing.length}題尚未完成。`);
      const athleteHistory = store.assessmentRecords
        .filter((record) => record.athleteId === athleteId && record.assessmentTemplateId === template.id)
        .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
      const previousRecord = athleteHistory[athleteHistory.length - 1] || null;
      const dimensionScores = scoreAnswers(template, answers);
      const completedAt = new Date().toISOString();
      const record = {
        id: uid("assessment"),
        athleteId,
        groupId,
        assessmentSessionId: sessionId,
        assessmentTemplateId: template.id,
        assessmentVersion: template.version,
        scoringVersion: template.scoringVersion,
        startedAt: startedAt || completedAt,
        completedAt,
        answers: { ...answers },
        dimensionScores,
        overallStatus: "gray",
        alertReasons: [],
        changeFromPrevious: null,
        changeFromBaseline: null,
        aiSummary: "",
        suggestedQuestion: "",
        viewed: false,
        cared: false,
        createdAt: completedAt
      };
      Object.assign(record, evaluateRecord(record, previousRecord, athleteHistory, template));
      store.assessmentRecords.push(record);
      delete store.drafts[`${athleteId}:${sessionId}`];
      this.store.write(store);
      return record;
    }
    async records() {
      return this.store.read().assessmentRecords;
    }
    async recordsForAthlete(athleteId) {
      return this.store.read().assessmentRecords
        .filter((record) => record.athleteId === athleteId)
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    }
    async markViewed(recordId) {
      const store = this.store.read();
      const record = store.assessmentRecords.find((item) => item.id === recordId);
      if (record) record.viewed = true;
      this.store.write(store);
      return record;
    }
    async markCared(recordId) {
      const store = this.store.read();
      const record = store.assessmentRecords.find((item) => item.id === recordId);
      if (record) record.cared = true;
      this.store.write(store);
      return record;
    }
  }

  class RemoteAssessmentRepository extends DemoAssessmentRepository {
    async submit() {
      throw new Error("正式測驗資料庫尚未串接。");
    }
  }

  class DemoFollowUpRepository {
    constructor(store) {
      this.store = store;
    }
    async list() {
      return this.store.read().followUps;
    }
    async forAthlete(athleteId) {
      return this.store.read().followUps
        .filter((item) => item.athleteId === athleteId)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }
    async save(input) {
      const store = this.store.read();
      const now = new Date().toISOString();
      const item = {
        id: input.id || uid("followup"),
        athleteId: input.athleteId,
        assessmentId: input.assessmentId,
        coachId: input.coachId || "demo-coach",
        status: input.status || "observing",
        note: input.note || "",
        athleteResponse: input.athleteResponse || "",
        nextAction: input.nextAction || "",
        followUpDate: input.followUpDate || "",
        createdAt: input.createdAt || now,
        updatedAt: now
      };
      const existing = store.followUps.find((followUp) => followUp.id === item.id);
      if (existing) Object.assign(existing, item);
      else store.followUps.push(item);
      const record = store.assessmentRecords.find((recordItem) => recordItem.id === item.assessmentId);
      if (record) record.cared = true;
      this.store.write(store);
      return item;
    }
  }

  class RemoteFollowUpRepository extends DemoFollowUpRepository {
    async save() {
      throw new Error("正式追蹤資料庫尚未串接。");
    }
  }

  function defaultGroup(store) {
    let group = store.groups.find((item) => item.id === "local-group");
    if (!group) {
      group = { id: "local-group", name: "未命名團隊", createdAt: new Date().toISOString() };
      store.groups.push(group);
    }
    return group;
  }

  function defaultSession(groupId) {
    return {
      id: "local-session",
      groupId,
      templateId: "quick-state-v1",
      name: "第三代渥太華心理技能量表",
      startDate: todayISO(),
      endDate: "",
      token: "local-link",
      createdAt: new Date().toISOString()
    };
  }

  function latestRecord(records, athleteId) {
    return records
      .filter((record) => record.athleteId === athleteId)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0] || null;
  }

  function nextFollowUp(followUps, athleteId) {
    return followUps
      .filter((item) => item.athleteId === athleteId && item.followUpDate && !["closed", "improved"].includes(item.status))
      .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate))[0] || null;
  }

  function buildCoachRows({ athletes, records, followUps }) {
    const now = new Date().toISOString();
    return athletes.map((athlete) => {
      const record = latestRecord(records, athlete.id);
      const followUp = nextFollowUp(followUps, athlete.id);
      const overdue = followUp ? daysBetween(followUp.followUpDate, now) > 0 : false;
      const dueToday = followUp ? followUp.followUpDate === todayISO() : false;
      const status = record?.overallStatus || "gray";
      return {
        athlete,
        record,
        followUp,
        status,
        overdue,
        dueToday,
        viewed: !!record?.viewed,
        cared: !!record?.cared || followUps.some((item) => item.athleteId === athlete.id),
        sortRank: overdue && status !== "red" ? 3 : statusRank(status)
      };
    }).sort((a, b) => a.sortRank - b.sortRank || new Date(b.record?.completedAt || 0) - new Date(a.record?.completedAt || 0));
  }

  function dashboardStats(rows, followUps) {
    return {
      total: rows.length,
      completed: rows.filter((row) => row.record).length,
      pending: rows.filter((row) => !row.record).length,
      stable: rows.filter((row) => row.status === "green").length,
      watch: rows.filter((row) => row.status === "orange").length,
      priority: rows.filter((row) => row.status === "red").length,
      dueToday: rows.filter((row) => row.dueToday).length,
      overdue: rows.filter((row) => row.overdue).length,
      notCared: rows.filter((row) => row.record && !row.cared).length,
      observing: followUps.filter((item) => item.status === "observing").length,
      improved: followUps.filter((item) => item.status === "improved").length
    };
  }

  function createRepositories() {
    const useDemo = APP_MODE === "demo";
    const store = new LocalStore({ seedDemo: useDemo });
    return {
      mode: APP_MODE,
      store,
      auth: useDemo ? new DemoAuthRepository(store) : new DemoAuthRepository(store),
      remoteAuth: new RemoteAuthRepository(),
      athletes: useDemo ? new DemoAthleteRepository(store) : new DemoAthleteRepository(store),
      remoteAthletes: new RemoteAthleteRepository(store),
      assessments: useDemo ? new DemoAssessmentRepository(store) : new DemoAssessmentRepository(store),
      remoteAssessments: new RemoteAssessmentRepository(store),
      followUps: useDemo ? new DemoFollowUpRepository(store) : new DemoFollowUpRepository(store),
      remoteFollowUps: new RemoteFollowUpRepository(store),
      groups: useDemo ? new DemoGroupRepository(store) : new DemoGroupRepository(store),
      remoteGroups: new RemoteGroupRepository(store)
    };
  }

  const api = {
    APP_MODE,
    APP_MODE_KEY,
    STORE_KEY,
    SESSION_KEY,
    ATHLETE_SESSION_KEY,
    riskThresholds,
    dimensionCatalog,
    assessmentTemplates,
    getTemplate,
    validateAnswers,
    scoreAnswers,
    highConcernAnswers,
    compareScores,
    evaluateRecord,
    statusLabel,
    statusRank,
    buildCoachRows,
    dashboardStats,
    createRepositories,
    demoSeed,
    uid,
    todayISO,
    daysBetween,
    readJson,
    writeJson
  };

  global.WenMindCore = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
