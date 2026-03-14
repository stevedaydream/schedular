import { ref } from 'vue'
import { runAutoSchedule } from '../utils/rotationEngine.js'
import { useHoliday } from './useHoliday.js'

/**
 * 自動排班
 * 包裝 rotationEngine.runAutoSchedule
 */
export function useAutoSchedule(scheduleStore, settingsStore) {
  const isRunning = ref(false)
  const conflictReport = ref([])
  const error = ref(null)

  const { fetchHolidays } = useHoliday()

  /**
   * 執行自動排班
   * @returns {boolean} success
   */
  /**
   * @param {Object|null} poolsOverride - 若傳入，直接用此 poolsMap 取代 settingsStore.rotationPools
   */
  async function runAutoScheduleAction(poolsOverride = null) {
    isRunning.value = true
    error.value = null
    conflictReport.value = []

    try {
      const yyyyMM = scheduleStore.currentMonth
      const year = parseInt(yyyyMM.slice(0, 4))

      // Load holidays
      const holidays = await fetchHolidays(year)

      const { users, settings, rotationPools } = settingsStore

      // Get active users
      const activeUsers = users.filter(
        u => u.isActive !== false && u.isActive !== 'false'
      )

      if (activeUsers.length === 0) {
        error.value = '沒有可排班的人員'
        return false
      }

      // Build pools map — use override if provided (e.g. from previous month's proposedPools)
      let poolsMap = {}
      if (poolsOverride) {
        poolsMap = poolsOverride
      } else {
        rotationPools.forEach(pool => {
          poolsMap[pool.poolName] = pool
        })
      }

      // Run the engine
      const result = runAutoSchedule(
        activeUsers,
        holidays,
        settings,
        poolsMap,
        yyyyMM
      )

      // Store conflicts
      conflictReport.value = result.conflicts

      // Convert schedule to batch save format
      const batchData = []
      Object.entries(result.schedule).forEach(([userId, shifts]) => {
        Object.entries(shifts).forEach(([dayKey, shift]) => {
          const day = parseInt(dayKey.replace('day_', ''))
          if (shift) {
            batchData.push({ userId, day, shift })
          }
        })
      })

      // Save to GAS
      const saved = await scheduleStore.batchSaveShifts({
        shifts: batchData,
        cellNotes: result.cellNotes,
        updatedPools: result.updatedPools
      })

      return saved
    } catch (err) {
      error.value = err.message || '自動排班時發生錯誤'
      return false
    } finally {
      isRunning.value = false
    }
  }

  return {
    runAutoSchedule: runAutoScheduleAction,
    conflictReport,
    isRunning,
    error
  }
}
