<template>
  <div class="min-h-screen bg-gray-50">
    <NavBar />

    <main class="max-w-5xl mx-auto px-4 py-6">
      <h2 class="text-xl font-semibold text-gray-900 mb-6">系統管理</h2>

      <!-- Tab navigation -->
      <div class="flex border-b border-gray-200 mb-6">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="[
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === tab.id
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          ]"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- User Management -->
      <div v-if="activeTab === 'users'">
        <UserManager />
      </div>

      <!-- Shift Type Management -->
      <div v-if="activeTab === 'shifts'">
        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-semibold">班別管理</h3>
            <button @click="initShiftEditor" class="text-xs text-gray-500 hover:text-gray-700 underline">重設</button>
          </div>

          <div v-if="shiftFormError" class="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">{{ shiftFormError }}</div>
          <div v-if="shiftSaveSuccess" class="mb-3 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">✓ 班別設定已儲存</div>

          <!-- Shift type list -->
          <div class="border border-gray-200 rounded overflow-hidden mb-4">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th class="text-left px-3 py-2 font-medium text-gray-700 w-24">代碼</th>
                  <th class="text-left px-3 py-2 font-medium text-gray-700 w-28">顯示名稱</th>
                  <th class="text-left px-3 py-2 font-medium text-gray-700">顏色</th>
                  <th class="text-center px-3 py-2 font-medium text-gray-700 w-16">啟用</th>
                  <th class="text-center px-3 py-2 font-medium text-gray-700 w-16">預覽</th>
                  <th class="w-12"></th>
                </tr>
              </thead>
              <tbody>
                <template v-for="(t, idx) in editingShiftTypes" :key="t.id">
                  <tr class="border-b border-gray-100">
                    <td class="px-3 py-2">
                      <span class="font-mono font-medium text-gray-800">{{ t.id }}</span>
                    </td>
                    <td class="px-3 py-2">
                      <input
                        v-model="t.label"
                        class="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
                        :placeholder="t.id"
                      />
                    </td>
                    <td class="px-3 py-2">
                      <div class="flex flex-wrap gap-1">
                        <button
                          v-for="c in COLOR_OPTIONS"
                          :key="c.value"
                          @click="t.color = c.value"
                          :class="['w-5 h-5 rounded-full border-2 transition-all', c.swatch, t.color === c.value ? 'border-gray-800 scale-110' : 'border-transparent']"
                          :title="c.label"
                        ></button>
                      </div>
                    </td>
                    <td class="px-3 py-2 text-center">
                      <input type="checkbox" v-model="t.active" class="rounded" />
                    </td>
                    <td class="px-3 py-2 text-center">
                      <span :class="['text-xs font-medium px-2 py-0.5 rounded', previewClass(t.color)]">
                        {{ t.label || t.id }}
                      </span>
                    </td>
                    <td class="px-3 py-2 text-center flex items-center gap-2 justify-center">
                      <button
                        @click="expandedShiftIdx = expandedShiftIdx === idx ? null : idx"
                        :class="['text-xs px-1.5 py-0.5 rounded transition-colors', expandedShiftIdx === idx ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-blue-600']"
                        title="人力設定"
                      >⚙</button>
                      <button @click="removeShiftType(idx)" class="text-red-400 hover:text-red-600 text-xs" title="刪除">✕</button>
                    </td>
                  </tr>
                  <!-- 展開：適用日別 + 每日人數需求 -->
                  <tr v-if="expandedShiftIdx === idx" class="bg-blue-50">
                    <td colspan="6" class="px-4 py-3">
                      <div class="text-xs font-medium text-gray-700 mb-2">人力設定</div>
                      <div class="flex flex-wrap gap-6">
                        <!-- 適用日別 -->
                        <div>
                          <div class="text-xs text-gray-500 mb-1">適用日別（不勾 = 不限）</div>
                          <div class="flex gap-3">
                            <label v-for="d in DAY_TYPE_OPTIONS" :key="d.value" class="flex items-center gap-1 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                :checked="(t.applicableDays || []).includes(d.value)"
                                @change="toggleApplicableDay(t, d.value)"
                                class="rounded"
                              />
                              {{ d.label }}
                            </label>
                          </div>
                        </div>
                        <!-- 每日需求人數 -->
                        <div>
                          <div class="text-xs text-gray-500 mb-1">每日需求人數（自動排班依此填補；留空 = 不設需求）</div>
                          <div class="flex gap-3">
                            <label
                              v-for="d in DAY_TYPE_OPTIONS"
                              :key="d.value"
                              class="flex items-center gap-1 text-xs"
                              :class="(t.applicableDays || []).length > 0 && !(t.applicableDays || []).includes(d.value) ? 'opacity-30' : ''"
                            >
                              <span class="text-gray-500 w-7">{{ d.label }}</span>
                              <input
                                type="number"
                                min="0"
                                max="99"
                                :value="t.quota?.[d.value] ?? ''"
                                @input="e => { if (!t.quota) t.quota = {}; const v = e.target.value; t.quota[d.value] = v === '' ? undefined : Number(v) }"
                                class="w-12 text-xs border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-blue-400"
                                :disabled="(t.applicableDays || []).length > 0 && !(t.applicableDays || []).includes(d.value)"
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
                <tr v-if="editingShiftTypes.length === 0">
                  <td colspan="6" class="text-center py-6 text-gray-400">尚無班別</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Add new shift type -->
          <div v-if="showAddShift" class="mb-4 p-3 bg-gray-50 border border-gray-200 rounded">
            <div class="text-sm font-medium text-gray-700 mb-2">新增班別</div>
            <div class="flex flex-wrap gap-3 items-end">
              <div>
                <label class="block text-xs text-gray-500 mb-1">代碼（儲存用）</label>
                <input v-model="newShift.id" class="input-field w-24" placeholder="如 PM" maxlength="10" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">顯示名稱</label>
                <input v-model="newShift.label" class="input-field w-24" placeholder="留空同代碼" maxlength="10" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">顏色</label>
                <div class="flex gap-1">
                  <button
                    v-for="c in COLOR_OPTIONS"
                    :key="c.value"
                    @click="newShift.color = c.value"
                    :class="['w-5 h-5 rounded-full border-2 transition-all', c.swatch, newShift.color === c.value ? 'border-gray-800 scale-110' : 'border-transparent']"
                    :title="c.label"
                  ></button>
                </div>
              </div>
              <div class="flex gap-2">
                <button @click="addShiftType" class="btn-primary text-sm">新增</button>
                <button @click="showAddShift = false" class="btn-secondary text-sm">取消</button>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between">
            <button v-if="!showAddShift" @click="showAddShift = true" class="btn-secondary text-sm">＋ 新增班別</button>
            <div v-else></div>
            <button @click="saveShiftTypes" :disabled="savingShifts" class="btn-primary text-sm">
              {{ savingShifts ? '儲存中...' : '儲存班別設定' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Rotation Management -->
      <div v-if="activeTab === 'rotation'">
        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-semibold">輪序管理</h3>
            <div class="flex gap-2">
              <button @click="loadRotation" :disabled="rotationLoading" class="btn-secondary text-sm">重新載入</button>
              <button @click="saveRotation" :disabled="rotationLoading || rotationSaving" class="btn-primary text-sm">
                {{ rotationSaving ? '儲存中...' : '儲存輪序' }}
              </button>
            </div>
          </div>

          <div v-if="rotationError" class="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">{{ rotationError }}</div>
          <div v-if="rotationSaveOk" class="mb-3 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">✓ 輪序已儲存</div>

          <p class="text-xs text-gray-500 mb-4">
            ▶ 表示下次自動排班的起點。拖曳可調整輪序順序，點「設為起點」可立即調整下次起點。
            <br>修改後需按「儲存輪序」才會生效。
          </p>

          <div v-if="rotationLoading" class="text-center py-8 text-gray-400">載入中...</div>

          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div
              v-for="pool in editingPools"
              :key="pool.poolName"
              class="border border-gray-200 rounded-lg p-3"
            >
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-semibold text-gray-700">{{ poolLabel(pool.poolName) }}</span>
                <span class="text-xs text-gray-400">共 {{ pool.order.length }} 人</span>
              </div>

              <div class="space-y-1">
                <div
                  v-for="(userId, idx) in pool.order"
                  :key="userId"
                  :draggable="true"
                  @dragstart="onPoolItemDragStart(pool.poolName, idx, $event)"
                  @dragover.prevent="onPoolItemDragOver(pool.poolName, idx)"
                  @drop.prevent="onPoolItemDrop(pool.poolName, idx)"
                  @dragend="poolDragState = null"
                  :class="[
                    'flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-grab select-none group',
                    isNextInPool(pool, idx) ? 'bg-blue-50 ring-1 ring-blue-300' : 'bg-gray-50 hover:bg-gray-100',
                    poolDragState?.poolName === pool.poolName && poolDragState?.fromIdx === idx ? 'opacity-40' : ''
                  ]"
                >
                  <!-- drag handle -->
                  <span class="text-gray-300 text-xs">⠿</span>

                  <!-- next indicator -->
                  <span class="w-4 text-center text-xs">
                    <span v-if="isNextInPool(pool, idx)" class="text-blue-600 font-bold">▶</span>
                    <span v-else class="text-gray-300">{{ idx + 1 }}</span>
                  </span>

                  <!-- code + name -->
                  <span class="font-mono text-xs text-gray-400 w-6">{{ getUserCode(userId) }}</span>
                  <span class="flex-1 text-gray-800">{{ getUserName(userId) }}</span>

                  <!-- set as next button -->
                  <button
                    v-if="!isNextInPool(pool, idx)"
                    @click="setPoolNext(pool, idx)"
                    class="hidden group-hover:inline text-xs text-blue-600 hover:underline whitespace-nowrap"
                  >設為起點</button>

                  <!-- remove button -->
                  <button
                    @click="removeFromPool(pool, idx)"
                    class="hidden group-hover:inline text-xs text-red-400 hover:text-red-600 ml-1"
                    title="從輪序中移除"
                  >✕</button>
                </div>

                <div v-if="pool.order.length === 0" class="text-xs text-gray-400 py-2 text-center">尚無成員</div>

                <!-- Add member dropdown -->
                <div class="mt-2 flex items-center gap-1">
                  <select
                    :value="''"
                    @change="e => { addToPool(pool, e.target.value); e.target.value = '' }"
                    class="flex-1 text-xs border border-dashed border-gray-300 rounded px-2 py-1 text-gray-500 focus:outline-none focus:border-blue-400 bg-white"
                  >
                    <option value="" disabled>＋ 新增成員...</option>
                    <option
                      v-for="u in usersNotInPool(pool)"
                      :key="u.userId"
                      :value="u.userId"
                    >{{ u.code ? u.code + ' · ' : '' }}{{ u.name }}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Auto-schedule Rules -->
        <div class="card mt-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-base font-semibold">排班規則</h3>
            <button
              @click="saveAutoScheduleRules"
              :disabled="rulesSaving"
              class="btn-primary text-sm"
            >{{ rulesSaving ? '儲存中...' : '儲存規則' }}</button>
          </div>

          <div v-if="rulesSaveOk" class="mb-3 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">✓ 規則已儲存</div>

          <div class="flex items-center gap-2 mb-2">
            <input v-model="rulesForm.forbidFragmentShift" type="checkbox" id="forbidFragmentShift" class="rounded" />
            <label for="forbidFragmentShift" class="text-sm text-gray-700">
              禁止碎班
              <span class="text-xs text-gray-400 ml-1">（休-班-休，啟用後排班時會掃描並警告）</span>
            </label>
          </div>

          <div v-if="rulesForm.forbidFragmentShift" class="ml-6">
            <p class="text-xs text-gray-500 mb-1">視為碎班的班別：</p>
            <div class="flex flex-wrap gap-3">
              <label
                v-for="t in fragmentShiftCandidates"
                :key="t.id"
                class="flex items-center gap-1.5 text-sm text-gray-700"
              >
                <input
                  type="checkbox"
                  class="rounded"
                  :checked="rulesForm.fragmentShiftTypes.includes(t.id)"
                  @change="toggleFragmentShiftType(t.id)"
                />
                {{ t.label || t.id }}
              </label>
            </div>
          </div>
        </div>

        <!-- Rotation Preview -->
        <div class="card mt-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-base font-semibold">輪序預覽</h3>
            <p class="text-xs text-gray-400">純推算，不寫入任何資料</p>
          </div>

          <p class="text-xs text-gray-500 mb-4">
            選擇月份，系統會依現有輪序（或已填入的 proposedPools）推算該月的六日 D/N 分配。
          </p>

          <div class="flex items-center gap-3 mb-4">
            <select v-model="previewYear" class="input-field w-24 text-sm">
              <option v-for="y in previewYearOptions" :key="y" :value="y">{{ y }}年</option>
            </select>
            <select v-model="previewMonthNum" class="input-field w-20 text-sm">
              <option v-for="m in 12" :key="m" :value="m">{{ m }}月</option>
            </select>
            <button
              @click="runPreview"
              :disabled="previewLoading"
              class="btn-primary text-sm"
            >
              {{ previewLoading ? '計算中...' : '計算預覽' }}
            </button>
            <button
              v-if="previewResult.length > 0"
              @click="previewResult = []"
              class="btn-secondary text-sm"
            >清除</button>
          </div>

          <div v-if="previewError" class="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">{{ previewError }}</div>

          <div v-if="previewResult.length > 0">
            <div class="text-xs text-gray-500 mb-2">
              {{ previewYear }}年{{ previewMonthNum }}月　共 {{ previewResult.length }} 個六日／假日
            </div>
            <div class="overflow-x-auto border border-gray-200 rounded">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th class="text-left px-3 py-2 font-medium text-gray-700 w-28">日期</th>
                    <th class="text-left px-3 py-2 font-medium text-gray-700 w-16">星期</th>
                    <th class="text-left px-3 py-2 font-medium text-gray-700 w-16">類型</th>
                    <th class="text-left px-3 py-2 font-medium text-gray-700">D 班</th>
                    <th class="text-left px-3 py-2 font-medium text-gray-700">N 班</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in previewResult"
                    :key="row.dateStr"
                    :class="[
                      'border-b border-gray-100',
                      row.dayType === 'saturday' ? 'bg-blue-50/40' :
                      row.dayType === 'sunday'   ? 'bg-red-50/40' :
                                                   'bg-orange-50/40'
                    ]"
                  >
                    <td class="px-3 py-2 font-mono text-xs text-gray-600">{{ row.dateStr }}</td>
                    <td class="px-3 py-2 text-xs text-gray-500">{{ PREVIEW_DAY_NAMES[new Date(row.dateStr).getDay()] }}</td>
                    <td class="px-3 py-2 text-xs">
                      <span :class="[
                        'px-1.5 py-0.5 rounded font-medium',
                        row.dayType === 'saturday' ? 'bg-blue-100 text-blue-700' :
                        row.dayType === 'sunday'   ? 'bg-red-100 text-red-700' :
                                                     'bg-orange-100 text-orange-700'
                      ]">
                        {{ row.dayType === 'saturday' ? '六' : row.dayType === 'sunday' ? '日' : '假' }}
                      </span>
                    </td>
                    <td class="px-3 py-2">
                      <span v-if="row.dUserId" class="inline-flex items-center gap-1.5">
                        <span class="font-mono text-xs text-gray-400">{{ getUserCode(row.dUserId) }}</span>
                        <span class="text-sm text-gray-800">{{ getUserName(row.dUserId) }}</span>
                      </span>
                      <span v-else class="text-xs text-gray-300">—</span>
                    </td>
                    <td class="px-3 py-2">
                      <span v-if="row.nUserId" class="inline-flex items-center gap-1.5">
                        <span class="font-mono text-xs text-gray-400">{{ getUserCode(row.nUserId) }}</span>
                        <span class="text-sm text-gray-800">{{ getUserName(row.nUserId) }}</span>
                      </span>
                      <span v-else class="text-xs text-gray-300">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      <!-- Holiday Management -->
      <div v-if="activeTab === 'holidays'">
        <div class="card">
          <h3 class="text-base font-semibold mb-4">國定假日管理</h3>

          <!-- Controls -->
          <div class="flex flex-wrap items-center gap-3 mb-4">
            <select v-model="selectedYear" class="input-field w-28" @change="onYearChange">
              <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}年</option>
            </select>
            <button @click="loadHolidaysFromDB" :disabled="holidayLoading" class="btn-primary text-sm">
              {{ holidayLoading ? '載入中...' : '從資料庫載入' }}
            </button>
            <button @click="loadHolidaysFromGov" :disabled="holidayLoading" class="btn-secondary text-sm">
              從 data.gov.tw 載入
            </button>
            <a
              href="https://data.gov.tw/dataset/14718"
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs text-blue-500 hover:text-blue-700 underline"
            >data.gov.tw ↗</a>
            <button @click="loadHolidaysFromGov(true)" :disabled="holidayLoading" class="text-xs text-gray-500 hover:text-gray-700 underline">
              強制重新整理
            </button>

            <!-- CSV import -->
            <label class="btn-secondary text-sm cursor-pointer flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
              匯入 CSV
              <input
                type="file"
                accept=".csv"
                class="hidden"
                ref="csvInput"
                @change="handleCSVImport"
              />
            </label>
            <div class="ml-auto flex items-center gap-3">
              <button
                v-if="hasRegularDayOff"
                @click="disableRegularDayOff"
                class="btn-secondary text-sm"
                title="將所有「例假日」設為不放假"
              >
                關閉例假日（{{ regularDayOffCount }} 筆）
              </button>
              <span v-if="editedHolidays.length" class="text-xs text-amber-600">
                {{ editedHolidays.length }} 筆已修改
              </span>
              <button
                @click="saveHolidaysToGAS"
                :disabled="savingHolidays || displayHolidays.length === 0"
                class="btn-primary text-sm"
              >
                {{ savingHolidays ? '儲存中...' : '儲存至系統' }}
              </button>
            </div>
          </div>

          <!-- Status bar -->
          <div v-if="holidaySource" class="mb-3 p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-500">
            資料來源：{{ holidaySource }}　共 {{ displayHolidays.length }} 筆，放假日 {{ displayHolidays.filter(h=>h.isHoliday).length }} 個
          </div>
          <div v-if="holidayError" class="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
            {{ holidayError }}
            <span class="text-xs block mt-1 text-gray-500">提示：resource_id 可能需要更新，請至 data.gov.tw 查詢最新的政府行政機關辦公日曆資料集</span>
          </div>
          <div v-if="csvError" class="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
            {{ csvError }}
          </div>
          <div v-if="csvSuccess" class="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
            ✓ CSV 匯入成功，共 {{ displayHolidays.length }} 筆，其中 {{ displayHolidays.filter(h=>h.isHoliday).length }} 個放假日
          </div>
          <div v-if="holidaySaveSuccess" class="mb-3 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
            ✓ 已成功儲存 {{ displayHolidays.filter(h => h.isHoliday).length }} 個假日至系統
          </div>

          <!-- Filter -->
          <div v-if="displayHolidays.length" class="flex items-center gap-3 mb-3 text-sm">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input v-model="showOnlyHolidays" type="checkbox" class="rounded" />
              只顯示放假日
            </label>
            <span class="text-gray-400">共 {{ displayHolidays.filter(h => h.isHoliday).length }} 個放假日</span>
          </div>

          <!-- Table -->
          <div v-if="displayHolidays.length" class="overflow-y-auto max-h-[500px] border border-gray-200 rounded">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-gray-50 z-10">
                <tr class="border-b border-gray-200">
                  <th class="text-left py-2 px-3 font-medium text-gray-700 w-32">日期</th>
                  <th class="text-left py-2 px-3 font-medium text-gray-700 w-16">星期</th>
                  <th class="text-left py-2 px-3 font-medium text-gray-700">名稱／備註</th>
                  <th class="text-center py-2 px-3 font-medium text-gray-700 w-20">放假</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="h in filteredHolidays"
                  :key="h.date"
                  :class="[
                    'border-b border-gray-100 hover:bg-gray-50',
                    h.isHoliday ? 'bg-orange-50' : '',
                    isEdited(h.date) ? 'ring-1 ring-amber-300 ring-inset' : ''
                  ]"
                >
                  <td class="py-2 px-3 text-gray-600 font-mono text-xs">{{ h.date }}</td>
                  <td class="py-2 px-3 text-gray-500 text-xs">{{ getDayOfWeek(h.date) }}</td>
                  <td class="py-2 px-3">
                    <input
                      :value="h.name"
                      @input="updateName(h.date, $event.target.value)"
                      class="w-full text-xs bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none px-0 py-0.5"
                      placeholder="（無備註）"
                    />
                  </td>
                  <td class="py-2 px-3 text-center">
                    <button
                      @click="toggleHoliday(h.date)"
                      :class="[
                        'w-8 h-5 rounded-full transition-colors relative',
                        h.isHoliday ? 'bg-orange-400' : 'bg-gray-200'
                      ]"
                    >
                      <span :class="['absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all', h.isHoliday ? 'left-4' : 'left-0.5']"></span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-else-if="!holidayLoading" class="text-center py-12 text-gray-400">
            <div class="text-4xl mb-3">📅</div>
            <p>點擊「從 data.gov.tw 載入」取得 {{ selectedYear }} 年假日資料</p>
          </div>
        </div>
      </div>

      <!-- Backup Export -->
      <div v-if="activeTab === 'backup'">
        <div class="card">
          <h3 class="text-base font-semibold mb-1">備份匯出</h3>
          <p class="text-sm text-gray-500 mb-6">將資料匯出為 JSON 檔案，可用於備份或離線保存。</p>

          <!-- Schedule backup -->
          <div class="border border-gray-200 rounded-lg p-4 mb-4">
            <div class="flex items-start gap-4">
              <div class="flex-1">
                <h4 class="font-medium text-gray-800 mb-1">班表備份</h4>
                <p class="text-xs text-gray-500 mb-3">匯出指定月份的排班資料（班別、備注、元資料）</p>
                <div class="flex items-center gap-3">
                  <input
                    type="month"
                    class="input-field w-36 text-sm"
                    :value="backupMonth.slice(0,4) + '-' + backupMonth.slice(4)"
                    :max="`${new Date().getFullYear() + 1}-12`"
                    @change="e => backupMonth = e.target.value.replace('-', '')"
                  />
                  <button
                    @click="backupSchedule"
                    :disabled="backupLoading === 'schedule' || !backupMonth"
                    class="btn-primary text-sm flex items-center gap-2"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                    {{ backupLoading === 'schedule' ? '匯出中...' : '下載班表 JSON' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Settings backup -->
          <div class="border border-gray-200 rounded-lg p-4 mb-4">
            <div class="flex items-start gap-4">
              <div class="flex-1">
                <h4 class="font-medium text-gray-800 mb-1">設定備份</h4>
                <p class="text-xs text-gray-500 mb-3">匯出系統設定、班別設定及人員資料</p>
                <button
                  @click="backupSettings"
                  :disabled="backupLoading === 'settings'"
                  class="btn-secondary text-sm flex items-center gap-2"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                  </svg>
                  {{ backupLoading === 'settings' ? '匯出中...' : '下載設定 JSON' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Archive old months -->
          <div class="border border-orange-200 bg-orange-50/30 rounded-lg p-4 mb-4">
            <h4 class="font-medium text-gray-800 mb-1">封存舊月份</h4>
            <p class="text-xs text-gray-500 mb-3">
              將主試算表中 <strong>3 個月前</strong>的班表分頁（Schedule / ScheduleMeta / Requests）複製到封存試算表後刪除，
              避免分頁數超過 Google Sheets 200 張上限。封存後可至 Drive 中的「<em>[試算表名稱]_Archive</em>」查閱歷史資料。
            </p>
            <div
              v-if="archiveResult"
              class="text-xs mb-3 p-2 rounded border"
              :class="archiveResult.success ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'"
            >
              <template v-if="archiveResult.success">
                <span v-if="archiveResult.data.archived === 0">✓ 無需封存（目前僅保有 3 個月以內的資料）</span>
                <span v-else>
                  ✓ 已封存 {{ archiveResult.data.archived }} 個月
                  （{{ archiveResult.data.months.join('、') }}）
                  至「{{ archiveResult.data.archiveName }}」
                </span>
              </template>
              <template v-else>✗ {{ archiveResult.error }}</template>
            </div>
            <button
              @click="runArchive"
              :disabled="archiving"
              class="btn-secondary text-sm flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2L19 8"/>
              </svg>
              {{ archiving ? '封存中（請稍候）...' : '封存 3 個月前的資料' }}
            </button>
            <p class="text-xs text-gray-400 mt-2">⚠ 封存後舊月份從主試算表移除，無法在此系統直接查閱，請至 Drive 的封存試算表確認。</p>
          </div>

          <!-- Historical Import -->
          <div class="border border-blue-200 bg-blue-50/30 rounded-lg p-4">
            <h4 class="font-medium text-gray-800 mb-1">匯入歷史班表</h4>
            <p class="text-xs text-gray-500 mb-3">
              上傳由 <code class="bg-gray-100 px-1 rounded">parse_schedule_excel.py</code> 產生的
              <code class="bg-gray-100 px-1 rounded">historical_import.json</code>，批量匯入歷史排班資料。
            </p>

            <!-- Step 1: Upload -->
            <div v-if="!importData">
              <label class="btn-secondary text-sm cursor-pointer flex items-center gap-2 w-fit">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
                選擇 JSON 檔案
                <input type="file" accept=".json" class="hidden" @change="handleImportFile" />
              </label>
            </div>

            <!-- Step 2: Preview & Configure -->
            <div v-else>
              <div class="text-xs text-gray-500 mb-3">
                來源：{{ importData.generatedAt?.slice(0,10) }}　共 <strong>{{ Object.keys(importData.months).length }}</strong> 個月、<strong>{{ importData.codes.length }}</strong> 個代號
              </div>

              <!-- Code mapping table -->
              <div class="mb-4">
                <div class="text-xs font-semibold text-gray-600 mb-1.5">人員代號對應</div>
                <div class="border border-gray-200 rounded overflow-hidden">
                  <table class="w-full text-xs">
                    <thead class="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th class="px-3 py-1.5 text-left">代號</th>
                        <th class="px-3 py-1.5 text-left">對應人員</th>
                        <th class="px-3 py-1.5 text-center w-16">匯入</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="code in importData.codes" :key="code" class="border-t border-gray-100">
                        <td class="px-3 py-1 font-mono font-bold text-gray-700">{{ code }}</td>
                        <td class="px-3 py-1">
                          <span v-if="importGetUser(code)" class="text-green-700">
                            ✓ {{ importGetUser(code).name }}
                          </span>
                          <span v-else class="text-orange-600">新人員（建立為離職）</span>
                        </td>
                        <td class="px-3 py-1 text-center">
                          <input type="checkbox" v-model="importCodes[code]" />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Month selection -->
              <div class="mb-4">
                <div class="flex items-center gap-3 mb-2">
                  <span class="text-xs font-semibold text-gray-600">選擇月份</span>
                  <button @click="importSelectAll(true)" class="text-xs text-blue-600 hover:underline">全選</button>
                  <button @click="importSelectAll(false)" class="text-xs text-gray-500 hover:underline">取消全選</button>
                </div>
                <div class="grid grid-cols-4 sm:grid-cols-6 gap-x-3 gap-y-1">
                  <label
                    v-for="yyyyMM in importSortedMonths"
                    :key="yyyyMM"
                    class="flex items-center gap-1 text-xs cursor-pointer"
                  >
                    <input type="checkbox" v-model="importMonths[yyyyMM]" />
                    <span :class="importMonthShiftCount(yyyyMM) < 10 ? 'text-orange-500' : 'text-gray-700'">
                      {{ yyyyMM.slice(0,4) }}/{{ yyyyMM.slice(4) }}
                      <span v-if="importMonthShiftCount(yyyyMM) < 10" title="班別格數偏少，可能是未完整的月份">⚠</span>
                    </span>
                  </label>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex flex-wrap items-center gap-2">
                <button
                  @click="startImport"
                  :disabled="importLoading"
                  class="btn-primary text-sm"
                >
                  {{ importLoading ? `匯入中 ${importProgress}/${importTotal}...` : '開始匯入' }}
                </button>
                <button @click="resetImport" :disabled="importLoading" class="btn-secondary text-sm">重新選擇</button>
              </div>

              <!-- Progress bar -->
              <div v-if="importLoading" class="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  class="h-2 bg-blue-500 transition-all duration-300"
                  :style="`width: ${importTotal > 0 ? Math.round(importProgress/importTotal*100) : 0}%`"
                ></div>
              </div>

              <!-- Results -->
              <div v-if="importDone" class="mt-3 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                ✓ 完成！成功匯入 {{ importDoneCount }} 個月。
              </div>
              <div v-if="importErrors.length" class="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                <p class="font-semibold">{{ importErrors.length }} 個月失敗：</p>
                <ul class="list-disc list-inside mt-1 space-y-0.5">
                  <li v-for="e in importErrors" :key="e">{{ e }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- System Settings -->
      <div v-if="activeTab === 'system'">
        <div class="card">
          <h3 class="text-base font-semibold mb-1">系統設定</h3>
          <p class="text-sm text-gray-500 mb-4">系統相關的外部資源與連結。</p>

          <div class="border border-gray-200 rounded-lg p-4">
            <h4 class="font-medium text-gray-800 mb-1">主資料試算表</h4>
            <p class="text-xs text-gray-500 mb-3">
              開啟後端 Google 試算表（班表、人員、設定等原始資料）。請謹慎修改，避免破壞系統資料結構。
            </p>
            <a
              :href="SPREADSHEET_URL"
              target="_blank"
              rel="noopener noreferrer"
              class="btn-primary text-sm inline-flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
              開啟主試算表
            </a>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import { getMonthDays, getDayType } from '../utils/dateHelper.js'
import { getRequiredCount } from '../utils/shiftCalc.js'
import { useSettingsStore } from '../stores/settings.js'
import { useShiftTypesStore, COLOR_OPTIONS, DEFAULT_SHIFT_TYPES, DAY_TYPE_OPTIONS } from '../stores/shiftTypes.js'
import { useHoliday } from '../composables/useHoliday.js'
import { useRotationProjection } from '../composables/useRotationProjection.js'
import { api } from '../api/gas.js'
import NavBar from '../components/common/NavBar.vue'
import UserManager from '../components/common/UserManager.vue'

const settingsStore = useSettingsStore()
const { holidays, loading: holidayLoading, error: holidayError, fetchHolidays, clearCache } = useHoliday()

const activeTab = ref('users')

watch(activeTab, (tab) => {
  if (tab === 'rotation' && editingPools.value.length === 0) loadRotation()
  if (tab === 'rotation') initRulesForm()
})
const tabs = [
  { id: 'users', label: '人員管理' },
  { id: 'shifts', label: '班別管理' },
  { id: 'rotation', label: '輪序管理' },
  { id: 'holidays', label: '國定假日' },
  { id: 'backup', label: '備份匯出' },
  { id: 'system', label: '系統設定' }
]

// 主資料試算表（Google Sheets）連結
const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1SitOBsyKtBsHr_OAih2A1Ans_El6ns5IHlcoQwoVPy8/edit?gid=1884631028#gid=1884631028'

// ── Shift Types ─────────────────────────────────────────────
const shiftTypesStore = useShiftTypesStore()
const editingShiftTypes = ref([])
const shiftFormError = ref(null)
const shiftSaveSuccess = ref(false)
const savingShifts = ref(false)
const showAddShift = ref(false)
const expandedShiftIdx = ref(null)
const newShift = reactive({ id: '', label: '', color: 'yellow' })

function previewClass(color) {
  return COLOR_OPTIONS.find(c => c.value === color)?.cell || 'bg-gray-100 text-gray-600'
}

function deepCopyShiftType(t) {
  return { ...t, applicableDays: [...(t.applicableDays || [])], quota: { ...(t.quota || {}) } }
}

function initShiftEditor() {
  editingShiftTypes.value = shiftTypesStore.shiftTypes.map(deepCopyShiftType)
  showAddShift.value = false
  expandedShiftIdx.value = null
  shiftFormError.value = null
}

function toggleApplicableDay(t, dayValue) {
  if (!t.applicableDays) t.applicableDays = []
  const idx = t.applicableDays.indexOf(dayValue)
  if (idx === -1) t.applicableDays.push(dayValue)
  else t.applicableDays.splice(idx, 1)
}

function addShiftType() {
  shiftFormError.value = null
  if (!newShift.id.trim()) { shiftFormError.value = '班別代碼不能為空'; return }
  if (editingShiftTypes.value.find(t => t.id === newShift.id.trim())) {
    shiftFormError.value = '此班別代碼已存在'; return
  }
  editingShiftTypes.value.push({
    id: newShift.id.trim(),
    label: newShift.label.trim() || newShift.id.trim(),
    color: newShift.color,
    active: true,
    applicableDays: [],
    quota: {}
  })
  newShift.id = ''
  newShift.label = ''
  newShift.color = 'yellow'
  showAddShift.value = false
}

function removeShiftType(idx) {
  editingShiftTypes.value.splice(idx, 1)
}

async function saveShiftTypes() {
  savingShifts.value = true
  shiftFormError.value = null
  shiftSaveSuccess.value = false
  const ok = await shiftTypesStore.saveShiftTypes(editingShiftTypes.value)
  if (ok) {
    shiftSaveSuccess.value = true
    setTimeout(() => (shiftSaveSuccess.value = false), 3000)
  } else {
    shiftFormError.value = shiftTypesStore.error || '儲存失敗'
  }
  savingShifts.value = false
}

// ── Rotation ─────────────────────────────────────────────────
const rotationLoading = ref(false)
const rotationSaving = ref(false)
const rotationError = ref(null)
const rotationSaveOk = ref(false)
const editingPools = ref([])
const poolDragState = ref(null) // { poolName, fromIdx }

const USED_POOLS = ['satD', 'satN', 'sunD', 'sunN']
const POOL_LABELS = {
  satD: '週六 D班', satN: '週六 N班',
  sunD: '週日 D班', sunN: '週日 N班',
  satOff: '週六 Off', sunOff: '週日 Off',
  holD: '假日 D班', holN: '假日 N班', holOff: '假日 Off'
}

function poolLabel(name) {
  return POOL_LABELS[name] || name
}

// ── Auto-schedule Rules ────────────────────────────────────────
const rulesSaving = ref(false)
const rulesSaveOk = ref(false)
const rulesForm = reactive({
  forbidFragmentShift: true,
  fragmentShiftTypes: ['D', 'N']
})

const fragmentShiftCandidates = computed(() =>
  shiftTypesStore.shiftTypes.filter(t => !t.requestOnly && t.id !== 'Off')
)

function initRulesForm() {
  let parsed = null
  try {
    parsed = settingsStore.settings.autoScheduleRules
      ? JSON.parse(settingsStore.settings.autoScheduleRules)
      : null
  } catch {
    parsed = null
  }
  rulesForm.forbidFragmentShift = parsed?.forbidFragmentShift !== false
  rulesForm.fragmentShiftTypes = parsed?.fragmentShiftTypes?.length ? [...parsed.fragmentShiftTypes] : ['D', 'N']
  rulesSaveOk.value = false
}

function toggleFragmentShiftType(id) {
  const idx = rulesForm.fragmentShiftTypes.indexOf(id)
  if (idx === -1) rulesForm.fragmentShiftTypes.push(id)
  else rulesForm.fragmentShiftTypes.splice(idx, 1)
}

async function saveAutoScheduleRules() {
  rulesSaving.value = true
  rulesSaveOk.value = false
  const ok = await settingsStore.updateSettings({
    autoScheduleRules: JSON.stringify({
      forbidFragmentShift: rulesForm.forbidFragmentShift,
      fragmentShiftTypes: rulesForm.fragmentShiftTypes
    })
  })
  rulesSaving.value = false
  if (ok) rulesSaveOk.value = true
}

function getUserName(userId) {
  return settingsStore.users.find(u => u.userId === userId)?.name || userId
}

function getUserCode(userId) {
  return settingsStore.users.find(u => u.userId === userId)?.code || ''
}

function isNextInPool(pool, idx) {
  const next = ((pool.lastIndex ?? -1) + 1) % Math.max(pool.order.length, 1)
  return idx === next
}

function setPoolNext(pool, idx) {
  // lastIndex is the one BEFORE next, so set lastIndex = idx - 1
  pool.lastIndex = (idx - 1 + pool.order.length) % pool.order.length
  // Edge case: if idx === 0, lastIndex should be order.length - 1
  if (idx === 0) pool.lastIndex = pool.order.length - 1
}

async function loadRotation() {
  rotationLoading.value = true
  rotationError.value = null
  try {
    // Ensure users are loaded so UUIDs can be resolved to names
    if (settingsStore.users.length === 0) await settingsStore.fetchUsers()
    await settingsStore.fetchRotationPools()
    editingPools.value = settingsStore.rotationPools
      .filter(p => USED_POOLS.includes(p.poolName))
      .map(p => ({
        poolName: p.poolName,
        order: [...(p.order || [])],
        lastIndex: p.lastIndex ?? -1,
        skipQueue: [...(p.skipQueue || [])]
      }))
  } catch (e) {
    rotationError.value = e.message
  } finally {
    rotationLoading.value = false
  }
}

async function saveRotation() {
  rotationSaving.value = true
  rotationError.value = null
  rotationSaveOk.value = false
  try {
    const result = await api.saveAllRotationPools({
      pools: editingPools.value.map(p => ({
        poolName: p.poolName,
        order: p.order,
        lastIndex: p.lastIndex,
        skipQueue: p.skipQueue
      }))
    })
    if (!result.success) throw new Error(result.error || '儲存失敗')
    rotationSaveOk.value = true
    setTimeout(() => (rotationSaveOk.value = false), 3000)
    await settingsStore.fetchRotationPools()
  } catch (e) {
    rotationError.value = e.message
  } finally {
    rotationSaving.value = false
  }
}

// Pool item drag-to-reorder
function onPoolItemDragStart(poolName, fromIdx, event) {
  poolDragState.value = { poolName, fromIdx }
  event.dataTransfer.effectAllowed = 'move'
}

function onPoolItemDragOver(poolName, toIdx) {
  if (!poolDragState.value || poolDragState.value.poolName !== poolName) return
  if (poolDragState.value.fromIdx === toIdx) return
  const pool = editingPools.value.find(p => p.poolName === poolName)
  if (!pool) return
  const arr = pool.order
  const [moved] = arr.splice(poolDragState.value.fromIdx, 1)
  arr.splice(toIdx, 0, moved)
  poolDragState.value.fromIdx = toIdx
}

function onPoolItemDrop(poolName, toIdx) {
  poolDragState.value = null
}

function removeFromPool(pool, idx) {
  const wasNext = isNextInPool(pool, idx)
  pool.order.splice(idx, 1)
  // Adjust lastIndex if needed
  if (pool.order.length === 0) {
    pool.lastIndex = -1
  } else if (idx <= pool.lastIndex) {
    pool.lastIndex = Math.max(-1, pool.lastIndex - 1)
  }
}

function addToPool(pool, userId) {
  if (!userId || pool.order.includes(userId)) return
  pool.order.push(userId)
}

function usersNotInPool(pool) {
  return settingsStore.users
    .filter(u => (u.isActive === true || u.isActive === 'true' || u.isActive === 'TRUE') && !pool.order.includes(u.userId))
    .sort((a, b) => (parseInt(a.sortOrder) || 0) - (parseInt(b.sortOrder) || 0))
}

// ── Rotation Preview ─────────────────────────────────────────
const { projectMonth } = useRotationProjection()

const PREVIEW_DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']

const now = new Date()
const previewYear = ref(now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear())
const previewMonthNum = ref(now.getMonth() === 11 ? 1 : now.getMonth() + 2)
const previewYearOptions = computed(() => {
  const y = now.getFullYear()
  return [y - 1, y, y + 1, y + 2]
})
const previewLoading = ref(false)
const previewError = ref(null)
const previewResult = ref([])

async function runPreview() {
  previewError.value = null
  previewResult.value = []
  previewLoading.value = true
  try {
    const mm = String(previewMonthNum.value).padStart(2, '0')
    const yyyyMM = `${previewYear.value}${mm}`
    // Ensure users are loaded so names resolve
    if (settingsStore.users.length === 0) await settingsStore.fetchUsers()
    previewResult.value = await projectMonth(yyyyMM)
  } catch (e) {
    previewError.value = e.message || '推算失敗'
  } finally {
    previewLoading.value = false
  }
}

// ── Holidays ────────────────────────────────────────────────
const currentYear = new Date().getFullYear()
const selectedYear = ref(currentYear)
const yearOptions = computed(() => {
  const years = []
  for (let y = currentYear - 1; y <= currentYear + 1; y++) years.push(y)
  return years
})

// Local editable copy of holidays
const displayHolidays = ref([])
const editedDates = ref(new Set())
const showOnlyHolidays = ref(false)
const savingHolidays = ref(false)
const holidaySaveSuccess = ref(false)
const csvInput = ref(null)
const csvError = ref(null)
const csvSuccess = ref(false)
const holidaySource = ref(null)

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']

const editedHolidays = computed(() => displayHolidays.value.filter(h => editedDates.value.has(h.date)))

const regularDayOffCount = computed(() =>
  displayHolidays.value.filter(h => h.isHoliday && h.name === '例假日').length
)
const hasRegularDayOff = computed(() => regularDayOffCount.value > 0)

function disableRegularDayOff() {
  displayHolidays.value.forEach(h => {
    if (h.isHoliday && h.name === '例假日') {
      h.isHoliday = false
      editedDates.value.add(h.date)
    }
  })
}

const filteredHolidays = computed(() =>
  showOnlyHolidays.value
    ? displayHolidays.value.filter(h => h.isHoliday)
    : displayHolidays.value
)

function getDayOfWeek(dateStr) {
  const d = new Date(dateStr)
  return isNaN(d) ? '' : `週${DAY_NAMES[d.getDay()]}`
}

function isEdited(date) {
  return editedDates.value.has(date)
}

function toggleHoliday(date) {
  const h = displayHolidays.value.find(h => h.date === date)
  if (h) {
    h.isHoliday = !h.isHoliday
    editedDates.value.add(date)
  }
}

function updateName(date, name) {
  const h = displayHolidays.value.find(h => h.date === date)
  if (h) {
    h.name = name
    editedDates.value.add(date)
  }
}

function onYearChange() {
  displayHolidays.value = []
  editedDates.value = new Set()
  holidaySaveSuccess.value = false
  holidaySource.value = null
}

async function loadHolidaysFromDB() {
  editedDates.value = new Set()
  holidaySaveSuccess.value = false
  csvSuccess.value = false
  holidaySource.value = null
  holidayLoading.value = true
  try {
    const result = await api.getHolidays(selectedYear.value)
    if (!result.success) {
      holidayError.value = result.error || '載入失敗'
      return
    }
    if (!result.data || result.data.length === 0) {
      holidayError.value = `資料庫中尚無 ${selectedYear.value} 年的假日資料，請先從 data.gov.tw 載入後儲存`
      return
    }
    holidayError.value = null
    displayHolidays.value = result.data.map(h => ({ ...h }))
    holidaySource.value = `資料庫（${selectedYear.value} 年）`
  } catch (err) {
    holidayError.value = '載入失敗：' + err.message
  } finally {
    holidayLoading.value = false
  }
}

function handleCSVImport(event) {
  csvError.value = null
  csvSuccess.value = false
  const file = event.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const text = e.target.result
      const parsed = parseHolidayCSV(text)
      if (parsed.length === 0) {
        csvError.value = '找不到有效資料，請確認 CSV 格式是否正確'
        return
      }
      displayHolidays.value = parsed
      editedDates.value = new Set()
      csvSuccess.value = true
      holidaySaveSuccess.value = false
    } catch (err) {
      csvError.value = '解析失敗：' + err.message
    } finally {
      // Reset file input so same file can be re-imported
      if (csvInput.value) csvInput.value.value = ''
    }
  }
  reader.readAsText(file, 'UTF-8')
}

/**
 * 解析假日 CSV，自動偵測格式：
 * 1. Google 行事曆格式（Subject, Start Date, ...）— 每筆皆為放假日
 * 2. data.gov.tw 原始格式（西元日期, 是否放假, 備註）
 */
function parseHolidayCSV(text) {
  const cleaned = text.replace(/^\uFEFF/, '') // Remove BOM
  const lines = cleaned.split(/\r?\n/).filter(l => l.trim() && l.replace(/,/g, '').trim())
  if (lines.length < 2) throw new Error('CSV 內容不足')

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  const yearStr = String(selectedYear.value)

  // ── Google 行事曆格式 ──────────────────────────────────────
  // Header: Subject, Start Date, Start Time, End Date, End Time, All Day Event, ...
  if (headers[0] === 'Subject' && headers.includes('Start Date')) {
    const subjectCol   = headers.indexOf('Subject')
    const startDateCol = headers.indexOf('Start Date')
    const allDayCol    = headers.indexOf('All Day Event')

    const results = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
      const name = cols[subjectCol] || ''
      const rawDate = cols[startDateCol] || ''
      if (!name || !rawDate) continue // 跳過空行

      // 格式：2026/1/1 → 2026-01-01
      const parts = rawDate.split('/')
      if (parts.length !== 3) continue
      const dateStr = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`
      if (!dateStr.startsWith(yearStr)) continue

      const isAllDay = allDayCol === -1 || cols[allDayCol]?.toUpperCase() === 'TRUE'
      if (!isAllDay) continue

      results.push({ date: dateStr, name, isHoliday: true })
    }
    return results.sort((a, b) => a.date.localeCompare(b.date))
  }

  // ── data.gov.tw 原始格式 ───────────────────────────────────
  // Header: 西元日期, 星期, 是否放假, 備註
  const findCol = (...names) => {
    for (const n of names) {
      const idx = headers.findIndex(h => h.includes(n))
      if (idx !== -1) return idx
    }
    return -1
  }

  const dateCol    = findCol('西元日期', 'date')
  const holidayCol = findCol('是否放假', 'isHoliday')
  const nameCol    = findCol('備註', 'name', '說明')

  if (dateCol === -1) throw new Error('無法識別 CSV 格式，找不到日期欄位（西元日期 或 Subject）')
  if (holidayCol === -1) throw new Error('找不到「是否放假」欄位')

  const results = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
    const rawDate = cols[dateCol] || ''
    if (rawDate.length < 8) continue

    const dateStr = rawDate.length === 8
      ? `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}`
      : rawDate
    if (!dateStr.startsWith(yearStr)) continue

    const val = cols[holidayCol] ?? '0'
    const isHoliday = val === '2' || val.toLowerCase() === 'y' || val === 'true'
    const name = nameCol !== -1 ? (cols[nameCol] || '') : ''
    results.push({ date: dateStr, name, isHoliday })
  }
  return results.sort((a, b) => a.date.localeCompare(b.date))
}

async function loadHolidaysFromGov(forceRefresh = false) {
  editedDates.value = new Set()
  holidaySaveSuccess.value = false
  csvSuccess.value = false
  holidaySource.value = null
  const data = await fetchHolidays(selectedYear.value, forceRefresh)
  displayHolidays.value = data.map(h => ({ ...h }))
  if (data.length > 0) holidaySource.value = 'data.gov.tw'
}

async function saveHolidaysToGAS() {
  savingHolidays.value = true
  holidaySaveSuccess.value = false
  try {
    const result = await api.saveHolidays({
      year: selectedYear.value,
      holidays: displayHolidays.value
    })
    if (result.success) {
      editedDates.value = new Set()
      holidaySaveSuccess.value = true
      // Update cache with saved data
      clearCache(selectedYear.value)
      setTimeout(() => (holidaySaveSuccess.value = false), 4000)
    } else {
      alert('儲存失敗：' + (result.error || '未知錯誤'))
    }
  } catch (err) {
    alert('儲存失敗：' + err.message)
  } finally {
    savingHolidays.value = false
  }
}

// ── Backup ──────────────────────────────────────────────────
const backupMonth = ref((() => {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
})())
const backupLoading = ref('')
const archiving = ref(false)
const archiveResult = ref(null)

async function runArchive() {
  if (!confirm('確認封存 3 個月前的班表至封存試算表？封存後舊月份將從主試算表移除。')) return
  archiving.value = true
  archiveResult.value = null
  try {
    archiveResult.value = await api.archiveOldMonths({ keepMonths: 3 })
  } catch (e) {
    archiveResult.value = { success: false, error: e.message }
  } finally {
    archiving.value = false
  }
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function backupSchedule() {
  if (!backupMonth.value) return
  backupLoading.value = 'schedule'
  try {
    const result = await api.getSchedule(backupMonth.value)
    if (!result.success) throw new Error(result.error)
    downloadJSON(result.data, `schedule_${backupMonth.value}.json`)
  } catch (e) {
    alert('備份失敗：' + e.message)
  } finally {
    backupLoading.value = ''
  }
}

async function backupSettings() {
  backupLoading.value = 'settings'
  try {
    const [settingsRes, shiftTypesRes, usersRes] = await Promise.all([
      api.getSettings(),
      api.getShiftTypes(),
      api.getUsers()
    ])
    const data = {
      exportedAt: new Date().toISOString(),
      settings: settingsRes.data,
      shiftTypes: shiftTypesRes.data,
      users: usersRes.data
    }
    downloadJSON(data, `settings_${new Date().toISOString().slice(0, 10)}.json`)
  } catch (e) {
    alert('備份失敗：' + e.message)
  } finally {
    backupLoading.value = ''
  }
}

// ── Historical Import ────────────────────────────────────────
const importData = ref(null)
const importCodes = ref({})
const importMonths = ref({})
const importLoading = ref(false)
const importProgress = ref(0)
const importTotal = ref(0)
const importErrors = ref([])
const importDone = ref(false)
const importDoneCount = ref(0)

function importGetUser(code) {
  return settingsStore.users.find(u => u.code === code) || null
}

const importSortedMonths = computed(() =>
  importData.value ? Object.keys(importData.value.months).sort() : []
)

function importMonthShiftCount(yyyyMM) {
  const m = importData.value?.months?.[yyyyMM]
  if (!m) return 0
  return Object.values(m).reduce((sum, shifts) => sum + Object.keys(shifts).length, 0)
}

function importSelectAll(val) {
  Object.keys(importMonths.value).forEach(m => { importMonths.value[m] = val })
}

function resetImport() {
  importData.value = null
  importCodes.value = {}
  importMonths.value = {}
  importErrors.value = []
  importDone.value = false
  importDoneCount.value = 0
}

async function handleImportFile(e) {
  const file = e.target.files[0]
  if (!file) return
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    if (!data.months || !data.codes) { alert('JSON 格式不正確，請使用 parse_schedule_excel.py 產生的檔案'); return }
    importData.value = data
    const codeMap = {}
    data.codes.forEach(c => { codeMap[c] = true })
    importCodes.value = codeMap
    const monthMap = {}
    Object.keys(data.months).forEach(m => { monthMap[m] = true })
    importMonths.value = monthMap
    if (settingsStore.users.length === 0) await settingsStore.fetchUsers()
  } catch {
    alert('無法解析 JSON 檔案')
  }
  e.target.value = ''
}

async function startImport() {
  importLoading.value = true
  importErrors.value = []
  importDone.value = false
  importDoneCount.value = 0

  try {
    // Build code → userId map (create new users for unmatched codes)
    const codeToUserId = {}
    for (const code of importData.value.codes) {
      if (!importCodes.value[code]) continue
      const existing = importGetUser(code)
      if (existing) {
        codeToUserId[code] = existing.userId
      } else {
        // Create as inactive historical user
        const r = await api.addUser({
          name: `歷史人員_${code}`,
          email: `import_${code.toLowerCase()}@placeholder.local`,
          role: 'member',
          isActive: false,
          code
        })
        if (r.success) {
          codeToUserId[code] = r.data.userId
        } else {
          // May already exist; refresh and retry
          await settingsStore.fetchUsers()
          const retry = importGetUser(code)
          if (retry) codeToUserId[code] = retry.userId
        }
      }
    }
    await settingsStore.fetchUsers()

    // Import each selected month
    const selected = importSortedMonths.value.filter(m => importMonths.value[m])
    importTotal.value = selected.length
    importProgress.value = 0

    for (const yyyyMM of selected) {
      const monthData = importData.value.months[yyyyMM]
      const shifts = []
      for (const [code, dayShifts] of Object.entries(monthData)) {
        if (!importCodes.value[code]) continue
        const userId = codeToUserId[code]
        if (!userId) continue
        for (const [dayKey, shift] of Object.entries(dayShifts)) {
          const day = parseInt(dayKey.replace('day_', ''))
          if (shift) shifts.push({ userId, day, shift })
        }
      }
      if (shifts.length > 0) {
        try {
          const r = await api.batchSaveShifts({ yyyyMM, shifts, updatedPools: null })
          if (!r.success) importErrors.value.push(`${yyyyMM}: ${r.error}`)
          else importDoneCount.value++
        } catch (e) {
          importErrors.value.push(`${yyyyMM}: ${e.message}`)
        }
      } else {
        importDoneCount.value++ // empty month counts as done
      }
      importProgress.value++
    }
    importDone.value = true
  } catch (e) {
    importErrors.value.push('系統錯誤：' + e.message)
  } finally {
    importLoading.value = false
  }
}

// ── Init ────────────────────────────────────────────────────
onMounted(async () => {
  await settingsStore.fetchSettings()
  initShiftEditor()
})
</script>
