import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api/gas.js'

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref([])
  const loading = ref(false)
  const error = ref(null)

  const unreadCount = computed(() =>
    notifications.value.filter(n => !n.readAt && n.status === 'pending').length
  )

  const pendingSwaps = computed(() =>
    notifications.value.filter(
      n => n.type === 'swap_request' && n.status === 'pending'
    )
  )

  async function fetchNotifications(userId) {
    loading.value = true
    error.value = null
    try {
      const result = await api.getNotifications(userId)
      if (!result.success) {
        error.value = result.error || '無法取得通知'
        return
      }
      notifications.value = result.data || []
    } catch (err) {
      error.value = err.message || '取得通知時發生錯誤'
    } finally {
      loading.value = false
    }
  }

  async function markRead(notificationId) {
    error.value = null
    try {
      // Optimistically update local state
      const notification = notifications.value.find(n => n.notificationId === notificationId)
      if (notification) {
        notification.readAt = new Date().toISOString()
      }
    } catch (err) {
      error.value = err.message
    }
  }

  async function respondSwap(notificationId, accept) {
    error.value = null
    try {
      const result = await api.respondSwap({ notificationId, accept })
      if (!result.success) {
        error.value = result.error || '回覆失敗'
        return false
      }
      // Update local notification status
      const notification = notifications.value.find(n => n.notificationId === notificationId)
      if (notification) {
        notification.status = accept ? 'accepted' : 'rejected'
        notification.readAt = new Date().toISOString()
      }
      return true
    } catch (err) {
      error.value = err.message || '回覆換班申請時發生錯誤'
      return false
    }
  }

  function addNotification(notification) {
    const existing = notifications.value.find(
      n => n.notificationId === notification.notificationId
    )
    if (!existing) {
      notifications.value.unshift(notification)
    }
  }

  return {
    notifications,
    unreadCount,
    pendingSwaps,
    loading,
    error,
    fetchNotifications,
    markRead,
    respondSwap,
    addNotification
  }
})
