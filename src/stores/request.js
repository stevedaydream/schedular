import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../api/gas.js'
import { getCurrentYYYYMM } from '../utils/dateHelper.js'

export const useRequestStore = defineStore('request', () => {
  const requestData = ref({})   // { userId: { day_1: 'D', ..., overBooked: [...] } }
  const currentMonth = ref(getCurrentYYYYMM())
  const loading = ref(false)
  const error = ref(null)

  async function fetchRequests(yyyyMM) {
    loading.value = true
    error.value = null
    try {
      const result = await api.getRequests(yyyyMM)
      if (!result.success) {
        error.value = result.error || '無法取得預約資料'
        return
      }
      currentMonth.value = yyyyMM
      requestData.value = result.data || {}
    } catch (err) {
      error.value = err.message || '取得預約資料時發生錯誤'
    } finally {
      loading.value = false
    }
  }

  async function saveRequest(userId, day, shift) {
    error.value = null
    try {
      const result = await api.saveRequest({
        yyyyMM: currentMonth.value,
        userId,
        day,
        shift
      })
      if (!result.success) {
        error.value = result.error || '預約儲存失敗'
        return { success: false, error: result.error }
      }
      // Update local state
      if (!requestData.value[userId]) {
        requestData.value[userId] = {}
      }
      requestData.value[userId][`day_${day}`] = shift
      if (result.data?.overBooked) {
        requestData.value[userId].overBooked = result.data.overBooked
      }
      return { success: true, overBooked: result.data?.overBooked || false }
    } catch (err) {
      error.value = err.message || '預約時發生錯誤'
      return { success: false, error: err.message }
    }
  }

  return {
    requestData,
    currentMonth,
    loading,
    error,
    fetchRequests,
    saveRequest
  }
})
