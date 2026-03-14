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
                          <div class="text-xs text-gray-500 mb-1">每日需求人數（留空 = 不設需求）</div>
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

        <!-- 班別配額輪序 (D / N / Off / W6Off) -->
        <div class="card mt-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-base font-semibold">班別配額輪序 (D / N / Off / W6Off)</h3>
            <p class="text-xs text-gray-400">依累計餘數公平分配每月各班數</p>
          </div>

          <div class="flex flex-wrap items-center gap-3 mb-3">
            <select v-model="offYear" class="input-field w-24 text-sm">
              <option v-for="y in previewYearOptions" :key="y" :value="y">{{ y }}年</option>
            </select>
            <select v-model="offMonthNum" class="input-field w-20 text-sm">
              <option v-for="m in 12" :key="m" :value="m">{{ m }}月</option>
            </select>
            <button @click="calcOffDistribution" :disabled="offLoading"
              :class="resetApplied ? 'btn-danger text-sm' : 'btn-primary text-sm'">
              {{ offLoading ? '計算中...'
                 : resetApplied ? '重新計算配額並推進新的輪序'
                 : '計算分配' }}
            </button>
          </div>

          <!-- 各班別獨立重設起點 -->
          <div class="flex flex-wrap gap-2 mb-4">
            <span class="text-xs text-gray-500 self-center">重設輪序起點：</span>
            <button v-for="st in ['D','N','Off','W6Off']" :key="st"
              @click="openResetModal(st)"
              :class="[
                'text-xs px-2 py-1 rounded border transition-colors',
                resetModified[st]
                  ? 'border-orange-400 bg-orange-50 text-orange-700 font-semibold hover:bg-orange-100'
                  : 'border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600'
              ]">
              {{ resetModified[st] ? '★ ' : '' }}重設 {{ st }} 起點
            </button>
          </div>

          <div v-if="offError" class="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">{{ offError }}</div>
          <div v-if="offApplyOk" class="mb-3 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">✓ 配額已套用，下月請執行「結算本月」更新累計餘數</div>
          <div v-if="offLocked" class="mb-3 p-2 bg-amber-50 border border-amber-300 rounded text-sm text-amber-700 flex items-center gap-2">
            <span>🔒</span>
            <span>此月輪序已結算鎖定，使用備查輪序順序重新計算配額，不推進輪序。</span>
          </div>

          <div v-if="offPreview.length > 0">
            <div class="text-xs text-gray-500 mb-2">
              {{ offYear }}年{{ offMonthNum }}月　自動計算：
              D: <span class="font-semibold text-gray-700">{{ monthTotals.D }}</span> 班
              N: <span class="font-semibold text-gray-700">{{ monthTotals.N }}</span> 班
              Off: <span class="font-semibold text-gray-700">{{ monthTotals.Off }}</span> 天
              W6Off: <span class="font-semibold text-gray-700">{{ monthTotals.W6Off }}</span> 天
              （共 {{ offPreview.length }} 人）
            </div>

            <div class="overflow-x-auto border border-gray-200 rounded mb-3">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th class="text-left px-3 py-2 font-medium text-gray-700">姓名</th>
                    <th class="text-center px-2 py-2 font-medium text-gray-700">D配額</th>
                    <th class="text-center px-2 py-2 font-medium text-gray-500 text-xs">D餘數→</th>
                    <th class="text-center px-2 py-2 font-medium text-gray-700">N配額</th>
                    <th class="text-center px-2 py-2 font-medium text-gray-500 text-xs">N餘數→</th>
                    <th class="text-center px-2 py-2 font-medium text-gray-700">Off配額</th>
                    <th class="text-center px-2 py-2 font-medium text-gray-500 text-xs">Off餘數→</th>
                    <th class="text-center px-2 py-2 font-medium text-gray-700">W6Off配額</th>
                    <th class="text-center px-2 py-2 font-medium text-gray-500 text-xs">W6Off餘數→</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in offPreview" :key="row.userId" class="border-b border-gray-100">
                    <td class="px-3 py-2">
                      <span class="font-mono text-xs text-gray-400 mr-1.5">{{ getUserCode(row.userId) }}</span>
                      {{ getUserName(row.userId) }}
                    </td>
                    <td class="px-2 py-2 text-center font-semibold">{{ row.D.quota }}</td>
                    <td class="px-2 py-2 text-center text-xs text-gray-500">{{ row.D.balanceBefore.toFixed(2) }} → {{ row.D.balanceAfter.toFixed(2) }}</td>
                    <td class="px-2 py-2 text-center font-semibold">{{ row.N.quota }}</td>
                    <td class="px-2 py-2 text-center text-xs text-gray-500">{{ row.N.balanceBefore.toFixed(2) }} → {{ row.N.balanceAfter.toFixed(2) }}</td>
                    <td class="px-2 py-2 text-center font-semibold">{{ row.Off.quota }}</td>
                    <td class="px-2 py-2 text-center text-xs text-gray-500">{{ row.Off.balanceBefore.toFixed(2) }} → {{ row.Off.balanceAfter.toFixed(2) }}</td>
                    <td class="px-2 py-2 text-center font-semibold">{{ row.W6Off?.quota ?? 0 }}</td>
                    <td class="px-2 py-2 text-center text-xs text-gray-500">
                      {{ row.W6Off ? (row.W6Off.balanceBefore.toFixed(2) + ' → ' + row.W6Off.balanceAfter.toFixed(2)) : '-' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="flex gap-2">
              <button @click="applyShiftQuota" :disabled="offApplying" class="btn-primary text-sm">
                {{ offApplying ? '套用中...' : '套用配額到班表' }}
              </button>
              <button v-if="!offLocked" @click="commitShift" :disabled="offCommitting" class="btn-secondary text-sm">
                {{ offCommitting ? '結算中...' : '結算本月（更新累計餘數）' }}
              </button>
              <span v-else class="flex items-center gap-1 text-xs text-amber-600 px-2 py-1 rounded bg-amber-50 border border-amber-200">
                🔒 輪序已鎖定
              </span>
            </div>
          </div>

        </div>
      </div>

      <!-- 班別輪序重設 Modal -->
      <div v-if="showResetModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div class="bg-white rounded-xl shadow-xl p-6 w-80">
          <h4 class="font-semibold text-gray-800 mb-1">重設 {{ showResetModal }} 輪序起點</h4>
          <p class="text-xs text-gray-500 mb-2">排第一的人優先分到多一班。只影響「{{ showResetModal }}」的累計餘數。</p>
          <!-- 整體旋轉按鈕 -->
          <div class="flex items-center gap-2 mb-3">
            <button @click="rotateResetOrder(showResetModal, 'down')"
              class="flex-1 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-100 transition-colors"
              title="最下方移到最上方">
              ↓ 底→頂
            </button>
            <button @click="rotateResetOrder(showResetModal, 'up')"
              class="flex-1 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-100 transition-colors"
              title="最上方移到最下方">
              ↑ 頂→底
            </button>
          </div>
          <ul class="space-y-1 mb-4">
            <li
              v-for="(item, idx) in resetOrders[showResetModal]"
              :key="item.userId"
              class="flex items-center gap-2 px-3 py-2 rounded border transition-colors"
              :class="
                item.userId === resetStartUser[showResetModal]
                  ? 'border-blue-400 bg-blue-50'
                  : item.userId === resetEndUser[showResetModal]
                    ? 'border-orange-300 bg-orange-50'
                    : 'border-gray-200 bg-gray-50'
              "
            >
              <span class="text-xs w-5 text-center font-mono"
                :class="
                  item.userId === resetStartUser[showResetModal] ? 'text-blue-500 font-bold'
                  : item.userId === resetEndUser[showResetModal] ? 'text-orange-400 font-bold'
                  : 'text-gray-400'
                ">
                {{ item.userId === resetStartUser[showResetModal] ? '▶'
                   : item.userId === resetEndUser[showResetModal] ? '◀'
                   : idx + 1 }}
              </span>
              <span class="flex-1 text-sm">
                <span class="font-mono text-xs text-gray-400 mr-1">{{ getUserCode(item.userId) }}</span>
                {{ getUserName(item.userId) }}
              </span>
              <span v-if="item.userId === resetStartUser[showResetModal]" class="text-xs text-blue-500">起點</span>
              <span v-else-if="item.userId === resetEndUser[showResetModal]" class="text-xs text-orange-400">終點</span>
            </li>
          </ul>
          <div class="flex gap-2 justify-end">
            <button @click="showResetModal = ''" class="btn-secondary text-sm">取消</button>
            <button @click="confirmShiftReset" class="btn-danger text-sm">確認重設</button>
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
})
const tabs = [
  { id: 'users', label: '人員管理' },
  { id: 'shifts', label: '班別管理' },
  { id: 'rotation', label: '輪序管理' },
  { id: 'holidays', label: '國定假日' }
]

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

// ── 班別配額輪序 (D / N / Off / W6Off) ──────────────────────
const offYear = ref(now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear())
const offMonthNum = ref(now.getMonth() === 11 ? 1 : now.getMonth() + 2)
const offLoading = ref(false)
const offApplying = ref(false)
const offCommitting = ref(false)
const offError = ref(null)
const offApplyOk = ref(false)
const offPreview = ref([])
const monthTotals = ref({ D: 0, N: 0, Off: 0, W6Off: 0 })
const offLocked = ref(false)       // 此月輪序已結算鎖定
const resetApplied = ref(false)    // 鎖定後已重設起點，待重新計算
// showResetModal: '' = 關閉, 'D'/'N'/'Off'/'W6Off' = 開啟對應班別重設
const showResetModal = ref('')
// 各班別獨立的輪序起點排序陣列
const resetOrders = ref({ D: [], N: [], Off: [], W6Off: [] })
// 已重設但尚未結算的班別（結算後清除）
const resetModified = ref({ D: false, N: false, Off: false, W6Off: false })
// 各班別的起點 userId（開啟 modal 時固定，旋轉時跟人移動）
const resetStartUser = ref({ D: null, N: null, Off: null, W6Off: null })
// 各班別的終點 userId = 當月 extras 的最後一人（index extras-1）
const resetEndUser = ref({ D: null, N: null, Off: null, W6Off: null })
// 結算後的輪序記錄，用於備查
const committedRecord = ref(null)

/** 利用 shiftTypesStore + settings + holidays 自動計算本月 D、N、Off、W6Off 總數 */
function computeMonthlyTotals(yyyyMM, holidayList, settings, activeCount) {
  if (!yyyyMM || activeCount === 0) return { D: 0, N: 0, Off: 0, W6Off: 0 }
  let d = 0, n = 0, off = 0, w6off = 0
  getMonthDays(yyyyMM).forEach(({ dateStr, dayOfWeek }) => {
    const dayType = getDayType(dateStr, holidayList)
    d += shiftTypesStore.getRequiredCount('D', dayType) ?? getRequiredCount('D', dayType, settings) ?? 0
    n += shiftTypesStore.getRequiredCount('N', dayType) ?? getRequiredCount('N', dayType, settings) ?? 0
    const totalRequired = shiftTypesStore.activeTypes
      .filter(t => t.id !== 'Off' && t.id !== 'W6Off' && shiftTypesStore.isApplicable(t.id, dayType))
      .reduce((sum, t) => {
        const v = shiftTypesStore.getRequiredCount(t.id, dayType) ?? getRequiredCount(t.id, dayType, settings) ?? 0
        return sum + v
      }, 0)
    const remainder = Math.max(0, activeCount - totalRequired)
    // Off = 所有可休假天數（含六日假日）
    off += remainder
    // W6Off = 星期六的可休假天數（含六+假日，以實際星期幾判斷）
    if (dayOfWeek === 6) w6off += remainder
  })
  return { D: d, N: n, Off: off, W6Off: w6off }
}

async function calcOffDistribution() {
  offError.value = null
  offApplyOk.value = false
  offPreview.value = []
  resetApplied.value = false
  offLoading.value = true
  try {
    if (settingsStore.users.length === 0) await settingsStore.fetchUsers()
    if (settingsStore.settings.wdD == null) await settingsStore.fetchSettings()
    if (shiftTypesStore.shiftTypes.length === 0) await shiftTypesStore.fetchShiftTypes()

    const activeUsers = settingsStore.users.filter(u => u.isActive !== false && u.isActive !== 'false')
    const userIds = activeUsers.map(u => u.userId)
    const mm = String(offMonthNum.value).padStart(2, '0')
    const yyyyMM = `${offYear.value}${mm}`

    // 確保假日資料已載入
    await fetchHolidays(offYear.value)

    const totals = computeMonthlyTotals(yyyyMM, holidays.value || [], settingsStore.settings, activeUsers.length)
    monthTotals.value = totals

    const result = await api.applyMonthlyShiftQuota({ yyyyMM, totals, userIds })
    if (!result.success) { offError.value = result.error; return }
    offPreview.value = result.data.preview
    offLocked.value = result.data.locked === true
  } catch (e) {
    offError.value = e.message || '計算失敗'
  } finally {
    offLoading.value = false
  }
}

async function applyShiftQuota() {
  offApplying.value = true
  offError.value = null
  try {
    const activeUsers = settingsStore.users.filter(u => u.isActive !== false && u.isActive !== 'false')
    const userIds = activeUsers.map(u => u.userId)
    const mm = String(offMonthNum.value).padStart(2, '0')
    const yyyyMM = `${offYear.value}${mm}`
    const result = await api.applyMonthlyShiftQuota({ yyyyMM, totals: monthTotals.value, userIds })
    if (!result.success) { offError.value = result.error; return }
    offApplyOk.value = true
  } catch (e) {
    offError.value = e.message || '套用失敗'
  } finally {
    offApplying.value = false
  }
}

async function commitShift() {
  if (offPreview.value.length === 0) { offError.value = '請先計算分配'; return }
  offCommitting.value = true
  offError.value = null
  try {
    const n = offPreview.value.length
    const mm = String(offMonthNum.value).padStart(2, '0')
    const yyyyMM = `${offYear.value}${mm}`
    const expected = {
      D:     monthTotals.value.D / n,
      N:     monthTotals.value.N / n,
      Off:   monthTotals.value.Off / n,
      W6Off: monthTotals.value.W6Off / n
    }
    const assignments = {}
    offPreview.value.forEach(r => {
      assignments[r.userId] = { D: r.D.quota, N: r.N.quota, Off: r.Off.quota, W6Off: r.W6Off?.quota ?? 0 }
    })

    // 建立輪序記錄：依 balanceBefore 排序重建實際分配順序
    const rotationRecord = { yyyyMM }
    ;['D', 'N', 'Off', 'W6Off'].forEach(st => {
      const sorted = [...offPreview.value]
        .sort((a, b) => (a[st]?.balanceBefore ?? 0) - (b[st]?.balanceBefore ?? 0))
      const extras = sorted[0]?.[st]?.extras ?? 0
      rotationRecord[st] = {
        order: sorted.map(r => r.userId),
        startUserId: sorted[0]?.userId ?? null,
        endUserId: extras > 0 ? (sorted[extras - 1]?.userId ?? null) : null,
        extras
      }
    })

    const result = await api.commitShiftBalance({ assignments, expected, yyyyMM, rotationRecord })
    if (!result.success) { offError.value = result.error; return }

    // 結算完成：清除起點修改標記，儲存記錄供備查
    Object.keys(resetModified.value).forEach(k => { resetModified.value[k] = false })
    committedRecord.value = rotationRecord
    await calcOffDistribution()
  } catch (e) {
    offError.value = e.message || '結算失敗'
  } finally {
    offCommitting.value = false
  }
}

function openResetModal(shiftType) {
  const activeUsers = settingsStore.users
    .filter(u => u.isActive !== false && u.isActive !== 'false')
    .sort((a, b) => (parseInt(a.sortOrder) || 0) - (parseInt(b.sortOrder) || 0))
  const existingOrder = resetOrders.value[shiftType]
  if (existingOrder.length === 0) {
    resetOrders.value[shiftType] = activeUsers.map(u => ({ userId: u.userId }))
  }

  const order = resetOrders.value[shiftType]
  const n = order.length

  // 起點：當前排第 1 的人，旋轉時跟著他走
  resetStartUser.value[shiftType] = order[0]?.userId ?? null

  // 終點：當月該班別 extras（餘數份額）的最後一人（index = extras - 1）
  // extras 從已計算的 preview 取得，若無則從 monthTotals 推算
  let extras = 0
  const previewRow = offPreview.value[0]
  if (previewRow?.[shiftType]) {
    extras = previewRow[shiftType].extras || 0
  } else if (n > 0) {
    extras = monthTotals.value[shiftType] % n
  }
  resetEndUser.value[shiftType] = (extras > 0 && order[extras - 1])
    ? order[extras - 1].userId
    : null

  showResetModal.value = shiftType
}

// dir = 'up'：第一個移到最後（12345678 → 23456781）
// dir = 'down'：最後一個移到最前（12345678 → 81234567）
function rotateResetOrder(shiftType, dir) {
  const arr = resetOrders.value[shiftType]
  if (arr.length < 2) return
  if (dir === 'up') {
    arr.push(arr.shift())
  } else {
    arr.unshift(arr.pop())
  }
}

async function confirmShiftReset() {
  const shiftType = showResetModal.value
  if (!shiftType) return
  offError.value = null
  try {
    const order = resetOrders.value[shiftType]
    const n = order.length
    // 依排序位置設定初始 balance：第 0 位最負（優先），最後一位為 0
    // 只重設該班別，其他班別的累計餘數不受影響
    const resetBalances = {}
    order.forEach((item, i) => {
      const bal = parseFloat((-(n - 1 - i) / n).toFixed(4))
      resetBalances[item.userId] = { [shiftType]: bal }
    })

    const wasLocked = offLocked.value
    // 若鎖定中重設，傳 yyyyMM 讓 GAS 刪除 rotationRecord（解鎖）
    const mm = String(offMonthNum.value).padStart(2, '0')
    const yyyyMM = wasLocked ? `${offYear.value}${mm}` : undefined

    const result = await api.commitShiftBalance({ resetBalances, yyyyMM })
    if (!result.success) { offError.value = result.error; return }

    resetModified.value[shiftType] = true
    showResetModal.value = ''

    if (wasLocked) {
      // 鎖定後重設：解鎖，清空 preview，讓使用者手動點「重新計算」
      offLocked.value = false
      offPreview.value = []
      resetApplied.value = true
    } else if (offPreview.value.length > 0) {
      await calcOffDistribution()
    }
  } catch (e) {
    offError.value = e.message || '重設失敗'
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

// ── Init ────────────────────────────────────────────────────
onMounted(async () => {
  await settingsStore.fetchSettings()
  initShiftEditor()
})
</script>
