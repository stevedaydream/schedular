import { computed } from 'vue'
import { getDaysInMonth, getDayType, getMonthDays } from '../utils/dateHelper.js'
import { countShifts, getRequiredCount } from '../utils/shiftCalc.js'
import { useShiftTypesStore } from '../stores/shiftTypes.js'

/**
 * 配額計算
 */
export function useQuota(scheduleStore, settingsStore, holidaysRef) {
  const shiftTypesStore = useShiftTypesStore()

  function unwrap(val) {
    return val && typeof val === 'object' && 'value' in val ? val.value : val
  }

  /**
   * 判定一個班別是否為「內部上班」
   * 邏輯：D, N 永遠是內部；其他班別必須在任一天別有設定需求人數 > 0
   */
  const internalIds = computed(() => {
    const ids = new Set(['D', 'N'])
    shiftTypesStore.activeTypes.forEach(t => {
      if (t.id === 'Off' || t.id === 'W6Off') return
      const hasQuota = Object.values(t.quota || {}).some(v => v !== null && v !== '' && Number(v) > 0)
      if (hasQuota) {
        ids.add(t.id)
      }
    })
    return ids
  })

  /**
   * 計算當月配額目標 (Target) - 保持穩定
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

      // D, N 的需求
      totals.D += (shiftTypesStore.getRequiredCount('D', dayType) ?? (dayType === 'weekday' ? parseInt(settings.wdD) : 1) ?? 1)
      totals.N += (shiftTypesStore.getRequiredCount('N', dayType) ?? (dayType === 'weekday' ? parseInt(settings.wdN) : 1) ?? 1)

      // 所有的內部班別需求加總
      const totalInternalRequired = shiftTypesStore.activeTypes
        .filter(t => t.id !== 'Off' && t.id !== 'W6Off' && shiftTypesStore.isApplicable(t.id, dayType))
        .reduce((sum, t) => {
          // 只有在 internalIds 中的才算入需求（避免外援班別佔用名額）
          if (!internalIds.value.has(t.id)) return sum
          const r = shiftTypesStore.getRequiredCount(t.id, dayType) ?? 0
          return sum + r
        }, 0)

      const remainder = Math.max(0, totalPeople - totalInternalRequired)
      totals.Off += remainder
      if (dayOfWeek === 6) totals.W6Off += remainder
    })

    return totals
  })

  const perPersonQuota = computed(() => {
    const allUsers = unwrap(settingsStore.users) || []
    const activeUsers = allUsers.filter(
      u => u.isActive !== false && u.isActive !== 'false' && !(u.noSchedule === true || u.noSchedule === 'true')
    )
    const count = activeUsers.length
    if (count === 0) return { D: 0, N: 0, Off: 0, W6Off: 0 }
    const reqs = monthlyRequirements.value
    return {
      D: Math.round(reqs.D / count),
      N: Math.round(reqs.N / count),
      Off: Math.round(reqs.Off / count),
      W6Off: Math.round(reqs.W6Off / count)
    }
  })

  /**
   * 取得特定人員的統計
   */
  function checkUserQuota(userId) {
    const currentMonth = unwrap(scheduleStore.currentMonth)
    const scheduleData = unwrap(scheduleStore.scheduleData) || {}
    const scheduleRow = scheduleData[userId] || {}
    
    // 使用動態計算的 internalIds (即有設配額的班別)
    const actual = countShifts(scheduleRow, internalIds.value)
    const quota = perPersonQuota.value

    const meta = unwrap(scheduleStore.meta) || {}
    const dQuota = meta?.dQuota?.[userId]
    const nQuota = meta?.nQuota?.[userId]
    const offQuota = meta?.offQuota?.[userId]
    const w6offQuota = meta?.w6offQuota?.[userId]

    // Calculate actual W6Off (含週六外援)
    const monthDays = getMonthDays(currentMonth)
    const satDays = new Set(monthDays.filter(d => d.dayOfWeek === 6).map(d => d.day))
    let w6OffActual = 0
    Object.entries(scheduleRow).forEach(([key, val]) => {
      if (key.startsWith('day_') && val) {
        // 判定是否視為 Off (是 Off 本身，或是沒有配額的外援班別)
        const isInternal = internalIds.value.has(val)
        if (!isInternal || val === 'Off') { 
          const day = parseInt(key.replace('day_', ''))
          if (satDays.has(day)) w6OffActual++
        }
      }
    })

    return {
      D: { target: dQuota ?? quota.D, actual: actual.D, diff: actual.D - (dQuota ?? quota.D) },
      N: { target: nQuota ?? quota.N, actual: actual.N, diff: actual.N - (nQuota ?? quota.N) },
      Off: { target: offQuota ?? quota.Off, actual: actual.Off, diff: actual.Off - (offQuota ?? quota.Off) },
      W6Off: { target: w6offQuota ?? quota.W6Off, actual: w6OffActual, diff: w6OffActual - (w6offQuota ?? quota.W6Off) }
    }
  }

  const quotas = computed(() => {
    const result = {}
    const users = unwrap(settingsStore.users) || []
    users.forEach(u => { result[u.userId] = checkUserQuota(u.userId) })
    return result
  })

  return { quotas, monthlyRequirements, perPersonQuota, checkUserQuota, internalIds }
}
