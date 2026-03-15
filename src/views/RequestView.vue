<template>
  <div class="min-h-screen bg-gray-50">
    <NavBar />

    <main class="max-w-full px-4 py-6">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <MonthSwitcher
          :currentMonth="requestStore.currentMonth"
          :minMonth="minRequestMonth"
          @change="onMonthChange"
        />
        <div class="text-sm text-gray-500">
          點擊格子循環選擇班別
        </div>
      </div>

      <!-- Locked notice -->
      <div
        v-if="scheduleStore.isLocked"
        class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm"
      >
        本月班表已鎖定，無法再提交預約
      </div>

      <div v-if="requestStore.loading" class="text-center py-12 text-gray-500">
        載入預約資料中...
      </div>

      <!-- All users request grid (own row editable, others read-only) -->
      <div v-else class="card overflow-x-auto">
        <div class="flex items-center gap-4 mb-3 text-xs text-gray-500">
          <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 bg-orange-100 border border-orange-300 rounded-sm"></span>爭議（超額預約）</span>
          <span>點擊自己的格子循環切換班別</span>
        </div>
        <table class="text-xs border-collapse w-max min-w-full">
          <thead>
            <tr>
              <th class="sticky left-0 z-10 bg-gray-100 border border-gray-200 px-3 py-2 text-left font-medium min-w-[100px]">
                姓名
              </th>
              <th
                v-for="dayInfo in monthDays"
                :key="dayInfo.day"
                :class="[
                  'border border-gray-200 px-1 py-1 text-center font-medium min-w-[44px]',
                  getDayHeaderClass(dayInfo)
                ]"
              >
                <div>{{ dayInfo.day }}</div>
                <div class="text-xs font-normal">{{ DAY_NAMES[dayInfo.dayOfWeek] }}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in sortedUsers"
              :key="user.userId"
              :class="[
                user.userId === authStore.user?.userId
                  ? 'bg-blue-50 hover:bg-blue-100/60'
                  : 'hover:bg-gray-50/50'
              ]"
            >
              <td
                :class="[
                  'sticky left-0 z-10 border border-gray-200 px-3 py-1.5 font-medium text-gray-800 whitespace-nowrap',
                  user.userId === authStore.user?.userId
                    ? 'bg-blue-50 border-l-4 border-l-blue-400'
                    : 'bg-white'
                ]"
              >
                <span v-if="user.code" class="inline-block font-mono text-xs bg-gray-100 text-gray-500 rounded px-1 mr-1">{{ user.code }}</span>
                {{ user.name }}
                <span v-if="user.userId === authStore.user?.userId" class="ml-1 text-xs font-semibold text-blue-500">（我）</span>
              </td>
              <td
                v-for="dayInfo in monthDays"
                :key="dayInfo.day"
                class="border border-gray-200 p-0"
              >
                <ShiftCell
                  :shift="getUserDayRequest(user.userId, dayInfo.day)"
                  :isEditable="!scheduleStore.isLocked && (authStore.isScheduler || user.userId === authStore.user?.userId)"
                  :isOverBooked="isUserDayDisputed(user.userId, dayInfo.day)"
                  :requestShift="getRotationRef(user.userId, dayInfo.day)"
                  @update="(shift) => handleUpdateRequest(user.userId, dayInfo.day, shift)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- OverBook Modal -->
      <OverBookModal
        v-if="overBookModal.show"
        :day="overBookModal.day"
        :shift="overBookModal.shift"
        :requestData="requestStore.requestData"
        :users="settingsStore.users"
        :currentMonth="requestStore.currentMonth"
        @close="overBookModal.show = false"
      />
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRequestStore } from '../stores/request.js'
import { useScheduleStore } from '../stores/schedule.js'
import { useSettingsStore } from '../stores/settings.js'
import { useAuthStore } from '../stores/auth.js'
import { useHoliday } from '../composables/useHoliday.js'
import { useRotationProjection } from '../composables/useRotationProjection.js'
import { getMonthDays, getDayType, DAY_NAMES, addMonths, getCurrentYYYYMM } from '../utils/dateHelper.js'
import NavBar from '../components/common/NavBar.vue'
import MonthSwitcher from '../components/common/MonthSwitcher.vue'
import ShiftCell from '../components/schedule/ShiftCell.vue'
import OverBookModal from '../components/schedule/OverBookModal.vue'

const requestStore = useRequestStore()
const scheduleStore = useScheduleStore()
const settingsStore = useSettingsStore()
const authStore = useAuthStore()
const { holidays, fetchHolidays } = useHoliday()
const { projectMonth } = useRotationProjection()

const overBookModal = ref({ show: false, day: null, shift: null })

// Earliest browsable month: current month (no past month access)
const minRequestMonth = getCurrentYYYYMM()

// Projected rotation map: { [userId]: { day_X: 'D'|'N' } }
const projectedShifts = ref({})

const monthDays = computed(() => getMonthDays(requestStore.currentMonth))

const sortedUsers = computed(() =>
  [...settingsStore.users]
    .filter(u => u.isActive !== false && u.isActive !== 'false')
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
)

function getUserDayRequest(userId, day) {
  return requestStore.requestData[userId]?.[`day_${day}`] || null
}

function isUserDayDisputed(userId, day) {
  const ob = requestStore.requestData[userId]?.overBooked || []
  return ob.includes(String(day)) || ob.includes(day)
}

function getDayHeaderClass(dayInfo) {
  const dateStr = `${requestStore.currentMonth.slice(0,4)}-${requestStore.currentMonth.slice(4,6)}-${String(dayInfo.day).padStart(2,'0')}`
  const dayType = getDayType(dateStr, holidays.value)
  if (dayType === 'holiday') return 'bg-orange-50 text-orange-700'
  if (dayInfo.dayOfWeek === 6) return 'bg-blue-50 text-blue-700'
  if (dayInfo.dayOfWeek === 0) return 'bg-red-50 text-red-700'
  return 'bg-gray-50'
}

// Actual saved schedule takes priority; fall back to projected rotation
function getRotationRef(userId, day) {
  return scheduleStore.scheduleData[userId]?.[`day_${day}`]
    || projectedShifts.value[userId]?.[`day_${day}`]
    || null
}

async function loadProjection(yyyyMM) {
  projectedShifts.value = {}
  try {
    const assignments = await projectMonth(yyyyMM)
    const map = {}
    assignments.forEach(({ day, dUserId, nUserId }) => {
      if (dUserId) {
        if (!map[dUserId]) map[dUserId] = {}
        map[dUserId][`day_${day}`] = 'D'
      }
      if (nUserId) {
        if (!map[nUserId]) map[nUserId] = {}
        map[nUserId][`day_${day}`] = 'N'
      }
    })
    projectedShifts.value = map
  } catch (_) { /* non-critical */ }
}

function hasWeekendSchedule() {
  return Object.values(scheduleStore.scheduleData).some(shifts =>
    Object.values(shifts).some(v => v === 'D' || v === 'N')
  )
}

async function onMonthChange(yyyyMM) {
  if (yyyyMM < minRequestMonth) return
  await Promise.all([
    requestStore.fetchRequests(yyyyMM),
    scheduleStore.fetchSchedule(yyyyMM)
  ])
  const year = parseInt(yyyyMM.slice(0, 4))
  await fetchHolidays(year)
  if (!hasWeekendSchedule()) loadProjection(yyyyMM) // fire-and-forget
}

async function handleUpdateRequest(userId, day, shift) {
  if (!authStore.user) return
  if (!authStore.isScheduler && userId !== authStore.user.userId) return
  const result = await requestStore.saveRequest(userId, day, shift)
  if (result.overBooked) {
    overBookModal.value = { show: true, day, shift }
  }
}

onMounted(async () => {
  // Default to next month for request submission
  const yyyyMM = addMonths(getCurrentYYYYMM(), 1)
  requestStore.currentMonth = yyyyMM
  await Promise.all([
    settingsStore.fetchSettings(),
    settingsStore.fetchUsers(),
    requestStore.fetchRequests(yyyyMM),
    scheduleStore.fetchSchedule(yyyyMM)
  ])
  const year = parseInt(yyyyMM.slice(0, 4))
  await fetchHolidays(year)
  if (!hasWeekendSchedule()) loadProjection(yyyyMM) // fire-and-forget
})
</script>
