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

目前尚未串接真正雲端資料庫。展示與本機流程使用 localStorage，僅在同一瀏覽器有效。正式上線需串接 Supabase Auth、Firebase Auth 或其他後端資料庫與權限控管。

## 指令

```bash
npm install
npm run build
npm run lint
npm run test
```

## 注意

目前題庫為展示題庫，正式使用前需確認量表授權、正式題目與計分規則。系統只提供自我了解、狀態變化與後續溝通參考，不提供醫療或心理診斷。
