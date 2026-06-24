<template>
  <div class="min-h-screen bg-gray-50">
    <NavBar />

    <main class="max-w-full px-4 py-6">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <MonthSwitcher
          :currentMonth="scheduleStore.currentMonth"
          @change="onMonthChange"
        />
        <div class="flex items-center gap-2">
          <span
            v-if="scheduleStore.isLocked"
            class="text-xs bg-green-100 text-green-700 border border-green-300 rounded-full px-3 py-1"
          >
            已鎖定
          </span>
          <span
            v-else
            class="text-xs bg-yellow-100 text-yellow-700 border border-yellow-300 rounded-full px-3 py-1"
          >
            排班中
          </span>
          <span v-if="fetchedAgo" class="text-xs text-gray-400">更新：{{ fetchedAgo }}</span>
          <!-- Request overlay toggle -->
          <button
            @click="showRequestOverlay = !showRequestOverlay"
            class="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            :class="showRequestOverlay ? 'border-blue-300 text-blue-600 bg-blue-50' : ''"
            title="顯示/隱藏預約班別"
          >{{ showRequestOverlay ? '隱藏預約' : '顯示預約' }}</button>
          <!-- View toggle (always show for convenience) -->
          <button
            @click="viewMode = viewMode === 'personal' ? 'table' : 'personal'"
            class="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            :class="viewMode === 'personal' ? 'border-blue-300 text-blue-600 bg-blue-50' : ''"
          >{{ viewMode === 'personal' ? '月曆' : '表格' }}</button>
        </div>
      </div>

      <!-- Personal monthly stats -->
      <div
        v-if="myStats"
        class="mb-4 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-lg flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
      >
        <span class="text-blue-600 font-medium">我的本月統計</span>
        <span class="text-gray-700">日班 <strong class="text-blue-700">{{ myStats.D }}</strong></span>
        <span class="text-gray-700">夜班 <strong class="text-indigo-700">{{ myStats.N }}</strong></span>
        <span class="text-gray-700">休假 <strong class="text-gray-500">{{ myStats.Off }}</strong></span>
        <span v-if="myStats.AM > 0" class="text-gray-700">AM <strong class="text-purple-700">{{ myStats.AM }}</strong></span>
      </div>

      <div
        v-if="scheduleStore.isArchived"
        class="mb-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-center gap-2"
      >
        <span>📦</span>
        <span>封存資料（唯讀）— 此月份已封存，僅供查閱</span>
      </div>

      <div v-if="scheduleStore.loading" class="text-center py-12 text-gray-500">
        載入班表中...
      </div>

      <template v-else>
        <!-- Personal calendar mode -->
        <div class="grid grid-cols-1 gap-1.5 max-w-sm mx-auto" v-if="viewMode === 'personal'">
          <div
            v-for="d in myCalendarDays"
            :key="d.day"
            :class="[
              'rounded-lg border text-sm overflow-hidden',
              d.dayType === 'holiday' ? 'bg-red-50 border-red-100' :
              d.dayOfWeek === 0 || d.dayOfWeek === 6 ? 'bg-blue-50/50 border-blue-100' :
              'bg-white border-gray-100'
            ]"
          >
            <!-- Main row -->
            <div class="flex items-center justify-between px-3 py-2">
              <div class="flex items-center gap-2 min-w-0">
                <span
                  :class="[
                    'w-8 text-center font-semibold flex-shrink-0',
                    d.dayOfWeek === 0 ? 'text-red-500' : d.dayOfWeek === 6 ? 'text-blue-500' : 'text-gray-800'
                  ]"
                >{{ d.day }}</span>
                <span class="text-xs text-gray-400 flex-shrink-0">{{ DAY_NAMES[d.dayOfWeek] }}</span>
                <span v-if="d.holidayName" class="text-xs text-red-500 font-medium truncate">{{ d.holidayName }}</span>
              </div>
              <div class="flex items-center gap-1.5 flex-shrink-0 ml-1">
                <span v-if="d.event?.meeting" class="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">晨會</span>
                <span v-if="d.event?.reporter" class="text-[10px] text-purple-600 truncate max-w-[4rem]" :title="'報告：' + d.event.reporter">{{ d.event.reporter }}</span>
                <span
                  v-if="d.shift"
                  :class="['text-xs font-medium px-2 py-0.5 rounded-full', SHIFT_COLOR[d.shift] || 'bg-gray-100 text-gray-600']"
                >{{ SHIFT_LABEL[d.shift] || d.shift }}</span>
                <span v-else class="text-xs text-gray-300">—</span>
                <!-- 預約班別 -->
                <span
                  v-if="showRequestOverlay && d.request"
                  :class="[
                    'text-[10px] font-mono font-bold px-1 py-0.5 rounded',
                    CONSTRAINT_SHIFTS.includes(d.request)
                      ? 'bg-amber-50 text-amber-600'
                      : d.request === d.shift
                        ? 'bg-green-100 text-green-600'
                        : 'bg-blue-100 text-blue-600'
                  ]"
                  :title="CONSTRAINT_SHIFTS.includes(d.request) ? CONSTRAINT_LABELS[d.request] : '預約：' + d.request"
                >{{ CONSTRAINT_LABELS[d.request] ?? d.request }}</span>
                <!-- 編輯事件按鈕 -->
                <button
                  @click="toggleEdit(d.dateStr)"
                  class="text-gray-300 hover:text-gray-500 transition-colors ml-0.5"
                  :class="editingDay === d.dateStr ? 'text-blue-400' : ''"
                  title="設定晨會/報告者"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- 全體班別小格子 -->
            <div v-if="d.allShifts.length" class="px-3 pb-2 flex flex-wrap gap-1">
              <span
                v-for="s in d.allShifts"
                :key="s.userId"
                :class="['text-[10px] font-mono px-1.5 py-0.5 rounded', SHIFT_COLOR[s.shift] || 'bg-gray-100 text-gray-500']"
                :title="s.name + '：' + (SHIFT_LABEL[s.shift] || s.shift)"
              >{{ s.name.slice(-1) }}</span>
            </div>

            <!-- 編輯事件面板 -->
            <div v-if="editingDay === d.dateStr" class="px-3 pb-3 pt-2 border-t border-gray-100 bg-gray-50/80">
              <div class="flex items-center gap-3 flex-wrap">
                <label class="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" v-model="editForm.meeting" class="rounded">
                  <span>晨會</span>
                </label>
                <input
                  v-model="editForm.reporter"
                  type="text"
                  placeholder="報告者姓名"
                  class="text-xs border border-gray-200 rounded px-2 py-1 flex-1 min-w-[6rem] bg-white focus:outline-none focus:border-blue-300"
                >
              </div>
              <div class="flex items-center gap-2 mt-2">
                <button @click="saveEvent(d.dateStr)" class="text-xs bg-blue-500 text-white px-2.5 py-1 rounded hover:bg-blue-600">儲存</button>
                <button @click="editingDay = null" class="text-xs text-gray-500 px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-100">取消</button>
                <button v-if="d.event" @click="removeEvent(d.dateStr)" class="text-xs text-red-400 px-2.5 py-1 rounded hover:text-red-500 ml-auto">清除</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Table mode -->
        <ScheduleGrid
          v-else
          :scheduleData="scheduleStore.scheduleData"
          :users="settingsStore.users"
          :holidays="holidays"
          :settings="settingsStore.settings"
          :currentMonth="scheduleStore.currentMonth"
          :meta="scheduleStore.meta"
          :isEditable="false"
          :highlightUserId="authStore.user?.userId"
          :requestData="showRequestOverlay ? requestStore.requestData : {}"
        />
      </template>
    </main>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, nextTick, computed, ref } from 'vue'
import { useScheduleStore } from '../stores/schedule.js'
import { useSettingsStore } from '../stores/settings.js'
import { useAuthStore } from '../stores/auth.js'
import { useRequestStore } from '../stores/request.js'
import { useHoliday } from '../composables/useHoliday.js'
import { useDayEvents } from '../composables/useDayEvents.js'
import { getMonthDays, getDayType, DAY_NAMES } from '../utils/dateHelper.js'
import NavBar from '../components/common/NavBar.vue'
import MonthSwitcher from '../components/common/MonthSwitcher.vue'
import ScheduleGrid from '../components/schedule/ScheduleGrid.vue'

const scheduleStore = useScheduleStore()
const settingsStore = useSettingsStore()
const authStore = useAuthStore()
const requestStore = useRequestStore()
const { holidays, fetchHolidays, getHolidayName } = useHoliday()
const { getEvent, setEvent, clearEvent } = useDayEvents()

const showRequestOverlay = ref(false)
const CONSTRAINT_SHIFTS = ['NO_DN', 'NO_D', 'NO_N']
const CONSTRAINT_LABELS = { NO_DN: '勿值', NO_D: '勿D', NO_N: '勿N' }

const viewMode = ref(typeof window !== 'undefined' && window.innerWidth < 640 ? 'personal' : 'table')

const SHIFT_LABEL = { D: '日班', N: '夜班', Off: '休假', S1: 'S1', H3: 'H3', W6Off: '六休', AM: 'AM班' }
const SHIFT_COLOR = {
  D: 'bg-blue-100 text-blue-800',
  N: 'bg-indigo-100 text-indigo-800',
  S1: 'bg-green-100 text-green-700',
  H3: 'bg-orange-100 text-orange-700',
  Off: 'bg-gray-100 text-gray-500',
  W6Off: 'bg-gray-50 text-gray-400',
  AM: 'bg-purple-100 text-purple-700'
}

// 編輯事件
const editingDay = ref(null)
const editForm = ref({ meeting: false, reporter: '' })

function toggleEdit(dateStr) {
  if (editingDay.value === dateStr) {
    editingDay.value = null
    return
  }
  const ev = getEvent(dateStr)
  editForm.value = { meeting: ev?.meeting ?? false, reporter: ev?.reporter ?? '' }
  editingDay.value = dateStr
}

function saveEvent(dateStr) {
  setEvent(dateStr, editForm.value)
  editingDay.value = null
}

function removeEvent(dateStr) {
  clearEvent(dateStr)
  editingDay.value = null
}

const SHIFT_SORT = { D: 0, N: 1, H3: 2, S1: 3 }

const myCalendarDays = computed(() => {
  const uid = authStore.user?.userId
  if (!uid || !scheduleStore.scheduleData) return []
  const row = scheduleStore.scheduleData[uid] || {}
  const reqRow = requestStore.requestData[uid] || {}
  const allUsers = settingsStore.users || []

  return getMonthDays(scheduleStore.currentMonth).map(d => {
    const allShifts = allUsers
      .map(u => ({
        userId: u.userId,
        name: u.name,
        shift: scheduleStore.scheduleData[u.userId]?.[`day_${d.day}`] || null
      }))
      .filter(s => s.shift && s.shift !== 'Off' && s.shift !== 'W6Off')
      .sort((a, b) => (SHIFT_SORT[a.shift] ?? 9) - (SHIFT_SORT[b.shift] ?? 9))

    return {
      ...d,
      shift: row[`day_${d.day}`] || null,
      request: reqRow[`day_${d.day}`] || null,
      dayType: getDayType(d.dateStr, holidays.value || []),
      holidayName: getHolidayName(d.dateStr),
      event: getEvent(d.dateStr),
      allShifts
    }
  })
})

const myStats = computed(() => {
  const uid = authStore.user?.userId
  if (!uid || !scheduleStore.scheduleData) return null
  const row = scheduleStore.scheduleData[uid]
  if (!row) return null
  const counts = { D: 0, N: 0, Off: 0, AM: 0 }
  Object.entries(row).forEach(([k, v]) => {
    if (k.startsWith('day_') && v && counts[v] !== undefined) counts[v]++
  })
  return counts
})

const now = ref(Date.now())
let _timer = null
onMounted(() => { _timer = setInterval(() => { now.value = Date.now() }, 30000) })
onUnmounted(() => clearInterval(_timer))

const fetchedAgo = computed(() => {
  const t = scheduleStore.fetchedAt
  if (!t) return null
  const mins = Math.floor((now.value - t.getTime()) / 60000)
  if (mins < 1) return '剛剛'
  return `${mins} 分鐘前`
})

function scrollToHighlightedRow() {
  nextTick(() => {
    document.querySelector('tr.ring-blue-300')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

onMounted(async () => {
  const yyyyMM = scheduleStore.currentMonth
  await Promise.all([
    settingsStore.fetchSettings(),
    settingsStore.fetchUsers(),
    scheduleStore.fetchSchedule(yyyyMM),
    requestStore.fetchRequests(yyyyMM)
  ])
  const year = parseInt(yyyyMM.slice(0, 4))
  await fetchHolidays(year)
  scrollToHighlightedRow()
})

async function onMonthChange(yyyyMM) {
  await Promise.all([
    scheduleStore.fetchSchedule(yyyyMM),
    requestStore.fetchRequests(yyyyMM)
  ])
  const year = parseInt(yyyyMM.slice(0, 4))
  await fetchHolidays(year)
  scrollToHighlightedRow()
}
</script>
