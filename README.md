# WenMind x TeamPro 心理雷達

提供所有運動項目的選手快速完成心理狀態測驗，並讓運動心理教練在後台掌握選手狀態、辨識需要關心的人、查看真實歷史變化並完成後續追蹤。

## 入口

- 選手入口：`#/`、`#/assessment`
- 運動心理教練登入：`#/coach/login`
- 心理教練後台：`#/coach/dashboard`
- 所有選手：`#/coach/athletes`
- 個人狀態：`#/coach/athletes/{athleteId}`
- 測驗管理：`#/coach/assessments`
- 追蹤紀錄：`#/coach/follow-ups`

GitHub Pages 使用 hash router，重新整理不需要 404 fallback。

## 模式

預設為 `production`，不會自動植入展示資料。可用 `?mode=demo` 或 `localStorage` 的 `wenmind:app-mode=demo` 啟用展示資料。

正式模式支援 GAS + Google Sheets 後台同步：填入端點後，選手手機填報與教練後台即可跨裝置共用同一份資料；未填端點時自動退回純本機 localStorage（僅同瀏覽器有效）。demo 模式一律使用本機示範資料。

## 後台同步（GAS + Sheets）

1. 到 script.google.com 新增專案，貼上 `apps-script/Code.gs`。
2. 部署 > 新增部署作業 > 類型「網頁應用程式」；執行身分：我；存取權：所有人。
3. 複製 `/exec` 網址，二選一：
   - 填進 `core.js` 的 `REMOTE_ENDPOINT_DEFAULT`（所有人預設走雲端），或
   - 用「你的網址?api=貼上/exec」造訪一次，前端會記在 localStorage。
4. 之後每次改 `Code.gs` 都要「管理部署作業 > 編輯 > 版本：新版本」才生效。

同步機制：前端 `RemoteStore` 以 localStorage 當離線快取，每次寫入非同步 `push`、切換畫面 `pull`；GAS 端以 `id` 合併（additive、時間新者勝），避免多裝置互相覆蓋。教練登入 session 仍為各裝置本機。

## 指令

```bash
npm install
npm run build
npm run lint
npm run test
```

## 注意

目前題庫為展示題庫，正式使用前需確認量表授權、正式題目與計分規則。系統只提供自我了解、狀態變化與後續溝通參考，不提供醫療或心理診斷。
