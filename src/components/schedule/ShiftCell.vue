<template>
  <div
    :class="[
      'relative w-full min-w-[44px] min-h-[36px] flex items-center justify-center select-none',
      cellClass,
      isEditable ? 'cursor-pointer' : 'cursor-default'
    ]"
    :title="tooltipText"
    v-click-outside="() => hovered = false"
    @click="isEditable && !suppressClick && (hovered = !hovered)"
  >
    <span class="text-xs font-medium">{{ displayValue }}</span>

    <!-- OverBook warning -->
    <span
      v-if="isOverBooked"
      class="absolute top-0.5 right-0.5 text-red-500 text-xs leading-none"
      title="超預警示"
    >!</span>

    <!-- Daily over-quota dot -->
    <span
      v-else-if="dayOverDot"
      :class="[
        'absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full',
        dayOverDot === 'red' ? 'bg-red-500' : 'bg-orange-400'
      ]"
      :title="dayOverTooltip"
    ></span>

    <!-- Cell note badge -->
    <span
      v-if="cellNote === '補排'"
      class="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-tl-sm"
      title="補排"
    ></span>
    <span
      v-else-if="cellNote === '待補'"
      class="absolute bottom-0 right-0 w-2 h-2 bg-yellow-400 rounded-tl-sm"
      title="待補"
    ></span>

    <!-- Request indicator badge (bottom-left) -->
    <span
      v-if="requestShift !== null && requestShift !== undefined"
      :class="[
        'absolute bottom-0 left-0 text-[9px] leading-none px-0.5 rounded-tr font-mono font-bold pointer-events-none',
        requestShift === shift
          ? 'bg-green-100 text-green-600'
          : isDisputedRequest
            ? 'bg-orange-100 text-orange-600'
            : 'bg-blue-100 text-blue-600'
      ]"
      :title="requestShift === shift ? '預約已確認' : isDisputedRequest ? '爭議預約：' + requestShift : '預約：' + requestShift"
    >{{ requestShift === shift ? '✓' : requestShift }}</span>

    <!-- Radial picker -->
    <div
      v-if="hovered && isEditable"
      class="absolute z-30 top-1/2 left-1/2"
      style="width: 0; height: 0;"
      @click.stop
    >
      <!-- Cancel at center -->
      <button
        class="absolute w-7 h-7 rounded-full bg-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-300 z-10 flex items-center justify-center shadow"
        style="transform: translate(-50%, -50%)"
        @click.stop="select(null)"
      >✕</button>
      <!-- Shift options radially -->
      <button
        v-for="opt in radialOptions"
        :key="opt.value"
        :class="[
          'absolute w-8 h-8 rounded-full text-xs font-medium flex items-center justify-center transition-colors shadow border',
          shift === opt.value ? opt.activeClass : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
        ]"
        :style="opt.style"
        @click.stop="select(opt.value)"
      >{{ opt.label }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useShiftTypesStore } from '../../stores/shiftTypes.js'

const RADIAL_RADIUS = 50

const props = defineProps({
  shift: { type: String, default: null },
  isEditable: { type: Boolean, default: false },
  suppressClick: { type: Boolean, default: false },
  isInDragSelection: { type: Boolean, default: false },
  isOverBooked: { type: Boolean, default: false },
  cellNote: { type: String, default: null },
  dayType: { type: String, default: 'weekday' },
  dayCounts: { type: Object, default: null },
  dayRequired: { type: Object, default: null },
  requestShift: { type: String, default: null },
  isDisputedRequest: { type: Boolean, default: false },
  includeRequestOnly: { type: Boolean, default: false }
})

const emit = defineEmits(['update'])

const shiftTypesStore = useShiftTypesStore()
const hovered = ref(false)

const radialOptions = computed(() => {
  const types = props.includeRequestOnly ? shiftTypesStore.requestTypes : shiftTypesStore.activeTypes
  const opts = types.map(t => ({
    value: t.id,
    label: t.label,
    activeClass: shiftTypesStore.getActiveClass(t.id)
  }))
  const n = opts.length
  return opts.map((opt, i) => {
    const angle = (2 * Math.PI / n) * i - Math.PI / 2
    const x = Math.round(RADIAL_RADIUS * Math.cos(angle))
    const y = Math.round(RADIAL_RADIUS * Math.sin(angle))
    return { ...opt, style: `transform: translate(calc(${x}px - 50%), calc(${y}px - 50%));` }
  })
})

const displayValue = computed(() => {
  if (!props.shift) return ''
  const t = shiftTypesStore.allTypes.find(t => t.id === props.shift)
  return t ? t.label : props.shift
})

const cellClass = computed(() => {
  const base = shiftTypesStore.getCellClass(props.shift)
  if (props.isInDragSelection) return base + ' ring-2 ring-blue-400 ring-inset'
  return base + (props.isOverBooked ? ' ring-2 ring-red-400 ring-inset' : ' border border-gray-100')
})

watch(() => props.suppressClick, (val) => {
  if (val) hovered.value = false
})

const dayOverDot = computed(() => {
  if (!props.shift || !props.dayCounts || !props.dayRequired) return null
  const count = props.dayCounts[props.shift]
  const req = props.dayRequired[props.shift]
  if (req == null) return null
  if (props.shift === 'Off' && count > req) return 'red'
  if (['D', 'N', 'AM'].includes(props.shift) && count > req) return 'orange'
  return null
})

const dayOverTooltip = computed(() => {
  if (!props.shift || !props.dayCounts || !props.dayRequired) return ''
  return `當日${props.shift}班已達 ${props.dayCounts[props.shift]} 人（需求 ${props.dayRequired[props.shift]} 人）`
})

const tooltipText = computed(() => {
  if (props.isOverBooked) return '超預警示：此班別已超出配額'
  if (dayOverDot.value) return dayOverTooltip.value
  if (props.cellNote) return props.cellNote
  return ''
})

function select(value) {
  hovered.value = false
  if (value !== props.shift) emit('update', value)
}
</script>
