<template>
  <div class="bg-amber-50 border border-amber-200 rounded-lg p-4">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-semibold text-amber-800 flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        自動排班衝突報告（{{ conflicts.length }} 筆）
      </h3>
      <button @click="showDetails = !showDetails" class="text-xs text-amber-700 hover:underline">
        {{ showDetails ? '收起' : '展開' }}
      </button>
    </div>

    <div v-if="showDetails">
      <table class="w-full text-xs">
        <thead>
          <tr class="border-b border-amber-200">
            <th class="text-left py-1 px-2 text-amber-700">人員</th>
            <th class="text-left py-1 px-2 text-amber-700">日期</th>
            <th class="text-left py-1 px-2 text-amber-700">原班別</th>
            <th class="text-left py-1 px-2 text-amber-700">嘗試排入</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(conflict, idx) in conflicts"
            :key="idx"
            class="border-b border-amber-100"
          >
            <td class="py-1.5 px-2 font-medium">{{ getUserName(conflict.userId) }}</td>
            <td class="py-1.5 px-2">第 {{ conflict.day }} 天</td>
            <td class="py-1.5 px-2">
              <span class="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{{ conflict.existing }}</span>
            </td>
            <td class="py-1.5 px-2">
              <span class="bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{{ conflict.attempted }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="text-xs text-amber-600 mt-2">請手動調整上述衝突後再鎖定班表。</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  conflicts: {
    type: Array,
    default: () => []
  },
  users: {
    type: Array,
    default: () => []
  }
})

const showDetails = ref(true)

function getUserName(userId) {
  const user = props.users.find(u => u.userId === userId)
  return user?.name || userId
}
</script>
