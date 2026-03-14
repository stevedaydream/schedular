import { ref, onUnmounted } from 'vue'

const POLL_INTERVAL = 30 * 1000 // 30 seconds

/**
 * 通知輪詢
 * 每 30 秒向 GAS 查詢新通知
 */
export function usePolling(notificationStore, authStore) {
  const isPolling = ref(false)
  let intervalId = null
  let notificationPermission = ref(Notification?.permission || 'default')

  async function requestNotificationPermission() {
    if (!('Notification' in window)) return
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission()
      notificationPermission.value = permission
    }
  }

  function showBrowserNotification(notification) {
    if (!('Notification' in window)) return
    if (Notification.permission !== 'granted') return

    const body = getNotificationBody(notification)
    new Notification('排班系統通知', {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: notification.notificationId
    })
  }

  function getNotificationBody(notification) {
    switch (notification.type) {
      case 'swap_request':
        return `收到換班申請：${notification.yyyyMM} 第 ${notification.day} 天`
      case 'swap_accepted':
        return `換班申請已被接受`
      case 'swap_rejected':
        return `換班申請已被拒絕`
      case 'swap_reminder':
        return `換班提醒：請記得填寫紙本換班單`
      default:
        return '您有新的通知'
    }
  }

  async function poll() {
    if (!authStore.isLoggedIn || !authStore.user) return

    try {
      const prevUnread = notificationStore.unreadCount
      await notificationStore.fetchNotifications(authStore.user.userId)

      // Show browser notification for new unread
      if (notificationStore.unreadCount > prevUnread) {
        const newNotifications = notificationStore.notifications
          .filter(n => !n.readAt && n.status === 'pending')
          .slice(0, notificationStore.unreadCount - prevUnread)

        newNotifications.forEach(showBrowserNotification)
      }
    } catch (err) {
      // Silent fail — polling should not disrupt user
    }
  }

  function startPolling() {
    if (isPolling.value) return
    isPolling.value = true

    // Request notification permission
    requestNotificationPermission()

    // Immediate first poll
    poll()

    // Set up interval
    intervalId = setInterval(poll, POLL_INTERVAL)
  }

  function stopPolling() {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
    isPolling.value = false
  }

  // Cleanup on unmount
  onUnmounted(() => {
    stopPolling()
  })

  return {
    isPolling,
    notificationPermission,
    startPolling,
    stopPolling,
    requestNotificationPermission
  }
}
