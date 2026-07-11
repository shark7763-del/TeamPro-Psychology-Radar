/**
 * WenMind x TeamPro 心理雷達 — 雲端同步後端 (Google Apps Script)
 *
 * 用途：讓「選手手機填報」與「運動心理教練後台」跨裝置共用同一份資料。
 * 前端（core.js 的 RemoteStore）會用 text/plain 的簡單請求 POST：
 *   { action: "pull" }               → 取回整份 store
 *   { action: "push", store: {...} } → 合併寫入後回傳最新 store（以 id 合併，不覆蓋別台資料）
 *
 * 部署步驟：
 *   1. script.google.com 新增專案，把本檔內容貼上（檔名 Code.gs）。
 *   2. 部署 > 新增部署作業 > 類型「網頁應用程式」。
 *      執行身分：我；具有存取權的使用者：所有人。
 *   3. 複製 /exec 網址，貼進前端 core.js 的 REMOTE_ENDPOINT_DEFAULT，
 *      或直接用「你的網址?api=貼上/exec」造訪一次（會自動記住）。
 *   4. 每次改動這支程式碼後，要「管理部署作業 > 編輯 > 版本：新版本」才會生效。
 *
 * 資料儲存在一個 Google 試算表（自動建立）的 DB 分頁，整份 store 以 JSON
 * 分段存放於 A 欄各儲存格（避開單格 50000 字上限）。
 */

var DOC_SHEET = 'DB';
var CHUNK_SIZE = 40000; // 單一儲存格上限約 50000 字，保守切 40000
var DB_PROP_KEY = 'WENMIND_DB_SPREADSHEET_ID';
var COLLECTIONS = ['groups', 'assessmentSessions', 'athletes', 'assessmentRecords', 'followUps', 'auditLogs'];

function doGet() {
  return jsonOut({ ok: true, service: 'wenmind-radar-sync', now: new Date().toISOString() });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return jsonOut({ ok: false, error: '系統忙碌中，請稍後再試。' });
  }
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    var action = body.action || 'pull';
    if (action === 'pull') {
      return jsonOut({ ok: true, store: readStore() });
    }
    if (action === 'push') {
      var merged = mergeStore(readStore(), body.store || {});
      writeStore(merged);
      return jsonOut({ ok: true, store: merged });
    }
    if (action === 'reset') {
      // 清空整個資料庫（清測試／示範資料用）。合併是 additive、無法用 push 刪資料，故另開此動作。
      var blank = emptyStore();
      writeStore(blank);
      return jsonOut({ ok: true, store: blank });
    }
    return jsonOut({ ok: false, error: '未知的 action：' + action });
  } catch (err) {
    return jsonOut({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(DB_PROP_KEY);
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      // 舊 id 失效則重建
    }
  }
  var created = SpreadsheetApp.create('WenMind心理雷達資料庫');
  props.setProperty(DB_PROP_KEY, created.getId());
  return created;
}

function docSheet() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(DOC_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(DOC_SHEET);
    sheet.getRange('A1').setValue('');
  }
  return sheet;
}

function emptyStore() {
  return {
    version: 2,
    mode: 'production',
    groups: [],
    assessmentSessions: [],
    athletes: [],
    assessmentRecords: [],
    drafts: {},
    followUps: [],
    auditLogs: []
  };
}

function normalizeStore(store) {
  var base = emptyStore();
  store = store || {};
  COLLECTIONS.forEach(function (key) {
    base[key] = Array.isArray(store[key]) ? store[key] : [];
  });
  base.drafts = (store.drafts && typeof store.drafts === 'object') ? store.drafts : {};
  base.version = store.version || 2;
  base.mode = store.mode || 'production';
  return base;
}

function readStore() {
  var sheet = docSheet();
  var last = sheet.getLastRow();
  if (last < 1) return emptyStore();
  var values = sheet.getRange(1, 1, last, 1).getValues();
  var raw = values.map(function (row) { return row[0]; }).join('');
  if (!raw) return emptyStore();
  try {
    return normalizeStore(JSON.parse(raw));
  } catch (err) {
    return emptyStore();
  }
}

function writeStore(store) {
  var sheet = docSheet();
  var raw = JSON.stringify(store);
  var chunks = [];
  for (var i = 0; i < raw.length; i += CHUNK_SIZE) {
    chunks.push([raw.slice(i, i + CHUNK_SIZE)]);
  }
  if (!chunks.length) chunks.push(['']);
  sheet.clearContents();
  sheet.getRange(1, 1, chunks.length, 1).setValues(chunks);
}

function itemTime(item) {
  var t = item && (item.updatedAt || item.completedAt || item.createdAt);
  var n = t ? new Date(t).getTime() : 0;
  return isNaN(n) ? 0 : n;
}

// 以 id 合併兩個陣列；同 id 取時間較新的一筆，additive 保留各裝置新增資料。
function mergeById(current, incoming) {
  var map = {};
  (current || []).forEach(function (item) {
    if (item && item.id) map[item.id] = item;
  });
  (incoming || []).forEach(function (item) {
    if (!item || !item.id) return;
    var existing = map[item.id];
    if (!existing || itemTime(item) >= itemTime(existing)) map[item.id] = item;
  });
  return Object.keys(map).map(function (id) { return map[id]; });
}

function mergeStore(current, incomingRaw) {
  var base = normalizeStore(current);
  var incoming = normalizeStore(incomingRaw);
  var out = emptyStore();
  COLLECTIONS.forEach(function (key) {
    out[key] = mergeById(base[key], incoming[key]);
  });
  out.drafts = {};
  Object.keys(base.drafts).forEach(function (k) { out.drafts[k] = base.drafts[k]; });
  Object.keys(incoming.drafts).forEach(function (k) { out.drafts[k] = incoming.drafts[k]; });
  out.version = Math.max(base.version || 2, incoming.version || 2);
  out.mode = 'production';
  return out;
}
