/**
 * TeamPro 運動心理技能自評 — 題庫 2.0 (questionBankVersion / scoringVersion: "2.0")
 *
 * 設計原則：
 * - 12 個能力導向構面，每構面 4 題，共 48 題，全部正向敘述（reverseScored: false）。
 * - 分數越高＝該心理技能越成熟；不使用「焦慮／擔心／害怕」等易造成反向理解的名稱。
 * - 題目為自編、生活化、跨運動情境，一題只問一件事，不複製未授權的正式量表。
 * - 兩種文字版本：standard（青少年 12-17／成人 18+）、child（兒童 8-11，句子更短更具體）。
 * - 本工具用於自我覺察與教練訪談，非臨床診斷、非官方 OMSAT-3、無常模百分位。
 */
(function (global) {
  "use strict";

  var VERSION = "2.0";

  var AGE_GROUPS = [
    { id: "child", label: "兒童版", range: "8～11 歲" },
    { id: "youth", label: "青少年版", range: "12～17 歲" },
    { id: "adult", label: "成人版", range: "18 歲以上" }
  ];

  // 12 個能力導向構面（分數越高＝技能越成熟）
  var DIMENSIONS = [
    { id: "goalSetting", name: "目標設定", group: "方向與投入", train: "把大目標拆成每週可完成的小目標，並定期檢視進度。" },
    { id: "selfConfidence", name: "自信", group: "方向與投入", train: "從最近做得到的一件事開始，累積可回想的成功經驗。" },
    { id: "commitment", name: "承諾", group: "方向與投入", train: "把「為什麼想練」寫下來，安排能長期維持的訓練節奏。" },
    { id: "relaxation", name: "放鬆調節", group: "身心調節", train: "每天 2 分鐘吐氣較長的呼吸練習，賽前使用固定放鬆流程。" },
    { id: "activation", name: "活化調節", group: "身心調節", train: "設計一段能提振精神的暖身，找到讓自己「動起來」的提示。" },
    { id: "stressRegulation", name: "壓力反應調節", group: "身心調節", train: "在模擬壓力情境練習把注意力拉回當下該做的動作。" },
    { id: "focus", name: "專注", group: "認知技能", train: "練習把注意力放在下一個可執行動作，減少想結果。" },
    { id: "refocus", name: "再專注", group: "認知技能", train: "建立失誤後的重置流程（一個動作＋一句提示語）。" },
    { id: "imageryAbility", name: "意象能力", group: "認知技能", train: "練習在腦中產生清晰、可調整、有身體感覺的動作畫面。" },
    { id: "imageryPractice", name: "意象練習", group: "認知技能", train: "固定安排時間，針對關鍵動作與情境做有計畫的想像練習。" },
    { id: "competitionPlan", name: "競賽計畫", group: "競賽準備", train: "整理賽前準備流程、可執行策略與突發狀況的應對計畫。" },
    { id: "emotionRegulation", name: "情緒調節", group: "身心調節", train: "練習覺察情緒並用固定方法（呼吸、提示語）回到平穩。" }
  ];

  // standard（青少年／成人）題目：每構面 4 題，情境不同、只問一件事
  var STANDARD = {
    goalSetting: [
      "訓練前，我會為自己設定這次要達成的具體目標。",
      "我會把長期目標拆成每週或每天可以完成的小目標。",
      "我清楚知道這個階段自己最想進步的項目。",
      "我會定期檢視目標的進度，並在需要時做調整。"
    ],
    selfConfidence: [
      "面對重要比賽時，我相信自己有能力表現出實力。",
      "遇到強勁對手時，我仍然相信自己有機會發揮。",
      "即使前面出現失誤，我仍相信自己能把後面做好。",
      "平常訓練的累積，讓我對自己的能力有把握。"
    ],
    commitment: [
      "為了進步，我願意持續投入時間與努力。",
      "即使訓練很辛苦，我仍然願意堅持完成。",
      "我願意為運動目標調整生活作息，例如睡眠與飲食。",
      "就算短期看不到成果，我仍會繼續投入訓練。"
    ],
    relaxation: [
      "感到緊繃時，我能透過呼吸讓身體慢慢放鬆。",
      "比賽前太緊張時，我有方法讓自己冷靜下來。",
      "我能在短時間內讓肌肉從緊繃恢復到放鬆。",
      "壓力大的時候，我知道怎麼讓自己穩定下來。"
    ],
    activation: [
      "覺得提不起勁時，我能讓自己重新振作起來。",
      "上場前，我能把自己調整到適合比賽的興奮程度。",
      "狀態太平淡時，我有辦法提高自己的專注與衝勁。",
      "需要全力以赴時，我能快速把自己帶到最佳狀態。"
    ],
    stressRegulation: [
      "比分落後時，我仍能穩住自己的節奏。",
      "面對關鍵時刻的壓力，我能維持穩定的表現。",
      "感覺到壓力時，我能把注意力拉回到當下該做的事。",
      "遇到裁判判決或突發狀況時，我能穩住不被影響。"
    ],
    focus: [
      "訓練時，我能把注意力放在目前要完成的動作。",
      "周圍有聲音或干擾時，我仍能完成教練交代的重點。",
      "比賽進行時，我能注意與戰術有關的重要訊息。",
      "壓力增加時，我仍能記得目前最重要的任務。"
    ],
    refocus: [
      "出現失誤後，我能很快把注意力拉回比賽。",
      "被對手得分後，我能重新專注在下一個回合。",
      "分心之後，我有方法讓自己回到當下。",
      "遇到中斷或干擾後，我能快速回到比賽狀態。"
    ],
    imageryAbility: [
      "我能在腦海中清楚想像自己完成動作的畫面。",
      "想像比賽情境時，我能感覺到身體動作的感受。",
      "我能在腦中調整想像的畫面，例如視角或速度。",
      "我能想像出清晰、順暢的最佳表現過程。"
    ],
    imageryPractice: [
      "我會固定安排時間做心像（想像）練習。",
      "比賽前，我會在腦中預演自己的表現。",
      "我會針對關鍵動作或情境做想像練習。",
      "我的想像練習是有計畫的，而不是隨意進行。"
    ],
    competitionPlan: [
      "比賽前，我有一套固定的準備流程。",
      "我會事先規劃比賽中可能用到的策略。",
      "遇到預期外的狀況，我有事先想好的應對方式。",
      "我會用固定的提示或口訣，幫助自己在場上執行計畫。"
    ],
    emotionRegulation: [
      "感到生氣或沮喪時，我能不讓情緒影響接下來的表現。",
      "比賽不順時，我能調整心情繼續投入。",
      "我能覺察自己的情緒，並用適合的方法調節。",
      "遇到挫折時，我能較快讓自己的情緒回到平穩。"
    ]
  };

  // child（兒童 8-11）：句子更短、具體，部分附例子；同樣正向、同 12 構面每構面 4 題
  var CHILD = {
    goalSetting: [
      "練習前，我會想好今天要做到什麼。",
      "我會把大目標分成每天的小目標。",
      "我知道自己現在最想變厲害的地方。",
      "我會看看自己有沒有進步。"
    ],
    selfConfidence: [
      "比賽的時候，我相信自己做得到。",
      "遇到很強的對手，我也相信自己能拚。",
      "就算做錯，我也相信後面能做好。",
      "多練習讓我更有信心。"
    ],
    commitment: [
      "為了變厲害，我願意好好練習。",
      "練習很累，我也會努力做完。",
      "為了運動，我願意早點睡、好好吃飯。",
      "就算還沒進步，我也會繼續練。"
    ],
    relaxation: [
      "緊張時，我會用深呼吸讓自己放鬆。",
      "比賽前太緊張，我有辦法冷靜下來。",
      "我可以讓身體從很緊變得比較鬆。",
      "壓力大的時候，我知道怎麼讓自己穩下來。"
    ],
    activation: [
      "沒有精神的時候，我能讓自己振作起來。",
      "上場前，我能讓自己準備好。（太緊張時慢下來，沒精神時動起來）",
      "太懶散的時候，我能讓自己更專心。",
      "需要拚的時候，我能很快進入狀態。"
    ],
    stressRegulation: [
      "分數落後時，我還是能穩穩地打。",
      "重要的時候，我能穩住不慌張。",
      "有壓力時，我能專心做現在要做的事。",
      "遇到沒想到的狀況，我能不亂了手腳。"
    ],
    focus: [
      "練習時，我會專心做現在的動作。",
      "旁邊很吵，我也能做到教練說的重點。",
      "比賽時，我會注意重要的事情。",
      "有壓力時，我還記得最重要的任務。"
    ],
    refocus: [
      "做錯以後，我能很快再專心。",
      "被對手得分，我能專心打下一球。",
      "分心以後，我有辦法回到現在。",
      "被打斷以後，我能很快回到比賽。"
    ],
    imageryAbility: [
      "我能在腦中想像自己做動作的樣子。",
      "想像比賽時，我能感覺到身體在動。",
      "我能在腦中換一個想像的畫面。",
      "我能想出自己表現很棒的樣子。"
    ],
    imageryPractice: [
      "我會固定花時間在腦中練習。",
      "比賽前，我會先在腦中想一遍。",
      "我會想像重要的動作怎麼做。",
      "我的想像練習是有計畫的。"
    ],
    competitionPlan: [
      "比賽前，我有固定的準備動作。",
      "我會先想好比賽要用的方法。",
      "遇到沒想到的狀況，我知道可以怎麼做。",
      "我會用小口訣提醒自己怎麼做。"
    ],
    emotionRegulation: [
      "生氣或難過時，我不會讓它影響表現。",
      "比賽不順，我能調整心情繼續打。",
      "我知道自己的心情，也能讓自己好一點。",
      "遇到挫折，我能比較快恢復心情。"
    ]
  };

  var TEXT = { standard: STANDARD, child: CHILD };

  function textSetFor(ageGroup) {
    return ageGroup === "child" ? TEXT.child : TEXT.standard;
  }

  // 依年齡組建立 48 題題目物件（含 reverse: false 供既有計分引擎使用）
  function buildQuestions(ageGroup) {
    var set = textSetFor(ageGroup);
    var out = [];
    DIMENSIONS.forEach(function (dimension) {
      (set[dimension.id] || []).forEach(function (text, index) {
        out.push({
          id: dimension.id + "_" + String(index + 1).padStart(2, "0"),
          dimension: dimension.id,
          ageGroup: ageGroup === "child" ? "child" : "standard",
          text: text,
          reverseScored: false,
          reverse: false,
          highConcern: false,
          version: VERSION
        });
      });
    });
    return out;
  }

  // 題庫自我檢核：48 題／12 構面／每構面 4 題／id 唯一／無空白／無重複題／全正向／版本正確
  function validateQuestionBank(ageGroup) {
    var questions = buildQuestions(ageGroup === "child" ? "child" : "standard");
    var errors = [];
    if (DIMENSIONS.length !== 12) errors.push("構面數需為 12，實際 " + DIMENSIONS.length);
    if (questions.length !== 48) errors.push("題數需為 48，實際 " + questions.length);
    var perDimension = {};
    DIMENSIONS.forEach(function (d) { perDimension[d.id] = 0; });
    var seenIds = {};
    var seenText = {};
    questions.forEach(function (q) {
      perDimension[q.dimension] = (perDimension[q.dimension] || 0) + 1;
      if (seenIds[q.id]) errors.push("重複的 id：" + q.id);
      seenIds[q.id] = true;
      var text = (q.text || "").trim();
      if (!text) errors.push("題目文字為空：" + q.id);
      if (seenText[text]) errors.push("完全相同的重複題目：" + q.id);
      seenText[text] = true;
      if (q.reverseScored) errors.push("2.0 不可有反向題：" + q.id);
      if (q.version !== VERSION) errors.push("版本錯誤：" + q.id);
    });
    Object.keys(perDimension).forEach(function (key) {
      if (perDimension[key] !== 4) errors.push(key + " 需剛好 4 題，實際 " + perDimension[key]);
    });
    return { ok: errors.length === 0, errors: errors };
  }

  var api = {
    VERSION: VERSION,
    AGE_GROUPS: AGE_GROUPS,
    DIMENSIONS: DIMENSIONS,
    buildQuestions: buildQuestions,
    validateQuestionBank: validateQuestionBank
  };

  global.TeamProQuestionBank = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
