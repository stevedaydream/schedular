/**
 * 輪序引擎 — 14 個獨立輪序池
 */

import { getDaysInMonth, getDayType, getMonthDays } from './dateHelper.js'

export const ROTATION_POOLS = [
  'satOff',  // 週六 Off
  'satD',    // 週六 D（1人）
  'satN',    // 週六 N（1人）
  'satAM',   // 週六 白班（半天）
  'sunOff',  // 週日 Off
  'sunD',    // 週日 D（1人）
  'sunN',    // 週日 N（1人）
  'holOff',  // 國定假日 Off
  'holD',    // 國定假日 D（1人）
  'holN',    // 國定假日 N（1人）
  'wdOff',   // 平日 Off
  'wdD',     // 平日 D
  'wdN',     // 平日 N
  'wdAM'     // 平日 白班
]

/**
 * 取得下一個輪序對象
 * @param {Object} pool - { poolName, order, lastIndex, skipQueue }
 * @param {string[]} skipIds - 本次需跳過的 userId（已排班）
 * @returns {{ userId: string, newIndex: number }}
 */
export function getNextInPool(pool, skipIds = []) {
  const { order, lastIndex, skipQueue } = pool
  if (!order || order.length === 0) return null

  // Check skip queue first
  if (skipQueue && skipQueue.length > 0) {
    const firstInQueue = skipQueue[0]
    if (!skipIds.includes(firstInQueue)) {
      return { userId: firstInQueue, fromSkipQueue: true }
    }
  }

  // Normal rotation: start from lastIndex + 1
  const startIdx = ((lastIndex ?? -1) + 1) % order.length
  let idx = startIdx
  let attempts = 0

  while (attempts < order.length) {
    const userId = order[idx]
    if (!skipIds.includes(userId)) {
      return { userId, newIndex: idx }
    }
    idx = (idx + 1) % order.length
    attempts++
  }

  // All people are in skipIds — return null
  return null
}

/**
 * 計算每人 Off 配額（支援人員不參與 Off 輪序）
 * @param {Array} users - [{ userId, isActive, isSupport }]
 * @param {Array} dayInfos - [{ day, dateStr, dayOfWeek, dayType }]
 * @param {Object} settings
 * @param {string[]} userOrder - ordered user ids from wdOff pool（正式人員順序）
 * @param {number} startIndex - 輪序起始索引（lastIndex + 1）
 * @returns {{ [userId]: number }} 每人 Off 配額
 */
export function calculateOffQuota(users, dayInfos, settings, userOrder, startIndex = 0) {
  const totalPeople = users.length
  const regularUsers = users.filter(u => !u.isSupport && u.isSupport !== 'true')
  const regularCount = regularUsers.length

  let totalOff = 0
  dayInfos.forEach(({ dayType }) => {
    if (dayType === 'weekday') {
      const working = (parseInt(settings.wdAM) || 3) +
                      (parseInt(settings.wdD) || 1) +
                      (parseInt(settings.wdN) || 1)
      totalOff += Math.max(0, totalPeople - working)
    } else if (dayType === 'saturday') {
      const working = (parseInt(settings.satAM) || 3) + 1 + 1
      totalOff += Math.max(0, totalPeople - working)
    } else if (dayType === 'sunday') {
      const working = (parseInt(settings.sunD) || 1) + (parseInt(settings.sunN) || 1)
      totalOff += Math.max(0, totalPeople - working)
    } else if (dayType === 'holiday') {
      const working = (parseInt(settings.holD) || 1) + (parseInt(settings.holN) || 1)
      totalOff += Math.max(0, totalPeople - working)
    }
  })

  const baseQuota = Math.floor(totalOff / regularCount)
  const remainder = totalOff % regularCount

  // 整除特例：remainder === 0 時 lastIndex 退回 startIndex 前一位，確保下月 V 不移動
  const effectiveLastIndex = remainder === 0
    ? (startIndex - 1 + regularCount) % regularCount
    : (startIndex + remainder - 1) % regularCount

  const quotas = {}
  // 正式人員按輪序分配配額
  userOrder.forEach((userId, idx) => {
    const relIdx = (idx - startIndex + regularCount) % regularCount
    quotas[userId] = baseQuota + (relIdx < remainder ? 1 : 0)
  })

  // 支援人員的 Off 配額記為 null（系統自動計算，不走輪序）
  users.filter(u => u.isSupport === true || u.isSupport === 'true').forEach(u => {
    quotas[u.userId] = null
  })

  return { quotas, effectiveLastIndex }
}

/**
 * 驗證月份交接：比對本月輪序起點與上月是否一致
 * @param {Object} currentPool - 本月輪序池
 * @param {Object} prevPool - 上月輪序池
 * @returns {{ consistent: boolean, message: string }}
 */
export function validateMonthHandover(currentPool, prevPool) {
  if (!prevPool || !currentPool) return { consistent: true, message: '' }
  const expectedStart = ((prevPool.lastIndex ?? -1) + 1) % (prevPool.order?.length || 1)
  const currentStart = ((currentPool.lastIndex ?? -1) + 1) % (currentPool.order?.length || 1)
  if (expectedStart !== currentStart) {
    return {
      consistent: false,
      message: `輪序起點不一致：預期從第 ${expectedStart + 1} 位開始，目前設定為第 ${currentStart + 1} 位。`
    }
  }
  return { consistent: true, message: '' }
}

/**
 * 執行自動排班
 * @param {Array} users - [{ userId, name, isActive }]
 * @param {Array} holidays - [{ date, name, isHoliday }]
 * @param {Object} settings
 * @param {Object} pools - { poolName: { order, lastIndex, skipQueue }, ... }
 * @param {string} yyyyMM
 * @returns {{ schedule, conflicts, updatedPools }}
 */
export function runAutoSchedule(users, holidays, settings, pools, yyyyMM) {
  const activeUsers = users.filter(u => u.isActive !== false && u.isActive !== 'false')
  // 支援人員不參與 Off 輪序池
  const supportIds = new Set(
    activeUsers.filter(u => u.isSupport === true || u.isSupport === 'true').map(u => u.userId)
  )
  const totalPeople = activeUsers.length

  // Build day info array
  const monthDays = getMonthDays(yyyyMM)
  const dayInfos = monthDays.map(d => ({
    ...d,
    dayType: getDayType(d.dateStr, holidays)
  }))

  // Initialize schedule: { userId: { day_1: null, ... } }
  const schedule = {}
  activeUsers.forEach(u => {
    schedule[u.userId] = {}
    dayInfos.forEach(d => {
      schedule[u.userId][`day_${d.day}`] = null
    })
  })

  const conflicts = []
  const updatedPools = JSON.parse(JSON.stringify(pools))
  const cellNotes = {}

  // Set of valid userIds for quick lookup
  const activeUserIds = new Set(activeUsers.map(u => u.userId))

  // Helper: assign shift to user on a day
  function assign(userId, day, shift, note = null) {
    if (!schedule[userId]) return false  // userId not in active schedule
    if (schedule[userId][`day_${day}`] !== null) {
      conflicts.push({ userId, day, existing: schedule[userId][`day_${day}`], attempted: shift })
      return false
    }
    schedule[userId][`day_${day}`] = shift
    if (note) cellNotes[`${userId}_${day}`] = note
    return true
  }

  // Helper: get next person from pool
  function pickFromPool(poolName, day) {
    const pool = updatedPools[poolName]
    if (!pool) return null
    const dayKey = `day_${day}`
    const alreadyScheduled = activeUsers
      .filter(u => schedule[u.userId]?.[dayKey] !== null)
      .map(u => u.userId)

    const isOffPool = poolName.endsWith('Off')

    // 先用 pool.order 過濾出有效成員
    let eligibleIds = (pool.order || []).filter(id => {
      if (!activeUserIds.has(id)) return false
      if (isOffPool && supportIds.has(id)) return false
      return true
    })

    // Fallback：若輪序池沒有有效成員（userId 不符），直接用 activeUsers 順序
    if (eligibleIds.length === 0) {
      eligibleIds = activeUsers
        .filter(u => !(isOffPool && supportIds.has(u.userId)))
        .map(u => u.userId)
      // 同步更新 pool.order 讓後續輪序正確
      pool.order = eligibleIds
      pool.lastIndex = -1
    }

    const result = getNextInPool({ ...pool, order: eligibleIds }, alreadyScheduled)
    if (!result) return null

    if (result.fromSkipQueue) {
      pool.skipQueue = pool.skipQueue.slice(1)
    } else {
      pool.lastIndex = result.newIndex
    }
    return result.userId
  }

  // 週六：D、N
  dayInfos.filter(d => d.dayType === 'saturday').forEach(({ day }) => {
    const dUser = pickFromPool('satD', day)
    if (dUser) assign(dUser, day, 'D')

    const nUser = pickFromPool('satN', day)
    if (nUser) assign(nUser, day, 'N')
  })

  // 週日：D、N
  dayInfos.filter(d => d.dayType === 'sunday').forEach(({ day }) => {
    const dUser = pickFromPool('sunD', day)
    if (dUser) assign(dUser, day, 'D')

    const nUser = pickFromPool('sunN', day)
    if (nUser) assign(nUser, day, 'N')
  })

  // 其餘（平日、假日）全部留空

  return {
    schedule,
    conflicts,
    updatedPools,
    cellNotes
  }
}
