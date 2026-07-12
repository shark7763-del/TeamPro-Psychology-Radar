/*
 * WenMind × TeamPro 報告引擎（規則式、離線、無外部依賴）
 * 由 record.dimensionScores 自動產生教練／家長／選手三版完整報告 HTML。
 * 判讀為「方向性感知」：對 positive:false（認知焦慮／身體焦慮）等構面，分數越高越需留意。
 */
(function (global) {
  "use strict";

  const Core = global.WenMindCore || (typeof require !== "undefined" ? require("./core.js") : null);

  // ---- 燈號門檻（與已交付的 PDF 報告一致；集中於此便於調整）----
  // 重要：本系統所有構面（含焦慮軸，已由計分反轉/反向計分處理）皆為「分數越高越好」。
  // 例：身體焦慮 81＝幾乎不焦慮（好）、身體焦慮 5＝高度焦慮（差）。詳見選手結果頁「分數越高越成熟」說明。
  const LEVEL = { green: 80, amber: 65 };   // >=80 綠、65-79 黃、<65 紅

  // 觸發「優先關心／轉介」提醒的門檻（皆為「低分＝需留意」）
  const ALERT = { stateConfidenceLow: 30, pressureVeryLow: 25, relaxationVeryLow: 20, anxietyLow: 40, flatCount: 6 };

  // 焦慮／擔心類構面：分數低＝焦慮高，需在文字上特別說明方向
  const ANXIETY_IDS = new Set(["cognitiveAnxiety", "somaticAnxiety", "fear", "stress"]);

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function isAnxiety(dim) {
    return !!dim && ANXIETY_IDS.has(dim.id);
  }

  // 回傳 { key:'g'|'a'|'r', label } —— 全構面一律「越高越好」
  function levelOf(dim) {
    const s = Number(dim.score);
    if (!Number.isFinite(s)) return { key: "a", label: "資料不足" };
    if (s >= LEVEL.green) return { key: "g", label: isAnxiety(dim) ? "焦慮低，良好" : "優勢" };
    if (s >= LEVEL.amber) return { key: "a", label: "尚可，需練習" };
    return { key: "r", label: isAnxiety(dim) ? "焦慮偏高，需留意" : "優先處理" };
  }

  // 效能值＝分數本身（越大越好），供排序挑優勢/弱項
  function merit(dim) {
    return Number(dim.score) || 0;
  }

  function byId(scores, id) {
    return (scores || []).find((d) => d.id === id) || null;
  }
  function nameVal(dim) {
    return dim ? `${dim.name} ${dim.score}` : "";
  }

  // ---- 挑選重點卡（優勢×1、最需關心×2）----
  function pickHeadline(scores) {
    const list = scores.filter((d) => Number.isFinite(d.score));
    const strong = [...list].sort((a, b) => merit(b) - merit(a))[0];
    const weak = [...list].sort((a, b) => merit(a) - merit(b));
    const cards = [];
    if (strong) cards.push(cardOf(strong, levelOf(strong).key === "g" ? "優勢" : "相對較高"));
    const chosen = new Set([strong && strong.id]);
    for (const d of weak) {
      if (cards.length >= 3) break;
      if (chosen.has(d.id)) continue;
      chosen.add(d.id);
      cards.push(cardOf(d, cards.length === 1 ? "最優先" : "需注意"));
    }
    return cards;
  }
  function cardOf(dim, tagText) {
    const lv = levelOf(dim);
    return { name: dim.name, score: dim.score, key: lv.key, tag: tagText, desc: lv.label };
  }

  // ---- 風險／轉介旗標 ----
  function computeFlags(scores) {
    const flags = [];
    const sc = byId(scores, "stateConfidence");
    if (sc && sc.score <= ALERT.stateConfidenceLow) {
      flags.push({ level: "alert", text: `狀態自信偏低（${sc.score}），建議教練近期主動關心其心理狀態，必要時連結學校輔導或運動心理資源。` });
    }
    const pc = byId(scores, "pressureControl") || byId(scores, "pressure");
    if (pc && pc.score <= ALERT.pressureVeryLow) {
      flags.push({ level: "alert", text: `壓力承受偏低（${pc.score}），留意是否長期硬撐或接近耗竭，建立安全回報機制。` });
    }
    const rx = byId(scores, "relaxation");
    if (rx && rx.score <= ALERT.relaxationVeryLow) {
      flags.push({ level: "alert", text: `放鬆能力偏低（${rx.score}），身心不易鬆弛，宜優先從基礎呼吸建立。` });
    }
    const som = byId(scores, "somaticAnxiety");
    const cog = byId(scores, "cognitiveAnxiety");
    if ((som && som.score <= ALERT.anxietyLow) || (cog && cog.score <= ALERT.anxietyLow)) {
      const parts = [som && som.score <= ALERT.anxietyLow ? `身體焦慮 ${som.score}` : "", cog && cog.score <= ALERT.anxietyLow ? `認知焦慮 ${cog.score}` : ""].filter(Boolean).join("、");
      flags.push({ level: "alert", text: `賽場焦慮偏高（${parts}；此量表分數越低代表越焦慮），建議關心其賽前緊張與擔心來源，練習放鬆與再專注。` });
    }
    const lows = scores.filter((d) => Number.isFinite(d.score) && merit(d) < 30).length;
    if (lows >= ALERT.flatCount) {
      flags.push({ level: "alert", text: `多數構面偏低（${lows} 項），可能為整體低落或作答未投入，請以面談確認真實狀態、必要時擇日重測。` });
    }
    return flags;
  }

  // ---- 綜合判讀（模式→模板）----
  function buildInsights(scores) {
    const out = [];
    const g = (id) => byId(scores, id);
    const commit = g("commitment") || g("motivation");
    const conf = g("confidence");
    const sConf = g("stateConfidence");
    const relax = g("relaxation");
    const somatic = g("somaticAnxiety");
    const refocus = g("refocus");
    const focus = g("concentration") || g("focus");
    const strive = g("striving");
    const pain = g("painTolerance");
    const pressure = g("pressureControl") || g("pressure");

    if (commit && commit.score >= 80) out.push({ t: "投入是可靠的基礎", d: `${nameVal(commit)}，代表對訓練與目標投入度高，是各項心理訓練能推動的前提。` });
    if (sConf && sConf.score < 40) out.push({ t: "賽場自信是關鍵缺口", d: `狀態自信 ${sConf.score} 偏低${conf ? `（一般情境自信 ${conf.score}）` : ""}，努力與自我肯定尚未對齊，建議以成功經驗逐步重建信心。` });
    if (somatic && somatic.score < 45) out.push({ t: "身體焦慮偏高", d: `身體焦慮 ${somatic.score}（此量表分數越低代表越焦慮），上場時身心容易鎖緊，訓練重點放在放鬆與節奏，而非消除緊張。` });
    if (relax && relax.score < 50) out.push({ t: "放鬆能力待建立", d: `放鬆 ${relax.score} 偏低，賽前與關鍵時刻不易鬆弛，宜從固定呼吸流程開始。` });
    if (refocus && refocus.score < 50) out.push({ t: "失誤後不易拉回", d: `再專注 ${refocus.score} 偏低，被得分或失誤後注意力容易卡住，需建立重置流程。` });
    if (focus && focus.score < 50) out.push({ t: "當下專注需加強", d: `專注 ${focus.score} 偏低，容易被外界或雜念拉走，建立單點專注線索會有幫助。` });
    if (strive && pain && strive.score >= 85 && pain.score >= 85 && pressure && pressure.score < 45)
      out.push({ t: "拚勁強但抗壓不足", d: `積極奮鬥 ${strive.score}、傷痛忍受 ${pain.score} 皆高，但壓力承受 ${pressure.score} 偏低——習慣硬撐卻缺少紓壓，易累積耗竭與受傷，宜建立安全回報機制。` });

    if (!out.length) out.push({ t: "整體概況", d: "本次各構面未見明顯極端，建議搭配教練觀察與選手晤談，維持並精進現有優勢。" });
    return out.slice(0, 5);
  }

  // ---- 四週訓練建議（取最需補強的 3 項 train 提示 + 通則）----
  function buildPlan(scores) {
    const weak = scores.filter((d) => Number.isFinite(d.score))
      .sort((a, b) => merit(a) - merit(b)).slice(0, 3);
    const weeks = [
      { w: "第 1 週", title: "放鬆基準", body: "每天一次 4 秒吸氣、6 秒吐氣 × 4 回合，練習放下肩膀與雙手；訓練前後評估緊繃 0–10。", done: "吐氣後緊繃下降至少 1 分。" },
      { w: "第 2 週", title: "建立支點", body: weak[0] ? `針對「${weak[0].name}」：${weak[0].train || "以具體、可重複的小練習逐步建立。"}` : "選定一項最需補強的能力，安排固定小練習。", done: "能說出並完成當週的固定練習。" },
      { w: "第 3 週", title: "接上情境", body: weak[1] ? `針對「${weak[1].name}」：${weak[1].train || "在接近比賽的情境中練習應用。"}` : "把練習放進接近比賽的情境中。", done: "壓力情境下仍能完成流程。" },
      { w: "第 4 週", title: "穩定輸出", body: "模擬賽後記錄四項分數，找出最佳狀態區間，並持續追蹤情緒與疲勞。", done: "連續 3 次模擬維持穩定。" }
    ];
    return weeks;
  }

  // ================= HTML 片段 =================
  function barsHtml(scores) {
    const rows = [...scores].sort((a, b) => merit(b) - merit(a)).map((d) => {
      const lv = levelOf(d);
      const w = Math.max(2, Math.min(100, Number(d.score) || 0));
      const note = isAnxiety(d) ? ' <span class="rep-hint">(分數低＝焦慮高)</span>' : "";
      return `<div class="rep-bar"><div class="rep-bar-name">${esc(d.name)}${note}</div>` +
        `<div class="rep-bar-track"><div class="rep-bar-fill ${lv.key}" style="width:${w}%"></div></div>` +
        `<div class="rep-bar-val">${esc(d.score)}</div></div>`;
    }).join("");
    return `<div class="rep-bars">${rows}</div>`;
  }

  function statsHtml(cards) {
    return `<div class="rep-stats">` + cards.map((c) =>
      `<div class="rep-stat"><div class="rep-stat-n">${esc(c.score)}</div>` +
      `<div class="rep-stat-l">${esc(c.name)}</div><div class="rep-stat-d">${esc(c.desc)}</div>` +
      `<span class="rep-tag ${c.key}">${esc(c.tag)}</span></div>`).join("") + `</div>`;
  }

  function flagsHtml(flags) {
    if (!flags.length) return "";
    return flags.map((f) => `<div class="rep-callout alert"><div class="rep-callout-t">優先關心提醒</div>${esc(f.text)}</div>`).join("");
  }

  function legendHtml() {
    return `<div class="rep-legend">
      <span><i class="rep-dot g"></i>綠燈 優勢</span>
      <span><i class="rep-dot a"></i>黃燈 尚可，需練習</span>
      <span><i class="rep-dot r"></i>紅燈 優先處理</span>
      <span>※ 擔心／焦慮類為「越高越需留意」</span></div>`;
  }

  // ---- 三種對象的語氣包 ----
  function audiencePack(audience, ctx) {
    const { name } = ctx;
    if (audience === "parent") {
      return {
        title: "給家長：怎麼陪伴，才幫得上忙",
        lead: `${esc(name)}的努力值得被肯定。以下建議幫助家庭端用對的方式支持，避免家庭與訓練場給出相反訊息。`,
        tips: [
          { t: "先關心人，再談表現", d: "多問「今天過得好嗎、累不累」，少用名次施壓；被在乎，孩子才願意投入。" },
          { t: "具體肯定、不比較", d: "指出他實際做到的一件事，比空泛的「你很棒」有用；用「跟自己比」取代和別人比。" },
          { t: "留意警訊、必要時求助", d: "若持續失眠、情緒低落、抗拒訓練或提到想放棄，請與教練、學校輔導室或專業人員聯繫。" }
        ],
        line: "「爸／媽以你的努力為傲，你不用證明給誰看。放輕鬆去做你會的就好，不管結果如何，我都在你這邊。」"
      };
    }
    if (audience === "athlete") {
      return {
        title: "給選手：你可以先練這件事",
        lead: "分數只是此刻的自我感受，不代表你的天花板。挑一件先練熟，你會進步得比想像中快。",
        tips: null,
        line: "「你不是不夠努力。先深呼吸、把肩膀放下，做好下一個動作就好——你比你以為的更強。」"
      };
    }
    return {
      title: "給教練：晤談與訓練重點",
      lead: "以下為本次量表的自動判讀，請結合日常觀察與選手晤談一起使用，不作為診斷依據。",
      tips: null,
      line: null
    };
  }

  // ================= 主函式 =================
  function buildReport(opts) {
    const { athlete = {}, record = {}, assessmentName = "", completedAt = "", audience = "coach" } = opts || {};
    const scores = (record.dimensionScores || []).filter((d) => d && Number.isFinite(d.score));
    if (!scores.length) return { html: `<div class="rep-callout">尚無可用分數，無法產生報告。</div>`, flags: [] };

    const cards = pickHeadline(scores);
    const flags = computeFlags(scores);
    const insights = buildInsights(scores);
    const plan = buildPlan(scores);
    const pack = audiencePack(audience, { name: athlete.name || "選手" });

    const head = `<header class="rep-head">
      <h1>${esc(athlete.name || "選手")}｜運動心理量表報告</h1>
      <p class="rep-sub">${esc(athlete.sport || "")}${assessmentName ? "　｜　量表：" + esc(assessmentName) : ""}${completedAt ? "　｜　完成 " + esc(completedAt) : ""}</p>
    </header>`;

    // 教練版：完整；家長／選手版：重點 + 對象專頁
    let body = "";
    if (audience === "coach") {
      body = `
        ${flagsHtml(flags)}
        ${statsHtml(cards)}
        ${legendHtml()}
        <section class="rep-block"><h2>綜合判讀</h2>
          <table class="rep-table"><tbody>${insights.map((i) => `<tr><td class="rep-th">${esc(i.t)}</td><td>${esc(i.d)}</td></tr>`).join("")}</tbody></table>
        </section>
        <section class="rep-block"><h2>各構面分數</h2>${barsHtml(scores)}</section>
        <section class="rep-block"><h2>四週訓練建議</h2>
          <table class="rep-table"><thead><tr><th>週次</th><th>內容</th><th>完成標準</th></tr></thead><tbody>
          ${plan.map((p) => `<tr><td><b>${esc(p.w)}</b><br>${esc(p.title)}</td><td>${esc(p.body)}</td><td>${esc(p.done)}</td></tr>`).join("")}
          </tbody></table>
        </section>`;
    } else {
      body = `
        ${audience === "parent" ? flagsHtml(flags) : ""}
        ${statsHtml(cards)}
        ${legendHtml()}
        <section class="rep-block"><h2>重點摘要</h2>
          <table class="rep-table"><tbody>${insights.slice(0, 3).map((i) => `<tr><td class="rep-th">${esc(i.t)}</td><td>${esc(i.d)}</td></tr>`).join("")}</tbody></table>
        </section>
        <section class="rep-block"><h2>${esc(pack.title)}</h2>
          <p class="rep-lead">${pack.lead}</p>
          ${pack.tips ? `<div class="rep-cols">${pack.tips.map((t) => `<div class="rep-col"><h3>${esc(t.t)}</h3><p>${esc(t.d)}</p></div>`).join("")}</div>` : ""}
          ${pack.line ? `<div class="rep-callout green"><div class="rep-callout-t">可以直接說的一句話</div>${esc(pack.line)}</div>` : ""}
        </section>`;
    }

    const foot = `<footer class="rep-foot">本報告由系統依自陳量表 0–100 分數自動判讀，僅供自我了解與心理訓練規劃、溝通參考，<b>不作為醫療或心理診斷依據</b>。判讀方向依系統構面設定；如需調整請洽管理者。</footer>`;
    return { html: `<div class="rep-doc rep-${esc(audience)}">${head}${body}${foot}</div>`, flags, cards, insights };
  }

  const api = { buildReport, levelOf, isAnxiety, LEVEL, ALERT };
  global.WenMindReport = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
