import { computed } from 'vue'
import { getDaysInMonth, getDayType, getMonthDays } from '../utils/dateHelper.js'
import { countShifts, getRequiredCount } from '../utils/shiftCalc.js'
import { useShiftTypesStore } from '../stores/shiftTypes.js'

/**
 * 配額計算
 * 計算每位人員每種班別的建議配額，並提供超額/不足警示
 */
export function useQuota(scheduleStore, settingsStore, holidaysRef) {
  const shiftTypesStore = useShiftTypesStore()

  // Helper to unwrap either a plain value or a computed ref
  function unwrap(val) {
    return val && typeof val === 'object' && 'value' in val ? val.value : val
  }

  function reqCount(shiftId, dayType, settings) {
    return shiftTypesStore.getRequiredCount(shiftId, dayType)
      ?? getRequiredCount(shiftId, dayType, settings)
      ?? 0
  }

  /**
   * 計算當月各班別總需求量（與 monthSummary 邏輯一致）
   */
  const monthlyRequirements = computed(() => {
    const currentMonth = unwrap(scheduleStore.currentMonth)
    const settings = unwrap(settingsStore.settings)
    const users = unwrap(settingsStore.users) || []
    const holidays = unwrap(holidaysRef) || []

    const monthDays = getMonthDays(currentMonth)
    const totals = { D: 0, N: 0, Off: 0, W6Off: 0 }

    const activeUsers = users.filter(
      u => u.isActive !== false && u.isActive !== 'false' && !(u.noSchedule === true || u.noSchedule === 'true')
    )
    const totalPeople = activeUsers.length

    monthDays.forEach(({ dateStr, dayOfWeek }) => {
      const dayType = getDayType(dateStr, holidays)

      totals.D += reqCount('D', dayType, settings)
      totals.N += reqCount('N', dayType, settings)

      // 計算該日所有值勤班別需求人數（排除 Off/W6Off）
      const totalRequired = shiftTypesStore.activeTypes
        .filter(t => t.id !== 'Off' && t.id !== 'W6Off' && shiftTypesStore.isApplicable(t.id, dayType))
        .reduce((sum, t) => sum + reqCount(t.id, dayType, settings), 0)

      const remainder = Math.max(0, totalPeople - totalRequired)
      // Off = 整月所有可休假天數（含六日假日）
      totals.Off += remainder
      // W6Off = 星期六的可休假天數（含六+假日，以實際星期幾判斷）
      if (dayOfWeek === 6) totals.W6Off += remainder
    })

    return totals
  })

  /**
   * 計算每位人員的建議配額（平均分配）
   */
  const perPersonQuota = computed(() => {
    const allUsers = unwrap(settingsStore.users) || []
    const activeUsers = allUsers.filter(
      u => u.isActive !== false && u.isActive !== 'false' && !(u.noSchedule === true || u.noSchedule === 'true')
    )
    const count = activeUsers.length
    if (count === 0) return { D: 0, N: 0, Off: 0, W6Off: 0 }

    const reqs = monthlyRequirements.value
    // reqs.Off 已包含所有日期（含六）的可休假總數
    return {
      D: Math.round(reqs.D / count),
      N: Math.round(reqs.N / count),
      Off: Math.round(reqs.Off / count),
      W6Off: Math.round(reqs.W6Off / count)
    }
  })

  /**
   * 取得特定人員的配額 (考慮輪序配額)
   * @param {string} userId
   * @returns {{ D: { target, actual, diff }, N: {...}, Off: {...}, AM: {...} }}
   */
  function checkUserQuota(userId) {
    const currentMonth = unwrap(scheduleStore.currentMonth)
    const scheduleData = unwrap(scheduleStore.scheduleData) || {}
    const scheduleRow = scheduleData[userId] || {}
    const actual = countShifts(scheduleRow)
    const quota = perPersonQuota.value

    // Use meta quotas if available (dQuota, nQuota, offQuota, w6offQuota from applyMonthlyShiftQuota)
    const meta = unwrap(scheduleStore.meta) || {}
    const dQuota = meta?.dQuota?.[userId]
    const nQuota = meta?.nQuota?.[userId]
    const offQuota = meta?.offQuota?.[userId]
    const w6offQuota = meta?.w6offQuota?.[userId]

    // Calculate actual W6Off: Off shifts that fall on any Saturday (including Saturday+holiday)
    const monthDays = getMonthDays(currentMonth)
    const satDays = new Set(
      monthDays.filter(d => d.dayOfWeek === 6).map(d => d.day)
    )
    let w6OffActual = 0
    Object.entries(scheduleRow).forEach(([key, val]) => {
      if (key.startsWith('day_') && val === 'Off') {
        const day = parseInt(key.replace('day_', ''))
        if (satDays.has(day)) w6OffActual++
      }
    })

    return {
      D: {
        target: dQuota ?? quota.D,
        actual: actual.D,
        diff: actual.D - (dQuota ?? quota.D)
      },
      N: {
        target: nQuota ?? quota.N,
        actual: actual.N,
        diff: actual.N - (nQuota ?? quota.N)
      },
      Off: {
        target: offQuota ?? quota.Off,
        actual: actual.Off,
        diff: actual.Off - (offQuota ?? quota.Off)
      },
      W6Off: {
        target: w6offQuota ?? quota.W6Off,
        actual: w6OffActual,
        diff: w6OffActual - (w6offQuota ?? quota.W6Off)
      }
    }
  }

  /**
   * 所有人員的配額狀況
   */
  const quotas = computed(() => {
    const result = {}
    const users = unwrap(settingsStore.users) || []
    users.forEach(u => {
      result[u.userId] = checkUserQuota(u.userId)
    })
    return result
  })

  return {
    quotas,
    monthlyRequirements,
    perPersonQuota,
    checkUserQuota
  }
}
