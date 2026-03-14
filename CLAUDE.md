# CLAUDE.md — 開發指引

這是一個 Vue 3 PWA 排班系統，後端使用 Google Apps Script + Google Sheets。

## 快速索引

完整規格請見 `PROJECT_SPEC.md`，此文件為開發慣例補充。

## 開發慣例

### 前端
- Vue 3 Composition API（`<script setup>`）
- Pinia store 統一管理狀態
- 所有 GAS 呼叫統一走 `src/api/gas.js`，不在元件內直接 fetch
- 日期操作統一用 `src/utils/dateHelper.js`，時區固定 Asia/Taipei
- 輪序計算統一用 `src/utils/rotationEngine.js`

### GAS 後端
- `Code.gs` 只做路由分發，邏輯拆到各 `.gs` 檔案
- 所有 Sheets 寫入用 `LockService` 防競態
- 回傳格式統一：`{ success: true, data: {...} }` 或 `{ success: false, error: "訊息" }`
- JWT 驗證抽出為共用函式，每個需授權的 action 都需驗證

### 命名規則
- Sheets 分頁名稱：`Schedule_202503`、`Requests_202503`、`ScheduleMeta_202503`
- 輪序池名稱：見 PROJECT_SPEC.md 的 ROTATION_POOLS 定義
- 班別值：`"D"` `"N"` `"Off"` `"AM"` `null`

## 目前開發進度

Phase 1 — 基礎建設（進行中）

## 已知限制

- GAS 個人帳號每日執行時間上限 6 分鐘
- Gmail 每日寄送上限 100 封
- GAS CORS 需特別處理（使用 no-cors 或 JSONP）
