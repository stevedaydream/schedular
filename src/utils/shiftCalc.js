/**
 * 班別計算工具
 */

export const SHIFT_TYPES = ['D', 'N', 'Off', 'H3']

export const SHIFT_COLORS = {
  D: 'bg-yellow-100 text-yellow-800',
  N: 'bg-blue-100 text-blue-800',
  Off: 'bg-green-100 text-green-800',
  H3: 'bg-pink-100 text-pink-800',
  null: 'bg-white text-gray-400'
}

export const SHIFT_LABELS = {
  D: 'D',
  N: 'N',
  Off: 'Off',
  H3: 'H3',
  null: ''
}

/**
 * 統計一個人員的班別次數
 * @param {Object} scheduleRow - { day_1: 'D', day_2: 'N', ... }
 * @returns {Object} { D: number, N: number, Off: number, H3: number, ... }
 */
export function countShifts(scheduleRow) {
  const counts = { D: 0, N: 0, Off: 0, H3: 0 }
  if (!scheduleRow) return counts
  Object.entries(scheduleRow).forEach(([key, value]) => {
    if (key.startsWith('day_') && value) {
      if (counts[value] !== undefined) counts[value]++
      else counts[value] = 1
    }
  })
  return counts
}

/**
 * 檢查某班別在某天是否超預
 * @param {string} shift - 'D'|'N'|'Off'
 * @param {number} day
 * @param {Object} requests - { userId: { day_1: 'D', ... }, ... }
 * @param {Object} settings - { wdD: 1, wdN: 1, ... }
 * @param {string} dayType - 'weekday'|'saturday'|'sunday'|'holiday'
 */
export function isOverBooked(shift, day, requests, settings, dayType) {
  const required = getRequiredCount(shift, dayType, settings)
  if (required === null) return false // no limit

  let count = 0
  Object.values(requests).forEach(row => {
    if (row[`day_${day}`] === shift) count++
  })
  return count > required
}

/**
 * 取得某天某班別所需人數
 * @param {string} shift
 * @param {string} dayType
 * @param {Object} settings
 * @returns {number|null} null = no limit
 */
export function getRequiredCount(shift, dayType, settings) {
  if (!settings) return null

  // Hardcoded for legacy backward compatibility, but priority given to dynamic types
  if (dayType === 'weekday') {
    if (shift === 'D') return parseInt(settings.wdD) || 1
    if (shift === 'N') return parseInt(settings.wdN) || 1
    // settings.wdAM will still work if shiftId is 'AM' via dynamic stores
  } else if (dayType === 'saturday') {
    if (shift === 'D') return parseInt(settings.satD) || 1
    if (shift === 'N') return parseInt(settings.satN) || 1
  } else if (dayType === 'sunday') {
    if (shift === 'D') return parseInt(settings.sunD) || 1
    if (shift === 'N') return parseInt(settings.sunN) || 1
  } else if (dayType === 'holiday') {
    if (shift === 'D') return parseInt(settings.holD) || 1
    if (shift === 'N') return parseInt(settings.holN) || 1
  }
  
  // Generic fallback: check if settings has [dayTypePrefix][shift]
  const prefix = dayType === 'weekday' ? 'wd' : (dayType === 'saturday' ? 'sat' : (dayType === 'sunday' ? 'sun' : 'hol'))
  const key = prefix + shift
  if (settings[key] !== undefined) return parseInt(settings[key]) || 0
  
  return null
}

/**
 * 循環切換班別（用於點擊格子）
 * null → D → N → Off → null
 */
export function cycleShift(current) {
  const cycle = [null, 'D', 'N', 'Off']
  const idx = cycle.indexOf(current)
  return cycle[(idx + 1) % cycle.length]
}

/**
 * 計算個人統計並與配額比對
 * @param {Object} shifts - { "1": "D", "2": "N", ... } (day as string key)
 * @param {Object} quota - { D: 4, N: 4, Off: 17, W6Off: 3 }
 * @param {Object} dayInfos - [{ day, dayType, dayOfWeek }] 用於計算 W6Off
 * @returns {{ actual, quota, diff, status }}
 */
export function calcPersonStats(shifts, quota, dayInfos = []) {
  const actual = { D: 0, N: 0, Off: 0, W6Off: 0 }

  // Build a set of saturday days for W6Off (based on dayOfWeek === 6 to match quota calc)
  const satDays = new Set(
    dayInfos.filter(d => d.dayOfWeek === 6).map(d => String(d.day))
  )

  Object.entries(shifts || {}).forEach(([day, val]) => {
    if (!val) return
    if (actual[val] !== undefined) actual[val]++
    else actual[val] = 1

    if (val === 'Off' && satDays.has(String(day))) actual.W6Off++
  })

  const result = {}
  // Check all types that have a quota or are standard
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
 * 計算某天所有人的班別分佈，並與需求比對
 * @param {Object} allShifts - { userId: { day_1: 'D', ... }, ... }
 * @param {number} day
 * @param {string} dayType
 * @param {Object} settings
 * @returns {Object} { counts, required, status }
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

  const required = {}
  Object.keys(counts).forEach(t => {
    if (t === 'Off') {
      required[t] = null
    } else {
      required[t] = getRequiredCount(t, dayType, settings)
    }
  })

  const status = {}
  Object.keys(counts).forEach(t => {
    if (t === 'Off') { status[t] = 'ok'; return }
    const r = required[t] ?? null
    if (r === null) { status[t] = 'ok'; return }
    if (counts[t] < r) status[t] = 'under'
    else if (counts[t] > r) status[t] = 'over'
    else status[t] = 'ok'
  })
  if (!status.Off) status.Off = 'ok'

  return { counts, required, status }
}

/**
 * 計算整體班表健康度
 * @param {Object} allShifts - { userId: scheduleRow }
 * @param {Object} allQuotas - { userId: { D, N, Off, W6Off } }
 * @param {Object} settings
 * @param {Array} dayInfos - [{ day, dayType }]
 * @returns {{ completionRate, anomalies, overQuota }}
 */
export function calcScheduleHealth(allShifts, allQuotas, settings, dayInfos) {
  const anomalies = []
  const overQuota = []

  // Check per-user quota
  Object.entries(allShifts || {}).forEach(([userId, row]) => {
    const quota = allQuotas?.[userId]
    if (!quota) return
    const stats = calcPersonStats(
      Object.fromEntries(
        Object.entries(row)
          .filter(([k]) => k.startsWith('day_'))
          .map(([k, v]) => [k.replace('day_', ''), v])
      ),
      quota,
      dayInfos
    )
    
    Object.keys(stats.byType).forEach(type => {
      const { diff, status } = stats.byType[type]
      if (status !== 'ok') {
        overQuota.push({ userId, type, diff, actual: stats.byType[type].actual, quota: quota[type] })
      }
    })
  })

  // Check per-day staffing
  dayInfos.forEach(({ day, dayType }) => {
    const dayStats = calcDayStats(allShifts, day, dayType, settings)
    Object.keys(dayStats.status).forEach(t => {
      if (dayStats.status[t] !== 'ok') {
        anomalies.push({ day, dayType, shift: t, actual: dayStats.counts[t], required: dayStats.required[t] })
      }
    })
  })

  // Completion rate: filled cells / total cells
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
