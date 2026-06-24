# AutoSchedule.gs — 自動排班引擎規格

> 對應檔案：`gas/AutoSchedule.gs`
> 更新日期：2026-03-17

---

## 一、班別定義

| 值 | 說明 | 分類 |
|---|---|---|
| `D` | 日班 | 上班 |
| `N` | 夜班 | 上班 |
| `S1` | 半日班（下午） | 上班 |
| `H3` | 假日班（週六出勤） | 上班 |
| `Off` | 一般休假 | 休息 |
| `W6Off` | 週六休假 | 休息 |

**勿值請求**（儲存於 Requests sheet，不是排班值）：

| 值 | 意義 | 允許班別（平日） | 允許班別（週六） |
|---|---|---|---|
| `NO_DN` | 不上 D 也不上 N | S1 或 Off | H3 或 W6Off |
| `NO_D` | 不上 D | N、S1、Off | H3 或 W6Off |
| `NO_N` | 不上 N | D、S1、Off | H3 或 W6Off |

> NO_DN ≠ 強制 Off。平日可排 S1；週六可排 H3 或 W6Off（不可 S1）。

---

## 二、日型分類

日曆由 `buildCal()` 產生，每天包含以下屬性：

| 屬性 | 說明 |
|---|---|
| `isWeekday` | 週一～五且非國定假日 |
| `isHol` | 國定假日（不限星期幾，來自 Holidays 表） |
| `isSat` | 週六 |
| `isSun` | 週日 |
| `isWeekend` | 週六或週日 |

---

## 三、初始化

### 輸入資料

| 資料 | 來源 | 說明 |
|---|---|---|
| 使用者清單 | `Auth.getUsers()` | 過濾 `isActive && !noSchedule` |
| 現有班表 | `Schedule.getSchedule()` | 所有非空格視為**鎖定**（不覆寫） |
| 請求資料 | `Request.getRequests()` | 含勿值約束（NO_DN/NO_D/NO_N）與 D/N/Off 偏好 |
| 國定假日 | `Schedule.getHolidays()` | 用於日型分類 |
| 設定值 | `Settings_.getSettings()` | 各日型人力需求、規則參數 |
| 上月尾段 | `loadPrevTail()` | 讀取上月最後 14 天，用於跨月連續工作天計算 |

### 排班者手動調整（schedulerAdjustments）

`ScheduleMeta` 中的 `schedulerAdjustments` 欄位（JSON）儲存排班者在上次預覽時的手動修改：

```json
{ "<userId>": { "day_5": "D", "day_12": "Off" } }
```

初始化時，`schedulerAdjustments` 中的值作為**軟鎖定**載入（與現有鎖定相同效果，但不覆寫已鎖定格）。這使排班者的手動調整在下次自動排班時被保留。

### 配額（rem）

每位使用者初始化剩餘配額 `rem[uid] = { D, N, Off, W6Off }`：
- 從 `ScheduleMeta` 讀取目標值（可個別覆寫 `quotaOverrides`）
- 減去已鎖定班別的現有計數
- W6Off 共用 Off 預算：W6Off 同時消耗 `rem.W6Off` 和 `rem.Off`

### noNight — 禁止夜班人員

`Users` 分頁的 `noNight` 欄位（布林值）標記「不可上夜班」人員。此限制是**雙層保護**：

1. **配額層（`Rotation.gs::redistributeNoNightQuota`，月初配額計算時執行一次）**
   `applyMonthlyShiftQuota` 依正常公平演算法算出每人 N/D 配額後，對 `noNight` 人員執行再分配：
   - 該人員的 N 配額全數歸零，等量加回其 D 配額（夜班還原為白班，總工作天數不變）
   - 每移出 1 天 N，就分給「目前 N 配額最低」的非 `noNight` 人員 1 天（每次重新排序，確保多單位移轉時仍維持公平），該受配者的 D 配額同時扣 1 天
   - N 班的「期望值」（fairness ledger 用於計算 `balanceAfter`）也改以「非 noNight 人數」分攤，`noNight` 人員的 N 期望值視為 0，避免月底累積無法消除的虛假餘額債務
2. **排班層（`AutoSchedule.gs::autoFillSchedule`，硬性排除，防止配額層被繞過）**
   - 初始化 `rem` 後立即將所有 `noNight` 人員的 `rem.N` 清零並併入 `rem.D`（保險措施，即使配額層已處理）
   - `stepN` 的群組平移（`tryNGroupShift`）不會挑選 `noNight` 人員的群組
   - `stepN` 的逐日缺額回填（fallback backfill）兩個 pass 皆排除 `noNight` 人員（含原本未檢查配額的 pass 1）
   - 手動修正函式 `fwNShortage`、`fwWuZhiViolation`（N 班缺額/勿值違規修正）皆排除 `noNight` 人員作為候選人

> `noNight` 人員仍可正常排 D/Off/AM 等其他班別，只是永不出現 N。

### 鎖定邏輯

Schedule sheet 中**任何非空格**均視為鎖定，自動排班不覆寫。
- 特例：週六的 `Off` 自動正規化為 `W6Off`

### 規則參數（parseRules）

| 參數 | 預設值 | 說明 |
|---|---|---|
| `maxConsecutiveWork` | 6 | 最多連續上班天數 |
| `maxConsecutiveN` | 4 | 最多連續 N 班天數 |
| `preferNGroup` | 3 | N 班群組偏好大小 |
| `maxDPerWeek` | 3 | 每週最多 D 班數 |
| `nMustEndOff` | true | N 班後必須接 Off |
| `avoidNOffD` | true | 避免 N→Off→D 模式 |
| `forbidFragmentShift` | true | 碎班檢查總開關（休-班-休）；false 則略過掃描 |
| `fragmentShiftTypes` | `['D','N']` | 視為碎班的班別值，可加入 `'S1'`/`'H3'` |

可透過 Settings sheet 的 `autoScheduleRules` 欄位（JSON 字串）覆寫。

> **碎班開關**：`forbidFragmentShift` 為參數化總開關，預設啟用。設為 `false` 即完全停用碎班掃描。`fragmentShiftTypes` 控制哪些班別被視為碎班——預設只看全日臨床班 D/N，避免半日班 S1 作為填充時產生大量雜訊。

---

## 四、執行順序

```
Step 0 (no-op)
→ Step 1: stepN              夜班（最受限，優先排）
→ Step 2: stepW6             週末 + 假日 + 週日
→ Step 3: stepD              日班（純平日）
→ Step 4: stepOffS1          Off / S1 壓力分配（純平日）
→ Step 5: stepS1             catch-all（補空格）
→ Step 5.5: fixDailyBalance  每日 D/N 平衡修正
→ Step 5.6: stepEnforceWeeklyOff  強制週休
→ Step 6: stepPostCheck      N→Off→D 鏈式交換
→ Step 7: stepFinalValidate  勿值違規掃描
→ Step 8: scanFragmentShifts 碎班掃描（參數化開關）
```

---

## 五、各步驟詳細說明

### Step 0：stepPreMarkWuZhi（空操作，no-op）

目前不執行任何動作。勿值約束由各後續步驟透過 `isWuZhiD` / `isWuZhiN` 直接過濾。

> 設計理由：NO_DN 在平日仍可排 S1，在週六仍可排 H3/W6Off，若直接標記 Off 會阻礙這兩種合法班別。

---

### Step 1：stepN — 夜班分配

**適用日型**：所有非週末日（含國定假日）

每天 N 班需求量：
- 平日 → `settings.wdN`
- 假日平日 → `settings.holN`（由 stepW6 處理）
- 週日 → `settings.sunN`（由 stepW6 的 honorNRequest 處理）

#### 使用者排序優先度（最先排的人優先）

1. **已有 N 班最多者**（延伸現有群組，避免碎片化）
2. **剩餘 N 配額最少者**（快滿配額的先排，避免月底無法放置）
3. **可用連續空位最少者**（最受限的先排）

#### Phase 1 — 延伸現有 N 群組（往左）

掃描已有 N 群組，嘗試在起始日前一天插入 N。條件：
- 未鎖定、未排
- 非週末
- 當天 N 需求未滿
- 新加入後連續 N 不超 `maxConsecutiveN`
- 連續工作不超 `maxConsecutiveWork`
- 前一天非 D

#### Phase 2 — 貪婪放置新群組（findCandidates）

從最大可能大小（`rem.N`）往下嘗試，找可用的連續空白平日區間。

`findCandidates` 過濾條件：
- 連續的平日空格（未鎖定、未排）
- 群組前一天不是 D（禁止 D→N）
- 群組後一天若已鎖定，不能是 D 或 S1
- 群組後兩天若已鎖定，不能是 D（禁止 N...N→Off→D）
- 連續 N 不超 `maxConsecutiveN`
- 連續工作不超 `maxConsecutiveWork`
- **勿值**：群組內任一天有 `NO_N` 或 `NO_DN` → 跳過此起點
- 各天 N 需求未滿

評分（選最高分起點）：
- 群組內各天 N 需求缺口總和
- 若 trailing Off 落在勿值日，額外 +10 分

放置後，trailing Off 自動寫入（週六則為 W6Off），已鎖定或已排則跳過。

#### Phase 2 失敗 — N 群組平移（tryNGroupShift）

找其他使用者的未鎖定 N 群組，嘗試整體往後移一天，釋出空間後再放置 uid 的群組。
成功 → `NGroupShift` 警告；仍失敗 → `NPlaceFail` 警告。

#### Fallback — 每日單天補填

所有使用者排完後，逐天檢查 N 缺口，強制補填單天 N：
- 優先選 `rem.N > 0` 者，再退而求其次
- 補填後同樣安排 trailing Off
- 發出 `NBackfill` 警告；找不到人 → `NShortage` 警告

---

### Step 2：stepW6 — 週末與假日

> **週六 D/N 由輪序池預先決定並鎖定於班表，stepW6 不負責分配週六 D/N。**

#### 國定假日（週間，isHol && !isWeekend）

1. 先處理 **D 預請求**（`req === 'D'`）：
   - 未鎖定、未排
   - `rem.D > 0`
   - 前一天非 N 或 D（含 N→rest→D 的 2 天間隔規則）
   - 連續工作未超限
   - 日 D 計數未達 `settings.holD`
2. 再處理 **N 預請求**（`req === 'N'`）：
   - 未鎖定、未排
   - `rem.N > 0`
   - 前一天非 N 或 D
   - 連續工作未超限
   - 日 N 計數未達 `settings.holN`
3. 其餘全排 **Off**（消耗 Off 配額）

#### 週日（isSun）

1. 先處理 **D 預請求**（上限 `settings.sunD`）：條件同上
2. 再處理 **N 預請求**（`req === 'N'`，上限 `settings.sunN`）：前一天非 N/D，連續工作未超限
3. 其餘全排 **Off**

#### 一般週六（isSat && !isHol）

強制保證每週六有 **`settings.satH3`** 個 H3（預設 2）：
- 所有未排使用者按 `h3Count`（本月累計 H3）升冪、再 `rem.W6Off` 降冪排序
- 前 `satH3 - existingH3` 人排 **H3**；其餘排 **W6Off**
- 若該人 W6Off 配額緊張（`satRemaining <= rem.W6Off`）→ `H3Force` 警告
- H3 人數仍不足 `satH3` → `H3Shortage` 警告

#### 假日週六（isSat && isHol）

全排 **W6Off**（假日週六不排 H3）。

> 勿值約束（NO_DN/NO_D/NO_N）在週六均可排 H3 或 W6Off，stepW6 無需特別處理。

---

### Step 3：stepD — 日班分配

**適用日型**：非週末且非國定假日（`!isWeekend && !isHol`）

每天依 `offPressure`（`rem.Off / 剩餘平日數`）升冪排序（需要休息越少者越先上 D）。

候選過濾條件：
- 未鎖定、未排
- `rem.D > 0`
- 前一天非 N 或 D（含 N→rest→D 的 2 天間隔）
- 下一天若已鎖定不能是 D（避免 DD）
- 本週 D 班數未達 `maxDPerWeek`
- 連續工作未超 `maxConsecutiveWork`
- **勿值**：`isWuZhiD(req)`（NO_DN 或 NO_D）者排除

取前 `settings.wdD` 位候選者排 D；不足 → `DShortage` 警告。

---

### Step 4：stepOffS1 — Off / S1 壓力分配

**適用日型**：非週末且非國定假日

對每天剩餘未排的使用者，按 `offPressure` 升冪排序後逐一分配：

| 條件 | 分配結果 |
|---|---|
| `mustRest`（連續工作超限 或 前天是 N） | Off |
| `offPressure >= 1.0`（Off 配額緊張） | Off |
| `rem.Off <= 0`（Off 配額耗盡） | S1 |
| 當天 S1 人數未達 `wdS1` | S1 |
| 其餘 | Off |

NO_DN 使用者在此步驟與一般使用者**相同**（D/N 已在前面步驟被排除，到這步只剩 S1 或 Off）。

後驗：
- `finalS1 < wdS1` → `S1Shortage` 警告
- `finalS1 > wdS1` → `S1Excess` 警告

---

### Step 5：stepS1（catch-all）

**適用日型**：所有非週末日（含假日）

此時仍為空的格子全部補 **S1**。

---

### Step 5.5：fixDailyBalance — 每日 D/N 平衡修正

**適用日型**：非週末、非假日

若某天 D 班人數為 0（應有 `wdD` 人）：
1. **等價交換**：找一個人在他處有多餘 D，將其 D 移到今天。發出 `DFix` 警告
2. **Fallback**：找符合條件的 S1 直接升為 D。發出 `DForce` 警告
3. 仍失敗 → `DShortage` 警告

若某天 N 人數超出 `wdN` → `NExcess` 警告（僅警告，不修正）

---

### Step 5.6：stepEnforceWeeklyOff — 強制週休

對每位使用者，確保每個結束於第 d 天的 **7 天滑動窗口**內至少有 1 天休息（Off/W6Off）：
- 若無休息，從窗口內找最近的未鎖定 S1 改為 Off。發出 `ForceOff` 警告
- 若找不到（全鎖定）→ `WeeklyOffFail` 警告

---

### Step 6：stepPostCheck — N→Off→D 鏈式交換

掃描所有 **N[d]→Off/W6Off[d+1]→D[d+2]** 模式，嘗試消除（uid 在 d+2 天不應排 D）：

| 嘗試 | 方式 | D 總量 | 警告類型 |
|---|---|---|---|
| 1 | 2 人等價：uid 與 Y 互換一個 D 日 | 不變 | `NOffD` |
| 2 | 3 人鏈式：A/B/C 各讓出一個 D 迴圈補位 | 不變 | `NOffD` |
| 3 | 4 人鏈式：A/B/C/E 迴圈 | 不變 | `NOffD` |
| 4（fallback） | 單次交換（找 Y 接手 d+2 的 D） | ±1 | `NOffDSingle` |
| 全失敗 | 保持現狀 | — | `NOffDFail` |

**canTakeD** 條件：現為 S1、非鎖定、前一天非 N/D（含間隔規則）、下一天非 D
**canGiveD** 條件：現為 D、非鎖定

---

### Step 7：stepFinalValidate — 勿值違規掃描

全表掃描，若使用者當天有勿值請求且被排了禁止班別：
- `isWuZhiD(req)` 且 `s === 'D'` → `WuZhiViolation` 警告
- `isWuZhiN(req)` 且 `s === 'N'` → `WuZhiViolation` 警告

---

### Step 8：scanFragmentShifts — 碎班掃描（參數化開關）

**啟用條件**：`rules.forbidFragmentShift === true`（預設啟用，設 `false` 則整步略過）

偵測「休-班-休」碎班：對每位使用者每一天，若該天班別屬於 `rules.fragmentShiftTypes`（預設 `['D','N']`），且**前一天**與**後一天**皆為休假（`Off`/`W6Off`），即發出 `FragmentShift` 警告。

邊界處理：
- 第 1 天的前一天回看上月尾段（`prevTail`）；無資料則略過該天（不誤報）。
- 月底最後一天無法確認下個月，略過（不誤報）。

> 僅產生**資訊性**警告，不自動修正——修正碎班會連動每日人力需求與配額平衡，交由排班者人工判斷處理。
>
> 對應截圖參考系統的「禁止碎班（O-D-O／O-E-O／O-N-O）」硬規則，但此處以可開關的軟性提醒實作，預設只看 D/N 全日臨床班。

---

## 六、警告類型一覽

| type | 說明 | userId | day | 可自動修正 |
|---|---|---|---|---|
| `NGroupShift` | N 群透過平移另一人的 N 群解決 | ✓ | — | — |
| `NPlaceFail` | N 群組放置失敗（後續由單天補填） | ✓ | — | — |
| `NBackfill` | N 單天強制補填 | ✓ | ✓ | — |
| `NShortage` | 某天 N 仍不足 | — | ✓ | ✓ |
| `NExcess` | 某天 N 超出需求 | — | ✓ | — |
| `NOffD` | N→Off→D 等價交換完成（資訊性） | ✓ | ✓ | — |
| `NOffDSingle` | N→Off→D 單次交換（非等價） | ✓ | ✓ | — |
| `NOffDFail` | N→Off→D 找不到交換對象 | ✓ | ✓ | ✓ |
| `H3Force` | 強制排 H3（犧牲 W6Off 配額） | ✓ | ✓ | — |
| `H3Shortage` | 週六 H3 人力不足 | — | ✓ | ✓ |
| `DShortage` | D 班人力不足 | — | ✓ | ✓ |
| `DFix` | D 班等價移位修正（資訊性） | ✓ | ✓ | — |
| `DForce` | D 班直接升班修正（資訊性） | ✓ | ✓ | — |
| `S1Shortage` | S1 人力不足 | — | ✓ | ✓ |
| `S1Excess` | S1 過多 | — | ✓ | ✓ |
| `ForceOff` | 強制插入 Off（7天窗口無休） | ✓ | ✓ | — |
| `WeeklyOffFail` | 7天窗口無法插入休息（均鎖定） | ✓ | ✓ | — |
| `WuZhiViolation` | 勿值日被排禁止班別 | ✓ | ✓ | ✓ |
| `FragmentShift` | 碎班（休-班-休，單日工作夾於兩休假間） | ✓ | ✓ | — |
| `QuotaDRebalance` | A D 超配額、B D 不足，建議同日對換 | ✓（A） | ✓ | ✓ |

> `QuotaDRebalance` 由 `rescanSchedule` 產生，`targetUserId` 欄位存放 B 的 userId。

---

## 七、fixWarning — 單筆修正

前端警告列表每筆可點擊「修正」，呼叫 `fixWarning` action：

**輸入**：`{ yyyyMM, warning: { type, userId, targetUserId?, day }, preview }`

後端將 Sheets 鎖定班表 + preview 合併為工作 sched，依 type 呼叫修正函式：

| type | 修正函式 | 策略 |
|---|---|---|
| `NOffDFail` | `fwNOffD` | 同 stepPostCheck：2人→3人→單次交換 |
| `DShortage` | `fwDShortage` | 等價移位（找同人多餘 D 日），fallback S1→D |
| `H3Shortage` | `fwH3Shortage` | W6Off→H3 |
| `S1Shortage` | `fwS1Shortage` | Off/W6Off→S1（找第一個符合者） |
| `S1Excess` | `fwS1Excess` | S1→Off |
| `WuZhiViolation` | `fwWuZhiViolation` | D/N→Off，再找他人補當日 D 或 N |
| `NShortage` | `fwNShortage` | S1/Off→N + trailing Off |
| `QuotaDRebalance` | `fwQuotaDRebalance` | A[D] ↔ B[Off/S1/W6Off]，同日對換 |
| `QuotaOffToS1` | `fwS1Shortage` | Off→S1（向下相容舊警告） |

**回傳**：`{ changes: { uid: { 'day_N': value } } }`
前端將 changes merge 回 preview，並移除該警告。

---

## 八、fixAllWarnings — 一鍵修正全部

**輸入**：`{ yyyyMM, warnings: [...], preview }`

伺服器端單次執行，對所有可修正警告依優先順序（同 sched 狀態）處理：

```
優先順序：
WuZhiViolation → NOffDFail → NShortage → DShortage → H3Shortage
→ S1Shortage → S1Excess → QuotaDRebalance → QuotaOffToS1
```

**回傳**：`{ changes: { uid: { 'day_N': value } }, remainingWarnings: [...] }`

- `changes`：所有修正的合計異動，前端 merge 回 `autoPreviewData`
- `remainingWarnings`：無法自動修正的警告（取代前端原有警告列表）

---

## 九、rescanSchedule — 重新掃描

**用途**：班表寫入後（或修正後），對已填班表重新掃描，找出可優化的地方。

**輸入**：`{ yyyyMM, preview, manualOverrides }`

工作 sched 建立順序：Sheets 鎖定 → preview → manualOverrides

**掃描項目**：

### 配額掃描（QuotaDRebalance）

對每對使用者 (A, B)：
- A 的 D 班數 > D 配額（超額）
- B 的 D 班數 < D 配額（不足）且 Off 班數 > Off 配額（可轉換）
- 找到同一天 A 有 D、B 有 Off/S1/W6Off（均未鎖定，B 的班次符合接 D 的體力條件）
- 每對 A-B 最多產生一個警告

### 每日人力需求掃描

逐天對照 Settings 設定值，不足時產生對應警告：

| 日型 | 檢查項目 | 警告類型 |
|---|---|---|
| 平日（isWeekday） | D < wdD | `DShortage` |
| 平日（isWeekday） | N < wdN | `NShortage` |
| 平日（isWeekday） | S1 < wdS1 | `S1Shortage` |
| 假日平日（isHol && !isWeekend） | D < holD | `DShortage` |
| 假日平日（isHol && !isWeekend） | N < holN | `NShortage` |
| 週日（isSun） | D < sunD | `DShortage` |
| 週日（isSun） | N < sunN | `NShortage` |
| 非假日週六（isSat && !isHol） | H3 < satH3 | `H3Shortage` |

> `QuotaOffToS1`（舊版）已從 rescanSchedule 移除，改由 `S1Shortage` 統一處理，避免同日重複修正。

### 碎班掃描（FragmentShift）

`rescanSchedule` 結尾呼叫 `scanFragmentShifts`，與 `autoFillSchedule` 共用同一份規則參數（`forbidFragmentShift` / `fragmentShiftTypes`）。班表寫回後重新掃描時亦能偵測碎班（資訊性，不自動修正）。

**回傳**：`{ warnings: [...] }`
前端以 type+day+userId 為 key 去重後 append 到現有警告列表。

---

## 十、勿值處理對照表

| Step | NO_DN | NO_D | NO_N |
|---|---|---|---|
| stepN | 排除（isWuZhiN） | 可排 N | 排除（isWuZhiN） |
| stepW6 假日/週日 D | 不排（req ≠ 'D'） | 不排 | 可排 D |
| stepW6 假日/週日 N | 不排（req ≠ 'N'） | 可排 N | 不排 |
| stepW6 週六 | H3 或 W6Off ✓ | H3 或 W6Off ✓ | H3 或 W6Off ✓ |
| stepD | 排除（isWuZhiD） | 排除（isWuZhiD） | 可排 D |
| stepOffS1 | 可排 S1 或 Off | 可排 S1 或 Off | 可排 S1 或 Off |
| stepFinalValidate | 檢查 D 和 N | 僅檢查 D | 僅檢查 N |

---

## 十一、輸出格式

### autoFillSchedule 回傳

```json
{
  "success": true,
  "data": {
    "preview": {
      "<userId>": { "day_1": "D", "day_2": "N", "day_3": "Off" }
    },
    "warnings": [
      { "type": "NOffDFail", "message": "...", "userId": "uid", "day": 3 }
    ]
  }
}
```

- `preview` 只包含**非鎖定**且由自動排班新填入的格子
- 前端確認後呼叫 `batchSaveShifts` 寫回 Sheets，並將 `schedulerAdjustments` 存入 ScheduleMeta

---

## 十二、前端預覽互動流程

```
autoFillSchedule
  → autoPreviewData (藍色，自動填入)
  + manualOverrides (橘色，排班者手動修改)
  = mergedPreview (實際預覽狀態)

fixWarning / fixAllWarnings
  → 輸入 mergedPreview 作為基底
  → changes merge 回 autoPreviewData

rescanSchedule
  → 輸入 autoPreviewData + manualOverrides
  → 產生新警告 append（去重）到 autoWarnings

確認填入（confirmAutoFill）
  → batchSaveShifts(mergedPreview)
  → saveScheduleMeta({ schedulerAdjustments: manualOverrides })
  → 清空 autoPreviewData / autoWarnings / manualOverrides
```

**三層顯示規則**：

| 層 | 顏色 | 來源 |
|---|---|---|
| 鎖定 | 灰色 | Sheets 現有班表 |
| 自動填入 | 藍色 | autoPreviewData |
| 手動修改 | 橘色 | manualOverrides（優先於自動填入） |

---

## 十三、Settings 設定值

所有每日人力需求優先讀取**班別管理**（shiftTypes）的 `quota[dayType]` 欄位；若未設定則 fallback 到 Settings sheet 的對應 key。

| 鍵 | 說明 | 預設值 |
|---|---|---|
| `wdD` | 平日每天 D 班需求人數 | 1 |
| `wdN` | 平日每天 N 班需求人數 | 1 |
| `wdS1` | 平日每天 S1 最少人數（rescanSchedule 用） | 2 |
| `holD` | 假日平日 D 班需求人數 | 1 |
| `holN` | 假日平日 N 班需求人數 | 1 |
| `sunD` | 週日 D 班需求人數 | 1 |
| `sunN` | 週日 N 班需求人數 | 1 |
| `satH3` | 非假日週六 H3 需求人數（自動補排） | 2 |
| `autoScheduleRules` | JSON，覆寫 rules 參數 | `""` |

> 週六 D/N 由輪序池預先決定並鎖定，不由 Settings 控制。
