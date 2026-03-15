<template>
  <div class="min-h-screen bg-gray-50">
    <NavBar />

    <main class="max-w-4xl mx-auto px-4 py-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-semibold text-gray-900">換班管理</h2>
        <button @click="showSwapModal = true" class="btn-primary">
          申請換班
        </button>
      </div>

      <!-- Pending swaps from others -->
      <div v-if="pendingSwaps.length > 0" class="mb-6">
        <h3 class="text-base font-medium text-gray-700 mb-3 flex items-center gap-2">
          <span class="w-2 h-2 bg-red-500 rounded-full"></span>
          待處理的換班申請
        </h3>
        <div class="space-y-3">
          <div
            v-for="swap in pendingSwaps"
            :key="swap.notificationId"
            class="card border-l-4 border-orange-400"
          >
            <div class="flex items-start justify-between">
              <div>
                <p class="font-medium text-gray-900">
                  {{ getUserName(swap.fromUserId) }} 申請與您換班
                </p>
                <p class="text-sm text-gray-500 mt-1">
                  {{ formatMonth(swap.yyyyMM) }} 第 {{ swap.day }} 天 ·
                  他們的班：<span class="font-medium">{{ swap.fromShift }}</span> ↔
                  您的班：<span class="font-medium">{{ swap.toShift }}</span>
                </p>
              </div>
              <div class="flex gap-2 ml-4">
                <button
                  @click="handleRespond(swap.notificationId, true)"
                  class="text-sm bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700"
                >
                  接受
                </button>
                <button
                  @click="handleRespond(swap.notificationId, false)"
                  class="text-sm bg-red-500 text-white px-3 py-1.5 rounded-md hover:bg-red-600"
                >
                  拒絕
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- All swap history -->
      <div>
        <h3 class="text-base font-medium text-gray-700 mb-3">換班紀錄</h3>
        <div v-if="notificationStore.loading" class="text-center py-8 text-gray-500">
          載入中...
        </div>
        <div v-else-if="allSwaps.length === 0" class="text-center py-8 text-gray-400">
          目前沒有換班紀錄
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="swap in allSwaps"
            :key="swap.notificationId"
            class="card"
          >
            <!-- Header -->
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span
                    :class="[
                      'text-xs px-2 py-0.5 rounded-full font-medium',
                      statusClass(swap.status)
                    ]"
                  >{{ statusLabel(swap.status) }}</span>
                  <span class="text-sm text-gray-700">
                    {{ formatMonth(swap.yyyyMM) }} 第 {{ swap.day }} 天
                  </span>
                </div>
                <p class="text-xs text-gray-500 mt-1">
                  {{ getUserName(swap.fromUserId) }} → {{ getUserName(swap.toUserId) }} ·
                  {{ swap.fromShift }} ↔ {{ swap.toShift }}
                </p>
              </div>
              <span class="text-xs text-gray-400 shrink-0">{{ formatDate(swap.createdAt) }}</span>
            </div>

            <!-- Timeline (only for swaps I initiated) -->
            <div
              v-if="swap.fromUserId === authStore.user?.userId"
              class="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-1.5"
            >
              <!-- Step 1: submitted -->
              <div class="flex items-center gap-2 text-xs">
                <span class="w-3 h-3 rounded-full bg-blue-500 shrink-0"></span>
                <span class="text-gray-700 font-medium">已提出申請</span>
                <span class="text-gray-400">{{ formatDateTime(swap.createdAt) }}</span>
              </div>
              <!-- Step 2: waiting / replied -->
              <div class="flex items-center gap-2 text-xs">
                <span :class="['w-3 h-3 rounded-full border-2 shrink-0', swap.status !== 'pending' ? 'bg-blue-500 border-blue-500' : 'border-gray-300 bg-white']"></span>
                <span :class="swap.status !== 'pending' ? 'text-gray-700 font-medium' : 'text-gray-400'">
                  {{ swap.status !== 'pending' ? '對方已回覆' : '等待對方回覆…' }}
                </span>
              </div>
              <!-- Step 3: result -->
              <div v-if="swap.status !== 'pending'" class="flex items-center gap-2 text-xs">
                <span :class="['w-3 h-3 rounded-full shrink-0', swap.status === 'accepted' || swap.status === 'done' ? 'bg-green-500' : 'bg-red-400']"></span>
                <span :class="swap.status === 'accepted' || swap.status === 'done' ? 'text-green-700 font-medium' : 'text-red-600 font-medium'">
                  {{ swap.status === 'accepted' || swap.status === 'done' ? '換班成功' : '已拒絕' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Swap request modal -->
    <SwapRequestModal
      v-if="showSwapModal"
      :users="settingsStore.users"
      :currentUserId="authStore.user?.userId"
      @close="showSwapModal = false"
      @submitted="onSwapSubmitted"
    />

    <!-- Swap notice modal (after acceptance) -->
    <SwapNoticeModal
      v-if="showNoticeModal"
      @close="showNoticeModal = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useNotificationStore } from '../stores/notification.js'
import { useSettingsStore } from '../stores/settings.js'
import { useAuthStore } from '../stores/auth.js'
import { formatMonthDisplay } from '../utils/dateHelper.js'
import NavBar from '../components/common/NavBar.vue'
import SwapRequestModal from '../components/swap/SwapRequestModal.vue'
import SwapNoticeModal from '../components/swap/SwapNoticeModal.vue'

const notificationStore = useNotificationStore()
const settingsStore = useSettingsStore()
const authStore = useAuthStore()

const showSwapModal = ref(false)
const showNoticeModal = ref(false)

const pendingSwaps = computed(() => notificationStore.pendingSwaps)

const allSwaps = computed(() =>
  notificationStore.notifications.filter(n =>
    n.type?.startsWith('swap')
  )
)

function getUserName(userId) {
  const user = settingsStore.users.find(u => u.userId === userId)
  return user?.name || userId
}

function formatMonth(yyyyMM) {
  return formatMonthDisplay(yyyyMM)
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('zh-TW')
}

function formatDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function statusLabel(status) {
  const map = {
    pending: '待回覆',
    accepted: '已接受',
    rejected: '已拒絕',
    done: '已完成'
  }
  return map[status] || status
}

function statusClass(status) {
  const map = {
    pending: 'bg-yellow-100 text-yellow-700',
    accepted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    done: 'bg-blue-100 text-blue-700'
  }
  return map[status] || 'bg-gray-100 text-gray-700'
}

async function handleRespond(notificationId, accept) {
  const success = await notificationStore.respondSwap(notificationId, accept)
  if (success && accept) {
    showNoticeModal.value = true
  }
}

function onSwapSubmitted() {
  showSwapModal.value = false
  // Refresh notifications
  if (authStore.user) {
    notificationStore.fetchNotifications(authStore.user.userId)
  }
}

onMounted(async () => {
  await settingsStore.fetchUsers()
  if (authStore.user) {
    await notificationStore.fetchNotifications(authStore.user.userId)
  }
})
</script>
