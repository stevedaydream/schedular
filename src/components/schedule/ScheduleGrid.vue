<template>
  <div class="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
    <table class="text-xs border-collapse" style="min-width: max-content">
      <!-- Day number row -->
      <thead>
        <!-- Holiday name row -->
        <tr>
          <th class="sticky left-0 z-20 bg-gray-50 border border-gray-200 px-3 py-1 text-left text-xs text-gray-400 font-normal min-w-[100px]">假日</th>
          <th
            v-for="dayInfo in monthDays"
            :key="`hol-${dayInfo.day}`"
            class="border border-gray-200 text-center px-0 py-0.5 min-w-[44px]"
            :class="isHolidayDay(dayInfo.dateStr) ? 'bg-orange-50' : 'bg-gray-50'"
          >
            <span
              v-if="isHolidayDay(dayInfo.dateStr)"
              class="block text-orange-600 font-medium leading-tight"
              style="writing-mode: vertical-rl; font-size: 10px; margin: 0 auto;"
            >{{ getHolidayName(dayInfo.dateStr) }}</span>
          </th>
          <th
            v-for="type in ['D', 'N', 'Off', 'W6Off']"
            :key="`hol-stat-${type}`"
            class="border border-gray-200 bg-gray-50"
          ></th>
        </tr>
        <tr>
          <th
            class="sticky left-0 z-20 bg-gray-100 border border-gray-200 px-3 py-2 text-left font-semibold text-gray-700 min-w-[100px]"
          >
            姓名
          </th>
          <th
            v-for="dayInfo in monthDays"
            :key="`h-${dayInfo.day}`"
            :class="[
              'border border-gray-200 text-center font-medium min-w-[44px] px-1 py-1',
              dayHeaderClass(dayInfo)
            ]"
          >
            <div>{{ dayInfo.day }}</div>
            <div class="text-gray-500 font-normal text-xs">{{ DAY_NAMES[dayInfo.dayOfWeek] }}</div>
          </th>
          <!-- Stats headers -->
          <th
            v-for="type in ['D', 'N', 'Off', 'W6Off']"
            :key="`stat-${type}`"
            class="border border-gray-200 text-center font-semibold text-gray-700 px-2 py-2 min-w-[36px] bg-gray-50"
          >
            {{ type }}
          </th>
        </tr>
      </thead>

      <!-- User rows -->
      <tbody>
        <tr
          v-for="user in sortedUsers"
          :key="user.userId"
          :class="rowClass(user.userId)"
          @mouseenter="hoveredUserId = user.userId"
          @mouseleave="hoveredUserId = null"
          @dragover="onRowDragOver(user.userId, $event)"
          @dragleave="onRowDragLeave"
          @drop="onRowDrop(user.userId, $event)"
          @dragend="onRowDragEnd"
        >
          <!-- Name cell -->
          <td
            :draggable="isEditable"
            :class="[
              'sticky left-0 z-10 border border-gray-200 px-3 py-1.5 font-medium whitespace-nowrap transition-all duration-150',
              isEditable ? 'cursor-grab active:cursor-grabbing' : '',
              hoveredUserId === user.userId
                ? 'bg-blue-50 text-blue-800 border-l-[4px] border-l-blue-400'
                : 'bg-white text-gray-800 border-l-[4px] border-l-transparent'
            ]"
            @dragstart="isEditable && onNameDragStart(user.userId, $event)"
          >
            <span
              v-if="user.code"
              class="inline-block font-mono text-xs bg-gray-100 text-gray-500 rounded px-1 mr-1.5"
            >{{ user.code }}</span>{{ user.name }}
          </td>

          <!-- Shift cells -->
          <td
            v-for="dayInfo in monthDays"
            :key="`${user.userId}-${dayInfo.day}`"
            class="border border-gray-200 p-0"
            :style="dayCellBg(dayInfo)"
            :data-uid="user.userId"
            :data-d="dayInfo.day"
            @mousedown="onCellMousedown(user.userId, dayInfo.day, $event)"
            @mouseenter="onCellMouseenter(user.userId, dayInfo.day)"
            @touchstart="onCellTouchStart(user.userId, dayInfo.day, $event)"
          >
            <ShiftCell
              :shift="getShift(user.userId, dayInfo.day)"
              :isEditable="isEditable"
              :suppressClick="isDragging"
              :isInDragSelection="isDragSelected(user.userId, dayInfo.day)"
              :isOverBooked="isOverBooked(user.userId, dayInfo.day)"
              :cellNote="getCellNote(user.userId, dayInfo.day)"
              :dayType="getDayTypeForDate(dayInfo.dateStr)"
              :requestShift="getRequestShift(user.userId, dayInfo.day)"
              :isDisputedRequest="isDisputedRequest(user.userId, dayInfo.day)"
              @update="(shift) => handleUpdate(user.userId, dayInfo.day, shift)"
            />
          </td>

          <!-- Stats cells -->
          <StatsRow
            :userId="user.userId"
            :shifts="normalizeShifts(scheduleData[user.userId])"
            :quota="getUserQuota(user.userId)"
            :isSupport="user.isSupport === true || user.isSupport === 'true'"
            :dayInfos="monthDays"
          />
        </tr>

        <!-- Empty state -->
        <tr v-if="sortedUsers.length === 0">
          <td :colspan="monthDays.length + 5" class="text-center py-12 text-gray-400">
            尚無人員資料
          </td>
        </tr>
      </tbody>

      <!-- Daily totals row -->
      <tfoot>
        <tr class="bg-gray-50">
          <td class="sticky left-0 z-10 bg-gray-100 border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600">
            每日小計
          </td>
          <td
            v-for="dayInfo in monthDays"
            :key="`total-${dayInfo.day}`"
            class="border border-gray-200 px-1 py-1 text-center"
          >
            <div class="space-y-0.5">
              <div
                v-for="t in shiftTypesStore.activeTypes"
                :key="t.id"
                class="text-xs leading-tight"
                :class="getDailyTotalClass(dayInfo.day, t.id, dayInfo.dateStr)"
              >
                {{ getDailyCount(dayInfo.day, t.id) > 0 ? `${t.label}:${getDailyCount(dayInfo.day, t.id)}` : '' }}
              </div>
            </div>
          </td>
          <td colspan="4" class="border border-gray-200"></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- Drag batch picker -->
  <Teleport to="body">
    <template v-if="showDragPicker">
      <div class="fixed inset-0 z-40" @click="cancelDrag"></div>
      <div
        class="fixed z-50 bg-white border border-gray-300 rounded-lg shadow-xl p-3"
        :style="dragPickerStyle"
      >
        <div class="text-xs text-gray-500 mb-2">批量填入 {{ dragCells.length }} 格</div>
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
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getMonthDays, getDayType, DAY_NAMES } from '../../utils/dateHelper.js'
import { getRequiredCount } from '../../utils/shiftCalc.js'
import { useQuota } from '../../composables/useQuota.js'
import { useShiftTypesStore } from '../../stores/shiftTypes.js'
import ShiftCell from './ShiftCell.vue'
import StatsRow from './StatsRow.vue'

const props = defineProps({
  scheduleData: {
    type: Object,
    default: () => ({})
  },
  users: {
    type: Array,
    default: () => []
  },
  holidays: {
    type: Array,
    default: () => []
  },
  settings: {
    type: Object,
    default: () => ({})
  },
  currentMonth: {
    type: String,
    required: true
  },
  meta: {
    type: Object,
    default: () => ({})
  },
  isEditable: {
    type: Boolean,
    default: false
  },
  highlightUserId: {
    type: String,
    default: null
  },
  requestData: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['update-shift', 'reorder-users'])

const monthDays = computed(() => getMonthDays(props.currentMonth))

const sortedUsers = computed(() =>
  [...props.users]
    .filter(u => u.isActive !== false && u.isActive !== 'false')
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
)

const cellNotes = computed(() => {
  try {
    if (typeof props.meta?.cellNotes === 'string') {
      return JSON.parse(props.meta.cellNotes)
    }
    return props.meta?.cellNotes || {}
  } catch {
    return {}
  }
})

// Dummy store adapters for useQuota
const scheduleStoreAdapter = {
  scheduleData: computed(() => props.scheduleData),
  currentMonth: computed(() => props.currentMonth),
  meta: computed(() => props.meta)
}
const settingsStoreAdapter = {
  users: computed(() => props.users),
  settings: computed(() => props.settings)
}

const { quotas } = useQuota(scheduleStoreAdapter, settingsStoreAdapter, computed(() => props.holidays))
const shiftTypesStore = useShiftTypesStore()

function getShift(userId, day) {
  return props.scheduleData[userId]?.[`day_${day}`] || null
}

function getCellNote(userId, day) {
  return cellNotes.value[`${userId}_${day}`] || null
}

function isOverBooked(userId, day) {
  return false
}

function getRequestShift(userId, day) {
  return props.requestData[userId]?.[`day_${day}`] || null
}

function isDisputedRequest(userId, day) {
  const overBooked = props.requestData[userId]?.overBooked || []
  return overBooked.includes(String(day)) || overBooked.includes(day)
}

function getDayTypeForDate(dateStr) {
  return getDayType(dateStr, props.holidays)
}

function isHolidayDay(dateStr) {
  return getDayType(dateStr, props.holidays) === 'holiday'
}

function getHolidayName(dateStr) {
  const h = props.holidays.find(h => h.date === dateStr && h.isHoliday)
  return h?.name || ''
}

function dayHeaderClass(dayInfo) {
  const dayType = getDayType(dayInfo.dateStr, props.holidays)
  if (dayType === 'holiday') return 'bg-orange-50 text-orange-700'
  if (dayInfo.dayOfWeek === 6) return 'bg-blue-50 text-blue-700'
  if (dayInfo.dayOfWeek === 0) return 'bg-red-50 text-red-700'
  return 'bg-gray-50 text-gray-600'
}

function dayCellBg(dayInfo) {
  const dayType = getDayType(dayInfo.dateStr, props.holidays)
  if (dayType === 'holiday') return 'background-color: #fff7ed'
  if (dayInfo.dayOfWeek === 6) return 'background-color: #eff6ff'
  if (dayInfo.dayOfWeek === 0) return 'background-color: #fff1f2'
  return ''
}

function getDailyCount(day, shiftType) {
  let count = 0
  Object.values(props.scheduleData).forEach(row => {
    if (row[`day_${day}`] === shiftType) count++
  })
  return count
}

function getDailyTotalClass(day, shiftType, dateStr) {
  const count = getDailyCount(day, shiftType)
  const dayType = getDayType(dateStr, props.holidays)

  // 若班別不適用此日別，有排班則標紅警示
  if (!shiftTypesStore.isApplicable(shiftType, dayType)) {
    return count > 0 ? 'text-red-500 font-medium' : 'text-gray-300'
  }

  if (count === 0) {
    // 有需求但沒有人排 → 橙色警示
    const required = shiftTypesStore.getRequiredCount(shiftType, dayType)
      ?? getRequiredCount(shiftType, dayType, props.settings)
    return required !== null && required > 0 ? 'text-orange-500 font-medium' : 'text-gray-300'
  }

  const required = shiftTypesStore.getRequiredCount(shiftType, dayType)
    ?? getRequiredCount(shiftType, dayType, props.settings)

  if (required === null) return 'text-gray-600'
  if (count < required) return 'text-orange-500 font-medium'
  if (count > required) return 'text-red-500 font-medium'
  return 'text-green-600'
}

function getUserQuota(userId) {
  const q = quotas.value?.[userId]
  if (!q) return null
  return {
    D: q.D?.target ?? null,
    N: q.N?.target ?? null,
    Off: q.Off?.target ?? null,
    W6Off: q.W6Off?.target ?? null
  }
}

function normalizeShifts(scheduleRow) {
  if (!scheduleRow) return {}
  const result = {}
  Object.entries(scheduleRow).forEach(([k, v]) => {
    if (k.startsWith('day_')) result[k.slice(4)] = v
  })
  return result
}

function handleUpdate(userId, day, shift) {
  emit('update-shift', { userId, day, shift })
}

// ── Row hover highlight ──────────────────────────────────────
const hoveredUserId = ref(null)

// ── Row drag-to-reorder ──────────────────────────────────────
const rowDragUserId = ref(null)
const rowDropTarget = ref(null) // { userId, position: 'before'|'after' }

function onNameDragStart(userId, event) {
  rowDragUserId.value = userId
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', userId)
}

function onRowDragOver(userId, event) {
  if (!rowDragUserId.value || rowDragUserId.value === userId) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  const rect = event.currentTarget.getBoundingClientRect()
  const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  rowDropTarget.value = { userId, position }
}

function onRowDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    rowDropTarget.value = null
  }
}

function onRowDrop(userId, event) {
  event.preventDefault()
  if (!rowDragUserId.value || rowDragUserId.value === userId) return

  const ordered = [...sortedUsers.value]
  const draggedUser = ordered.find(u => u.userId === rowDragUserId.value)
  if (!draggedUser) return

  const withoutDragged = ordered.filter(u => u.userId !== rowDragUserId.value)
  const targetIdx = withoutDragged.findIndex(u => u.userId === userId)
  const insertAt = rowDropTarget.value?.position === 'after' ? targetIdx + 1 : targetIdx
  withoutDragged.splice(insertAt, 0, draggedUser)

  emit('reorder-users', withoutDragged.map((u, i) => ({ userId: u.userId, sortOrder: i + 1 })))
  rowDragUserId.value = null
  rowDropTarget.value = null
}

function onRowDragEnd() {
  rowDragUserId.value = null
  rowDropTarget.value = null
}

function rowClass(userId) {
  const classes = ['hover:bg-gray-50/50']
  if (props.highlightUserId === userId) classes.push('ring-2 ring-blue-300 ring-inset')
  if (rowDragUserId.value === userId) classes.push('opacity-40')
  if (rowDropTarget.value?.userId === userId) {
    classes.push(rowDropTarget.value.position === 'before'
      ? 'border-t-2 border-t-blue-400'
      : 'border-b-2 border-b-blue-400')
  }
  return classes
}

// ── Drag-to-select ───────────────────────────────────────────
const isDragging = ref(false)
const dragCells = ref([]) // [{ userId, day }]
const showDragPicker = ref(false)
const dragPickerPos = ref({ x: 0, y: 0 })
let dragStarted = false

const dragOptions = computed(() => [
  ...shiftTypesStore.activeTypes.map(t => ({
    value: t.id,
    label: t.label,
    cellClass: shiftTypesStore.getCellClass(t.id)
  })),
  { value: null, label: '✕ 清除', cellClass: 'bg-gray-100 text-gray-600 hover:bg-gray-200' }
])

const dragPickerStyle = computed(() => {
  const margin = 8
  const pickerW = 260
  const pickerH = 90
  const x = Math.min(dragPickerPos.value.x + margin, window.innerWidth - pickerW - margin)
  const y = Math.min(dragPickerPos.value.y + margin, window.innerHeight - pickerH - margin)
  return { top: `${y}px`, left: `${x}px` }
})

function isDragSelected(userId, day) {
  return dragCells.value.some(c => c.userId === userId && c.day === day)
}

function onCellMousedown(userId, day, event) {
  if (!props.isEditable) return
  event.preventDefault()
  dragStarted = true
  isDragging.value = false
  dragCells.value = [{ userId, day }]
}

function onCellMouseenter(userId, day) {
  if (!dragStarted || !props.isEditable) return
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
    // Keep isDragging = true briefly so ShiftCell suppresses the click event
    setTimeout(() => { isDragging.value = false }, 50)
  } else {
    isDragging.value = false
    dragCells.value = []
  }
}

function applyDragShift(shift) {
  dragCells.value.forEach(({ userId, day }) => {
    emit('update-shift', { userId, day, shift })
  })
  dragCells.value = []
  showDragPicker.value = false
}

function cancelDrag() {
  dragCells.value = []
  showDragPicker.value = false
}

// ── Touch drag-to-select ─────────────────────────────────────
let touchTimer = null
let touchDragActive = false

function onCellTouchStart(userId, day, event) {
  if (!props.isEditable) return
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
    // Clear timer if finger moved before long press fires
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
  if (!uid || !day) return
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

onMounted(() => {
  document.addEventListener('mouseup', onDocumentMouseup)
  document.addEventListener('touchmove', onDocumentTouchMove, { passive: false })
  document.addEventListener('touchend', onDocumentTouchEnd)
  document.addEventListener('touchcancel', onDocumentTouchCancel)
})
onUnmounted(() => {
  document.removeEventListener('mouseup', onDocumentMouseup)
  document.removeEventListener('touchmove', onDocumentTouchMove)
  document.removeEventListener('touchend', onDocumentTouchEnd)
  document.removeEventListener('touchcancel', onDocumentTouchCancel)
})
</script>
