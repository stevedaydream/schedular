<template>
  <div class="min-h-screen bg-gray-50 print:bg-white">
    <NavBar class="print:hidden" />

    <main class="max-w-full px-4 py-6 print:p-0">
      <!-- Header controls -->
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6 print:hidden">
        <MonthSwitcher
          :currentMonth="scheduleStore.currentMonth"
          @change="onMonthChange"
        />

        <div class="flex items-center gap-2 flex-wrap">
          <!-- Auto-filling indicator -->
          <span v-if="autoSchedule.isRunning.value" class="text-sm text-gray-500 flex items-center gap-1.5">
            <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            填入六日輪序中...
          </span>

          <!-- Lock -->
          <div v-if="!scheduleStore.isLocked" class="relative group">
            <button
              @click="handleLock"
              class="btn-secondary flex items-center gap-2"
              :disabled="scheduleStore.loading"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/>
              </svg>
              鎖定班表
            </button>
            <div class="tooltip-box w-60">
              <p class="font-semibold mb-1">🔒 鎖定班表</p>
              <p>確認本月排班後鎖定。鎖定後：</p>
              <ul class="mt-1 space-y-0.5 list-disc list-inside">
                <li>員工無法再提交預約</li>
                <li>六日輪序進度寫入下月起點</li>
                <li>班表進入唯讀模式</li>
              </ul>
            </div>
          </div>

          <!-- Unlock -->
          <div v-else class="relative group">
            <button
              @click="handleUnlock"
              class="btn-danger flex items-center gap-2"
              :disabled="scheduleStore.loading"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/>
              </svg>
              解鎖班表
            </button>
            <div class="tooltip-box w-52">
              <p class="font-semibold mb-1">🔓 解鎖班表</p>
              <p>解除鎖定，允許繼續修改班表與接受員工預約。</p>
              <p class="mt-1 text-yellow-300">⚠ 解鎖不會回退輪序進度。</p>
            </div>
          </div>

          <!-- Reset weekends -->
          <div v-if="!scheduleStore.isLocked" class="relative group">
            <button
              @click="showResetWeekendsConfirm = true"
              :disabled="scheduleStore.loading || resettingWeekends"
              class="btn-secondary text-sm flex items-center gap-1"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              {{ resettingWeekends ? '重排中...' : '重排六日輪序' }}
            </button>
            <div class="tooltip-box w-64">
              <p class="font-semibold mb-1">🔄 重排六日輪序</p>
              <p>清除本月週六／週日的 D、N 班，依目前輪序池重新填入。</p>
              <p class="mt-1 text-gray-300">平日、假日及其他班別不受影響。</p>
              <p class="mt-1 text-gray-300">使用時機：在輪序管理調整順序後套用。</p>
            </div>
          </div>

          <!-- Clear schedule -->
          <div v-if="!scheduleStore.isLocked" class="relative group">
            <button
              @click="showClearConfirm = true"
              :disabled="scheduleStore.loading"
              class="btn-danger text-sm flex items-center gap-1"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
              清除班表
            </button>
            <div class="tooltip-box w-56">
              <p class="font-semibold mb-1">🗑 清除班表</p>
              <p>清除本月全部班別，班表恢復空白。</p>
              <p class="mt-1 text-yellow-300">⚠ 此操作無法復原。</p>
              <p class="mt-1 text-gray-300">清除後六日 D/N 輪序將自動重新填入。</p>
            </div>
          </div>

          <!-- Transfer scheduler -->
          <div class="relative group">
            <button
              @click="showTransferModal = true"
              class="btn-secondary text-sm"
            >
              移交排班者
            </button>
            <div class="tooltip-box w-56">
              <p class="font-semibold mb-1">👤 移交排班者</p>
              <p>將排班者權限轉移給其他人員。</p>
              <p class="mt-1 text-yellow-300">⚠ 移交後您將失去排班功能。</p>
            </div>
          </div>

          <!-- Confirm requests -->
          <div v-if="!scheduleStore.isLocked && pendingRequests.length > 0" class="relative group">
            <button
              @click="handleConfirmRequests"
              :disabled="confirmingRequests"
              class="btn-secondary text-sm flex items-center gap-1.5"
            >
              {{ confirmingRequests ? '確認中...' : `確認 ${pendingRequests.length} 個預約` }}
              <span v-if="disputedCount > 0" class="text-orange-500 font-medium">（{{ disputedCount }} 爭議）</span>
            </button>
            <div class="tooltip-box w-64">
              <p class="font-semibold mb-1">✅ 確認員工預約</p>
              <p>將員工提交的預約（無爭議部分）一鍵填入班表。</p>
              <ul class="mt-1 space-y-0.5 list-disc list-inside text-gray-300">
                <li>藍色格 = 待確認</li>
                <li>橘色格 = 超額爭議，需手動處理</li>
              </ul>
            </div>
          </div>

          <!-- Print -->
          <div class="relative group">
            <button
              @click="printSchedule"
              class="btn-secondary text-sm flex items-center gap-1.5"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
              </svg>
              列印班表
            </button>
            <div class="tooltip-box w-52">
              <p class="font-semibold mb-1">🖨 列印 / 匯出 PDF</p>
              <p>呼叫瀏覽器列印功能。</p>
              <p class="mt-1 text-gray-300">選擇「另存為 PDF」可匯出電子檔。版面自動設為 A4 橫式。</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Print-only header -->
      <div class="hidden print:block mb-4">
        <h1 class="text-lg font-bold text-gray-900">
          {{ scheduleStore.currentMonth.slice(0,4) }}年{{ scheduleStore.currentMonth.slice(4) }}月　排班表
        </h1>
        <p class="text-xs text-gray-500 mt-0.5">列印時間：{{ new Date().toLocaleString('zh-TW') }}</p>
      </div>

      <!-- Locked banner -->
      <div
        v-if="scheduleStore.isLocked"
        class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm flex items-center gap-2 print:hidden"
      >
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/>
        </svg>
        <span>班表已鎖定，僅可查看。如需修改請先解鎖。</span>
      </div>

      <!-- Schedule health indicator -->
      <div
        v-if="health && !scheduleStore.loading"
        class="mb-4 p-3 bg-white border border-gray-200 rounded-lg flex flex-wrap items-center justify-between gap-3 text-sm print:hidden"
      >
        <div class="flex items-center gap-4">
          <span class="font-medium text-gray-700">
            {{ scheduleStore.currentMonth.slice(0,4) }}年{{ scheduleStore.currentMonth.slice(4) }}月班表
          </span>
          <span class="flex items-center gap-1">
            <span class="text-blue-600 font-semibold">● 完成度 {{ health.completionRate }}%</span>
          </span>
          <span v-if="health.anomalies.length" class="text-amber-600">
            ⚠ {{ health.anomalies.length }} 處人力異常
          </span>
          <span v-if="health.overQuota.length" class="text-red-600">
            ✗ {{ health.overQuota.length }} 人配額異常
          </span>
          <span v-if="!health.anomalies.length && !health.overQuota.length" class="text-green-600">
            ✓ 全部正常
          </span>
        </div>
        <div class="flex gap-2">
          <button
            v-if="health.anomalies.length || health.overQuota.length"
            @click="showHealthModal = true"
            class="text-xs text-blue-600 hover:underline"
          >
            查看異常清單
          </button>
          <button
            v-if="!scheduleStore.isLocked"
            @click="handleLock"
            class="btn-primary text-xs px-3 py-1"
            :disabled="scheduleStore.loading"
          >
            確認鎖定
          </button>
        </div>
      </div>

      <!-- Monthly shift summary -->
      <div
        v-if="monthSummary && !scheduleStore.loading"
        class="mb-4 px-4 py-3 bg-white border border-gray-200 rounded-lg print:hidden"
      >
        <div class="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
          <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide">本月預計</span>
          <div class="flex items-baseline gap-1.5">
            <span class="w-5 h-5 inline-flex items-center justify-center text-xs font-bold bg-blue-100 text-blue-700 rounded">D</span>
            <span class="font-semibold text-gray-800">{{ monthSummary.D }}</span>
            <span class="text-gray-400 text-xs">班　均 {{ monthSummary.avgD }}/人</span>
          </div>
          <div class="flex items-baseline gap-1.5">
            <span class="w-5 h-5 inline-flex items-center justify-center text-xs font-bold bg-indigo-100 text-indigo-700 rounded">N</span>
            <span class="font-semibold text-gray-800">{{ monthSummary.N }}</span>
            <span class="text-gray-400 text-xs">班　均 {{ monthSummary.avgN }}/人</span>
          </div>
          <div class="flex items-baseline gap-1.5">
            <span class="w-5 h-5 inline-flex items-center justify-center text-xs font-bold bg-gray-100 text-gray-500 rounded">Off</span>
            <span class="font-semibold text-gray-800">{{ monthSummary.Off }}</span>
            <span class="text-gray-400 text-xs">天　均 {{ monthSummary.avgOff }}/人</span>
          </div>
          <div class="flex items-baseline gap-1.5">
            <span class="w-5 h-5 inline-flex items-center justify-center text-xs font-bold bg-green-100 text-green-700 rounded">W6</span>
            <span class="font-semibold text-gray-800">{{ monthSummary.W6Off }}</span>
            <span class="text-gray-400 text-xs">天　均 {{ monthSummary.avgW6Off }}/人</span>
          </div>
        </div>
      </div>

      <!-- 輪序管理面板（排班者 / 超管） -->
      <div
        v-if="canManageRotation && !scheduleStore.isLocked"
        class="mb-4 bg-white border border-gray-200 rounded-lg print:hidden"
      >
        <!-- Header row -->
        <div class="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-2 justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">配額輪序管理</span>
            <span v-if="offLocked" class="text-xs text-amber-600 flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">🔒 已鎖定</span>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <button
              @click="svCalcOff"
              :disabled="svOffLoading"
              :class="svResetApplied ? 'bg-orange-500 hover:bg-orange-600 text-white text-xs px-2.5 py-1 rounded font-medium transition-colors' : 'btn-primary text-xs px-2.5 py-1'"
            >{{ svOffLoading ? '計算中...' : svResetApplied ? '重新計算並推進輪序' : '計算配額' }}</button>
            <template v-if="svOffPreview.length > 0">
              <button
                v-if="!offLocked"
                @click="svShowApplyConfirm = true"
                :disabled="svOffApplying"
                class="btn-secondary text-xs px-2.5 py-1"
              >{{ svOffApplying ? '帶入中...' : '帶入配額' }}</button>
              <button
                v-if="!offLocked"
                @click="svShowCommitConfirm = true"
                :disabled="svOffCommitting"
                class="btn-secondary text-xs px-2.5 py-1"
              >{{ svOffCommitting ? '結算中...' : '結算' }}</button>
            </template>
          </div>
        </div>

        <!-- Interaction hint + unlock toggle -->
        <div class="px-4 py-2 flex items-center justify-between gap-2 border-b border-gray-100">
          <span class="text-xs text-gray-400">
            {{ svAnyOrderLocked ? '輪序已鎖定（防誤觸）' : '點擊代號設為起點，或拖曳旋轉順序' }}
          </span>
          <div class="flex items-center gap-1.5 shrink-0">
            <button
              v-if="svAnyOrderLocked"
              @click="svUnlockAll"
              class="text-xs px-2 py-0.5 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors"
            >解鎖修改</button>
            <button
              @click="svResetAllOrders"
              class="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 transition-colors"
              title="清除歷史輪序紀錄，以現有人員名單重新開始"
            >重設輪序</button>
          </div>
        </div>

        <!-- Rotation order display: 4 rows, one per shift type -->
        <div class="px-4 py-3 space-y-1.5">
          <div v-for="st in ['D','N','Off','W6Off']" :key="st">
            <!-- Chip row -->
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-gray-400 w-10 shrink-0">{{ st }}</span>
              <div
                class="flex gap-1 overflow-hidden select-none"
                :class="svOrderLocked[st]
                  ? 'opacity-50'
                  : svDraggingShift === st ? 'cursor-grabbing' : 'cursor-grab'"
                @mousedown="!svOrderLocked[st] && svDragStart(st, $event)"
                @touchstart.prevent="!svOrderLocked[st] && svDragStart(st, $event)"
              >
                <div
                  v-for="uid in svGetDisplayOrder(st)"
                  :key="uid"
                  :title="svOrderLocked[st] ? getUserName(uid) : getUserName(uid) + '（點擊設為起點）'"
                  :class="[
                    'w-7 h-7 rounded text-xs font-mono font-bold flex items-center justify-center border select-none transition-colors',
                    svPendingReset?.st === st && svPendingReset?.newOrder[0] === uid
                      ? 'ring-2 ring-offset-1 ring-blue-400'
                      : '',
                    svIsStart(st, uid) ? 'bg-blue-500 text-white border-blue-600'
                    : svIsEnd(st, uid) ? 'bg-orange-400 text-white border-orange-500'
                    : svIsFullCycleEnd(st, uid) ? 'bg-green-400 text-white border-green-500'
                    : 'bg-gray-100 text-gray-600 border-gray-200'
                  ]"
                  @click.stop="!svOrderLocked[st] && svChipClick(st, uid)"
                >{{ getUserCode(uid) || '?' }}</div>
              </div>
              <span v-if="svGetExtras(st) > 0" class="text-xs text-gray-400 shrink-0">+{{ svGetExtras(st) }}</span>
              <span v-else-if="svOffPreview.length > 0" class="text-xs text-green-500 shrink-0" title="均等整除，下月從同一起點開始">↺</span>
              <span v-if="svOrderLocked[st]" class="text-amber-500 shrink-0 text-xs">🔒</span>
            </div>
            <!-- Inline confirm banner -->
            <div
              v-if="svPendingReset?.st === st"
              class="mt-1 ml-12 flex items-center gap-2 py-1 px-2 bg-blue-50 rounded border border-blue-200"
            >
              <span class="text-xs text-gray-700">
                以 <span class="font-mono font-bold text-blue-600">{{ getUserCode(svPendingReset.newOrder[0]) }}</span>
                為「{{ st }}」輪序起點？
              </span>
              <button @click="svDoConfirmReset" class="text-xs px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors shrink-0">確認</button>
              <button @click="svCancelPendingReset" class="text-xs px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-100 transition-colors shrink-0">取消</button>
            </div>
          </div>
        </div>

        <!-- Pending action hint -->
        <div
          v-if="svOffPreview.length > 0 && !offLocked"
          class="mx-4 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 flex items-center gap-1.5"
        >
          <span>⚠</span>
          <span>配額已試算，尚未<strong>帶入班表</strong>或<strong>結算</strong></span>
        </div>

        <div v-if="svOffError" class="px-4 pb-3 text-xs text-red-600">{{ svOffError }}</div>
        <div v-if="svOffApplyOk" class="px-4 pb-3 text-xs text-green-600">✓ 配額已套用到班表</div>
      </div>

      <!-- 輪序結果備查 -->
      <div
        v-if="scheduleStore.meta?.rotationRecord"
        class="mb-4 bg-white border border-gray-200 rounded-lg print:hidden"
      >
        <button
          @click="showRotationRecord = !showRotationRecord"
          class="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 transition-colors rounded-lg"
        >
          <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide">輪序備查</span>
          <span class="text-gray-400 text-xs">{{ showRotationRecord ? '▲ 收折' : '▼ 展開' }}</span>
        </button>
        <div v-if="showRotationRecord" class="px-4 pb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div v-for="st in ['D','N','Off','W6Off']" :key="st"
            class="border border-gray-200 rounded overflow-hidden">
            <div class="bg-gray-50 px-2 py-1 flex items-center justify-between border-b border-gray-200">
              <span class="text-xs font-semibold text-gray-700">{{ st }}</span>
              <span class="text-xs text-gray-400">+{{ scheduleStore.meta.rotationRecord[st]?.extras ?? 0 }}人</span>
            </div>
            <ul class="divide-y divide-gray-100">
              <li v-for="(uid, idx) in scheduleStore.meta.rotationRecord[st]?.order" :key="uid"
                class="flex items-center gap-1 px-2 py-0.5 text-xs"
                :class="
                  uid === scheduleStore.meta.rotationRecord[st].startUserId ? 'bg-blue-50'
                  : uid === scheduleStore.meta.rotationRecord[st].endUserId ? 'bg-orange-50'
                  : ''
                "
              >
                <span class="w-3.5 text-center font-mono shrink-0"
                  :class="uid === scheduleStore.meta.rotationRecord[st].startUserId ? 'text-blue-500 font-bold'
                    : uid === scheduleStore.meta.rotationRecord[st].endUserId ? 'text-orange-400 font-bold'
                    : 'text-gray-300'">
                  {{ uid === scheduleStore.meta.rotationRecord[st].startUserId ? '▶'
                     : uid === scheduleStore.meta.rotationRecord[st].endUserId ? '◀'
                     : idx + 1 }}
                </span>
                <span class="flex-1 text-gray-700 truncate">{{ getUserName(uid) }}</span>
                <span v-if="uid === scheduleStore.meta.rotationRecord[st].startUserId" class="text-blue-400 shrink-0">起</span>
                <span v-else-if="uid === scheduleStore.meta.rotationRecord[st].endUserId" class="text-orange-400 shrink-0">終</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Health anomaly modal -->
      <div
        v-if="showHealthModal"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      >
        <div class="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
          <h3 class="text-lg font-semibold mb-4">班表異常清單</h3>
          <div v-if="health.overQuota.length" class="mb-4">
            <h4 class="text-sm font-medium text-gray-700 mb-2">個人配額異常</h4>
            <ul class="space-y-1 text-sm">
              <li v-for="(item, i) in health.overQuota" :key="i"
                :class="item.diff > 0 ? 'text-red-600' : 'text-orange-600'"
              >
                {{ item.diff > 0 ? '✗' : '⚠' }}
                {{ getUserName(item.userId) }}：{{ item.type }}班 {{ item.actual }} 個
                （配額 {{ item.quota }} 個），差 {{ item.diff > 0 ? '+' : '' }}{{ item.diff }}
              </li>
            </ul>
          </div>
          <div v-if="health.anomalies.length">
            <h4 class="text-sm font-medium text-gray-700 mb-2">每日人力異常</h4>
            <ul class="space-y-1 text-sm text-amber-700">
              <li v-for="(item, i) in health.anomalies" :key="i">
                ⚠ {{ scheduleStore.currentMonth.slice(4) }}/{{ item.day }}：
                {{ item.shift }}班 {{ item.actual }} 人（需求 {{ item.required }} 人）
              </li>
            </ul>
          </div>
          <div class="flex justify-end mt-4">
            <button @click="showHealthModal = false" class="btn-secondary">關閉</button>
          </div>
        </div>
      </div>

      <!-- Conflict report -->
      <ConflictReport
        v-if="autoSchedule.conflictReport.value.length > 0"
        :conflicts="autoSchedule.conflictReport.value"
        :users="settingsStore.users"
        class="mb-4"
      />

      <!-- Error message -->
      <div
        v-if="scheduleStore.error || autoSchedule.error.value"
        class="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700"
      >
        {{ scheduleStore.error || autoSchedule.error.value }}
      </div>

      <!-- Loading -->
      <div v-if="scheduleStore.loading" class="text-center py-12 text-gray-500">
        載入班表中...
      </div>

      <!-- Schedule Grid -->
      <ScheduleGrid
        v-else
        :scheduleData="scheduleStore.scheduleData"
        :users="settingsStore.users"
        :holidays="holidays"
        :settings="settingsStore.settings"
        :currentMonth="scheduleStore.currentMonth"
        :meta="scheduleStore.meta"
        :isEditable="!scheduleStore.isLocked"
        :requestData="requestStore.requestData"
        @update-shift="handleUpdateShift"
        @reorder-users="handleReorderUsers"
      />

      <!-- Request comparison panel -->
      <div v-if="!scheduleStore.loading" class="mt-4 print:hidden">
        <button
          @click="showRequestPanel = !showRequestPanel"
          class="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <svg class="w-4 h-4 transition-transform" :class="showRequestPanel ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
          {{ showRequestPanel ? '隱藏' : '顯示' }}預約班表對照
          <span class="text-xs text-gray-400">
            （{{ Object.keys(requestStore.requestData).filter(uid => Object.entries(requestStore.requestData[uid]).some(([k,v]) => k.startsWith('day_') && v)).length }} 人已提交預約）
          </span>
        </button>

        <div v-if="showRequestPanel" class="card overflow-x-auto">
          <div class="flex items-center gap-3 mb-3">
            <h4 class="text-sm font-semibold text-gray-700">員工預約班表</h4>
            <span class="text-xs text-gray-400">藍色＝待確認　橘色＝爭議（超額）　綠色✓＝已填入班表</span>
          </div>
          <table class="text-xs border-collapse" style="min-width: max-content">
            <thead>
              <tr>
                <th class="sticky left-0 z-10 bg-gray-100 border border-gray-200 px-3 py-1.5 text-left font-medium min-w-[100px]">姓名</th>
                <th
                  v-for="dayInfo in requestMonthDays"
                  :key="dayInfo.day"
                  :class="[
                    'border border-gray-200 text-center font-medium min-w-[36px] px-1 py-1',
                    dayInfo.dayOfWeek === 6 ? 'bg-blue-50 text-blue-700' : dayInfo.dayOfWeek === 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'
                  ]"
                >
                  <div>{{ dayInfo.day }}</div>
                  <div class="text-gray-400 font-normal">{{ ['日','一','二','三','四','五','六'][dayInfo.dayOfWeek] }}</div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="user in requestSortedUsers"
                :key="user.userId"
                class="hover:bg-gray-50/50"
              >
                <td class="sticky left-0 z-10 bg-white border border-gray-200 px-3 py-1 font-medium text-gray-800 whitespace-nowrap">
                  <span v-if="user.code" class="inline-block font-mono text-xs bg-gray-100 text-gray-500 rounded px-1 mr-1">{{ user.code }}</span>{{ user.name }}
                </td>
                <td
                  v-for="dayInfo in requestMonthDays"
                  :key="dayInfo.day"
                  class="border border-gray-200 p-0 relative"
                >
                  <div
                    v-if="getReqShift(user.userId, dayInfo.day)"
                    :class="[
                      'text-xs font-medium text-center py-1 px-0.5 min-h-[28px] flex items-center justify-center',
                      isReqDisputed(user.userId, dayInfo.day)
                        ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-300 ring-inset'
                        : getReqShift(user.userId, dayInfo.day) === scheduleStore.scheduleData[user.userId]?.['day_' + dayInfo.day]
                          ? 'bg-green-50 text-green-700'
                          : 'bg-blue-50 text-blue-700'
                    ]"
                    :title="isReqDisputed(user.userId, dayInfo.day) ? '爭議：同一班別預約人數超額' : ''"
                  >
                    {{ getReqShift(user.userId, dayInfo.day) }}
                    <span v-if="isReqDisputed(user.userId, dayInfo.day)" class="ml-0.5 text-orange-500">!</span>
                  </div>
                  <div v-else class="min-h-[28px]"></div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- Transfer modal -->
    <div
      v-if="showTransferModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 class="text-lg font-semibold mb-4">移交排班者角色</h3>
        <p class="text-sm text-gray-500 mb-4">選擇要移交給的人員：</p>
        <select v-model="transferTarget" class="input-field mb-4">
          <option value="">請選擇</option>
          <option
            v-for="user in transferableUsers"
            :key="user.userId"
            :value="user.userId"
          >
            {{ user.name }}（{{ user.email }}）
          </option>
        </select>
        <div class="flex gap-2 justify-end">
          <button @click="showTransferModal = false" class="btn-secondary">取消</button>
          <button @click="handleTransfer" :disabled="!transferTarget" class="btn-primary">確認移交</button>
        </div>
      </div>
    </div>
    <!-- Reset weekends confirm modal -->
    <div
      v-if="showResetWeekendsConfirm"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <div class="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h3 class="text-lg font-semibold mb-2">重排六日輪序</h3>
        <p class="text-gray-600 mb-1 text-sm">
          將清除 <strong>{{ scheduleStore.currentMonth.slice(0,4) }} 年 {{ scheduleStore.currentMonth.slice(4) }} 月</strong> 所有週六、週日的 D / N 班別，並依目前輪序池重新填入。
        </p>
        <p class="text-gray-400 text-xs mb-1">平日、假日及其他班別不受影響。</p>
        <p class="text-amber-600 text-xs mb-4">⚠ 若後續月份已自動填入，重排後需一併對那些月份執行「重排六日輪序」。</p>
        <div class="flex gap-2 justify-end">
          <button @click="showResetWeekendsConfirm = false" class="btn-secondary">取消</button>
          <button @click="handleResetWeekends" class="btn-primary">確認重排</button>
        </div>
      </div>
    </div>

    <!-- Clear schedule confirm modal -->
    <div
      v-if="showClearConfirm"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <div class="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h3 class="text-lg font-semibold mb-2 text-red-600">確認清除班表</h3>
        <p class="text-gray-600 mb-1 text-sm">
          將清除 <strong>{{ scheduleStore.currentMonth.slice(0,4) }} 年 {{ scheduleStore.currentMonth.slice(4) }} 月</strong> 所有班別資料。
        </p>
        <p class="text-red-500 text-xs mb-4">此操作無法復原，請確認後再執行。</p>
        <div class="flex gap-2 justify-end">
          <button @click="showClearConfirm = false" class="btn-secondary">取消</button>
          <button @click="handleClear" :disabled="clearing" class="btn-danger">
            {{ clearing ? '清除中...' : '確認清除' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Rotation: Apply quota confirm -->
    <div v-if="svShowApplyConfirm" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h3 class="text-lg font-semibold mb-2">帶入配額到班表</h3>
        <p class="text-sm text-gray-600 mb-4">
          將計算出的 D / N / Off / W6Off 配額套用到 {{ scheduleStore.currentMonth.slice(0,4) }} 年 {{ scheduleStore.currentMonth.slice(4) }} 月。
          此操作不更新累計餘數，可重複執行。
        </p>
        <div class="flex gap-2 justify-end">
          <button @click="svShowApplyConfirm = false" class="btn-secondary">取消</button>
          <button @click="svApplyQuota" class="btn-primary">確認帶入</button>
        </div>
      </div>
    </div>

    <!-- Rotation: Commit confirm -->
    <div v-if="svShowCommitConfirm" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h3 class="text-lg font-semibold mb-2">結算本月輪序</h3>
        <p class="text-sm text-gray-600 mb-1">
          將 {{ scheduleStore.currentMonth.slice(0,4) }} 年 {{ scheduleStore.currentMonth.slice(4) }} 月的分配結果寫入累計餘數，作為下次輪序的基準。
        </p>
        <p class="text-xs text-amber-600 mb-4">⚠ 結算後輪序將鎖定，如需重算需先重設起點。</p>
        <div class="flex gap-2 justify-end">
          <button @click="svShowCommitConfirm = false" class="btn-secondary">取消</button>
          <button @click="svCommit" class="btn-primary">確認結算</button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useScheduleStore } from '../stores/schedule.js'
import { useSettingsStore } from '../stores/settings.js'
import { useAuthStore } from '../stores/auth.js'
import { useRequestStore } from '../stores/request.js'
import { api } from '../api/gas.js'
import { useAutoSchedule } from '../composables/useAutoSchedule.js'
import { useShiftTypesStore } from '../stores/shiftTypes.js'
import { useHoliday } from '../composables/useHoliday.js'
import { calcScheduleHealth, getRequiredCount } from '../utils/shiftCalc.js'
import { getMonthDays, getDayType, DAY_NAMES, addMonths, getCurrentYYYYMM } from '../utils/dateHelper.js'
import NavBar from '../components/common/NavBar.vue'
import MonthSwitcher from '../components/common/MonthSwitcher.vue'
import ScheduleGrid from '../components/schedule/ScheduleGrid.vue'
import ConflictReport from '../components/schedule/ConflictReport.vue'

const scheduleStore = useScheduleStore()
const settingsStore = useSettingsStore()
const authStore = useAuthStore()
const shiftTypesStore = useShiftTypesStore()
const requestStore = useRequestStore()
const autoSchedule = useAutoSchedule(scheduleStore, settingsStore)
const { holidays, fetchHolidays } = useHoliday()

const showTransferModal = ref(false)
const transferTarget = ref('')
const showHealthModal = ref(false)
const showRotationRecord = ref(false)
const showClearConfirm = ref(false)
const clearing = ref(false)
const showRequestPanel = ref(false)
const confirmingRequests = ref(false)

// All non-disputed requests (ready to be bulk-confirmed)
const pendingRequests = computed(() => {
  const shifts = []
  settingsStore.users.forEach(user => {
    const userReqs = requestStore.requestData[user.userId]
    if (!userReqs) return
    const overBooked = userReqs.overBooked || []
    Object.entries(userReqs).forEach(([key, val]) => {
      if (!key.startsWith('day_') || !val) return
      const day = parseInt(key.slice(4))
      if (overBooked.includes(String(day)) || overBooked.includes(day)) return
      shifts.push({ userId: user.userId, day, shift: val })
    })
  })
  return shifts
})

const disputedCount = computed(() => {
  let n = 0
  settingsStore.users.forEach(user => {
    n += (requestStore.requestData[user.userId]?.overBooked || []).length
  })
  return n
})

const monthSummary = computed(() => {
  const activeUsers = settingsStore.users.filter(
    u => u.isActive !== false && u.isActive !== 'false'
  ).length
  if (activeUsers === 0) return null

  const s = settingsStore.settings
  const dayInfos = getMonthDays(scheduleStore.currentMonth)
  const holidayList = holidays.value || []

  let D = 0, N = 0, Off = 0, W6Off = 0

  const req = (shiftId, dayType) =>
    shiftTypesStore.getRequiredCount(shiftId, dayType)
    ?? getRequiredCount(shiftId, dayType, s)
    ?? 0

  dayInfos.forEach(({ dateStr, dayOfWeek }) => {
    const dayType = getDayType(dateStr, holidayList)

    D += req('D', dayType)
    N += req('N', dayType)

    // 該日所有「值勤」班別需求人數總和（排除 Off / W6Off 本身）
    const totalRequired = shiftTypesStore.activeTypes
      .filter(t => t.id !== 'Off' && t.id !== 'W6Off' && shiftTypesStore.isApplicable(t.id, dayType))
      .reduce((sum, t) => sum + req(t.id, dayType), 0)

    const remainder = Math.max(0, activeUsers - totalRequired)
    // Off = 所有可休假天數（含六日假日）
    Off += remainder
    // W6Off = 星期六的可休假天數（含六+假日，以實際星期幾判斷）
    if (dayOfWeek === 6) W6Off += remainder
  })

  const avg = (n) => (n / activeUsers).toFixed(1)
  return { activeUsers, D, N, Off, W6Off, avgD: avg(D), avgN: avg(N), avgOff: avg(Off), avgW6Off: avg(W6Off) }
})

const health = computed(() => {
  const yyyyMM = scheduleStore.currentMonth
  if (!yyyyMM || !settingsStore.settings) return null
  const dayInfos = getMonthDays(yyyyMM).map(d => ({
    ...d,
    dayType: getDayType(d.dateStr, holidays.value || [])
  }))
  return calcScheduleHealth(
    scheduleStore.scheduleData,
    scheduleStore.meta?.offQuota || {},
    settingsStore.settings,
    dayInfos
  )
})

function getUserName(userId) {
  return settingsStore.users.find(u => u.userId === userId)?.name || userId
}

const transferableUsers = computed(() =>
  settingsStore.users.filter(
    u => u.userId !== authStore.user?.userId && u.isActive !== false
  )
)

function isScheduleEmpty(data) {
  if (!data || Object.keys(data).length === 0) return true
  return Object.values(data).every(row =>
    Object.entries(row).every(([k, v]) => !k.startsWith('day_') || !v)
  )
}

/**
 * 推進輪序池指針 1 格（模擬指派一人）
 */
function advanceSimPool(pools, poolName) {
  const pool = pools[poolName]
  if (!pool || !pool.order || pool.order.length === 0) return
  if (pool.skipQueue && pool.skipQueue.length > 0) {
    pool.skipQueue = pool.skipQueue.slice(1)
  } else {
    pool.lastIndex = ((pool.lastIndex ?? -1) + 1) % pool.order.length
  }
}

/**
 * 純日期推算：模擬 months 陣列裡每個月的六日輪序推進，
 * 回傳模擬後的 pools（不呼叫 GAS、不寫入任何資料）。
 */
function simulatePoolsThrough(pools, months) {
  const sim = JSON.parse(JSON.stringify(pools))
  months.forEach(yyyyMM => {
    const yr = yyyyMM.slice(0, 4)
    const monthHolidays = holidays.value?.filter(h => h.date.startsWith(yr)) || []
    getMonthDays(yyyyMM).forEach(({ dateStr }) => {
      const dayType = getDayType(dateStr, monthHolidays)
      if (dayType === 'saturday') {
        advanceSimPool(sim, 'satD')
        advanceSimPool(sim, 'satN')
      } else if (dayType === 'sunday') {
        advanceSimPool(sim, 'sunD')
        advanceSimPool(sim, 'sunN')
      } else if (dayType === 'holiday') {
        advanceSimPool(sim, 'holD')
        advanceSimPool(sim, 'holN')
      }
    })
  })
  return sim
}

/**
 * 取得填入 yyyyMM 時應使用的輪序起點：
 * 1. 往回最多查 6 個月，找最近一個有 proposedPools 的月份作為基準
 * 2. 基準到 yyyyMM 之間的空缺月份，用日期推算模擬補齊
 * 3. 找不到任何基準 → 直接用 RotationPools（最後鎖定狀態）
 */
async function getEffectiveRotationPools(yyyyMM) {
  let basePools = null
  let baseMonth = null

  let checkMonth = addMonths(yyyyMM, -1)
  for (let i = 0; i < 6; i++) {
    try {
      const result = await api.getSchedule({ yyyyMM: checkMonth })
      if (result.success && result.data.meta?.proposedPools) {
        const proposed = typeof result.data.meta.proposedPools === 'string'
          ? JSON.parse(result.data.meta.proposedPools)
          : result.data.meta.proposedPools
        if (proposed && Object.keys(proposed).length > 0) {
          basePools = proposed
          baseMonth = checkMonth
          break
        }
      }
    } catch (_) { /* continue */ }
    checkMonth = addMonths(checkMonth, -1)
  }

  if (!basePools) {
    // 找不到任何 proposedPools → 用 RotationPools 直接填（無法推算起點月份，跳過模擬）
    await settingsStore.fetchRotationPools()
    const map = {}
    settingsStore.rotationPools.forEach(p => { map[p.poolName] = p })
    return map
  }

  // 收集 baseMonth 之後、yyyyMM 之前的空缺月份，用純日期推算補齊輪序進度
  const gapMonths = []
  let curr = addMonths(baseMonth, 1)
  for (let safety = 0; curr !== yyyyMM && safety < 24; safety++) {
    gapMonths.push(curr)
    curr = addMonths(curr, 1)
  }

  return gapMonths.length > 0 ? simulatePoolsThrough(basePools, gapMonths) : basePools
}

// Returns true only if NO weekend (sat/sun) cell has a D or N assignment yet
function isWeekendsEmpty(data, yyyyMM) {
  const weekendKeys = getMonthDays(yyyyMM)
    .filter(({ dateStr }) => {
      const t = getDayType(dateStr, holidays.value)
      return t === 'saturday' || t === 'sunday'
    })
    .map(({ day }) => `day_${day}`)
  return !Object.values(data).some(row =>
    weekendKeys.some(k => row[k] === 'D' || row[k] === 'N')
  )
}

async function autoFillWeekends() {
  if (scheduleStore.isLocked) return
  if (scheduleStore.meta?.weekendFilled) return           // already intentionally filled
  if (!isWeekendsEmpty(scheduleStore.scheduleData, scheduleStore.currentMonth)) return
  const pools = await getEffectiveRotationPools(scheduleStore.currentMonth)
  await autoSchedule.runAutoSchedule(pools)
}

const resettingWeekends = ref(false)
const showResetWeekendsConfirm = ref(false)

async function handleResetWeekends() {
  resettingWeekends.value = true
  showResetWeekendsConfirm.value = false
  try {
    const yyyyMM = scheduleStore.currentMonth
    // Step 1: clear all weekend D/N cells in current schedule
    const clearShifts = []
    getMonthDays(yyyyMM).forEach(({ day, dateStr }) => {
      const dayType = getDayType(dateStr, holidays.value)
      if (dayType !== 'saturday' && dayType !== 'sunday') return
      Object.entries(scheduleStore.scheduleData).forEach(([userId, row]) => {
        const shift = row[`day_${day}`]
        if (shift === 'D' || shift === 'N') {
          clearShifts.push({ userId, day, shift: null })
        }
      })
    })
    if (clearShifts.length > 0) {
      await api.batchSaveShifts({ yyyyMM, shifts: clearShifts, updatedPools: null })
    }
    // Step 2: re-run rotation starting from previous month's proposed state
    const pools = await getEffectiveRotationPools(yyyyMM)
    await autoSchedule.runAutoSchedule(pools)
    await scheduleStore.fetchSchedule(yyyyMM)
  } finally {
    resettingWeekends.value = false
  }
}

onMounted(async () => {
  // Default to next month so scheduler starts on the month they're about to arrange
  const yyyyMM = addMonths(getCurrentYYYYMM(), 1)
  await Promise.all([
    settingsStore.fetchSettings(),
    settingsStore.fetchUsers(),
    scheduleStore.fetchSchedule(yyyyMM),
    requestStore.fetchRequests(yyyyMM),
    shiftTypesStore.fetchShiftTypes()
  ])
  const year = parseInt(yyyyMM.slice(0, 4))
  await fetchHolidays(year)
  await autoFillWeekends()
  if (canManageRotation.value && !scheduleStore.isLocked) {
    await svInitOrderFromRecord(yyyyMM) // rotation order (chip display) — must finish before svCalcOff
    svCalcOff()                         // extras count + quota preview — fire-and-forget
  }
})

async function onMonthChange(yyyyMM) {
  // Reset rotation panel state when switching months
  svOffPreview.value = []
  svResetOrders.value = { D: [], N: [], Off: [], W6Off: [] }
  svResetModified.value = { D: false, N: false, Off: false, W6Off: false }
  svOrderLocked.value = { D: false, N: false, Off: false, W6Off: false }
  svPendingReset.value = null
  offLocked.value = false

  await Promise.all([
    scheduleStore.fetchSchedule(yyyyMM),
    requestStore.fetchRequests(yyyyMM)
  ])
  const year = parseInt(yyyyMM.slice(0, 4))
  await fetchHolidays(year)
  // C: Do NOT auto-fill weekends on month switch — only auto-fill on first mount.
  // Manual re-fill is always available via the 重排六日 button.
  if (canManageRotation.value && !scheduleStore.isLocked) {
    await svInitOrderFromRecord(yyyyMM) // rotation order (chip display) — must finish before svCalcOff
    svCalcOff()                         // extras count + quota preview — fire-and-forget
  }
}

async function handleUpdateShift({ userId, day, shift }) {
  await scheduleStore.saveShift(userId, day, shift)
}

function handleReorderUsers(updates) {
  // Optimistically update local state
  updates.forEach(({ userId, sortOrder }) => {
    const user = settingsStore.users.find(u => u.userId === userId)
    if (user) user.sortOrder = sortOrder
  })
  // Persist each changed user in background
  updates.forEach(({ userId, sortOrder }) => {
    settingsStore.updateUser({ userId, sortOrder })
  })
}

function printSchedule() {
  window.print()
}

async function handleLock() {
  await scheduleStore.lockSchedule(scheduleStore.currentMonth)
}

async function handleUnlock() {
  await scheduleStore.unlockSchedule(scheduleStore.currentMonth)
}

async function handleClear() {
  clearing.value = true
  const ok = await scheduleStore.clearSchedule(scheduleStore.currentMonth)
  clearing.value = false
  if (ok) {
    showClearConfirm.value = false
    await autoFillWeekends()
  }
}

// Request panel helpers
const requestMonthDays = computed(() => getMonthDays(scheduleStore.currentMonth))
const requestSortedUsers = computed(() =>
  [...settingsStore.users]
    .filter(u => u.isActive !== false && u.isActive !== 'false')
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
)
function getReqShift(userId, day) {
  return requestStore.requestData[userId]?.[`day_${day}`] || null
}
function isReqDisputed(userId, day) {
  const ob = requestStore.requestData[userId]?.overBooked || []
  return ob.includes(String(day)) || ob.includes(day)
}

async function handleConfirmRequests() {
  if (pendingRequests.value.length === 0) return
  confirmingRequests.value = true
  try {
    const result = await api.batchSaveShifts({
      yyyyMM: scheduleStore.currentMonth,
      shifts: pendingRequests.value,
      updatedPools: null
    })
    if (result.success) {
      await scheduleStore.fetchSchedule(scheduleStore.currentMonth)
    }
  } finally {
    confirmingRequests.value = false
  }
}

async function handleTransfer() {
  if (!transferTarget.value) return
  const result = await api.transferScheduler({ targetUserId: transferTarget.value })
  if (result.success) {
    showTransferModal.value = false
    transferTarget.value = ''
    // Refresh user list
    await settingsStore.fetchUsers()
  }
}

// ── 輪序管理（排班者 / 超管）────────────────────────────────
const canManageRotation = computed(() => {
  const role = authStore.user?.role
  return role === 'superadmin' || role === 'scheduler'
})

function getUserCode(userId) {
  return settingsStore.users.find(u => u.userId === userId)?.code || ''
}

const svActiveUsers = computed(() =>
  [...settingsStore.users]
    .filter(u => u.isActive !== false && u.isActive !== 'false')
    .sort((a, b) => (parseInt(a.sortOrder) || 0) - (parseInt(b.sortOrder) || 0))
)

// State
const svOffLoading = ref(false)
const svOffApplying = ref(false)
const svOffCommitting = ref(false)
const svOffError = ref(null)
const svOffApplyOk = ref(false)
const svOffPreview = ref([])
const svMonthTotals = ref({ D: 0, N: 0, Off: 0, W6Off: 0 })
const offLocked = ref(false)
const svResetApplied = ref(false)
const svResetOrders = ref({ D: [], N: [], Off: [], W6Off: [] })
const svResetModified = ref({ D: false, N: false, Off: false, W6Off: false })
const svShowApplyConfirm = ref(false)
const svShowCommitConfirm = ref(false)

// Drag-to-rotate state
const svOrderLocked = ref({ D: false, N: false, Off: false, W6Off: false })
const svPendingReset = ref(null)   // { st, newOrder: [...userIds] }
const svDraggingShift = ref(null)  // shift type currently being dragged
const svDragRotation = ref(0)      // rotation offset in chip positions
let svIsDragging = false           // whether drag threshold was exceeded

const svAnyOrderLocked = computed(() => Object.values(svOrderLocked.value).some(v => v))

function svComputeTotals(yyyyMM, activeCount) {
  if (!yyyyMM || activeCount === 0) return { D: 0, N: 0, Off: 0, W6Off: 0 }
  const s = settingsStore.settings
  let d = 0, n = 0, off = 0, w6off = 0
  getMonthDays(yyyyMM).forEach(({ dateStr, dayOfWeek }) => {
    const dayType = getDayType(dateStr, holidays.value || [])
    d += shiftTypesStore.getRequiredCount('D', dayType) ?? getRequiredCount('D', dayType, s) ?? 0
    n += shiftTypesStore.getRequiredCount('N', dayType) ?? getRequiredCount('N', dayType, s) ?? 0
    const totalRequired = shiftTypesStore.activeTypes
      .filter(t => t.id !== 'Off' && t.id !== 'W6Off' && shiftTypesStore.isApplicable(t.id, dayType))
      .reduce((sum, t) => sum + (shiftTypesStore.getRequiredCount(t.id, dayType) ?? getRequiredCount(t.id, dayType, s) ?? 0), 0)
    const remainder = Math.max(0, activeCount - totalRequired)
    off += remainder
    if (dayOfWeek === 6) w6off += remainder
  })
  return { D: d, N: n, Off: off, W6Off: w6off }
}

async function svCalcOff() {
  svOffError.value = null
  svOffApplyOk.value = false
  svOffPreview.value = []
  svResetApplied.value = false
  svOffLoading.value = true
  try {
    if (settingsStore.users.length === 0) await settingsStore.fetchUsers()
    if (settingsStore.settings.wdD == null) await settingsStore.fetchSettings()
    if (shiftTypesStore.shiftTypes.length === 0) await shiftTypesStore.fetchShiftTypes()
    const year = parseInt(scheduleStore.currentMonth.slice(0, 4))
    await fetchHolidays(year)

    const userIds = svActiveUsers.value.map(u => u.userId)
    const yyyyMM = scheduleStore.currentMonth
    const totals = svComputeTotals(yyyyMM, userIds.length)
    svMonthTotals.value = totals

    const result = await api.applyMonthlyShiftQuota({ yyyyMM, totals, userIds })
    if (!result.success) { svOffError.value = result.error; return }
    svOffPreview.value = result.data.preview
    offLocked.value = result.data.locked === true
    // Fallback: fill any shift type whose rotation order wasn't found by svInitOrderFromRecord
    // (e.g. old records missing Off/W6Off) using balance-before ascending sort
    ;['D', 'N', 'Off', 'W6Off'].forEach(st => {
      if (svResetOrders.value[st].length > 0) return
      const sorted = [...result.data.preview]
        .sort((a, b) => (a[st]?.balanceBefore ?? 0) - (b[st]?.balanceBefore ?? 0))
        .map(r => r.userId)
      if (sorted.length > 0) {
        svResetOrders.value[st] = sorted.map(uid => ({ userId: uid }))
      }
    })
  } catch (e) {
    svOffError.value = e.message || '計算失敗'
  } finally {
    svOffLoading.value = false
  }
}

async function svApplyQuota() {
  svShowApplyConfirm.value = false
  svOffApplying.value = true
  svOffError.value = null
  try {
    const userIds = svActiveUsers.value.map(u => u.userId)
    const yyyyMM = scheduleStore.currentMonth
    const result = await api.applyMonthlyShiftQuota({ yyyyMM, totals: svMonthTotals.value, userIds })
    if (!result.success) { svOffError.value = result.error; return }
    svOffApplyOk.value = true
    // Refresh schedule meta so quota columns update
    await scheduleStore.fetchSchedule(yyyyMM)
  } catch (e) {
    svOffError.value = e.message || '套用失敗'
  } finally {
    svOffApplying.value = false
  }
}

async function svCommit() {
  svShowCommitConfirm.value = false
  if (svOffPreview.value.length === 0) { svOffError.value = '請先計算分配'; return }
  svOffCommitting.value = true
  svOffError.value = null
  try {
    const n = svOffPreview.value.length
    const yyyyMM = scheduleStore.currentMonth
    const expected = {
      D: svMonthTotals.value.D / n,
      N: svMonthTotals.value.N / n,
      Off: svMonthTotals.value.Off / n,
      W6Off: svMonthTotals.value.W6Off / n
    }
    const assignments = {}
    svOffPreview.value.forEach(r => {
      assignments[r.userId] = { D: r.D.quota, N: r.N.quota, Off: r.Off.quota, W6Off: r.W6Off?.quota ?? 0 }
    })
    const rotationRecord = { yyyyMM }
    ;['D', 'N', 'Off', 'W6Off'].forEach(st => {
      const sorted = [...svOffPreview.value].sort((a, b) => (a[st]?.balanceBefore ?? 0) - (b[st]?.balanceBefore ?? 0))
      const extras = sorted[0]?.[st]?.extras ?? 0
      rotationRecord[st] = {
        order: sorted.map(r => r.userId),
        startUserId: sorted[0]?.userId ?? null,
        endUserId: extras > 0 ? (sorted[extras - 1]?.userId ?? null) : null,
        extras
      }
    })
    const result = await api.commitShiftBalance({ assignments, expected, yyyyMM, rotationRecord })
    if (!result.success) { svOffError.value = result.error; return }
    Object.keys(svResetModified.value).forEach(k => { svResetModified.value[k] = false })
    await scheduleStore.fetchSchedule(yyyyMM)
    await svCalcOff()
  } catch (e) {
    svOffError.value = e.message || '結算失敗'
  } finally {
    svOffCommitting.value = false
  }
}

// ── Drag-to-rotate helpers ─────────────────────────────────────────────────

const CHIP_WIDTH = 32 // px: w-7 (28) + gap-1 (4)

function svGetCurrentOrder(st) {
  if (svResetOrders.value[st].length > 0) return svResetOrders.value[st].map(u => u.userId)
  return svActiveUsers.value.map(u => u.userId)
}

function svDragStart(st, event) {
  svIsDragging = false
  svPendingReset.value = null
  svDraggingShift.value = st
  svDragRotation.value = 0

  const isTouch = event.type === 'touchstart'
  const getX = (e) => isTouch
    ? (e.touches[0] ?? e.changedTouches[0])?.clientX ?? 0
    : e.clientX
  const startX = getX(event)

  const onMove = (e) => {
    const deltaX = getX(e) - startX
    svIsDragging = Math.abs(deltaX) > 8
    if (svIsDragging) {
      // Drag left → rotate forward (positive rotation)
      svDragRotation.value = -Math.round(deltaX / CHIP_WIDTH)
      if (isTouch) e.preventDefault()
    }
  }

  const onEnd = () => {
    document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onMove)
    document.removeEventListener(isTouch ? 'touchend' : 'mouseup', onEnd)

    const finalRot = svDragRotation.value
    const wasDrag = svIsDragging
    svDraggingShift.value = null
    svDragRotation.value = 0

    if (!wasDrag || finalRot === 0) return

    const base = svGetCurrentOrder(st)
    const n = base.length
    if (n === 0) return
    const rot = ((finalRot % n) + n) % n
    if (rot === 0) return
    svPendingReset.value = { st, newOrder: [...base.slice(rot), ...base.slice(0, rot)] }
  }

  document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove, { passive: false })
  document.addEventListener(isTouch ? 'touchend' : 'mouseup', onEnd)
}

function svChipClick(st, uid) {
  if (svIsDragging) return
  const base = svGetCurrentOrder(st)
  const idx = base.indexOf(uid)
  if (idx <= 0) return // already at start position
  svPendingReset.value = { st, newOrder: [...base.slice(idx), ...base.slice(0, idx)] }
}

async function svDoConfirmReset() {
  if (!svPendingReset.value) return
  const { st, newOrder } = svPendingReset.value
  svPendingReset.value = null
  svOffError.value = null
  try {
    const n = newOrder.length
    const resetBalances = {}
    newOrder.forEach((uid, i) => {
      resetBalances[uid] = { [st]: parseFloat((-(n - 1 - i) / n).toFixed(4)) }
    })
    const wasLocked = offLocked.value
    const yyyyMM = wasLocked ? scheduleStore.currentMonth : undefined
    const result = await api.commitShiftBalance({ resetBalances, yyyyMM })
    if (!result.success) { svOffError.value = result.error; return }
    svResetOrders.value[st] = newOrder.map(uid => ({ userId: uid }))
    svResetModified.value[st] = true
    svOrderLocked.value[st] = true
    if (wasLocked) {
      offLocked.value = false
      svOffPreview.value = []
      svResetApplied.value = true
    } else if (svOffPreview.value.length > 0) {
      await svCalcOff()
    }
  } catch (e) {
    svOffError.value = e.message || '重設失敗'
  }
}

function svCancelPendingReset() {
  svPendingReset.value = null
}

function svUnlockAll() {
  Object.keys(svOrderLocked.value).forEach(k => { svOrderLocked.value[k] = false })
}

// Reset all rotation orders to the current active user list (for personnel changes / full resets)
function svResetAllOrders() {
  svResetOrders.value = { D: [], N: [], Off: [], W6Off: [] }
  svOrderLocked.value = { D: false, N: false, Off: false, W6Off: false }
  svPendingReset.value = null
  svResetModified.value = { D: true, N: true, Off: true, W6Off: true }
}

// Initialise svResetOrders from the most recent saved rotationRecord.
// 1. Current month has a rotationRecord → use it directly.
// 2. No record for current month → search backwards, advance order by extras, project to current month.
// 3. No record found at all → leave empty (falls back to user list in svGetDisplayOrder).
async function svInitOrderFromRecord(yyyyMM) {
  const SHIFT_TYPES = ['D', 'N', 'Off', 'W6Off']
  const activeIds = svActiveUsers.value.map(u => u.userId)

  // Reconcile a stored order with the current active user list:
  // - filter out departed users
  // - append new users (not in record) at the end
  function reconcileOrder(order) {
    const filtered = order.filter(uid => activeIds.includes(uid))
    const newUsers = activeIds.filter(uid => !order.includes(uid))
    return [...filtered, ...newUsers]
  }

  function applyOrders(orders) {
    SHIFT_TYPES.forEach(st => {
      if (Array.isArray(orders[st]) && orders[st].length > 0) {
        svResetOrders.value[st] = orders[st].map(uid => ({ userId: uid }))
      }
    })
  }

  // 1. Current month already has a committed rotationRecord → use it directly
  const existingRecord = scheduleStore.meta?.rotationRecord
  if (existingRecord && SHIFT_TYPES.some(st => Array.isArray(existingRecord[st]?.order) && existingRecord[st].order.length > 0)) {
    const orders = {}
    SHIFT_TYPES.forEach(st => {
      if (Array.isArray(existingRecord[st]?.order)) orders[st] = reconcileOrder(existingRecord[st].order)
    })
    applyOrders(orders)
    return
  }

  // 2. Search backwards for last committed record; GAS advances one step → returns start of foundMonth+1
  try {
    const result = await api.getRecentRotationRecord(yyyyMM)
    if (!result.success || !result.data.record) return
    // No record found → svResetOrders stays empty → svGetDisplayOrder falls back to user list

    const { foundMonth } = result.data
    // result.data.record already = starting order for foundMonth+1
    const orders = {}
    SHIFT_TYPES.forEach(st => {
      if (Array.isArray(result.data.record[st]?.order) && result.data.record[st].order.length > 0) {
        orders[st] = result.data.record[st].order
      }
    })

    // 3. Chain through gap months: from foundMonth+1 up to yyyyMM-1
    // For each uncommitted gap month M, compute extras = totals[st] % n and rotate
    const n = activeIds.length
    if (n > 0 && foundMonth) {
      // Ensure holiday data is loaded for any year spanned by the gap
      const gapYears = new Set()
      let scanM = addMonths(foundMonth, 1)
      while (scanM < yyyyMM) {
        gapYears.add(parseInt(scanM.slice(0, 4)))
        scanM = addMonths(scanM, 1)
      }
      for (const year of gapYears) {
        await fetchHolidays(year) // cached — no-op if already loaded
      }

      // Rotate through each gap month to arrive at yyyyMM's starting point
      scanM = addMonths(foundMonth, 1)
      while (scanM < yyyyMM) {
        const totals = svComputeTotals(scanM, n)
        SHIFT_TYPES.forEach(st => {
          if (!orders[st] || orders[st].length === 0) return
          const extras = totals[st] % n
          if (extras === 0) return
          orders[st] = [...orders[st].slice(extras), ...orders[st].slice(0, extras)]
        })
        scanM = addMonths(scanM, 1)
      }
    }

    // Reconcile with current active users after all gap-month rotations
    SHIFT_TYPES.forEach(st => {
      if (orders[st]) orders[st] = reconcileOrder(orders[st])
    })
    applyOrders(orders)
  } catch (e) {
    // Non-critical — silent fallback to user list
  }
}

// Display helpers
function svGetDisplayOrder(st) {
  // Active drag: show real-time rotated order
  if (svDraggingShift.value === st) {
    const base = svGetCurrentOrder(st)
    const n = base.length
    if (n === 0) return []
    const rot = ((svDragRotation.value % n) + n) % n
    return rot === 0 ? base : [...base.slice(rot), ...base.slice(0, rot)]
  }
  // Pending confirm: show the proposed new order
  if (svPendingReset.value?.st === st) return svPendingReset.value.newOrder
  // Always use rotation-order (from svInitOrderFromRecord or user reset).
  // svCalcOff preview only contributes extras count, not display order.
  return svGetCurrentOrder(st)
}

function svGetExtras(st) {
  if (svOffPreview.value.length > 0) return svOffPreview.value[0]?.[st]?.extras ?? 0
  const n = svActiveUsers.value.length
  return n > 0 ? svMonthTotals.value[st] % n : 0
}

function svIsStart(st, userId) {
  return svGetDisplayOrder(st)[0] === userId
}

function svIsEnd(st, userId) {
  const ex = svGetExtras(st)
  if (ex <= 0) return false
  return svGetDisplayOrder(st)[ex - 1] === userId
}

// extras = 0: the last chip completes the full cycle and wraps back to the start next month
function svIsFullCycleEnd(st, userId) {
  if (svGetExtras(st) !== 0 || svOffPreview.length === 0) return false
  const order = svGetDisplayOrder(st)
  return order.length > 1 && order[order.length - 1] === userId
}
</script>

<style>
/* Tooltip box — appears below the button on hover, right-aligned to avoid overflow */
.tooltip-box {
  @apply absolute top-full right-0 mt-2
         bg-gray-900 text-white text-xs rounded-lg px-3 py-2.5
         opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
         pointer-events-none z-50 shadow-xl
         transition-opacity duration-150;
}
.tooltip-box::after {
  content: '';
  @apply absolute bottom-full right-3
         border-4 border-transparent border-b-gray-900;
}
@media (max-width: 640px) {
  .tooltip-box {
    @apply bottom-full top-auto mt-0 mb-2 right-0 left-auto;
    max-width: calc(100vw - 2rem);
  }
  .tooltip-box::after {
    @apply top-full bottom-auto border-t-gray-900 border-b-transparent;
  }
}

@media print {
  @page {
    size: A4 landscape;
    margin: 8mm 6mm;
  }

  /* 保留格子背景色 */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* 移除 sticky 定位（列印不支援） */
  .sticky {
    position: static !important;
  }

  /* 表格縮放以填滿頁寬 */
  .overflow-x-auto {
    overflow: visible !important;
  }

  table {
    width: 100% !important;
    font-size: 9px !important;
    border-collapse: collapse !important;
  }

  th, td {
    padding: 2px 3px !important;
  }

  /* 隱藏批量填入的浮動 picker */
  .fixed {
    display: none !important;
  }
}
</style>
