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
      </div>

      <!-- Month info banner -->
      <div class="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800 flex flex-wrap items-center gap-2">
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span>您正在預約 <strong>{{ requestMonthLabel }}</strong> 的班別，排班者將參考此表安排班別。</span>
        <span v-if="isCurrentMonth" class="text-xs text-blue-500">（本月）</span>
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
        <div class="flex items-center gap-4 mb-3 text-xs text-gray-500 flex-wrap">
          <span class="flex items-center gap-1">
            <span class="inline-block px-1 rounded font-mono font-bold bg-teal-100 text-teal-700">D</span>已排班表
          </span>
          <span class="flex items-center gap-1">
            <span class="inline-block px-1 rounded font-mono font-bold bg-violet-100 text-violet-600">D</span>推算輪序
          </span>
          <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 bg-orange-100 border border-orange-300 rounded-sm"></span>爭議（超額預約）</span>
          <span class="flex items-center gap-1"><span class="inline-block px-1 rounded bg-red-100 text-red-800 font-medium">勿值</span>不排D或N</span>
          <span class="flex items-center gap-1"><span class="inline-block px-1 rounded bg-orange-100 text-orange-800 font-medium">勿D</span>不排D班</span>
          <span class="flex items-center gap-1"><span class="inline-block px-1 rounded bg-purple-100 text-purple-800 font-medium">勿N</span>不排N班</span>
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
                :data-uid="user.userId"
                :data-d="dayInfo.day"
                @mousedown="onCellMousedown(user.userId, dayInfo.day, $event)"
                @mouseenter="onCellMouseenter(user.userId, dayInfo.day)"
                @touchstart="onCellTouchStart(user.userId, dayInfo.day, $event)"
              >
                <ShiftCell
                  :shift="getUserDayRequest(user.userId, dayInfo.day)"
                  :isEditable="!scheduleStore.isLocked && (authStore.isScheduler || user.userId === authStore.user?.userId)"
                  :isOverBooked="isUserDayDisputed(user.userId, dayInfo.day)"
                  :requestShift="getRotationRef(user.userId, dayInfo.day)"
                  :rotRefSource="getRotationSource(user.userId, dayInfo.day)"
                  :includeRequestOnly="true"
                  :suppressClick="isDragging"
                  :isInDragSelection="isDragSelected(user.userId, dayInfo.day)"
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

      <!-- 單格衝突確認 -->
      <div
        v-if="conflictModal.show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="conflictModal.show = false"
      >
        <div class="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
          <div class="text-base font-semibold text-gray-800 mb-2">⚠️ 輪序衝突</div>
          <p class="text-sm text-gray-600 mb-4">
            第 <strong>{{ conflictModal.day }}</strong> 天的輪序已排
            <strong class="text-blue-700">{{ conflictModal.rotRef }}</strong>，
            您仍要預約
            <strong class="text-orange-600">{{ conflictModal.shift }}</strong> 嗎？
          </p>
          <div class="flex justify-end gap-2">
            <button class="px-4 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200 text-gray-700" @click="conflictModal.show = false">取消</button>
            <button class="px-4 py-1.5 text-sm rounded bg-orange-500 hover:bg-orange-600 text-white font-medium" @click="confirmConflictSave">確認覆蓋</button>
          </div>
        </div>
      </div>

      <!-- 批量拖曳衝突確認 -->
      <div
        v-if="dragConflictModal.show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="dragConflictModal.show = false"
      >
        <div class="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
          <div class="text-base font-semibold text-gray-800 mb-2">⚠️ 批量衝突</div>
          <p class="text-sm text-gray-600 mb-4">
            已選的 <strong>{{ dragConflictModal.cells.length }}</strong> 個格子中有輪序 D、N 或 H3，仍要覆蓋為
            <strong class="text-orange-600">{{ dragConflictModal.shift }}</strong> 嗎？
          </p>
          <div class="flex justify-end gap-2">
            <button class="px-4 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200 text-gray-700" @click="dragConflictModal.show = false">取消</button>
            <button class="px-4 py-1.5 text-sm rounded bg-orange-500 hover:bg-orange-600 text-white font-medium" @click="confirmDragConflictSave">確認覆蓋</button>
          </div>
        </div>
      </div>
    </main>
  </div>

  <!-- Drag batch picker -->
  <Teleport to="body">
    <template v-if="showDragPicker">
      <div class="fixed inset-0 z-40" @click="cancelDrag"></div>
      <div
        class="fixed z-50 bg-white border border-gray-300 rounded-lg shadow-xl p-3"
        :style="dragPickerStyle"
      >
        <div class="text-xs text-gray-500 mb-2">批量預約 {{ dragCells.length }} 格</div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="opt in dragOptions"
            :key="String(opt.value)"
            :class="['text-xs px-2.5 py-1 rounded font-medium transition-all cursor-pointer', opt.cellClass]"
            @click.stop="applyDragShift(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </template>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRequestStore } from '../stores/request.js'
import { useScheduleStore } from '../stores/schedule.js'
import { useSettingsStore } from '../stores/settings.js'
import { useAuthStore } from '../stores/auth.js'
import { useShiftTypesStore } from '../stores/shiftTypes.js'
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
const shiftTypesStore = useShiftTypesStore()
const { holidays, fetchHolidays } = useHoliday()
const { projectMonth } = useRotationProjection()

const overBookModal = ref({ show: false, day: null, shift: null })

// Earliest browsable month: current month (no past month access)
const minRequestMonth = getCurrentYYYYMM()

// Projected rotation map: { [userId]: { day_X: 'D'|'N' } }
const projectedShifts = ref({})

const monthDays = computed(() => getMonthDays(requestStore.currentMonth))

const requestMonthLabel = computed(() => {
  const ym = requestStore.currentMonth
  if (!ym) return ''
  return `${ym.slice(0, 4)} 年 ${parseInt(ym.slice(4))} 月`
})

const currentYYYYMM = getCurrentYYYYMM()
const isCurrentMonth = computed(() => requestStore.currentMonth === currentYYYYMM)

const sortedUsers = computed(() =>
  [...settingsStore.schedulingUsers]
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

// Returns where the rotRef comes from: 'schedule' (confirmed) or 'projected' (calculated)
function getRotationSource(userId, day) {
  if (scheduleStore.scheduleData[userId]?.[`day_${day}`]) return 'schedule'
  if (projectedShifts.value[userId]?.[`day_${day}`]) return 'projected'
  return null
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

async function onMonthChange(yyyyMM) {
  if (yyyyMM < minRequestMonth) return
  await Promise.all([
    requestStore.fetchRequests(yyyyMM),
    scheduleStore.fetchSchedule(yyyyMM)
  ])
  const year = parseInt(yyyyMM.slice(0, 4))
  await fetchHolidays(year)
  loadProjection(yyyyMM) // fire-and-forget — always load regardless of existing schedule
}

const conflictModal = ref({ show: false, userId: null, day: null, shift: null, rotRef: null })

// Normalize Saturday "Off" → "W6Off" (request form uses "Off" for all rest)
function normalizeShift(shift, day) {
  if (shift === 'Off') {
    const dayInfo = monthDays.value.find(d => d.day === day)
    if (dayInfo && dayInfo.dayOfWeek === 6) return 'W6Off'
  }
  return shift
}

async function handleUpdateRequest(userId, day, shift) {
  if (!authStore.user) return
  if (!authStore.isScheduler && userId !== authStore.user.userId) return

  const normalized = normalizeShift(shift, day)
  const rotRef = getRotationRef(userId, day)
  const isConflict = (rotRef === 'D' || rotRef === 'N' || rotRef === 'H3') && normalized && normalized !== rotRef
  if (isConflict) {
    conflictModal.value = { show: true, userId, day, shift: normalized, rotRef }
    return
  }

  await doSaveRequest(userId, day, normalized)
}

async function doSaveRequest(userId, day, shift) {
  const result = await requestStore.saveRequest(userId, day, shift)
  if (result.overBooked) {
    overBookModal.value = { show: true, day, shift }
  }
}

async function confirmConflictSave() {
  const { userId, day, shift } = conflictModal.value
  conflictModal.value = { show: false, userId: null, day: null, shift: null, rotRef: null }
  await doSaveRequest(userId, day, shift)
}

// ── Drag-to-select batch request ─────────────────────────────
const isDragging = ref(false)
const dragCells = ref([])
const showDragPicker = ref(false)
const dragPickerPos = ref({ x: 0, y: 0 })
let dragStarted = false

const dragOptions = computed(() => [
  ...shiftTypesStore.requestTypes.map(t => ({
    value: t.id,
    label: t.label,
    cellClass: shiftTypesStore.getCellClass(t.id)
  })),
  { value: null, label: '✕ 清除', cellClass: 'bg-gray-100 text-gray-600 hover:bg-gray-200' }
])

const dragPickerStyle = computed(() => {
  const margin = 8
  const pickerW = 300
  const pickerH = 130
  const x = Math.min(dragPickerPos.value.x + margin, window.innerWidth - pickerW - margin)
  const y = Math.min(dragPickerPos.value.y + margin, window.innerHeight - pickerH - margin)
  return { top: `${y}px`, left: `${x}px` }
})

function isCellEditable(userId) {
  return !scheduleStore.isLocked && (authStore.isScheduler || userId === authStore.user?.userId)
}

function isDragSelected(userId, day) {
  return dragCells.value.some(c => c.userId === userId && c.day === day)
}

function onCellMousedown(userId, day, event) {
  if (!isCellEditable(userId)) return
  event.preventDefault()
  dragStarted = true
  isDragging.value = false
  dragCells.value = [{ userId, day }]
}

function onCellMouseenter(userId, day) {
  if (!dragStarted || !isCellEditable(userId)) return
  if (!dragCells.value.some(c => c.userId === userId && c.day === day)) {
    isDragging.value = true
    dragCells.value.push({ userId, day })
  }
}

function onDocumentMouseup(event) {
  if (!dragStarted) return
  dragStarted = false
  if (isDragging.value && dragCells.value.length > 1) {
    showDragPicker.value = true
    dragPickerPos.value = { x: event.clientX, y: event.clientY }
    setTimeout(() => { isDragging.value = false }, 50)
  } else {
    isDragging.value = false
    dragCells.value = []
  }
}

async function applyDragShift(shift) {
  const cells = [...dragCells.value]
  dragCells.value = []
  showDragPicker.value = false
  const conflictCells = cells.filter(({ userId, day }) => {
    if (!isCellEditable(userId)) return false
    const normalized = normalizeShift(shift, day)
    const rotRef = getRotationRef(userId, day)
    return (rotRef === 'D' || rotRef === 'N' || rotRef === 'H3') && normalized && normalized !== rotRef
  })
  const cleanCells = cells.filter(({ userId, day }) => {
    if (!isCellEditable(userId)) return false
    const normalized = normalizeShift(shift, day)
    const rotRef = getRotationRef(userId, day)
    return !((rotRef === 'D' || rotRef === 'N' || rotRef === 'H3') && normalized && normalized !== rotRef)
  })
  await Promise.all(cleanCells.map(({ userId, day }) => requestStore.saveRequest(userId, day, normalizeShift(shift, day))))
  if (conflictCells.length > 0) {
    dragConflictModal.value = { show: true, cells: conflictCells, shift }
  }
}

const dragConflictModal = ref({ show: false, cells: [], shift: null })

async function confirmDragConflictSave() {
  const { cells, shift } = dragConflictModal.value
  dragConflictModal.value = { show: false, cells: [], shift: null }
  await Promise.all(cells.map(({ userId, day }) => requestStore.saveRequest(userId, day, normalizeShift(shift, day))))
}

function cancelDrag() {
  dragCells.value = []
  showDragPicker.value = false
}

// ── Touch long-press drag ─────────────────────────────────────
let touchTimer = null
let touchDragActive = false

function onCellTouchStart(userId, day, event) {
  if (!isCellEditable(userId)) return
  clearTimeout(touchTimer)
  touchDragActive = false
  touchTimer = setTimeout(() => {
    touchDragActive = true
    dragStarted = true
    isDragging.value = false
    dragCells.value = [{ userId, day }]
    if (navigator.vibrate) navigator.vibrate(30)
  }, 400)
}

function onDocumentTouchMove(event) {
  if (!touchDragActive) {
    if (touchTimer) { clearTimeout(touchTimer); touchTimer = null }
    return
  }
  event.preventDefault()
  const touch = event.touches[0]
  const el = document.elementFromPoint(touch.clientX, touch.clientY)
  if (!el) return
  const td = el.closest('[data-uid]')
  if (!td) return
  const uid = td.dataset.uid
  const day = parseInt(td.dataset.d)
  if (!uid || !day || !isCellEditable(uid)) return
  if (!dragCells.value.some(c => c.userId === uid && c.day === day)) {
    isDragging.value = true
    dragCells.value.push({ userId: uid, day })
  }
}

function onDocumentTouchEnd(event) {
  clearTimeout(touchTimer)
  touchTimer = null
  if (!touchDragActive) return
  touchDragActive = false
  if (!dragStarted) return
  dragStarted = false
  if (isDragging.value && dragCells.value.length > 1) {
    const touch = event.changedTouches[0]
    showDragPicker.value = true
    dragPickerPos.value = { x: touch.clientX, y: touch.clientY }
    setTimeout(() => { isDragging.value = false }, 50)
  } else {
    isDragging.value = false
    dragCells.value = []
  }
}

function onDocumentTouchCancel() {
  clearTimeout(touchTimer)
  touchTimer = null
  touchDragActive = false
  dragStarted = false
  isDragging.value = false
  dragCells.value = []
}

onUnmounted(() => {
  document.removeEventListener('mouseup', onDocumentMouseup)
  document.removeEventListener('touchmove', onDocumentTouchMove)
  document.removeEventListener('touchend', onDocumentTouchEnd)
  document.removeEventListener('touchcancel', onDocumentTouchCancel)
})

onMounted(async () => {
  document.addEventListener('mouseup', onDocumentMouseup)
  document.addEventListener('touchmove', onDocumentTouchMove, { passive: false })
  document.addEventListener('touchend', onDocumentTouchEnd)
  document.addEventListener('touchcancel', onDocumentTouchCancel)

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
  loadProjection(yyyyMM) // fire-and-forget
})
</script>
