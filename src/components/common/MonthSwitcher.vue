<template>
  <div class="flex items-center gap-3">
    <button
      @click="prev"
      :disabled="isPrevDisabled"
      :class="[
        'p-2 rounded-md transition-colors',
        isPrevDisabled
          ? 'text-gray-300 cursor-not-allowed'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
      ]"
      aria-label="上個月"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>

    <!-- Month display — click to open year calendar -->
    <div class="relative" ref="pickerRef">
      <button
        @click="showPicker = !showPicker"
        class="text-lg font-semibold text-gray-800 min-w-[120px] text-center px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
      >
        {{ displayMonth }}
        <svg class="inline w-3.5 h-3.5 ml-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      <!-- Year calendar dropdown -->
      <div
        v-if="showPicker"
        class="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 w-72"
      >
        <!-- Year navigation -->
        <div class="flex items-center justify-between mb-3">
          <button
            @click="pickerYear--"
            class="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <span class="font-semibold text-gray-800">{{ pickerYear }} 年</span>
          <button
            @click="pickerYear++"
            class="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>

        <!-- Month grid -->
        <div class="grid grid-cols-4 gap-1.5">
          <button
            v-for="m in 12"
            :key="m"
            @click="selectMonth(m)"
            :disabled="isMonthDisabled(m)"
            :class="[
              'py-1.5 rounded-lg text-sm font-medium transition-colors',
              isMonthDisabled(m)
                ? 'text-gray-300 cursor-not-allowed'
                : isSelected(m)
                  ? 'bg-blue-600 text-white'
                  : isCurrentMonth(m)
                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-300'
                    : 'text-gray-700 hover:bg-gray-100'
            ]"
          >
            {{ m }}月
          </button>
        </div>

        <!-- Today shortcut -->
        <div class="mt-3 pt-3 border-t border-gray-100 text-center">
          <button
            @click="selectToday"
            class="text-xs text-blue-600 hover:text-blue-800 hover:underline"
          >
            回到本月
          </button>
        </div>
      </div>
    </div>

    <button
      @click="next"
      class="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
      aria-label="下個月"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { addMonths, formatMonthDisplay, getCurrentYYYYMM } from '../../utils/dateHelper.js'

const props = defineProps({
  currentMonth: {
    type: String,
    required: true
  },
  minMonth: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['change'])

const displayMonth = computed(() => formatMonthDisplay(props.currentMonth))

const showPicker = ref(false)
const pickerYear = ref(parseInt(props.currentMonth.slice(0, 4)))
const pickerRef = ref(null)

// Sync pickerYear when currentMonth changes externally
watch(() => props.currentMonth, (val) => {
  pickerYear.value = parseInt(val.slice(0, 4))
})

// Open picker → show the year of the selected month
watch(showPicker, (val) => {
  if (val) pickerYear.value = parseInt(props.currentMonth.slice(0, 4))
})

const isPrevDisabled = computed(() => {
  if (!props.minMonth) return false
  return addMonths(props.currentMonth, -1) < props.minMonth
})

function isMonthDisabled(month) {
  if (!props.minMonth) return false
  const mm = String(month).padStart(2, '0')
  return `${pickerYear.value}${mm}` < props.minMonth
}

function isSelected(month) {
  const mm = String(month).padStart(2, '0')
  return props.currentMonth === `${pickerYear.value}${mm}`
}

function isCurrentMonth(month) {
  const now = getCurrentYYYYMM()
  const mm = String(month).padStart(2, '0')
  return now === `${pickerYear.value}${mm}`
}

function selectMonth(month) {
  if (isMonthDisabled(month)) return
  const mm = String(month).padStart(2, '0')
  emit('change', `${pickerYear.value}${mm}`)
  showPicker.value = false
}

function selectToday() {
  emit('change', getCurrentYYYYMM())
  showPicker.value = false
}

function prev() {
  emit('change', addMonths(props.currentMonth, -1))
}

function next() {
  emit('change', addMonths(props.currentMonth, 1))
}

// Close picker when clicking outside
function onClickOutside(e) {
  if (pickerRef.value && !pickerRef.value.contains(e.target)) {
    showPicker.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', onClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', onClickOutside))
</script>
