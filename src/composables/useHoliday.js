import { ref } from 'vue'
import { api } from '../api/gas.js'

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

export function useHoliday() {
  const holidays = ref([])
  const loading = ref(false)
  const error = ref(null)

  function cacheKey(year) {
    return `holidays_cache_${year}`
  }

  function loadFromCache(year) {
    try {
      const cached = localStorage.getItem(cacheKey(year))
      if (!cached) return null
      const { data, timestamp } = JSON.parse(cached)
      if (Date.now() - timestamp > CACHE_TTL) return null
      return data
    } catch { return null }
  }

  function saveToCache(year, data) {
    try {
      localStorage.setItem(cacheKey(year), JSON.stringify({ data, timestamp: Date.now() }))
    } catch { }
  }

  function clearCache(year) {
    localStorage.removeItem(cacheKey(year))
  }

  async function fetchHolidays(year, forceRefresh = false) {
    loading.value = true
    error.value = null

    if (!forceRefresh) {
      const cached = loadFromCache(year)
      if (cached) {
        holidays.value = cached
        loading.value = false
        return cached
      }
    }

    try {
      // 優先讀管理員已存入 Sheets 的假日資料
      const sheetsResult = await api.getHolidays(year)
      if (sheetsResult.success && Array.isArray(sheetsResult.data) && sheetsResult.data.length > 0) {
        holidays.value = sheetsResult.data
        saveToCache(year, sheetsResult.data)
        return sheetsResult.data
      }

      // Sheets 無資料時，從 data.gov.tw 抓取
      const govResult = await api.getGovHolidays(year)
      if (!govResult.success) throw new Error(govResult.error || '載入失敗')
      holidays.value = govResult.data
      saveToCache(year, govResult.data)
      return govResult.data
    } catch (err) {
      error.value = `無法取得假日資料：${err.message}`
      holidays.value = []
      return []
    } finally {
      loading.value = false
    }
  }

  function isHoliday(dateStr) {
    return holidays.value.some(h => h.date === dateStr && h.isHoliday)
  }

  function getHolidayName(dateStr) {
    return holidays.value.find(h => h.date === dateStr)?.name || null
  }

  return { holidays, loading, error, fetchHolidays, clearCache, isHoliday, getHolidayName }
}
