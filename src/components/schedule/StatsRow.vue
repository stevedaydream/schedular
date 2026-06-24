<template>
  <template v-for="type in displayTypes" :key="type">
    <td
      :class="[
        'border border-gray-200 px-2 py-1 text-center text-xs font-medium min-w-[42px] cursor-pointer select-none transition-colors relative',
        cellClass(type),
        Math.abs(byType[type]?.diff ?? 0) >= 2 ? 'animate-alert-pulse' : ''
      ]"
      :title="tooltipText(type)"
      @click.stop="toggleExpand(type)"
    >
      <span :class="['inline-block', bumping === type ? 'animate-count-bump' : '']">
        {{ byType[type]?.actual ?? 0 }}
      </span>
      <span class="text-gray-400">/</span>
      <span>{{ byType[type]?.quota ?? '–' }}</span><sup
        v-if="overrides?.[type]?.target != null"
        class="text-blue-400 font-bold ml-px"
        title="自訂配額覆蓋中"
      >*</sup>
      <span v-if="statusIcon(type)" class="ml-0.5">{{ statusIcon(type) }}</span>
    </td>
  </template>

  <!-- Expand detail + override edit panel -->
  <td v-if="expandedType" colspan="1" class="relative">
    <div class="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded shadow-lg p-3 min-w-[200px] text-xs text-gray-700" @click.stop>
      <div class="font-semibold mb-2">{{ expandedType }} 班明細</div>
      <div v-for="d in expandDays" :key="d.day" class="flex justify-between gap-4 py-0.5">
        <span>第 {{ d.day }} 日</span>
        <span class="font-medium">{{ d.value }}</span>
      </div>
      <div v-if="expandDays.length === 0" class="text-gray-400">無資料</div>

      <!-- Override edit section (only when editable) -->
      <template v-if="isEditable">
        <div class="border-t border-gray-100 mt-2 pt-2">
          <div class="text-gray-500 mb-1 font-semibold">配額調整</div>
          <div class="text-gray-400 mb-1.5">
            輪序配額：{{ rotationQuota?.[expandedType] ?? '–' }}
          </div>
          <div class="flex items-center gap-1 mb-1.5">
            <label class="text-gray-500 shrink-0">自訂目標：</label>
            <input
              v-model.number="editTarget"
              type="number"
              min="0"
              class="w-12 border border-gray-300 rounded px-1 py-0.5 text-xs text-center"
            />
          </div>
          <div class="mb-2">
            <label class="text-gray-500 block mb-0.5">備註：</label>
            <textarea
              v-model="editNote"
              rows="2"
              class="w-full border border-gray-300 rounded px-1 py-0.5 text-xs resize-none"
              placeholder="說明調整原因…"
            />
          </div>
          <div class="flex gap-1">
            <button
              @click="saveOverride"
              class="text-xs px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >儲存</button>
            <button
              v-if="overrides?.[expandedType]?.target != null"
              @click="clearOverride"
              class="text-xs px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-100 text-gray-500 transition-colors"
            >清除覆蓋</button>
          </div>
        </div>
      </template>

      <button @click="expandedType = null" class="mt-2 text-blue-600 hover:underline w-full text-right">收起</button>
    </div>
  </td>

  <!-- Note / override summary column -->
  <td class="border border-gray-200 px-1 text-center relative min-w-[26px]">
    <button
      v-if="hasAnyOverride"
      @click.stop="showNotePanel = !showNotePanel"
      class="text-gray-400 hover:text-blue-500 leading-none select-none"
      title="查看配額調整"
    >📝</button>
    <div
      v-if="showNotePanel"
      class="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded shadow-lg p-3 min-w-[190px] text-xs text-gray-700" @click.stop
    >
      <div class="font-semibold mb-2">配額調整紀錄</div>
      <template v-for="t in displayTypes" :key="t">
        <div v-if="overrides?.[t]?.target != null" class="mb-1.5">
          <div class="flex items-baseline gap-1">
            <span class="font-bold text-gray-500 w-8 shrink-0">{{ t }}</span>
            <span class="text-blue-600">目標 {{ overrides[t].target }}</span>
            <span class="text-gray-400">（原 {{ rotationQuota?.[t] ?? '–' }}）</span>
          </div>
          <div v-if="overrides[t].note" class="text-gray-500 mt-0.5 ml-8 leading-relaxed">
            {{ overrides[t].note }}
          </div>
        </div>
      </template>
      <button @click="showNotePanel = false" class="mt-1 text-blue-600 hover:underline w-full text-right">收起</button>
    </div>
  </td>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { calcPersonStats } from '../../utils/shiftCalc.js'
import { useShiftTypesStore } from '../../stores/shiftTypes.js'

const props = defineProps({
  userId:        { type: String,  required: true },
  shifts:        { type: Object,  default: () => ({}) },
  quota:         { type: Object,  default: () => null },
  isSupport:     { type: Boolean, default: false },
  dayInfos:      { type: Array,   default: () => [] },
  overrides:     { type: Object,  default: () => ({}) },   // { D: { target, note }, … }
  rotationQuota: { type: Object,  default: () => null },   // { D, N, Off, W6Off } 純輪序值
  isEditable:    { type: Boolean, default: false }
})

const emit = defineEmits(['update-override'])

const shiftTypesStore = useShiftTypesStore()
const bumping = ref(null)
const expandedType = ref(null)
const showNotePanel = ref(false)

function closeAll() { expandedType.value = null; showNotePanel.value = false }
onMounted(() => document.addEventListener('click', closeAll))
onUnmounted(() => document.removeEventListener('click', closeAll))
const editTarget = ref('')
const editNote = ref('')

const displayTypes = ['D', 'N', 'Off', 'W6Off']

const internalIds = computed(() => {
  const ids = new Set(['D', 'N'])
  shiftTypesStore.activeTypes.forEach(t => {
    if (t.id === 'Off' || t.id === 'W6Off') return
    const hasQuota = Object.values(t.quota || {}).some(v => v !== null && v !== '' && Number(v) > 0)
    if (hasQuota) ids.add(t.id)
  })
  return ids
})

const stats = computed(() => calcPersonStats(props.shifts, props.quota, props.dayInfos, internalIds.value))
const byType = computed(() => stats.value.byType)

const hasAnyOverride = computed(() =>
  displayTypes.some(t => props.overrides?.[t]?.target != null)
)

// Populate edit fields when expanding a cell
watch(expandedType, (type) => {
  if (!type) return
  editTarget.value = props.overrides?.[type]?.target ?? props.quota?.[type] ?? ''
  editNote.value = props.overrides?.[type]?.note ?? ''
})

// Close note panel when expanding a type cell
watch(expandedType, () => { showNotePanel.value = false })

// Bump animation on actual count change
watch(() => stats.value.actual, (newVal, oldVal) => {
  if (!oldVal) return
  for (const t of displayTypes) {
    if (newVal[t] !== oldVal[t]) {
      bumping.value = t
      setTimeout(() => { bumping.value = null }, 300)
      break
    }
  }
}, { deep: true })

const expandDays = computed(() => {
  if (!expandedType.value) return []
  const type = expandedType.value
  const ids = internalIds.value
  const satDays = new Set(props.dayInfos.filter(d => d.dayType === 'saturday').map(d => String(d.day)))

  return Object.entries(props.shifts || {})
    .filter(([day, v]) => {
      if (!v) return false
      const isInternal = ids.has(v)
      const effectiveShift = (isInternal && v !== 'Off') ? v : 'Off'
      if (type === 'W6Off') return effectiveShift === 'Off' && satDays.has(String(day))
      return effectiveShift === type
    })
    .map(([day, value]) => ({ day, value }))
    .sort((a, b) => parseInt(a.day) - parseInt(b.day))
})

function cellClass(type) {
  const s = byType.value[type]?.status
  if (!s || s === 'ok') return 'text-green-700 bg-green-50'
  if (s === 'under') return 'text-orange-600 bg-orange-50'
  if (s === 'over') return 'text-red-600 bg-red-50'
  return 'text-gray-700'
}

function statusIcon(type) {
  const s = byType.value[type]?.status
  if (s === 'ok') return '✓'
  if (s === 'under') return '↓'
  if (s === 'over') return '↑'
  return ''
}

function tooltipText(type) {
  const b = byType.value[type]
  const hasOv = props.overrides?.[type]?.target != null
  const rotLine = hasOv ? `\n原輪序配額：${props.rotationQuota?.[type] ?? '–'}` : ''
  const note = props.overrides?.[type]?.note
  const noteLine = note ? `\n備註：${note}` : ''
  if (!b || b.quota === null) return `${type}: ${b?.actual ?? 0}${rotLine}${noteLine}`
  if (b.status === 'ok')    return `${type}：符合（${b.actual}/${b.quota}）${rotLine}${noteLine}`
  if (b.status === 'under') return `${type}：不足 ${Math.abs(b.diff)}（${b.actual}/${b.quota}）${rotLine}${noteLine}`
  if (b.status === 'over')  return `${type}：超出 ${b.diff}（${b.actual}/${b.quota}）${rotLine}${noteLine}`
  return ''
}

function toggleExpand(type) {
  expandedType.value = expandedType.value === type ? null : type
}

function saveOverride() {
  const type = expandedType.value
  if (!type) return
  const target = (editTarget.value !== '' && editTarget.value !== null)
    ? Number(editTarget.value)
    : null
  emit('update-override', { type, target, note: editNote.value.trim() })
  expandedType.value = null
}

function clearOverride() {
  const type = expandedType.value
  if (!type) return
  emit('update-override', { type, target: null, note: '' })
  expandedType.value = null
}
</script>
