(function (global) {
  "use strict";

  // 題庫 2.0（瀏覽器先載入 questionBank.js；Node 測試用 require）
  const QB = (typeof global.TeamProQuestionBank !== "undefined")
    ? global.TeamProQuestionBank
    : (typeof require !== "undefined" ? require("./questionBank.js") : null);

  const APP_MODE_KEY = "wenmind:app-mode";
  const STORE_KEY = "wenmind:radar:v2";
  const SESSION_KEY = "wenmind:coach-session";
  const ATHLETE_SESSION_KEY = "wenmind:athlete-session";
  const REMOTE_ENDPOINT_KEY = "wenmind:api-endpoint";

  // 部署 GAS 後把 Web App /exec 網址貼在這裡即可全裝置同步；
  // 或用 網址?api=你的/exec 造訪一次，會自動記住（存在 localStorage）。
  const REMOTE_ENDPOINT_DEFAULT = "https://script.google.com/macros/s/AKfycbxRSa_dxXJNJrRAD64pSnopA2Mw4ymSXEOVIQxZO2yhFK1KAz9d5hQhguJa6BWd1A7z9g/exec";

  function resolveEndpoint() {
    // 測試／離線情境可設 global.WENMIND_FORCE_LOCAL = true 強制純本機，不打後台。
    if (global.WENMIND_FORCE_LOCAL) return "";
    try {
      const params = new URLSearchParams(global.location?.search || "");
      const fromQuery = params.get("api");
      if (fromQuery) {
        global.localStorage?.setItem(REMOTE_ENDPOINT_KEY, fromQuery);
        return fromQuery;
      }
      return global.localStorage?.getItem(REMOTE_ENDPOINT_KEY) || REMOTE_ENDPOINT_DEFAULT;
    } catch {
      return REMOTE_ENDPOINT_DEFAULT;
    }
  }

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

  const defaultDimensionCatalog = [
    { id: "confidence", name: "自信心", group: "心理準備", positive: true, train: "先從最近做得到的一個動作建立把握感。" },
    { id: "focus", name: "專注力", group: "心理準備", positive: true, train: "練習把注意力拉回下一個可執行動作。" },
    { id: "motivation", name: "訓練動機", group: "投入狀態", positive: true, train: "把大目標拆成一週內可完成的小任務。" },
    { id: "pressure", name: "壓力調節", group: "身心調節", positive: true, train: "建立比賽前與失誤後的呼吸重置流程。" },
    { id: "recovery", name: "心理疲勞／恢復", group: "身心調節", positive: true, train: "觀察睡眠、恢復與訓練負荷是否需要調整。" }
  ];

  const ottawaDimensions = [
    { id: "goal", name: "目標設定", group: "心理技能", positive: true, train: "協助選手建立每日與階段目標。" },
    { id: "confidence", name: "自信", group: "心理技能", positive: true, train: "先了解最近影響把握感的訓練或比賽事件。" },
    { id: "commitment", name: "承諾", group: "心理技能", positive: true, train: "檢視投入、犧牲與訓練承諾是否穩定。" },
    { id: "relaxation", name: "放鬆", group: "身心調節", positive: true, train: "練習賽前與關鍵時刻的放鬆流程。" },
    { id: "activation", name: "活化", group: "身心調節", positive: true, train: "建立從低落或過度放鬆回到比賽狀態的啟動流程。" },
    { id: "fear", name: "擔心", group: "身心調節", positive: true, train: "釐清訓練或比賽中引發害怕的情境。" },
    { id: "stress", name: "焦慮", group: "身心調節", positive: true, train: "觀察緊張、身體緊繃與失常擔心的變化。" },
    { id: "imagery", name: "意象能力", group: "認知技能", positive: true, train: "練習產生清晰、可調整且有感覺的動作影像。" },
    { id: "mentalPractice", name: "意象練習", group: "認知技能", positive: true, train: "安排固定且有計畫的意象練習。" },
    { id: "concentration", name: "專注", group: "認知技能", positive: true, train: "找出失去專注的情境並建立回到當下的策略。" },
    { id: "refocus", name: "再專注", group: "認知技能", positive: true, train: "建立失誤、混亂或突發狀況後的重置流程。" },
    { id: "competitionPlan", name: "競賽計畫", group: "競賽準備", positive: true, train: "整理賽前習慣、提示語與比賽中可執行計畫。" }
  ];

  const toughnessDimensions = [
    { id: "striving", name: "積極奮鬥", group: "心理堅韌", positive: true, train: "觀察選手是否持續追求進步與自我要求。" },
    { id: "pressureControl", name: "壓力", group: "心理堅韌", positive: true, train: "討論壓力、挑戰與落後時的穩定策略。" },
    { id: "painTolerance", name: "傷痛忍受", group: "心理堅韌", positive: true, train: "提醒正式使用時需搭配安全界線與傷痛回報。" }
  ];

  const anxietyDimensions = [
    { id: "cognitiveAnxiety", name: "認知焦慮", group: "競賽狀態", positive: false, train: "了解比賽前擔心、害怕失常或擔心他人評價的來源。" },
    { id: "somaticAnxiety", name: "身體焦慮", group: "競賽狀態", positive: false, train: "觀察身體緊張、胃部不適、心跳與手心出汗。" },
    { id: "stateConfidence", name: "狀態自信", group: "競賽狀態", positive: true, train: "確認選手面對比賽挑戰時的信心與可控感。" }
  ];

  // TeamPro 運動心理技能自評 2.0（正式主測驗；12 構面×4 題＝48 題、7 點量尺、全正向）
  function teamproTemplate(ageGroup) {
    const isChild = ageGroup === "child";
    return {
      id: isChild ? "teampro-mental-skills-v2-child" : "teampro-mental-skills-v2",
      // 暫不開放選手填寫；保留在清單中讓既有紀錄仍可正確顯示名稱與構面。
      hidden: true,
      version: "2.0",
      scoringVersion: "2.0",
      questionBankVersion: "2.0",
      ageGroup: isChild ? "child" : "standard",
      name: "TeamPro 運動心理技能自評" + (isChild ? "（兒童版）" : ""),
      subtitle: "參考運動心理技能架構設計，用於選手自我覺察、教練訪談及心理技能訓練，不屬於臨床診斷工具。",
      description: isChild
        ? "兒童版：用更簡單的句子，了解 12 項運動心理技能目前的自我感受。"
        : "了解 12 項運動心理技能目前的自我感受，作為自我覺察與教練訪談的參考。",
      disclaimer: "本結果為選手當下的自我評估，不代表人格定型、心理疾病或比賽結果預測。",
      resultNote: isChild
        ? "兒童版結果主要用於親子及教練對話，不建議單獨依分數替孩子下結論。"
        : "本結果為選手當下的自我評估，不代表人格定型、心理疾病或比賽結果預測。",
      points: 7,
      optionLabels: ["非常不符合", "大多不符合", "有些不符合", "普通／不確定", "有些符合", "大多符合", "非常符合"],
      dimensions: QB ? QB.DIMENSIONS : [],
      questions: QB ? QB.buildQuestions(isChild ? "child" : "standard") : []
    };
  }

  const assessmentTemplates = [
    teamproTemplate("standard"),
    {
      id: "ottawa-mental-skills-v1",
      version: "2026.07.demo",
      scoringVersion: "demo-v2",
      name: "渥太華心理技能問卷",
      description: "檢測12種重要運動心理技能的自我評估狀態。",
      disclaimer: "目前為展示題庫，正式使用前需確認量表授權、正式題目與計分規則。",
      points: 5,
      scoreMode: "sum",
      optionLabels: ["從來不曾", "很少", "偶而", "經常", "幾乎總是"],
      dimensions: ottawaDimensions,
      questions: makeQuestions("om", [
        "我設定每日訓練目標",
        "不管我遇到任何的障礙，我相信在我選擇的活動上我都可以成功",
        "我下定決心絕不放棄我的運動專項",
        "我覺得放鬆是容易的",
        "在訓練過程中感到疲憊時我還會更加努力",
        "我的運動專項上有一些事物具有潛在危險而且這些潛在危險令我害怕",
        "我會因為太緊張而表現失常",
        "我覺得要在腦海裡產生運動的影像是容易的",
        "我每星期都會固定針對我的運動專項做意象練習",
        "在重要比賽中，我會失去專注力",
        "當我比賽時，失誤經常接二連三的發生",
        "在比賽前我會規劃一套習慣做的事去執行",
        "我會設定困難但可以達成的目標",
        "在運動中即使處境艱難，我仍然可以表現得很有自信",
        "我盡心盡力地想去成為一位傑出的運動員",
        "我可以按照自己的意思去降低肌肉的緊繃",
        "當我在比賽中太過放鬆時我能夠去增加自己的衝勁",
        "我覺得訓練是困難的因為我害怕參與我的專項運動",
        "在比賽中，我的身體會出現不必要的緊繃",
        "我覺得要改變我腦海裡的影像是容易的",
        "我會在心中反覆演練我最佳表現時的狀態",
        "我在日常訓練當中會失去專注力",
        "在比賽中感到混亂之後我很難再重新控制自己",
        "在比賽前我會規劃一套習慣想的事來加以思考",
        "我設定目標來改善我訓練時的表現",
        "我相信我擁有能力可以達到自己的目標",
        "我願意犧牲其他大多的事情來達到我在運動專項上的卓越",
        "我覺得快速放鬆是容易的",
        "我可以輕易的激發自己到達我最佳表現所需的理想水準",
        "我怕輸",
        "我覺得在比賽中，觀眾多會讓我感到緊張而失常",
        "我在腦海裡有清晰的影像",
        "我的意象練習是有事先規劃好的",
        "我覺得在某些特定的練習情境下要維持專心是很困難的",
        "我覺得在比賽時要把一些沒有預期會發生的事情拋開是困難的",
        "我規劃了一套習慣動作在比賽中執行",
        "我的目標促使我更加努力",
        "我對於自己的整體表現有信心",
        "跟我生活中的其他事物相比，我會更加投入去增強我的運動專項",
        "在比賽的關鍵時刻我可以有效的放鬆",
        "即使我在比賽前情緒低落，我可以輕易的讓自己活絡起來",
        "我覺得很難透過增加對事情的控制感來降低我對訓練的恐懼",
        "我在練習時的比賽表現比正式比賽時還要好",
        "我可以在腦海影像當中感覺到一些動作",
        "我會針對比賽的關鍵情境作意象練習",
        "對我來說，要找到一個有效的策略，讓我在比賽中從頭到尾都維持專注是困難的",
        "在訓練當中，我老是想著失誤",
        "我有一些像提示話語的計劃，讓我能夠在比賽中告訴自己"
      ], ottawaDimensions.map((item) => item.id), [6, 7, 10, 11, 18, 19, 22, 23, 30, 31, 34, 35, 42, 43, 46, 47])
    },
    {
      id: "trait-mental-toughness-v1",
      version: "2026.07.demo",
      scoringVersion: "demo-v2",
      name: "特質運動心理堅韌性量表",
      description: "了解運動情境中的心理堅韌、抗壓、堅持與自我要求狀態。",
      disclaimer: "目前為展示題庫，正式使用前需確認量表授權、正式題目與計分規則。",
      points: 5,
      optionLabels: ["非常不同意", "相當不同意", "有點不同意", "有點同意", "相當同意"],
      dimensions: toughnessDimensions,
      questions: makeQuestions("tm", [
        "練習時我會盡力達到自己所設定的目標",
        "練習時我會不斷地想去超越自己的體能",
        "緊張的時候，我會有辦法馬上放鬆下來",
        "如果比賽時的干擾很多，我不會分心",
        "有時候身上有一些傷痛，我還是會持續的參與練習",
        "練習時我會一直想去追求進步",
        "遇到困難時，我會保持冷靜",
        "面對挑戰時，我會很沉穩的接受它",
        "練習的時候身體常會有一些酸痛，我都會忍下來",
        "為了比別人好，我會自動自發的練習",
        "落後時，我還是會穩紮穩打",
        "比賽時如果覺得壓力很大，我還是會很專心",
        "雖然身上有一些傷痛，我還是會持續的參與訓練",
        "練習時我會努力地去學習新的東西",
        "有壓力時，我的抗壓能力很好",
        "比賽的時候身體常會有一些酸痛，我都會忍下來",
        "練習時我會盡力達到教練的要求",
        "比賽的時候如果受了一點傷，我通常會忍下來",
        "雖然有壓力，我通常會把一切都控制的很好",
        "我不會因為落後而覺得很緊張",
        "練習時雖然很辛苦，我還是會自我要求"
      ], ["striving", "striving", "pressureControl", "pressureControl", "painTolerance", "striving", "pressureControl", "pressureControl", "painTolerance", "striving", "pressureControl", "pressureControl", "painTolerance", "striving", "pressureControl", "painTolerance", "striving", "painTolerance", "pressureControl", "pressureControl", "striving"])
    },
    {
      id: "competition-state-anxiety-v1",
      version: "2026.07.demo",
      scoringVersion: "demo-v2",
      name: "競賽狀態性焦慮量表",
      description: "了解選手比賽前的認知焦慮、身體焦慮與狀態自信。",
      disclaimer: "目前為展示題庫，正式使用前需確認量表授權、正式題目與計分規則。",
      points: 4,
      optionLabels: ["一點也不", "有點同意", "同意", "非常同意"],
      dimensions: anxietyDimensions,
      questions: makeQuestions("ca", [
        "我覺得忐忑不安",
        "我擔心自己無法在比賽中發揮應有的實力",
        "我覺得有自信",
        "我覺得身體緊張",
        "我擔心會輸掉比賽",
        "我覺得胃部緊縮",
        "我有信心克服挑戰",
        "我擔心在壓力下會失常",
        "我的心跳急速",
        "我有信心會表現很好",
        "我擔心表現的很差",
        "我感到胃下垂",
        "我有自信，因為我預計能達到自己的目標",
        "我擔心其他人對我的表現感到失望",
        "我的手心出汗",
        "我有信心突破壓力",
        "我覺得身體有些緊繃"
      ], ["somaticAnxiety", "cognitiveAnxiety", "stateConfidence", "somaticAnxiety", "cognitiveAnxiety", "somaticAnxiety", "stateConfidence", "cognitiveAnxiety", "somaticAnxiety", "stateConfidence", "cognitiveAnxiety", "somaticAnxiety", "stateConfidence", "cognitiveAnxiety", "somaticAnxiety", "stateConfidence", "somaticAnxiety"], [], ["cognitiveAnxiety", "somaticAnxiety"])
    }
  ];

  function makeQuestions(prefix, texts, dimensions, reverseNumbers = [], highConcernDimensions = []) {
    return texts.map((text, index) => {
      const dimension = Array.isArray(dimensions) ? dimensions[index % dimensions.length] : dimensions;
      return {
        id: `${prefix}${String(index + 1).padStart(2, "0")}`,
        dimension,
        text,
        reverse: reverseNumbers.includes(index + 1),
        highConcern: highConcernDimensions.includes(dimension) || reverseNumbers.includes(index + 1)
      };
    });
  }

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

  function isDemoSeedEntry(item) {
    const name = String(item?.name || "").trim();
    const id = String(item?.id || "");
    return id.startsWith("demo-") || name === "王小明";
  }

  function normalizeRecordedScores(record) {
    if (!record || !record.assessmentTemplateId) return record;
    const template = getTemplate(record.assessmentTemplateId);
    if (!template || template.scoreMode !== "sum") return record;
    if (!Array.isArray(record.dimensionScores)) return refreshRecordNames(record);

    const scoreById = new Map(record.dimensionScores.filter(Boolean).map((item) => [item.id, item]));
    const convertScore = (item) => {
      if (!item) return item;
      const source = scoreById.get(item.id) || item;
      const rawMax = Number(source.max || item.max || 0);
      if (!(rawMax > 0) || rawMax >= 100 || source.rawScore != null) return item;
      const normalized = Math.round((Number(source.score || 0) / rawMax) * 100);
      return { ...item, score: normalized, max: 100, rawScore: source.score, rawMax };
    };
    const convertChange = (arr) => Array.isArray(arr)
      ? arr.map((item) => {
        const source = scoreById.get(item?.id);
        const rawMax = Number(source?.max || item?.max || 0);
        if (!(rawMax > 0) || rawMax >= 100 || source?.rawScore != null) return item;
        const ratio = 100 / rawMax;
        const scale = (value) => Number.isFinite(value) ? Math.round(value * ratio) : value;
        return {
          ...item,
          current: scale(item.current),
          previous: scale(item.previous),
          baseline: scale(item.baseline)
        };
      })
      : arr;

    return refreshRecordNames({
      ...record,
      dimensionScores: record.dimensionScores.map(convertScore),
      changeFromPrevious: convertChange(record.changeFromPrevious),
      changeFromBaseline: convertChange(record.changeFromBaseline)
    });
  }

  function sanitizeStore(store) {
    if (!store || typeof store !== "object") return createEmptyStore();
    const next = {
      ...createEmptyStore(),
      ...store,
      groups: Array.isArray(store.groups) ? store.groups.filter((item) => !String(item?.id || "").startsWith("demo-")) : [],
      assessmentSessions: Array.isArray(store.assessmentSessions) ? store.assessmentSessions.filter((item) => !String(item?.id || "").startsWith("demo-")) : [],
      athletes: Array.isArray(store.athletes) ? store.athletes.filter((item) => !isDemoSeedEntry(item)) : [],
      assessmentRecords: Array.isArray(store.assessmentRecords) ? store.assessmentRecords.filter((item) => !String(item?.id || "").startsWith("demo-") && !String(item?.athleteId || "").startsWith("demo-")) : [],
      drafts: store.drafts && typeof store.drafts === "object" ? store.drafts : {},
      followUps: Array.isArray(store.followUps) ? store.followUps.filter((item) => !String(item?.id || "").startsWith("demo-") && !String(item?.athleteId || "").startsWith("demo-")) : [],
      auditLogs: Array.isArray(store.auditLogs) ? store.auditLogs.filter((item) => !String(item?.id || "").startsWith("demo-")) : []
    };
    next.assessmentRecords = next.assessmentRecords.map((record) => normalizeRecordedScores(record));
    return next;
  }

  function demoSeed() {
    const now = new Date();
    const groupId = "demo-group";
    const sessionId = "demo-session";
    return {
      ...createEmptyStore(),
      groups: [{ id: groupId, name: "展示團隊", createdAt: new Date(now - 35 * 86400000).toISOString() }],
      assessmentSessions: [{
        id: sessionId,
        groupId,
        templateId: getTemplate().id,
        name: "特質運動心理堅韌性量表展示活動",
        startDate: todayISO(),
        endDate: todayISO(),
        token: "demo-token",
        createdAt: new Date(now - 7 * 86400000).toISOString()
      }],
      athletes: [],
      assessmentRecords: [],
      followUps: [],
      auditLogs: []
    };
  }

  function getTemplate(templateId = "teampro-mental-skills-v2") {
    return assessmentTemplates.find((template) => template.id === templateId) || assessmentTemplates[0];
  }

  function getDimensionCatalog(template) {
    return template?.dimensions || defaultDimensionCatalog;
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
    const sumMode = template.scoreMode === "sum";
    return getDimensionCatalog(template).map((dimension) => {
      const questions = template.questions.filter((question) => question.dimension === dimension.id);
      const values = questions.map((question) => {
        const raw = answers[question.id];
        return question.reverse ? template.points + 1 - raw : raw;
      });
      if (sumMode) {
        // 原始總分模式改為百分比，讓三個量表的顯示區間一致。
        const sum = values.reduce((total, value) => total + value, 0);
        const rawMax = questions.length * template.points;
        const score = rawMax ? Math.round((sum / rawMax) * 100) : 0;
        return { ...dimension, score, max: 100, rawScore: sum, rawMax };
      }
      const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
      const average = Math.round(avg * 100) / 100; // 原始平均，保留兩位小數（例：4.75／7）
      // 0～100 線性換算，不是百分位排名；夾在 0~100 之間
      const normalized = Math.max(0, Math.min(100, Math.round(((avg - 1) / (template.points - 1)) * 100)));
      const score = dimension.positive === false ? 100 - normalized : normalized;
      return { ...dimension, score, average, pointScale: template.points, max: 100 };
    });
  }

  function highConcernAnswers(template, answers) {
    return template.questions
      .filter((question) => question.highConcern && Number.isInteger(answers[question.id]))
      .map((question) => {
        const value = answers[question.id];
        const dimension = getDimensionCatalog(template).find((item) => item.id === question.dimension);
        const reversed = question.reverse || dimension?.positive === false;
        const effective = reversed ? template.points + 1 - value : value;
        return { id: question.id, dimension: question.dimension, text: question.text, answer: value, effectiveScore: effective };
      })
      .filter((item) => item.effectiveScore <= 2);
  }

  function compareScores(current, previous) {
    if (!previous) return null;
    return current.map((item) => {
      const prev = previous.dimensionScores.find((score) => score.id === item.id);
      const max = item.max || 100;
      // delta 以「滿分百分比」表示，讓門檻在 0-100 或原始總分量表都一致
      const delta = prev ? Math.round(((item.score - prev.score) / max) * 100) : null;
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
      const max = item.max || 100;
      return { id: item.id, name: item.name, current: item.score, baseline, delta: Math.round(((item.score - baseline) / max) * 100) };
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
    const low = scores.filter((score) => (score.score / (score.max || 100)) * 100 <= riskThresholds.dimensionLow);
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
      const dimension = getDimensionCatalog(template).find((item) => item.id === answer.dimension);
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

  // TeamPro 2.0 分數解讀區間（能力導向、不使用「很差／異常／不及格」等字眼）
  function interpretationBand(score) {
    if (score >= 75) return { key: "strong", level: "個人相對優勢", note: "此能力在本次自評中相對成熟且穩定，可作為個人優勢持續發揮。" };
    if (score >= 60) return { key: "stable", level: "相對穩定", note: "此能力目前相對穩定，可維持並依比賽需求進一步精進。" };
    if (score >= 40) return { key: "developing", level: "發展中", note: "此能力正在發展中，透過針對性的練習可望逐步提升。" };
    return { key: "priority", level: "優先了解與訓練", note: "此能力目前可優先了解與培養，建議搭配實際訓練或比賽情境進一步確認。" };
  }

  // 相對優勢：score>=75 且個人前3名；優先訓練：score<60 且個人後3名（不硬貼標籤）
  function strengthsAndPriorities(scores) {
    const list = Array.isArray(scores) ? scores.filter((item) => Number.isFinite(item.score)) : [];
    const strengths = [...list].sort((a, b) => b.score - a.score).filter((item) => item.score >= 75).slice(0, 3);
    const priorities = [...list].sort((a, b) => a.score - b.score).filter((item) => item.score < 60).slice(0, 3);
    return { strengths, priorities };
  }

  class LocalStore {
    constructor({ seedDemo = false } = {}) {
      this.seedDemo = seedDemo;
      this.ensure();
    }
    ensure() {
      const current = readJson(STORE_KEY, null);
      if (!current) {
        writeJson(STORE_KEY, this.seedDemo ? demoSeed() : createEmptyStore());
        return;
      }
      const sanitized = sanitizeStore(current);
      if (JSON.stringify(sanitized) !== JSON.stringify(current)) writeJson(STORE_KEY, sanitized);
    }
    read() {
      const store = sanitizeStore(readJson(STORE_KEY, createEmptyStore()));
      if (store) writeJson(STORE_KEY, store);
      return store;
    }
    write(store) {
      writeJson(STORE_KEY, sanitizeStore(store));
    }
  }

  async function postRemote(endpoint, payload) {
    // 用 text/plain 做「簡單請求」避開 GAS 不支援的 CORS preflight。
    // 加 15 秒逾時，避免手機弱網時 fetch 卡住不返回。
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      });
      if (!res.ok) throw new Error(`同步失敗 (HTTP ${res.status})`);
      const data = await res.json();
      if (data && data.ok === false) throw new Error(data.error || "同步失敗");
      return data;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // 雲端資料層：以 localStorage 當離線快取，每次寫入非同步 push 到 GAS，
  // 讀取時 pull 回最新（GAS 端以 id 合併，additive 不覆蓋別台裝置資料）。
  class RemoteStore {
    constructor({ endpoint, cacheKey = STORE_KEY }) {
      this.endpoint = endpoint;
      this.cacheKey = cacheKey;
      this.cache = sanitizeStore(readJson(cacheKey, null) || createEmptyStore());
      this._pending = Promise.resolve();
      this._writeSeq = 0; // 每次本機寫入遞增，用來判斷伺服器回應是否已過期
      this.online = false;
      this.lastError = "";
    }
    read() {
      this.cache = sanitizeStore(this.cache);
      return this.cache;
    }
    write(store) {
      this.cache = sanitizeStore(store);
      this._writeSeq += 1;
      writeJson(this.cacheKey, this.cache);
      this._queuePush(this.cache, this._writeSeq);
      return this.cache;
    }
    // 套用伺服器資料，但保留「本機當下的作答草稿」，且不覆蓋比它更新的本機寫入
    _applyServer(serverStore, seqAtRequest) {
      if (seqAtRequest !== undefined && seqAtRequest !== this._writeSeq) return; // 期間有更新的本機寫入，放棄套用避免回退
      const localDrafts = (this.cache && this.cache.drafts) ? this.cache.drafts : {};
      const merged = sanitizeStore(serverStore);
      merged.drafts = { ...(merged.drafts || {}), ...localDrafts }; // 本機草稿優先，作答中不被同步蓋掉
      this.cache = merged;
      writeJson(this.cacheKey, this.cache);
    }
    _queuePush(store, seq) {
      if (!this.endpoint) return this._pending;
      const snapshot = JSON.parse(JSON.stringify(store));
      this._pending = this._pending
        .catch(() => {})
        .then(() => postRemote(this.endpoint, { action: "push", store: snapshot }))
        .then((data) => {
          if (data && data.store) this._applyServer(data.store, seq);
          this.online = true;
          this.lastError = "";
        })
        .catch((err) => {
          this.online = false;
          this.lastError = err.message || String(err);
        });
      return this._pending;
    }
    async flush() {
      try {
        await this._pending;
      } catch {
        /* 已在 _queuePush 內記錄 lastError */
      }
      return this.cache;
    }
    async pull() {
      if (!this.endpoint) return this.cache;
      await this.flush();
      // 若上次 push 失敗（曾離線），先補送本機快取再拉最新。
      if (this.lastError) {
        this._queuePush(this.cache, this._writeSeq);
        await this.flush();
      }
      const seqAtRequest = this._writeSeq;
      try {
        const data = await postRemote(this.endpoint, { action: "pull" });
        // 只有在拉取期間沒有更新的本機寫入時才套用，並保留本機草稿
        if (data && data.store) this._applyServer(data.store, seqAtRequest);
        this.online = true;
        this.lastError = "";
      } catch (err) {
        this.online = false;
        this.lastError = err.message || String(err);
      }
      return this.cache;
    }
  }

  class DemoAuthRepository {
    constructor(store) {
      this.store = store;
    }
    async login({ account, password }) {
      const normalizedAccount = account?.trim() || "";
      const normalizedPassword = password?.trim() || "";
      if (!normalizedAccount || !normalizedPassword) throw new Error("請輸入教練帳號與密碼。");
      if (normalizedAccount !== "mind123" || normalizedPassword !== "mind123") throw new Error("帳號或密碼錯誤。");
      const session = {
        id: uid("session"),
        coachId: "coach-mind123",
        coachName: "運動心理教練",
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
    draftKey(athleteId, sessionId, templateId) {
      return `${athleteId}:${sessionId}:${templateId || getTemplate().id}`;
    }
    async readDraft(athleteId, sessionId, templateId) {
      const store = this.store.read();
      return store.drafts[this.draftKey(athleteId, sessionId, templateId)] || null;
    }
    async saveDraft(athleteId, sessionId, draft, templateId) {
      const store = this.store.read();
      const key = this.draftKey(athleteId, sessionId, templateId);
      store.drafts[key] = { ...draft, athleteId, assessmentSessionId: sessionId, assessmentTemplateId: templateId || getTemplate().id, updatedAt: new Date().toISOString() };
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
        questionBankVersion: template.questionBankVersion || template.scoringVersion,
        ageGroup: template.ageGroup || "standard",
        startedAt: startedAt || completedAt,
        completedAt,
        answers: { ...answers },
        dimensionScores,
        dimensionAverages: Object.fromEntries(dimensionScores.map((item) => [item.id, item.average ?? null])),
        completed: true,
        isDemo: false,
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
      delete store.drafts[this.draftKey(athleteId, sessionId, template.id)];
      this.store.write(store);
      return record;
    }
    async records() {
      return this.store.read().assessmentRecords.map(refreshRecordNames);
    }
    async recordsForAthlete(athleteId) {
      return this.store.read().assessmentRecords
        .filter((record) => record.athleteId === athleteId)
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
        .map(refreshRecordNames);
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
      templateId: getTemplate().id,
      name: getTemplate().name,
      startDate: todayISO(),
      endDate: "",
      token: "local-link",
      createdAt: new Date().toISOString()
    };
  }

  // 構面顯示名稱以「目前量表定義」為準（用 id 對照），讓量表改名後舊紀錄也一起更新。
  function refreshRecordNames(record) {
    if (!record || !record.assessmentTemplateId) return record;
    const template = getTemplate(record.assessmentTemplateId);
    if (!template || !Array.isArray(template.dimensions)) return record;
    const nameById = {};
    template.dimensions.forEach((dimension) => { nameById[dimension.id] = dimension.name; });
    const allowedIds = new Set(template.dimensions.map((dimension) => dimension.id));
    const fix = (arr) => Array.isArray(arr)
      ? arr
        .filter((item) => item && allowedIds.has(item.id))
        .map((item) => (item && nameById[item.id]) ? { ...item, name: nameById[item.id] } : item)
      : arr;
    return {
      ...record,
      dimensionScores: fix(record.dimensionScores),
      changeFromPrevious: fix(record.changeFromPrevious),
      changeFromBaseline: fix(record.changeFromBaseline)
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
    // demo 模式一律本機示範資料；正式模式若設定了 GAS /exec 端點則走雲端同步，
    // 否則退回純本機（localStorage）。所有 repository 共用同一個 store。
    const endpoint = useDemo ? "" : resolveEndpoint();
    const store = endpoint
      ? new RemoteStore({ endpoint, cacheKey: STORE_KEY })
      : new LocalStore({ seedDemo: useDemo });
    return {
      mode: APP_MODE,
      endpoint,
      synced: !!endpoint,
      store,
      auth: new DemoAuthRepository(store),
      athletes: new DemoAthleteRepository(store),
      assessments: new DemoAssessmentRepository(store),
      followUps: new DemoFollowUpRepository(store),
      groups: new DemoGroupRepository(store)
    };
  }

  const api = {
    APP_MODE,
    APP_MODE_KEY,
    STORE_KEY,
    SESSION_KEY,
    ATHLETE_SESSION_KEY,
    REMOTE_ENDPOINT_KEY,
    resolveEndpoint,
    riskThresholds,
    defaultDimensionCatalog,
    assessmentTemplates,
    getTemplate,
    validateAnswers,
    scoreAnswers,
    highConcernAnswers,
    compareScores,
    evaluateRecord,
    statusLabel,
    statusRank,
    interpretationBand,
    strengthsAndPriorities,
    questionBank: QB,
    validateQuestionBank: QB ? QB.validateQuestionBank : (() => ({ ok: false, errors: ["questionBank 未載入"] })),
    ageGroups: QB ? QB.AGE_GROUPS : [],
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
