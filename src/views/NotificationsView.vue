<template>
  <div class="min-h-screen bg-gray-50">
    <NavBar />

    <main class="max-w-2xl mx-auto px-4 py-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-semibold text-gray-900">通知中心</h2>
        <span
          v-if="notificationStore.unreadCount > 0"
          class="text-xs bg-red-500 text-white rounded-full px-2 py-0.5"
        >
          {{ notificationStore.unreadCount }} 則未讀
        </span>
      </div>

      <div v-if="notificationStore.loading" class="text-center py-12 text-gray-500">
        載入通知中...
      </div>

      <div
        v-else-if="notificationStore.notifications.length === 0"
        class="text-center py-12 text-gray-400"
      >
        <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>
        目前沒有通知
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="notification in notificationStore.notifications"
          :key="notification.notificationId"
          :class="[
            'card transition-all',
            !notification.readAt ? 'border-l-4 border-blue-500 bg-blue-50/30' : ''
          ]"
          @click="handleRead(notification)"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span
                  :class="[
                    'text-xs px-2 py-0.5 rounded-full font-medium',
                    typeClass(notification.type)
                  ]"
                >
                  {{ typeLabel(notification.type) }}
                </span>
                <span
                  :class="[
                    'text-xs px-2 py-0.5 rounded-full',
                    statusBadgeClass(notification.status)
                  ]"
                >
                  {{ statusLabel(notification.status) }}
                </span>
              </div>
              <p class="text-sm text-gray-800">{{ notificationText(notification) }}</p>
              <p class="text-xs text-gray-400 mt-1">{{ formatDate(notification.createdAt) }}</p>
            </div>
            <div v-if="!notification.readAt" class="w-2 h-2 bg-blue-500 rounded-full mt-1 flex-shrink-0"></div>
          </div>

          <!-- Actions for pending swap requests -->
          <div
            v-if="notification.type === 'swap_request' && notification.status === 'pending'"
            class="mt-3 flex gap-2"
            @click.stop
          >
            <button
              @click="respondSwap(notification.notificationId, true)"
              class="text-sm bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700"
            >
              接受換班
            </button>
            <button
              @click="respondSwap(notification.notificationId, false)"
              class="text-sm bg-red-500 text-white px-3 py-1.5 rounded-md hover:bg-red-600"
            >
              拒絕換班
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useNotificationStore } from '../stores/notification.js'
import { useAuthStore } from '../stores/auth.js'
import { useSettingsStore } from '../stores/settings.js'
import { formatMonthDisplay } from '../utils/dateHelper.js'
import NavBar from '../components/common/NavBar.vue'

const notificationStore = useNotificationStore()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()

function getUserName(userId) {
  const user = settingsStore.users.find(u => u.userId === userId)
  return user?.name || userId
}

function typeLabel(type) {
  const map = {
    swap_request: '換班申請',
    swap_accepted: '換班接受',
    swap_rejected: '換班拒絕',
    swap_reminder: '換班提醒'
  }
  return map[type] || type
}

function typeClass(type) {
  const map = {
    swap_request: 'bg-orange-100 text-orange-700',
    swap_accepted: 'bg-green-100 text-green-700',
    swap_rejected: 'bg-red-100 text-red-700',
    swap_reminder: 'bg-blue-100 text-blue-700'
  }
  return map[type] || 'bg-gray-100 text-gray-700'
}

function statusLabel(status) {
  const map = {
    pending: '待處理',
    accepted: '已接受',
    rejected: '已拒絕',
    done: '已完成'
  }
  return map[status] || status
}

function statusBadgeClass(status) {
  const map = {
    pending: 'bg-yellow-100 text-yellow-600',
    accepted: 'bg-green-100 text-green-600',
    rejected: 'bg-red-100 text-red-600',
    done: 'bg-gray-100 text-gray-600'
  }
  return map[status] || 'bg-gray-100 text-gray-600'
}

function notificationText(n) {
  const from = getUserName(n.fromUserId)
  const month = formatMonthDisplay(n.yyyyMM)
  switch (n.type) {
    case 'swap_request':
      return `${from} 申請與您換班（${month} 第 ${n.day} 天：${n.fromShift} ↔ ${n.toShift}）`
    case 'swap_accepted':
      return `${from} 已接受您的換班申請（${month} 第 ${n.day} 天）`
    case 'swap_rejected':
      return `${from} 已拒絕您的換班申請（${month} 第 ${n.day} 天）`
    case 'swap_reminder':
      return `換班已確認，請記得填寫紙本換班單並通知副主任（${month} 第 ${n.day} 天）`
    default:
      return '您有一則新通知'
  }
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-TW')
}

function handleRead(notification) {
  if (!notification.readAt) {
    notificationStore.markRead(notification.notificationId)
  }
}

async function respondSwap(notificationId, accept) {
  await notificationStore.respondSwap(notificationId, accept)
}

onMounted(async () => {
  await settingsStore.fetchUsers()
  if (authStore.user) {
    await notificationStore.fetchNotifications(authStore.user.userId)
  }
})
</script>
