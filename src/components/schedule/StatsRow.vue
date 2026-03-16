<template>
  <template v-for="type in displayTypes" :key="type">
    <td
      :class="[
        'border border-gray-200 px-2 py-1 text-center text-xs font-medium min-w-[42px] cursor-pointer select-none transition-colors relative',
        cellClass(type),
        Math.abs(byType[type]?.diff ?? 0) >= 2 ? 'animate-alert-pulse' : ''
      ]"
      :title="tooltipText(type)"
      @click="toggleExpand(type)"
    >
      <span :class="['inline-block', bumping === type ? 'animate-count-bump' : '']">
        {{ byType[type]?.actual ?? 0 }}
      </span>
      <span class="text-gray-400">/</span>
      <span>{{ byType[type]?.quota ?? '–' }}</span>
      <span v-if="statusIcon(type)" class="ml-0.5">{{ statusIcon(type) }}</span>
    </td>
  </template>

  <!-- Expand detail panel -->
  <td v-if="expandedType" colspan="1" class="relative">
    <div class="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded shadow-lg p-3 min-w-[160px] text-xs text-gray-700">
      <div class="font-semibold mb-2">{{ expandedType }} 班明細</div>
      <div v-for="d in expandDays" :key="d.day" class="flex justify-between gap-4 py-0.5">
        <span>第 {{ d.day }} 日</span>
        <span class="font-medium">{{ d.value }}</span>
      </div>
      <div v-if="expandDays.length === 0" class="text-gray-400">無資料</div>
      <button @click="expandedType = null" class="mt-2 text-blue-600 hover:underline w-full text-right">收起</button>
    </div>
  </td>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { calcPersonStats } from '../../utils/shiftCalc.js'
import { useShiftTypesStore } from '../../stores/shiftTypes.js'

const props = defineProps({
  userId: { type: String, required: true },
  shifts: { type: Object, default: () => ({}) },
  quota: { type: Object, default: () => null },
  isSupport: { type: Boolean, default: false },
  dayInfos: { type: Array, default: () => [] }
})

const shiftTypesStore = useShiftTypesStore()
const bumping = ref(null)
const expandedType = ref(null)

const displayTypes = ['D', 'N', 'Off', 'W6Off']

/**
 * 判定一個班別是否為「內部上班」
 * 邏輯：D, N 永遠是內部；其他班別必須在任一天別有設定需求人數 > 0
 */
const internalIds = computed(() => {
  const ids = new Set(['D', 'N'])
  shiftTypesStore.activeTypes.forEach(t => {
    if (t.id === 'Off' || t.id === 'W6Off') return
    const hasQuota = Object.values(t.quota || {}).some(v => v !== null && v !== '' && Number(v) > 0)
    if (hasQuota) {
      ids.add(t.id)
    }
  })
  return ids
})

const stats = computed(() => calcPersonStats(props.shifts, props.quota, props.dayInfos, internalIds.value))
const byType = computed(() => stats.value.byType)

// Watch for changes to trigger bump animation
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
  if (!b || b.quota === null) return `${type}: ${b?.actual ?? 0}`
  if (b.status === 'ok') return `${type}：符合配額（${b.actual}/${b.quota}）`
  if (b.status === 'under') return `${type}：尚少 ${Math.abs(b.diff)} 個（${b.actual}/${b.quota}）`
  if (b.status === 'over') return `${type}：超出 ${b.diff} 個（${b.actual}/${b.quota}）`
  return ''
}

function toggleExpand(type) {
  expandedType.value = expandedType.value === type ? null : type
}
</script>
