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

      <div v-if="scheduleStore.loading" class="text-center py-12 text-gray-500">
        載入班表中...
      </div>

      <template v-else>
        <!-- Personal calendar mode -->
        <div v-if="viewMode === 'personal'" class="grid grid-cols-1 gap-1.5 max-w-sm mx-auto">
          <div
            v-for="d in myCalendarDays"
            :key="d.day"
            :class="[
              'flex items-center justify-between px-3 py-2 rounded-lg border text-sm',
              d.dayType === 'holiday' ? 'bg-red-50 border-red-100' :
              d.dayOfWeek === 0 || d.dayOfWeek === 6 ? 'bg-blue-50/50 border-blue-100' :
              'bg-white border-gray-100'
            ]"
          >
            <div class="flex items-center gap-3">
              <span
                :class="[
                  'w-8 text-center font-semibold',
                  d.dayOfWeek === 0 ? 'text-red-500' : d.dayOfWeek === 6 ? 'text-blue-500' : 'text-gray-800'
                ]"
              >{{ d.day }}</span>
              <span class="text-xs text-gray-400">{{ DAY_NAMES[d.dayOfWeek] }}</span>
            </div>
            <span
              v-if="d.shift"
              :class="['text-xs font-medium px-2 py-0.5 rounded-full', SHIFT_COLOR[d.shift] || 'bg-gray-100 text-gray-600']"
            >{{ SHIFT_LABEL[d.shift] || d.shift }}</span>
            <span v-else class="text-xs text-gray-300">—</span>
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
import { useHoliday } from '../composables/useHoliday.js'
import { getMonthDays, getDayType, DAY_NAMES } from '../utils/dateHelper.js'
import NavBar from '../components/common/NavBar.vue'
import MonthSwitcher from '../components/common/MonthSwitcher.vue'
import ScheduleGrid from '../components/schedule/ScheduleGrid.vue'

const scheduleStore = useScheduleStore()
const settingsStore = useSettingsStore()
const authStore = useAuthStore()
const { holidays, fetchHolidays } = useHoliday()

const viewMode = ref(typeof window !== 'undefined' && window.innerWidth < 640 ? 'personal' : 'table')

const SHIFT_LABEL = { D: '日班', N: '夜班', Off: '休假', AM: 'AM班' }
const SHIFT_COLOR = {
  D: 'bg-blue-100 text-blue-800',
  N: 'bg-indigo-100 text-indigo-800',
  Off: 'bg-gray-100 text-gray-500',
  AM: 'bg-purple-100 text-purple-700'
}

const myCalendarDays = computed(() => {
  const uid = authStore.user?.userId
  if (!uid || !scheduleStore.scheduleData) return []
  const row = scheduleStore.scheduleData[uid] || {}
  return getMonthDays(scheduleStore.currentMonth).map(d => ({
    ...d,
    shift: row[`day_${d.day}`] || null,
    dayType: getDayType(d.dateStr, holidays.value || [])
  }))
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
  await Promise.all([
    settingsStore.fetchSettings(),
    settingsStore.fetchUsers(),
    scheduleStore.fetchSchedule(scheduleStore.currentMonth)
  ])
  const year = parseInt(scheduleStore.currentMonth.slice(0, 4))
  await fetchHolidays(year)
  scrollToHighlightedRow()
})

async function onMonthChange(yyyyMM) {
  await scheduleStore.fetchSchedule(yyyyMM)
  const year = parseInt(yyyyMM.slice(0, 4))
  await fetchHolidays(year)
  scrollToHighlightedRow()
}
</script>
