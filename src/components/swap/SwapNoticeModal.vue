<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
      <div class="text-center mb-4">
        <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-gray-900">換班已確認！</h3>
      </div>

      <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 space-y-2">
        <p class="text-sm font-semibold text-amber-800">請注意以下事項：</p>
        <div class="flex items-start gap-2 text-sm text-amber-700">
          <span class="flex-shrink-0 mt-0.5">1.</span>
          <span>請填寫<strong>紙本換班單</strong>並送至相關部門存檔</span>
        </div>
        <div class="flex items-start gap-2 text-sm text-amber-700">
          <span class="flex-shrink-0 mt-0.5">2.</span>
          <span>請<strong>通知副主任</strong>此次換班安排</span>
        </div>
        <div class="flex items-start gap-2 text-sm text-amber-700">
          <span class="flex-shrink-0 mt-0.5">3.</span>
          <span>確認後班表將正式更新</span>
        </div>
      </div>

      <button @click="emit('close')" class="btn-primary w-full">
        我已了解，確認完成
      </button>
    </div>
  </div>
</template>

<script setup>
const emit = defineEmits(['close'])
</script>
