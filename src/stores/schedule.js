import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api/gas.js'
import { getCurrentYYYYMM } from '../utils/dateHelper.js'

// Debounce map: key = "userId_day", value = { timer, pendingShift }
const _pendingSaves = new Map()

export const useScheduleStore = defineStore('schedule', () => {
  const scheduleData = ref({})   // { userId: { day_1: 'D', day_2: 'N', ... } }
  const currentMonth = ref(getCurrentYYYYMM())
  const isLocked = ref(false)
  const meta = ref({})           // { isLocked, lockedBy, cellNotes, offQuota }
  const loading = ref(false)
  const error = ref(null)
  const fetchedAt = ref(null)    // Date of last successful fetch

  const shiftRows = computed(() => scheduleData.value)

  async function fetchSchedule(yyyyMM) {
    loading.value = true
    error.value = null
    try {
      const result = await api.getSchedule(yyyyMM)
      if (!result.success) {
        error.value = result.error || '無法取得班表'
        return
      }
      currentMonth.value = yyyyMM
      scheduleData.value = result.data.schedule || {}
      meta.value = result.data.meta || {}
      isLocked.value = meta.value.isLocked === true || meta.value.isLocked === 'true'
      fetchedAt.value = new Date()
    } catch (err) {
      error.value = err.message || '取得班表時發生錯誤'
    } finally {
      loading.value = false
    }
  }

  function saveShift(userId, day, shift) {
    const key = `${userId}_${day}`

    // 1. 立即更新本地畫面（樂觀更新）
    if (!scheduleData.value[userId]) scheduleData.value[userId] = {}
    const prev = scheduleData.value[userId][`day_${day}`]
    scheduleData.value[userId][`day_${day}`] = shift

    // 2. Debounce：取消前一個未送出的計時器，只送最後一次值
    if (_pendingSaves.has(key)) {
      clearTimeout(_pendingSaves.get(key).timer)
    }

    const timer = setTimeout(async () => {
      _pendingSaves.delete(key)
      error.value = null
      try {
        const result = await api.saveShift({
          yyyyMM: currentMonth.value,
          userId,
          day,
          shift
        })
        if (!result.success) {
          // Rollback on failure
          scheduleData.value[userId][`day_${day}`] = prev
          error.value = result.error || '儲存失敗'
        }
      } catch (err) {
        scheduleData.value[userId][`day_${day}`] = prev
        error.value = err.message || '儲存時發生錯誤'
      }
    }, 600)

    _pendingSaves.set(key, { timer, shift })
  }

  async function batchSaveShifts(data) {
    loading.value = true
    error.value = null
    try {
      const result = await api.batchSaveShifts({
        yyyyMM: currentMonth.value,
        ...data
      })
      if (!result.success) {
        error.value = result.error || '批次儲存失敗'
        return false
      }
      // Refresh data from server
      await fetchSchedule(currentMonth.value)
      return true
    } catch (err) {
      error.value = err.message || '批次儲存時發生錯誤'
      return false
    } finally {
      loading.value = false
    }
  }

  async function lockSchedule(yyyyMM) {
    error.value = null
    try {
      const result = await api.lockSchedule({ yyyyMM })
      if (!result.success) {
        error.value = result.error || '鎖定失敗'
        return false
      }
      isLocked.value = true
      meta.value.isLocked = true
      return true
    } catch (err) {
      error.value = err.message || '鎖定時發生錯誤'
      return false
    }
  }

  async function unlockSchedule(yyyyMM) {
    error.value = null
    try {
      const result = await api.unlockSchedule({ yyyyMM })
      if (!result.success) {
        error.value = result.error || '解鎖失敗'
        return false
      }
      isLocked.value = false
      meta.value.isLocked = false
      return true
    } catch (err) {
      error.value = err.message || '解鎖時發生錯誤'
      return false
    }
  }

  async function clearSchedule(yyyyMM) {
    loading.value = true
    error.value = null
    try {
      const result = await api.clearSchedule({ yyyyMM })
      if (!result.success) {
        error.value = result.error || '清除失敗'
        return false
      }
      // Clear local state
      Object.keys(scheduleData.value).forEach(userId => {
        Object.keys(scheduleData.value[userId]).forEach(key => {
          scheduleData.value[userId][key] = null
        })
      })
      return true
    } catch (err) {
      error.value = err.message || '清除時發生錯誤'
      return false
    } finally {
      loading.value = false
    }
  }

  function setLocalShift(userId, day, shift) {
    if (!scheduleData.value[userId]) {
      scheduleData.value[userId] = {}
    }
    scheduleData.value[userId][`day_${day}`] = shift
  }

  return {
    scheduleData,
    currentMonth,
    isLocked,
    meta,
    loading,
    error,
    fetchedAt,
    shiftRows,
    fetchSchedule,
    saveShift,
    batchSaveShifts,
    lockSchedule,
    unlockSchedule,
    clearSchedule,
    setLocalShift
  }
})
