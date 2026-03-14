<template>
  <tfoot class="sticky bottom-0 z-10 bg-white border-t-2 border-gray-300">
    <!-- Actual counts row -->
    <tr>
      <td class="sticky left-0 bg-gray-50 border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600 min-w-[80px]">
        實際人數
      </td>
      <td
        v-for="d in dayInfos"
        :key="`actual-${d.day}`"
        :class="['border border-gray-200 px-1 py-0.5 text-center text-xs min-w-[44px]', dayColClass(d)]"
      >
        <div v-for="shift in ['D','N','Off','AM']" :key="shift" class="flex justify-between gap-1">
          <span class="text-gray-400">{{ shift }}</span>
          <span :class="countClass(shift, d)">{{ dayCounts(d)[shift] }}</span>
        </div>
      </td>
      <!-- Stats columns placeholder -->
      <td v-for="i in 4" :key="`stat-${i}`" class="border border-gray-200"></td>
    </tr>
    <!-- Required vs actual row -->
    <tr>
      <td class="sticky left-0 bg-gray-50 border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600">
        需求比對
      </td>
      <td
        v-for="d in dayInfos"
        :key="`req-${d.day}`"
        :class="['border border-gray-200 px-1 py-0.5 text-center text-xs min-w-[44px]', dayColClass(d)]"
        :title="dayTooltip(d)"
      >
        <div v-for="shift in ['D','N','AM']" :key="shift" class="flex justify-between gap-1">
          <span class="text-gray-400">{{ shift }}</span>
          <span :class="reqClass(shift, d)">
            {{ dayRequired(d)[shift] !== null ? dayRequired(d)[shift] : '–' }}
            {{ reqIcon(shift, d) }}
          </span>
        </div>
      </td>
      <td v-for="i in 4" :key="`req-stat-${i}`" class="border border-gray-200"></td>
    </tr>
  </tfoot>
</template>

<script setup>
import { computed } from 'vue'
import { calcDayStats } from '../../utils/shiftCalc.js'

const props = defineProps({
  allShifts: { type: Object, default: () => ({}) },
  dayInfos: { type: Array, default: () => [] },
  settings: { type: Object, default: () => ({}) },
  holidays: { type: Array, default: () => [] }
})

function dayCounts(d) {
  return calcDayStats(props.allShifts, d.day, d.dayType, props.settings).counts
}

function dayRequired(d) {
  return calcDayStats(props.allShifts, d.day, d.dayType, props.settings).required
}

function dayStatus(d) {
  return calcDayStats(props.allShifts, d.day, d.dayType, props.settings).status
}

function dayColClass(d) {
  if (d.dayType === 'holiday') return 'bg-orange-50'
  if (d.dayType === 'saturday') return 'bg-blue-50'
  if (d.dayType === 'sunday') return 'bg-red-50'
  return ''
}

function countClass(shift, d) {
  const status = dayStatus(d)
  if (status[shift] === 'under') return 'text-yellow-600 font-semibold'
  if (status[shift] === 'over') return 'text-orange-600 font-semibold'
  return 'text-gray-700'
}

function reqClass(shift, d) {
  const status = dayStatus(d)
  if (status[shift] === 'under') return 'text-yellow-600'
  if (status[shift] === 'over') return 'text-orange-600'
  return 'text-green-600'
}

function reqIcon(shift, d) {
  const status = dayStatus(d)
  if (status[shift] === 'under') return '⚠'
  if (status[shift] === 'over') return '↑'
  if (status[shift] === 'ok') return '✓'
  return ''
}

function dayTooltip(d) {
  const holiday = props.holidays.find(h => {
    const dayNum = parseInt(d.dateStr?.split('-')[2])
    return h.isHoliday && dayNum === d.day
  })
  return holiday ? holiday.name : ''
}
</script>
