# 排班系統 UX 改進規劃

> 依三個角色的使用流程分析，整理出現有問題與改進建議，供未來實作參考。
> 產出日期：2026-03-15

---

## 目錄

1. [角色流程總覽](#角色流程總覽)
2. [管理者（Superadmin）](#管理者superadmin)
3. [排班者（Scheduler）](#排班者scheduler)
4. [成員（Member）](#成員member)
5. [跨角色共同問題](#跨角色共同問題)
6. [實作優先順序](#實作優先順序)

---

## 角色流程總覽

### 路由與權限矩陣

| 路由 | Superadmin | Scheduler | Member |
|------|:---:|:---:|:---:|
| `/admin` | ✓ | ✗ | ✗ |
| `/schedule` | ✓ | ✓ | ✗ |
| `/schedule/view` | ✓ | ✓ | ✓ |
| `/request` | ✓ | ✓ | ✓ |
| `/swap` | ✓ | ✓ | ✓ |
| `/notifications` | ✓ | ✓ | ✓ |

### 月度作業時序

```
月初                                               月底
 │                                                   │
 ├─ 成員：預約下個月班別（/request）                     │
 │                                                   │
 ├─ 排班者：參考預約 → 編輯班表（/schedule）              │
 │          六日自動填入 → 配額試算 → 帶入班表            │
 │                                                   │
 ├─ 成員：查看班表 → 申請換班（/swap）                    │
 │                                                   │
 └────────────────────────────── 排班者：鎖定班表 → 結算 ┘
```

---

## 管理者（Superadmin）

### 現有流程

```
登入 → /admin
  Tab: 人員管理   → 新增 / 編輯 / 刪除 / 批次匯入 / 轉讓排班者
  Tab: 班別管理   → 定義 D/N/Off/AM 及各日別配額
  Tab: 輪序管理   → 14 個週末 pool 順序、輪序預覽
  Tab: 國定假日   → 逐年勾選假日、設定假日值班
  Tab: 備份匯出   → CSV 匯出
```

### 問題 & 改進建議

#### A-1　無系統總覽 Dashboard ⭐ 中期
**問題：** 進入 /admin 直接是 tab 管理介面，無法快速了解系統現況。
**建議：** 在 /admin 頂部（或獨立 tab）加 Dashboard 看板，顯示：
- 本月班表鎖定狀態（幾個月份未鎖定）
- 幾個月份未結算配額
- 目前啟用人員數
- 待處理換班申請數
- 近期操作記錄摘要

```
實作位置：src/views/AdminView.vue → 新增 dashboard tab
資料來源：scheduleStore.meta、notificationStore.pendingSwaps、settingsStore.users
```

---

#### A-2　班別配額設定分散 ⭐ 中期
**問題：** 班別定義（顏色、label）在「班別管理」tab；人數配額（wdD=1, satN=1）卻在 Settings。管理者需要在兩個地方維護同一件事。
**建議：** 合併到班別管理中，廢棄 Settings 裡的裸數字欄位。每個班別直接設定「各日別所需人數」：

```
班別 D：
  平日需求：1 人
  週六需求：1 人
  週日需求：1 人
  假日需求：1 人
```

```
實作位置：
  前端：src/views/AdminView.vue（班別管理 tab）
  GAS：gas/Settings.gs → updateSettings 整合到 saveShiftTypes
  影響：src/stores/shiftTypes.js getRequiredCount() 邏輯需調整
```

---

#### A-3　輪序 Pool 14 個顯示認知負擔重 ⭐ 低優先
**問題：** 14 個 pool 同時列出，管理者難以一眼掌握「satD 現在誰排第一」。
**建議：**
- 改為分組顯示：週六組 / 週日組 / 假日組 / 平日組
- 每個 pool 卡片高亮「下一位」上班者（lastIndex + 1）
- 折疊不常用的平日 pool（wdOff/wdAM 等）

```
實作位置：src/views/AdminView.vue（輪序管理 tab）
```

---

#### A-4　停用 vs 刪除語意不清 ⭐ 低優先
**問題：** `isActive=false`（停用帳號）和 `removeUser`（刪除人員）的差異在 UI 上無說明。停用後帳號是否仍可登入？
**建議：**
- 停用：帳號無法登入，歷史班表保留，在班表上以灰色顯示
- 刪除：從 Users Sheet 移除，但班表資料保留（歷史完整性）
- UI 上分開按鈕，刪除前加警告說明差異

```
實作位置：
  前端：src/views/AdminView.vue → UserManager 組件
  GAS：gas/Auth.gs → login() 加 isActive 檢查（應已存在，確認即可）
```

---

#### A-5　無操作記錄 ⭐ 長期
**問題：** 誰在什麼時候改了什麼設定，無從查證。
**建議：** 新增 AuditLog Sheet，記錄以下事件：
- 班表鎖定 / 解鎖
- 人員新增 / 修改 / 刪除
- 角色轉讓
- 輪序 pool 修改

```
GAS：各操作函式尾端呼叫 appendAuditLog(user, action, detail)
前端：Admin Tab 5 備份匯出附近加「操作記錄」tab
```

---

## 排班者（Scheduler）

### 現有流程

```
登入 → /schedule（預設下個月）
  ↓
載入班表 → 六日自動填入（若空白 + weekendFilled=false）
  ↓
編輯班表（點擊格子循環選班別）
  ↓
配額輪序管理面板：
  D/N/Off/W6Off chip 列 → 顯示輪序起終點
  自動試算配額（svCalcOff）
  帶入班表 / 結算
  ↓
月底：鎖定班表
```

### 問題 & 改進建議

#### S-1　無法在排班頁直接看預約資料 ⭐⭐ 高優先
**問題：** 排班者需切換到 /request 才能看成員預約，再切回 /schedule 對照排班，操作繁瑣。
**建議：** 在班表編輯頁加「顯示預約」toggle，overlay 方式在格子上顯示成員預約的班別（半透明或小角標）。

```
實作位置：src/views/ScheduleView.vue
資料來源：requestStore（已在 onMounted 載入）
實作方式：
  新增 const showRequestOverlay = ref(false)
  在 ShiftCell 加 :requestShift prop（已有 requestShift prop 在 RequestView）
  toolbar 加 toggle 按鈕
```

---

#### S-2　配額帶入/結算流程不直觀 ⭐⭐ 高優先
**問題：** 「試算 → 帶入班表 → 結算」三步驟對新排班者不清楚，不知該做哪步、已做到哪步。
**建議：** 配額管理面板改為步驟引導式：

```
步驟 ①  自動試算（頁面載入後自動完成，顯示 ✓）
步驟 ②  帶入班表（按鈕，完成後顯示 ✓ 已帶入）
步驟 ③  月底結算（按鈕，完成後顯示 🔒 已結算）
```

未完成步驟：藍色高亮 + 箭頭指示；已完成：灰色打勾。

```
實作位置：src/views/ScheduleView.vue → 配額面板區塊（約第 240-360 行）
```

---

#### S-3　鎖定前無摘要確認 ⭐⭐ 高優先
**問題：** 點擊鎖定後直接鎖定，沒有顯示「本月是否有問題」的確認畫面。
**建議：** 點擊「鎖定班表」後先顯示確認 modal，包含：
- 未排格子數（null 格）
- 超配日期列表
- 各班別總數：D × n、N × n、Off × n
- 配額是否已結算（若未結算加警示）

```
實作位置：src/views/ScheduleView.vue → handleLock()
新增函式：computeLockSummary() → 掃描 scheduleStore.scheduleData
新增組件：LockConfirmModal.vue（或 inline modal）
```

---

#### S-4　兩套輪序系統說明不足 ⭐ 中期
**問題：** 六日 D/N 自動填入（RotationPools）和 D/N/Off/W6Off 配額輪序（rotationRecord）並列在同一頁面，新排班者容易混淆兩者用途。
**建議：**
- 兩個系統分為獨立的折疊區塊（accordion），預設展開目前所需操作的那個
- 各自加「？」說明：
  - 六日輪序：「決定週六日由誰上 D/N 班（點名制）」
  - 配額輪序：「決定這個月誰多排一次 D/N/Off（總量公平分配）」

```
實作位置：src/views/ScheduleView.vue → 輪序面板 template 區塊
```

---

#### S-5　清除班表風險控制 ⭐ 中期
**問題：** 清除班表後六日自動重填，若輪序池狀態不對可能直接覆蓋，清除前只有一個簡單確認。
**建議：**
- 區分「清除平日班別」和「清除全部（含六日）」
- 清除前顯示「將清除 N 個已排格子」
- 清除後六日重填前加一個選項：「是否同時重填六日輪序？」

```
實作位置：src/views/ScheduleView.vue → handleClear()
```

---

#### S-6　月份狀態 Badge ⭐ 高優先（低成本）
**問題：** 切換到某個月份時，排班者不知道該月的目前狀態。
**建議：** MonthSwitcher 或頁面標題旁顯示狀態 badge：

| 狀態 | 顯示 | 條件 |
|------|------|------|
| 排班中 | 藍色 `排班中` | !isLocked && scheduleData 有資料 |
| 已鎖定 | 綠色 `🔒 已鎖定` | isLocked && !meta.rotationRecord |
| 已結算 | 灰色 `✓ 已結算` | isLocked && meta.rotationRecord |
| 未填入 | 橘色 `未填入` | !isLocked && scheduleData 全空 |

```
實作位置：src/views/ScheduleView.vue → 頁面 header 區域
資料來源：scheduleStore.isLocked、scheduleStore.meta.rotationRecord
```

---

#### S-7　排班者無法匯出班表 ⭐ 低優先
**問題：** 匯出功能只在 /admin（superadmin only），但排班者可能需要列印或分享班表。
**建議：** 班表管理頁加「列印」按鈕（觸發 `window.print()`，已有 print: CSS）和「匯出 CSV」功能。

```
實作位置：src/views/ScheduleView.vue → header 按鈕區
CSV 匯出：前端直接用 Blob + download，無需後端
```

---

## 成員（Member）

### 現有流程

```
登入 → 自動導向 /schedule/view
  ↓
查看班表（捲動找自己那一行）
  ↓
/request → 預約下個月班別（點擊自己的格子）
  ↓
/swap → 發起換班 / 接受他人申請
  ↓
/notifications → 查看通知
```

### 問題 & 改進建議

#### M-1　找自己的班需要捲動 ⭐⭐ 高優先（低成本）
**問題：** 10～20 人的班表，成員進入頁面需要捲動才能找到自己（雖然已有藍色高亮）。
**建議：** 頁面載入後自動 `scrollIntoView` 到自己那一行。

```javascript
// 實作位置：src/views/ScheduleReadView.vue → onMounted
// 在資料載入完成後：
await nextTick()
document.querySelector('tr.is-current-user')?.scrollIntoView({
  behavior: 'smooth', block: 'center'
})
```

---

#### M-2　缺乏「我的月份統計」 ⭐⭐ 高優先（低成本）
**問題：** 成員無法一眼看到「我這個月：D × 8、N × 6、Off × 16」。
**建議：** 在查看班表頁面，自己那一列最右側（sticky column）加個人統計小卡，或在頁面頂部顯示：

```
我的本月統計：D × 8　N × 6　Off × 16　AM × 0
```

```
實作位置：src/views/ScheduleReadView.vue
computed：從 scheduleStore.scheduleData[authStore.user.userId] 計算
```

---

#### M-3　預約頁面月份說明不清 ⭐⭐ 高優先（低成本）
**問題：** 進入 /request 預設顯示「下個月」，成員可能以為在看當月，誤填後困惑。
**建議：**
- 頁面頂部加明確說明橫幅：「您正在預約 **X 月** 的班別，排班者將參考此表安排班別」
- MonthSwitcher 顯示月份時加「（預約中）」或「（已截止）」標籤

```
實作位置：src/views/RequestView.vue → 頂部提示區塊
```

---

#### M-4　換班流程追蹤不透明 ⭐ 中期
**問題：** 申請換班後只能從通知 badge 得知結果，沒有時間軸。
**建議：** 在 /swap「我發起的申請」列表中加狀態時間軸：

```
● 已提出申請  2026/03/15 14:30
○ 等待對方回覆
○ 結果
```

```
實作位置：src/views/SwapView.vue
資料來源：notificationStore（createdAt 已有）
```

---

#### M-5　通知中心與換班頁面功能重疊 ⭐ 中期
**問題：** `swap_request` 通知在 /notifications 和 /swap 都能接受/拒絕，容易混淆主要入口。
**建議：**
- /notifications 的 swap_request 通知：點擊後跳轉到 /swap 操作，不在通知頁直接操作
- /swap 作為唯一的換班操作入口
- /notifications 只保留「查看」和「標記已讀」功能

```
實作位置：src/views/NotificationsView.vue
修改：移除通知頁的接受/拒絕按鈕，改為跳轉連結
```

---

#### M-6　缺乏預約的輪序參考 ⭐ 低優先
**問題：** 成員不知道系統預期自己這個月上幾個 D/N，可能隨意填或不填。
**建議：** 在預約頁右上加「本月系統預計配給你：D × N、N × M」（從 useRotationProjection 取得），讓成員預約更有依據。

```
實作位置：src/views/RequestView.vue
資料來源：useRotationProjection composable（已存在）
```

---

#### M-7　行動裝置個人月曆模式 ⭐ 長期
**問題：** 班表是水平捲動的大表格，手機上每個格子只有 44px，閱讀困難。
**建議：** 在手機裝置上（`max-width: 640px`）提供切換選項：
- 預設：現有橫向表格（可捲動）
- 個人模式：只顯示自己，改為垂直日曆（每天一列，顯示日期、星期、班別）

```
實作位置：src/views/ScheduleReadView.vue
切換：const viewMode = ref(window.innerWidth < 640 ? 'personal' : 'table')
```

---

## 跨角色共同問題

### C-1　無「上次更新時間」顯示 ⭐⭐ 高優先（低成本）
**問題：** 成員和排班者不知道班表是否是最新資料。
**建議：** 班表頁面頂部顯示「最後更新：X 分鐘前」（從 scheduleStore.meta 的 lockedAt 或 localStorage 存取時間推算）。

---

### C-2　通知範圍只有換班 ⭐ 中期
**問題：** 重要事件（班表鎖定、預約截止）沒有通知。
**建議：** 擴充通知類型：

| 通知類型 | 觸發時機 | 對象 |
|---------|---------|------|
| `schedule_locked` | 排班者鎖定班表 | 全員 |
| `request_reminder` | 月份預約截止前 3 天 | 尚未預約的成員 |
| `swap_request` | 有人申請換班（已有）| 被申請者 |

```
GAS：gas/Notification_.gs 新增這兩種型別
觸發點：lockSchedule 時呼叫 batchCreateNotifications
```

---

### C-3　無深色模式 ⭐ 低優先
**問題：** 值班夜間使用手機查看班表，全白背景刺眼。
**建議：** 加入 Tailwind `dark:` 模式支援，並在 NavBar 加切換按鈕。

```
實作位置：tailwind.config.js → darkMode: 'class'
src/App.vue → 讀取 localStorage 'theme' 切換 class
```

---

### C-4　首次登入無引導 ⭐ 低優先
**問題：** 新成員第一次登入沒有任何說明，直接進班表。
**建議：** 偵測 `localStorage` 是否有 `hasSeenOnboarding`，若無顯示簡單的一次性說明卡片（不需複雜 tour）：
- 成員：「在這裡可以查看班表 / 去預約頁面填寫班別偏好 / 換班申請在這裡」
- 排班者：加上「六日輪序說明」和「配額結算流程說明」

---

## 實作優先順序

### 🔴 高優先（低成本、高影響）

| # | 功能 | 角色 | 位置 | 估計難度 |
|---|------|------|------|---------|
| 1 | 班表查看自動 scrollIntoView 到自己列 | 成員 | ScheduleReadView | 簡單 |
| 2 | 月份狀態 badge（排班中/已鎖定/已結算） | 排班者 | ScheduleView | 簡單 |
| 3 | 個人月份統計（D×N、N×M）| 成員 | ScheduleReadView | 簡單 |
| 4 | 預約頁月份說明橫幅 | 成員 | RequestView | 簡單 |
| 5 | 排班頁加「顯示預約」overlay toggle | 排班者 | ScheduleView | 中等 |
| 6 | 鎖定前摘要確認 modal | 排班者 | ScheduleView | 中等 |
| 7 | 上次更新時間顯示 | 全員 | 共用 | 簡單 |

### 🟡 中期（需設計投入）

| # | 功能 | 角色 | 位置 | 估計難度 |
|---|------|------|------|---------|
| 8 | 配額步驟引導式面板（① 試算 ② 帶入 ③ 結算）| 排班者 | ScheduleView | 中等 |
| 9 | 換班時間軸追蹤 | 成員 | SwapView | 中等 |
| 10 | 通知入口統一（通知頁不直接操作換班）| 成員 | NotificationsView | 簡單 |
| 11 | 兩套輪序系統說明 accordion + tooltip | 排班者 | ScheduleView | 中等 |
| 12 | 清除班表分級（平日/全部）| 排班者 | ScheduleView | 中等 |
| 13 | 系統通知擴充（鎖定、預約提醒）| 全員 | GAS + frontend | 複雜 |
| 14 | Admin Dashboard | 管理者 | AdminView | 複雜 |

### 🟢 長期規劃

| # | 功能 | 角色 | 位置 | 估計難度 |
|---|------|------|------|---------|
| 15 | 行動裝置個人月曆模式 | 成員 | ScheduleReadView | 複雜 |
| 16 | 班別設定整合（合併 Settings + ShiftTypes）| 管理者 | AdminView + GAS | 複雜 |
| 17 | 操作記錄 / 稽核日誌 | 管理者 | AdminView + GAS | 複雜 |
| 18 | 深色模式 | 全員 | 全域 | 複雜 |
| 19 | 首次登入引導說明 | 全員 | App.vue | 中等 |
| 20 | 排班者班表匯出 CSV | 排班者 | ScheduleView | 簡單 |

---

## 技術實作備忘

### 關鍵檔案索引

```
src/views/ScheduleView.vue      排班者主頁面（最複雜，~1400 行）
src/views/ScheduleReadView.vue  成員查看班表
src/views/RequestView.vue       班別預約
src/views/SwapView.vue          換班管理
src/views/NotificationsView.vue 通知中心
src/views/AdminView.vue         管理者後台
src/views/LoginView.vue         登入

src/stores/schedule.js          班表狀態
src/stores/request.js           預約狀態
src/stores/notification.js      通知狀態
src/stores/settings.js          設定、人員、輪序池
src/stores/auth.js              認證狀態
src/stores/shiftTypes.js        班別定義

src/composables/useHoliday.js         假日（含快取）
src/composables/useAutoSchedule.js    六日自動填班
src/composables/useRotationProjection.js  輪序投影推算

src/utils/rotationEngine.js     輪序引擎（純函式）
src/utils/dateHelper.js         日期工具（Asia/Taipei）

gas/Code.gs       GAS 路由分發
gas/Auth.gs       認證、JWT、人員 CRUD
gas/Schedule.gs   班表、Meta、假日、輪序記錄
gas/Request.gs    預約、超額檢查
gas/Swap.gs       換班、郵件通知
gas/Rotation.gs   輪序池、配額計算
gas/Settings.gs   系統設定、班別定義
```

### 資料結構快速參考

```javascript
// ScheduleMeta_YYYYMM 儲存的 key-value
{
  isLocked: true,
  lockedBy: 'userId',
  lockedAt: '2026-03-31T...',
  cellNotes: { "userId_day": "備註" },
  offQuota: {},
  proposedPools: { poolName: { order, lastIndex } },
  weekendFilled: true,          // 六日是否已自動填入
  rotationRecord: {             // 配額輪序結算記錄
    yyyyMM: '202503',
    D:    { order, extras, startUserId, endUserId },
    N:    { ... },
    Off:  { ... },
    W6Off:{ ... }
  }
}

// 班別值
'D' | 'N' | 'Off' | 'AM' | null

// 月份格式
'YYYYMM'  // e.g., '202506'
```

### 已知系統限制

| 限制 | 來源 | 影響 |
|------|------|------|
| GAS 每日執行時間 6 分鐘 | Google Apps Script | 批次操作需注意 |
| Gmail 每日 100 封 | Google 配額 | 通知擴充後需評估 |
| GAS 無 WebSocket | 原生限制 | 即時同步靠前端輪詢 |
| GAS CORS：POST 只能用 text/plain | GAS 限制 | token 放在 body 而非 header |
| 無離線 POST | PWA 架構限制 | 離線只能查看（GET 快取），無法編輯 |
