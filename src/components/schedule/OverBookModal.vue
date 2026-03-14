<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-red-700 flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          超預警示
        </h3>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        <strong>{{ currentMonth.slice(0,4) }}年{{ currentMonth.slice(4,6) }}月 第{{ day }}天</strong>
        的 <strong>{{ shift }}</strong> 班預約人數已超出配額。
      </div>

      <p class="text-sm font-medium text-gray-700 mb-2">目前預約此班的人員：</p>
      <ul class="space-y-1 mb-4">
        <li
          v-for="(userId, idx) in bookedUserIds"
          :key="userId"
          class="flex items-center justify-between text-sm py-2 px-3 bg-gray-50 rounded-md"
        >
          <span class="font-medium">{{ getUserName(userId) }}</span>
          <span v-if="idx >= requiredCount" class="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
            建議退讓（依輪序）
          </span>
        </li>
      </ul>

      <p class="text-xs text-gray-500">
        系統依輪序排後面者優先建議退讓，最終由排班者決定。
      </p>

      <div class="mt-4 flex justify-end">
        <button @click="emit('close')" class="btn-primary">了解</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  day: { type: Number, required: true },
  shift: { type: String, required: true },
  requestData: { type: Object, default: () => ({}) },
  users: { type: Array, default: () => [] },
  currentMonth: { type: String, required: true }
})

const emit = defineEmits(['close'])

const bookedUserIds = computed(() =>
  Object.entries(props.requestData)
    .filter(([, row]) => row[`day_${props.day}`] === props.shift)
    .map(([userId]) => userId)
)

const requiredCount = computed(() => 1) // simplified; actual logic uses settings

function getUserName(userId) {
  const user = props.users.find(u => u.userId === userId)
  return user?.name || userId
}
</script>
