/**
 * 班別計算工具 — 完整健康檢查版本
 */

export const SHIFT_TYPES = ['D', 'N', 'Off']

/**
 * 統計一個人員的班別次數
 */
export function countShifts(scheduleRow, internalIds = new Set()) {
  const counts = { D: 0, N: 0, Off: 0 }
  if (!scheduleRow) return counts
  
  Object.entries(scheduleRow).forEach(([key, value]) => {
    if (key.startsWith('day_') && value) {
      if (value === 'Off') {
        counts.Off++
      } else if (value === 'D' || value === 'N' || internalIds.has(value)) {
        if (counts[value] !== undefined) counts[value]++
        else counts[value] = 1
      } else {
        counts.Off++ // 外援
      }
    }
  })
  return counts
}

/**
 * 取得需求人數
 */
export function getRequiredCount(shift, dayType, settings) {
  if (!settings || !shift) return null
  const mapping = {
    weekday: { D: 'wdD', N: 'wdN' },
    saturday: { D: 'satD', N: 'satN' },
    sunday: { D: 'sunD', N: 'sunN' },
    holiday: { D: 'holD', N: 'holN' }
  }
  const key = mapping[dayType]?.[shift]
  if (key && settings[key] !== undefined) return parseInt(settings[key]) || 0
  return null
}

/**
 * 計算個人統計並與配額比對
 */
export function calcPersonStats(shifts, quota, dayInfos = [], internalIds = new Set()) {
  const actual = { D: 0, N: 0, Off: 0, W6Off: 0 }
  const satDays = new Set(dayInfos.filter(d => d.dayType === 'saturday').map(d => String(d.day)))

  Object.entries(shifts || {}).forEach(([day, val]) => {
    if (!val) return
    const isInternal = (val === 'D' || val === 'N' || val === 'Off' || internalIds.has(val))
    const effectiveShift = isInternal ? val : 'Off'

    if (actual[effectiveShift] !== undefined) actual[effectiveShift]++
    else actual[effectiveShift] = (actual[effectiveShift] || 0) + 1

    if (effectiveShift === 'Off' && satDays.has(String(day))) {
      actual.W6Off++
    }
  })

  const result = {}
  const typesToCheck = new Set(['D', 'N', 'Off', 'W6Off', ...Object.keys(quota || {})])
  
  typesToCheck.forEach(type => {
    const q = quota?.[type] ?? null
    const a = actual[type] || 0
    const diff = q !== null ? a - q : 0
    let status = 'ok'
    if (q !== null && diff < 0) status = 'under'
    if (q !== null && diff > 0) status = 'over'
    result[type] = { actual: a, quota: q, diff, status }
  })

  return { actual, byType: result }
}

/**
 * 計算某天各班別分佈
 */
export function calcDayStats(allShifts, day, dayType, settings) {
  const counts = { D: 0, N: 0, Off: 0 }
  const key = `day_${day}`

  Object.values(allShifts || {}).forEach(row => {
    const val = row[key]
    if (val) {
      if (counts[val] !== undefined) counts[val]++
      else counts[val] = (counts[val] || 0) + 1
    }
  })

  const status = {}
  Object.keys(counts).forEach(t => {
    if (t === 'Off') { status[t] = 'ok'; return }
    const r = getRequiredCount(t, dayType, settings)
    if (r === null) { status[t] = 'ok'; return }
    if (counts[t] < r) status[t] = 'under'
    else if (counts[t] > r) status[t] = 'over'
    else status[t] = 'ok'
  })
  if (!status.Off) status.Off = 'ok'

  return { counts, status }
}

/**
 * 計算整體班表健康度 (核心修復)
 */
export function calcScheduleHealth(allShifts, allQuotas, settings, dayInfos, internalIds = new Set()) {
  const anomalies = []
  const overQuota = []

  // 1. 檢查每人配額達成狀況
  Object.entries(allShifts || {}).forEach(([userId, row]) => {
    const quota = allQuotas?.[userId]
    if (!quota) return
    const stats = calcPersonStats(
      Object.fromEntries(Object.entries(row).filter(([k]) => k.startsWith('day_')).map(([k, v]) => [k.replace('day_', ''), v])),
      quota,
      dayInfos,
      internalIds
    )
    
    Object.keys(stats.byType).forEach(type => {
      const { diff, status } = stats.byType[type]
      if (status !== 'ok') {
        overQuota.push({ userId, type, diff, actual: stats.byType[type].actual, quota: quota[type] })
      }
    })
  })

  // 2. 檢查每日人力是否補齊
  dayInfos.forEach(({ day, dayType }) => {
    const dayStats = calcDayStats(allShifts, day, dayType, settings)
    Object.keys(dayStats.status).forEach(t => {
      if (dayStats.status[t] !== 'ok') {
        anomalies.push({ day, dayType, shift: t, actual: dayStats.counts[t] })
      }
    })
  })

  // 3. 計算完成度 (Completion Rate)
  const userIds = Object.keys(allShifts || {})
  const totalCells = userIds.length * dayInfos.length
  let filledCells = 0
  userIds.forEach(uid => {
    dayInfos.forEach(({ day }) => {
      if (allShifts[uid]?.[`day_${day}`]) filledCells++
    })
  })
  const completionRate = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0

  return { completionRate, anomalies, overQuota }
}
