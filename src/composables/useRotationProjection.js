/**
 * useRotationProjection
 * 輪序投影工具：不寫入任何資料，純推算指定月份的六日班別分配。
 */
import { useHoliday } from './useHoliday.js'
import { getMonthDays, getDayType, addMonths } from '../utils/dateHelper.js'
import { runAutoSchedule } from '../utils/rotationEngine.js'
import { api } from '../api/gas.js'
import { useSettingsStore } from '../stores/settings.js'

export function useRotationProjection() {
  const { holidays, fetchHolidays } = useHoliday()
  const settingsStore = useSettingsStore()

  // ── 模擬工具 ────────────────────────────────────────────────

  function advanceSimPool(pools, poolName) {
    const pool = pools[poolName]
    if (!pool || !pool.order || pool.order.length === 0) return
    if (pool.skipQueue && pool.skipQueue.length > 0) {
      pool.skipQueue = pool.skipQueue.slice(1)
    } else {
      pool.lastIndex = ((pool.lastIndex ?? -1) + 1) % pool.order.length
    }
  }

  /**
   * 純日期推算：模擬 months 清單中每個月的六日輪序推進。
   * 不呼叫 GAS，不寫入任何資料。
   */
  function simulatePoolsThrough(pools, months) {
    const sim = JSON.parse(JSON.stringify(pools))
    months.forEach(yyyyMM => {
      const yr = yyyyMM.slice(0, 4)
      const monthHolidays = holidays.value?.filter(h => h.date.startsWith(yr)) || []
      getMonthDays(yyyyMM).forEach(({ dateStr }) => {
        const dayType = getDayType(dateStr, monthHolidays)
        if (dayType === 'saturday') {
          advanceSimPool(sim, 'satD')
          advanceSimPool(sim, 'satN')
        } else if (dayType === 'sunday') {
          advanceSimPool(sim, 'sunD')
          advanceSimPool(sim, 'sunN')
        } else if (dayType === 'holiday') {
          advanceSimPool(sim, 'holD')
          advanceSimPool(sim, 'holN')
        }
      })
    })
    return sim
  }

  /**
   * 取得填入 yyyyMM 時應使用的輪序起點：
   * 往回最多找 6 個月的 proposedPools 作為基準，
   * 基準到目標月份之間的空缺用日期推算模擬補齊。
   */
  async function getEffectiveRotationPools(yyyyMM) {
    let basePools = null
    let baseMonth = null

    let checkMonth = addMonths(yyyyMM, -1)
    for (let i = 0; i < 6; i++) {
      try {
        const result = await api.getSchedule({ yyyyMM: checkMonth })
        if (result.success && result.data.meta?.proposedPools) {
          const proposed = typeof result.data.meta.proposedPools === 'string'
            ? JSON.parse(result.data.meta.proposedPools)
            : result.data.meta.proposedPools
          if (proposed && Object.keys(proposed).length > 0) {
            basePools = proposed
            baseMonth = checkMonth
            break
          }
        }
      } catch (_) { /* continue */ }
      checkMonth = addMonths(checkMonth, -1)
    }

    if (!basePools) {
      if (settingsStore.rotationPools.length === 0) await settingsStore.fetchRotationPools()
      const map = {}
      settingsStore.rotationPools.forEach(p => { map[p.poolName] = p })
      return map
    }

    const gapMonths = []
    let curr = addMonths(baseMonth, 1)
    for (let s = 0; curr !== yyyyMM && s < 24; s++) {
      gapMonths.push(curr)
      curr = addMonths(curr, 1)
    }
    return gapMonths.length > 0 ? simulatePoolsThrough(basePools, gapMonths) : basePools
  }

  /**
   * 投影指定月份的六日班別分配（唯讀，不儲存）。
   * @returns {Array} [{ day, dateStr, dayOfWeek, dayType, dUserId, nUserId }]
   */
  async function projectMonth(yyyyMM) {
    const year = parseInt(yyyyMM.slice(0, 4))
    await fetchHolidays(year)

    const pools = await getEffectiveRotationPools(yyyyMM)
    const activeUsers = settingsStore.users.filter(
      u => u.isActive !== false && u.isActive !== 'false'
    )

    const result = runAutoSchedule(
      activeUsers,
      holidays.value || [],
      settingsStore.settings,
      pools,
      yyyyMM
    )

    const monthHolidays = holidays.value || []
    const assignments = []

    getMonthDays(yyyyMM).forEach(({ day, dateStr, dayOfWeek }) => {
      const dayType = getDayType(dateStr, monthHolidays)
      if (dayType !== 'saturday' && dayType !== 'sunday' && dayType !== 'holiday') return

      let dUserId = null
      let nUserId = null
      Object.entries(result.schedule).forEach(([uid, shifts]) => {
        if (shifts[`day_${day}`] === 'D') dUserId = uid
        if (shifts[`day_${day}`] === 'N') nUserId = uid
      })

      assignments.push({ day, dateStr, dayOfWeek, dayType, dUserId, nUserId })
    })

    return assignments
  }

  return { getEffectiveRotationPools, simulatePoolsThrough, projectMonth }
}
