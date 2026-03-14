# 單位班表排班系統 (Shift Scheduler PWA) — 專案規格文件

> 提供給 Claude Code 開發使用。請依照此文件架構逐步實作。

---

## 專案概述

一款供醫療/行政單位使用的 PWA 排班系統，支援：
- 主排班者執行月份排班
- 同仁預約班別（多人即時）
- 換班申請與通知
- 自動配額計算與輪序機制

---

## 技術棧

| 項目 | 技術 |
|------|------|
| 前端框架 | Vue 3 + Vite |
| 樣式 | Tailwind CSS |
| 狀態管理 | Pinia |
| 路由 | Vue Router 4 |
| PWA | vite-plugin-pwa |
| 後端 | Google Apps Script (GAS) Web App |
| 資料庫 | Google Sheets |
| 通知 | Gmail (via GAS) |
| 假日資料 | data.gov.tw 開放資料 API |
| 登入 | Google OAuth + 帳號密碼 |
| 部署 | Cloudflare Pages |

---

## 專案結構

```
scheduler/
├── public/
│   ├── manifest.json
│   └── icons/
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── router/
│   │   └── index.js
│   ├── stores/
│   │   ├── auth.js           # 登入狀態、角色
│   │   ├── schedule.js       # 班表資料
│   │   ├── request.js        # 預約資料
│   │   ├── notification.js   # 通知輪詢
│   │   └── settings.js       # 系統設定
│   ├── views/
│   │   ├── LoginView.vue
│   │   ├── ScheduleView.vue       # 主班表（排班者視角）
│   │   ├── ScheduleReadView.vue   # 主班表（成員查看）
│   │   ├── RequestView.vue        # 預約班表
│   │   ├── SwapView.vue           # 換班申請/管理
│   │   ├── NotificationsView.vue  # 通知中心
│   │   └── AdminView.vue          # 管理設定
│   ├── components/
│   │   ├── schedule/
│   │   │   ├── ScheduleGrid.vue       # 主班表格（橫向滾動）
│   │   │   ├── ShiftCell.vue          # 單格班別（可編輯）
│   │   │   ├── StatsRow.vue           # D/N/Off 統計欄
│   │   │   ├── OverBookModal.vue      # 超預彈窗
│   │   │   └── ConflictReport.vue     # 自動排班衝突報告
│   │   ├── swap/
│   │   │   ├── SwapRequestModal.vue   # 換班申請表單
│   │   │   └── SwapNoticeModal.vue    # 紙條提醒彈窗
│   │   └── common/
│   │       ├── MonthSwitcher.vue      # 月份切換
│   │       ├── UserManager.vue        # 人員管理
│   │       └── NavBar.vue
│   ├── composables/
│   │   ├── useQuota.js        # Off/D/N 配額計算
│   │   ├── useHoliday.js      # 國定假日 API
│   │   ├── usePolling.js      # 通知輪詢（30秒）
│   │   └── useAutoSchedule.js # 自動排班邏輯
│   ├── api/
│   │   └── gas.js             # 所有 GAS API 呼叫統一管理
│   └── utils/
│       ├── shiftCalc.js       # 班表計算邏輯
│       ├── dateHelper.js      # 日期工具
│       └── rotationEngine.js  # 輪序引擎
├── gas/
│   ├── Code.gs                # GAS 主程式（doGet/doPost）
│   ├── Auth.gs                # 登入驗證
│   ├── Schedule.gs            # 班表 CRUD
│   ├── Request.gs             # 預約 CRUD
│   ├── Swap.gs                # 換班邏輯
│   ├── Notification.gs        # 通知 & Gmail
│   ├── Rotation.gs            # 輪序計算
│   └── Setup.gs               # Sheets 初始化腳本
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## 角色與權限

| 角色 | 說明 |
|------|------|
| `superadmin` | 管理人員名單、設定人力需求、假日設定 |
| `scheduler` | 同時只能一人持有；執行排班、移交角色 |
| `member` | 查看班表、提交預約、申請換班 |

### 排班者移交機制
- `scheduler` 主動指定下一任 → 對方確認 → 角色轉移
- 舊 `scheduler` 降為 `member`

---

## 支援人員機制

### 概念說明
支援人員為臨時或跨單位支援的同仁，其輪序參與範圍與正式人員不同。

### 輪序參與規則

| 輪序池 | 正式人員 | 支援人員（開啟時） |
|--------|----------|-------------------|
| D班（平日/週六/週日/假日） | ✅ 參與 | ✅ 參與 |
| N班（平日/週六/週日/假日） | ✅ 參與 | ✅ 參與 |
| Off（平日/週六/週日/假日） | ✅ 參與 | ❌ 不參與 |
| W6Off（週六 Off） | ✅ 參與 | ❌ 不參與 |
| 白班（AM） | ✅ 參與 | ✅ 參與 |

> 支援人員參與排班（D/N/AM），但不佔用 Off 配額輪序

### 支援開關設計

```
AdminView → 人員管理 → 每位人員可設定：
  [✅ 參與排班]  isActive toggle
  [⚙️ 支援模式]  isSupport toggle（isActive=true 時才顯示）
```

**開關行為：**
- `isSupport = false`（預設）：正式人員，參與全部輪序池
- `isSupport = true`：支援模式，僅參與 D/N/AM 輪序，Off 配額計算時排除此人

### 支援人員對 Off 配額的影響

```
月總 Off 數計算：
  當日 Off 人數 = 總排班人數（含支援）- 當日所需上班人數

每人 Off 配額分配：
  參與分配人數 = 排班人數 - 支援人員數
  baseQuota = 月總Off ÷ 參與分配人數（取商）
  餘數照輪序分配給正式人員

支援人員的 Off：
  = 月總天數 - 其 D 班數 - 其 N 班數 - 其 AM 班數
  （系統自動計算，不走輪序配額）
```

### 月份交接防呆（對應 VBA UpdateRotationMarkers）

每月自動排班前執行輪序交接時：
1. 比對本月輪序起點（V）與上月是否一致
2. **一致** → 直接執行交接（X → 下一人成為新 V）
3. **不一致** → 警告彈窗，排班者選擇：
   - 強制重置：清除本月標記，從上月複製 V/X 後再交接
   - 取消：不執行任何動作

### 整除特例處理

```javascript
if (remainder === 0) {
  // X 記錄在 startIndex 的前一個人
  // 確保下月 V 位置不移動（回到原位）
  lastIndex = (startIndex - 1 + eligibleCount) % eligibleCount
} else {
  // 正常：X 記錄在最後一個拿到餘數的人
  lastIndex = ((startIndex - 1 + remainder - 1) % eligibleCount)
}
```

---

## 頁面與路由

```
/login                  登入頁
/schedule               主班表（排班者操作）
/schedule/view          主班表（成員查看）
/request                預約班表（成員）
/swap                   換班申請與管理
/notifications          通知中心
/admin                  系統管理（superadmin）
```

---

## 人力配置設定

### 平日（週一～週五）
| 班別 | 人數 |
|------|------|
| 白班 | 可設定 |
| D（值班） | 可設定 |
| N（夜班） | 可設定 |

### 週六
| 班別 | 人數 |
|------|------|
| 白班（半天） | 沿用平日白班人數 |
| D | 1人 |
| N | 1人 |
| Off | 總人數 - 上述人數 |

### 週日 & 國定假日
| 班別 | 人數 |
|------|------|
| D | 1人 |
| N | 1人 |
| Off | 總人數 - 2 |

---

## 輪序引擎（rotationEngine.js）

### 14個獨立輪序池

```javascript
const ROTATION_POOLS = [
  'satOff',   // 週六 Off
  'satD',     // 週六 D（1人）
  'satN',     // 週六 N（1人）
  'satAM',    // 週六 白班（半天）
  'sunOff',   // 週日 Off
  'sunD',     // 週日 D（1人）
  'sunN',     // 週日 N（1人）
  'holOff',   // 國定假日 Off
  'holD',     // 國定假日 D（1人）
  'holN',     // 國定假日 N（1人）
  'wdOff',    // 平日 Off
  'wdD',      // 平日 D
  'wdN',      // 平日 N
  'wdAM',     // 平日 白班
]
```

每個輪序池資料結構：
```javascript
{
  poolName: 'satD',
  order: ['userId1', 'userId2', ...],  // 輪序順序
  lastIndex: 3,                         // 上月結尾索引
  skipQueue: ['userId2'],               // 跳過補回優先隊列
}
```

### 輪序規則
1. 每月從上月 `lastIndex + 1` 開始
2. 國定假日落在週六/週日 → 走假日輪序，週末輪序**跳過不消耗索引**
3. D/N 餘數分配：總量 % 人數 的餘數，依輪序順序各加1

### Off 配額計算
```
月總 Off 數 = 各日 (總人數 - 當日所需人數) 加總
            （週六/週日/假日分別計算）
每人基本 Off = 月總Off ÷ 參與人數（取商）
餘數 r = 月總Off % 參與人數
從 lastIndex+1 開始，分配 r 個人各 +1
```

### 衝突處理（同人同天兩班）
1. **Step 1 — 當月補回**：在該輪序池下一個輪到日期找空位插入，標記「補排」
2. **Step 2 — 下月優先**：當月無法補回時，下月該輪序池插隊第一位，標記「待補／已移至下月」
3. **Step 3 — 排班者確認**：自動排班完成後產生衝突報告，排班者可接受或手動調整

### 自動排班執行順序
```
1. 載入當月國定假日
2. 分類每天類型：平日 / 週六 / 週日 / 假日
3. 排入假日 D、N
4. 排入週日 D、N
5. 排入週六 D、N、白班
6. 計算並排入各類型 Off（含餘數分配）
7. 排入平日 D、N、白班（餘數輪序）
8. 衝突檢查 → 跳過補回處理
9. 產生衝突報告
10. 等待排班者確認後鎖定
```

---

## 班表格 UI 規格（ScheduleGrid.vue）

```
列結構：
  第1列：日期 1-31（固定 header，含國定假日標記）
  第2列：星期（一～日，六日不同底色）
  之後每列：一位人員

欄結構：
  第1欄：人員姓名（sticky left）
  第2-32欄：1-31 日班別格（可點擊編輯）
  第33欄：D 總數（紅色若與配額不符）
  第34欄：N 總數（紅色若與配額不符）
  第35欄：Off 總數（紅色若與配額不符）
  第36欄：白班總數

顏色規則：
  週六欄：淺藍底
  週日欄：淺紅底
  國定假日：橘色標記
  統計數字不符：紅色文字，hover 顯示「過多/過少 N個」
  超預格子：紅色邊框 + 警示圖示
  補排標記：綠色角標
  待補標記：黃色角標
```

---

## 預約功能規格

- 成員可選任意日期、任意班別直接寫入
- 寫入時 server 端驗證是否超預
- 超預條件：當日該班別預約人數 > 配額上限
- 超預時：
  - 仍允許寫入
  - 格子標記「需處理」（紅色警示）
  - 點擊開啟 `OverBookModal`
  - 顯示當日所有預約該班的人員清單
  - 顯示輪序退讓提示：「建議與 XX 溝通退出（依輪序排後面者優先退讓）」
- 排班者執行排班時，鎖定該月預約功能（其他月份不受影響）

---

## 換班功能規格

### 申請流程
1. 申請者選自己某天班別 → 選目標對象 → 送出
2. 系統寫入通知文件
3. 對象透過輪詢收到通知
4. 彈窗顯示換班詳情：接受 / 拒絕

### 確認後強制提醒
- 雙方同意後顯示 `SwapNoticeModal`
- 提醒內容：
  - 「請填寫紙本換班單」
  - 「請通知副主任」
- 確認後才正式寫入班表

### Email 通知內容
- 換班申請：寄給被申請者，說明申請人、日期、班別
- 換班結果：寄給申請者，說明對方回覆
- 換班完成：雙方皆收到確認信

---

## GAS API 規格

所有請求走單一 Web App URL，以 `action` 參數區分。

### GET 端點

| action | 參數 | 說明 |
|--------|------|------|
| `getSchedule` | `yyyyMM` | 取得排班結果 |
| `getRequests` | `yyyyMM` | 取得預約資料 |
| `getNotifications` | `userId` | 取得待處理通知 |
| `getHolidays` | `year` | 取得國定假日 |
| `getSettings` | — | 取得系統設定 |
| `getUsers` | — | 取得人員清單 |
| `getRotationState` | — | 取得所有輪序池狀態 |

### POST 端點

| action | 說明 |
|--------|------|
| `login` | 帳密登入，回傳 JWT |
| `googleLogin` | Google OAuth token 驗證 |
| `saveShift` | 儲存單格班別（排班者） |
| `batchSaveShifts` | 批次儲存自動排班結果 |
| `saveRequest` | 儲存預約班別（成員） |
| `lockSchedule` | 鎖定月份排班 |
| `unlockSchedule` | 解鎖月份排班 |
| `transferScheduler` | 移交排班者角色 |
| `submitSwap` | 提交換班申請 |
| `respondSwap` | 回覆換班申請（接受/拒絕） |
| `updateSettings` | 更新系統設定 |
| `updateUser` | 更新人員資料 |
| `addUser` | 新增人員 |
| `removeUser` | 移除人員 |
| `saveHolidayDuty` | 儲存假日值班抽籤結果 |

---

## Google Sheets 結構

### `Users` 分頁
| 欄位 | 說明 |
|------|------|
| userId | UUID |
| name | 姓名 |
| role | superadmin / scheduler / member |
| email | 電子郵件 |
| passwordHash | SHA-256 雜湊（帳密登入用） |
| isActive | 是否參與排班 |
| isSupport | 是否為支援模式（true = 不參與 Off 輪序） |
| sortOrder | 顯示順序 |

### `Settings` 分頁
| 欄位 | 說明 |
|------|------|
| wdAM | 平日白班人數 |
| wdD | 平日D班人數 |
| wdN | 平日N班人數 |
| satAM | 週六白班人數（同平日） |
| holD | 假日D班人數（固定1） |
| holN | 假日N班人數（固定1） |
| sunD | 週日D班人數（固定1） |
| sunN | 週日N班人數（固定1） |

### `RotationPools` 分頁
每行一個輪序池，JSON 格式儲存：
```json
{
  "poolName": "satD",
  "order": ["uid1", "uid2"],
  "lastIndex": 3,
  "skipQueue": []
}
```

### `Holidays_{year}` 分頁
| 欄位 | 說明 |
|------|------|
| date | YYYY-MM-DD |
| name | 假日名稱 |
| isHoliday | true/false |

### `Schedule_{yyyyMM}` 分頁
| 欄位 | 說明 |
|------|------|
| userId | — |
| day_1 ~ day_31 | D / N / Off / AM / null |
| lockedAt | 鎖定時間 |

### `ScheduleMeta_{yyyyMM}` 分頁
| 欄位 | 說明 |
|------|------|
| isLocked | true/false |
| lockedBy | userId |
| cellNotes | JSON `{"userId_day": "補排|待補"}` |
| offQuota | JSON `{"userId": 8}` 各人配額 |

### `Requests_{yyyyMM}` 分頁
| 欄位 | 說明 |
|------|------|
| userId | — |
| day_1 ~ day_31 | D / N / Off / AM / null |
| overBooked | JSON 超預日期清單 `["3","7"]` |

### `Notifications` 分頁
| 欄位 | 說明 |
|------|------|
| notificationId | UUID |
| type | swap_request / swap_accepted / swap_rejected / swap_reminder |
| fromUserId | — |
| toUserId | — |
| yyyyMM | 換班所屬月份 |
| day | 換班日期 |
| fromShift | 申請者班別 |
| toShift | 對象班別 |
| status | pending / accepted / rejected / done |
| createdAt | 時間戳 |
| readAt | 已讀時間 |

---

## 假日值班設定（四月執行）

1. 系統從 `data.gov.tw` API 取得當年國定假日清單
2. 在 `AdminView` 顯示全年假日列表
3. 每個假日顯示「抽籤」按鈕 → 隨機從參與排班人員中抽出 D 班和 N 班各一人
4. 抽籤結果直接填入對應月份排班表
5. 可手動覆蓋抽籤結果
6. 確認後鎖定（只有 superadmin 可修改）

---

## 通知輪詢機制

```javascript
// usePolling.js
// 每 30 秒向 GAS 查詢新通知
// 有新通知時：
// 1. 更新 notification store
// 2. NavBar 顯示紅點
// 3. 顯示瀏覽器 Notification API 彈窗（需用戶授權）
```

---

## 登入機制

### Google OAuth
1. 前端引導至 Google OAuth 同意頁
2. 取得 id_token
3. POST 給 GAS 驗證
4. GAS 比對 Users 表的 email
5. 回傳自簽 JWT（存 localStorage）

### 帳號密碼
1. 前端送出 email + SHA-256(password)
2. GAS 比對 Users 表
3. 回傳自簽 JWT

### JWT Payload
```json
{
  "userId": "xxx",
  "email": "xxx",
  "role": "scheduler",
  "exp": 1234567890
}
```

---

## 開發順序建議（Phase）

### Phase 1 — 基礎建設
- [ ] Vue3 + Vite + Tailwind + PWA 初始化
- [ ] Vue Router + Pinia 設定
- [ ] GAS 後端基礎架構（doGet/doPost router）
- [ ] Sheets 初始化腳本（Setup.gs）
- [ ] Google OAuth 登入
- [ ] 帳號密碼登入
- [ ] JWT 驗證 middleware
- [ ] 人員管理 CRUD（AdminView，含 isSupport 開關）

### Phase 2 — 核心班表
- [ ] ScheduleGrid.vue 主畫面
- [ ] ShiftCell.vue 可編輯格子
- [ ] StatsRow.vue 統計欄（含配額比對）
- [ ] MonthSwitcher.vue
- [ ] Off/D/N 配額計算（useQuota.js）
- [ ] 14輪序池引擎（rotationEngine.js）
- [ ] 自動排班執行邏輯（useAutoSchedule.js）
- [ ] 衝突檢查與補回機制
- [ ] ConflictReport.vue 衝突報告
- [ ] 排班鎖定/解鎖機制
- [ ] 排班者移交功能

### Phase 3 — 預約功能
- [ ] RequestView.vue 預約介面
- [ ] 超預即時檢查
- [ ] OverBookModal.vue 超預彈窗
- [ ] 預約鎖定（排班中月份）

### Phase 4 — 換班與通知
- [ ] SwapView.vue 換班管理
- [ ] SwapRequestModal.vue 申請表單
- [ ] SwapNoticeModal.vue 紙條提醒
- [ ] GAS Gmail 通知發送
- [ ] usePolling.js 30秒輪詢
- [ ] NotificationsView.vue 通知中心
- [ ] 瀏覽器 Notification API

### Phase 5 — 假日管理
- [ ] data.gov.tw API 串接（useHoliday.js）
- [ ] 假日清單顯示介面
- [ ] 四月年度假日值班抽籤
- [ ] 假日設定儲存至 GAS

---

## 環境變數（.env）

```
VITE_GAS_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
VITE_JWT_SECRET=your_jwt_secret_for_gas
```

> ⚠️ JWT secret 需同時設定在 GAS 的 Script Properties

---

## 注意事項

1. **GAS 限制**：單次執行上限 6 分鐘，自動排班需批次處理
2. **CORS**：GAS Web App 需設定「Anyone」存取，前端加 `mode: 'no-cors'` 或用 JSONP
3. **Sheets 並發**：多人同時寫入預約時，GAS 用 `LockService` 防止競態
4. **PWA 離線**：班表讀取可快取，寫入操作需網路連線
5. **輪序池持久化**：每月排班完成後必須更新 RotationPools 的 lastIndex
6. **時區**：所有日期操作統一使用 Asia/Taipei (UTC+8)

---

## 班表比對驗證系統（Validation System）

### 原始設計參考（來自現有 Excel 班表）

Excel 中有兩層比對機制：

```
右側統計欄（每人）：
  AI = 實際D總數    AR = 配額D數  → 比對
  AJ = 實際N總數    AS = 配額N數  → 比對
  AK = 實際OFF總數  AT = 配額OFF數 → 比對
  AN = 實際W6Off數  AU = 配額W6Off → 比對

下方統計列（每日）：
  Row 放假人數 = 當日實際 Off 人數（計算值）
  Row 國假註記 = 當日國定假日或特殊標記
  → 對應每日應放假上限做比對
```

---

### PWA 比對驗證設計

#### 一、個人統計列（每人最右側）

```
姓名 | 1  2  3 ... 31 | D實/配  N實/配  Off實/配  W6實/配
```

**顯示邏輯：**

| 狀態 | 顯示方式 |
|------|----------|
| 實際 = 配額 | 綠色數字，正常顯示 |
| 實際 < 配額 | 橘色數字 + 底色淡橘，hover 顯示「尚少 N 個」 |
| 實際 > 配額 | 紅色數字 + 底色淡紅，hover 顯示「超出 N 個」 |
| 差距 ≥ 2 | 加粗字體 + 閃爍邊框（嚴重警示） |

**格式範例：**
```
黃郁芳 | D D N ... Off | 4✓  4✓  17✓  3↑
                          綠   綠   綠   紅(超1)
```

#### 二、每日統計列（班表底部固定列）

班表格底部固定顯示兩列：

**第一列：當日班別人數**
```
     | 1   2   3  ...  31
D    | 1   2   1  ...  2     ← 當日實際D人數
N    | 1   1   2  ...  1     ← 當日實際N人數
Off  | 6   5   5  ...  5     ← 當日實際Off人數
AM   | 2   2   2  ...  2     ← 當日實際白班人數
```

**第二列：當日比對狀態**
```
     | 1   2   3  ...  31
D需  | 1✓  2✓  1✓ ...  2✓   ← 需求人數（綠=符合/紅=不符）
N需  | 1✓  1✓  2✓ ...  1✓
Off上限 | 6✓ 5⚠ 5✓ ...  6✓  ← 超預或人數異常
```

**每日格子底色規則：**

| 狀態 | 班表格底色 |
|------|-----------|
| 該日所有班別人數符合需求 | 無色（正常） |
| 某班別人數不足 | 該欄淡黃底 |
| 某班別人數超過 | 該欄淡橘底 |
| Off 超過上限（超預） | 該欄淡紅底 |
| 國定假日 | 該欄淡橘色標頭 |

#### 三、班別格子即時驗證（ShiftCell.vue）

每個格子填入班別時，即時觸發以下驗證：

```
填入 D：
  → 當日D人數 +1
  → 若超過需求人數 → 格子右上角出現橘色小點
  → hover 提示「當日D班已達 N 人（需求 M 人）」

填入 Off：
  → 當日Off人數 +1
  → 若超過當日Off上限 → 格子右上角出現紅色小點
  → hover 提示「當日Off已達上限（X/X）」

個人統計同步更新：
  → 右側D/N/Off/W6Off計數即時重算
  → 顏色即時變化
```

#### 四、整體班表健康度指標（ScheduleView 頂部）

排班者操作頁面頂部顯示摘要列：

```
┌─────────────────────────────────────────────────┐
│ 3月班表  ●完成度 72%   ⚠ 3處異常   ✗ 2人超配額  │
│ [查看異常清單]                      [確認鎖定]   │
└─────────────────────────────────────────────────┘
```

**異常清單彈窗內容：**
```
個人配額異常：
  ✗ 詹雅慈：D班 2個（配額 4個），差 -2
  ✗ 張心柔：Off班 19個（配額 17個），超 +2

每日人力異常：
  ⚠ 3/5（三）：N班 0人（需求 1人）
  ⚠ 3/12（三）：D班 2人（需求 1人）

超預警示：
  ⚠ 3/8（日）：Off預約 7人，上限 6人
```

#### 五、數字變化動畫設計

計數變化時使用輕量動畫提示使用者：

```css
/* 數字跳動效果（填入班別時觸發） */
@keyframes countBump {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.3); }
  100% { transform: scale(1); }
}

/* 警示閃爍（超出配額時） */
@keyframes alertPulse {
  0%, 100% { background-color: rgba(239,68,68,0.1); }
  50%       { background-color: rgba(239,68,68,0.3); }
}
```

---

### 計算邏輯（shiftCalc.js）

```javascript
// 個人統計
export function calcPersonStats(shifts, quota) {
  const actual = { D: 0, N: 0, Off: 0, AM: 0, W6Off: 0 }
  // 計算各班別實際數量
  // 比對 quota，回傳 diff 和 status ('ok'|'under'|'over')
}

// 每日統計
export function calcDayStats(allShifts, day, dayType, requirements) {
  // dayType: 'weekday'|'saturday'|'sunday'|'holiday'
  // 回傳當日各班別人數 & 與需求比對結果
}

// 整體健康度
export function calcScheduleHealth(allShifts, allQuotas, requirements) {
  // 回傳 completionRate, anomalies[], overQuota[]
}
```

---

### StatsRow.vue 元件規格

```
props:
  userId        當前人員 ID
  shifts        該人員完整班別物件 { "1": "D", "2": "N", ... }
  quota         配額物件 { D: 4, N: 4, Off: 17, W6Off: 3 }
  isSupport     是否支援人員（影響 Off 配額顯示）

顯示：
  每個數字格：實際數 / 配額數
  狀態色：綠(符合) / 橘(不足) / 紅(超出)
  hover tooltip：差距說明
  點擊：展開該類別日期明細
```

---

### DayStatsBar.vue 元件規格（新增）

```
固定在班表格底部（sticky bottom）
顯示每日 D / N / Off / AM 實際人數
對比每日需求人數顯示底色
國定假日欄顯示假日名稱 tooltip
```
