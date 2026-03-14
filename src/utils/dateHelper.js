/**
 * 日期工具 — 所有操作以 Asia/Taipei (UTC+8) 時區為準
 */

const TAIPEI_TZ = 'Asia/Taipei'

/**
 * 取得台北時間的 Date 物件（轉換為本地時間表達的 UTC 等效值）
 */
export function getTaipeiDate(date = new Date()) {
  const taipeiStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: TAIPEI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
  return new Date(taipeiStr + 'T00:00:00')
}

/**
 * 格式化為 yyyyMM 字串，如 "202503"
 */
export function formatYYYYMM(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TAIPEI_TZ,
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(date)
  const year = parts.find(p => p.type === 'year').value
  const month = parts.find(p => p.type === 'month').value
  return year + month
}

/**
 * 取得目前台北時間的 yyyyMM
 */
export function getCurrentYYYYMM() {
  return formatYYYYMM(new Date())
}

/**
 * 取得指定月份的天數
 * @param {string} yyyyMM - "202503"
 */
export function getDaysInMonth(yyyyMM) {
  const year = parseInt(yyyyMM.slice(0, 4))
  const month = parseInt(yyyyMM.slice(4, 6))
  return new Date(year, month, 0).getDate()
}

/**
 * 取得指定日期的類型
 * @param {string} dateStr - "2025-03-15"
 * @param {Array} holidays - [{ date: "2025-01-01", name: "元旦", isHoliday: true }, ...]
 * @returns {'weekday'|'saturday'|'sunday'|'holiday'}
 */
export function getDayType(dateStr, holidays = []) {
  const date = new Date(dateStr + 'T12:00:00+08:00')
  const dayOfWeek = date.getDay() // 0=Sun, 6=Sat

  // Check if it's a national holiday first
  const holiday = holidays.find(h => h.date === dateStr && h.isHoliday)
  if (holiday) return 'holiday'

  if (dayOfWeek === 6) return 'saturday'
  if (dayOfWeek === 0) return 'sunday'
  return 'weekday'
}

/**
 * 月份加減
 * @param {string} yyyyMM - "202503"
 * @param {number} n - 月份數量（可為負）
 * @returns {string} - "202504"
 */
export function addMonths(yyyyMM, n) {
  const year = parseInt(yyyyMM.slice(0, 4))
  const month = parseInt(yyyyMM.slice(4, 6))
  const date = new Date(year, month - 1 + n, 1)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}${m}`
}

/**
 * 格式化 yyyyMM 為顯示用字串，如 "2025年03月"
 */
export function formatMonthDisplay(yyyyMM) {
  const year = yyyyMM.slice(0, 4)
  const month = yyyyMM.slice(4, 6)
  return `${year}年${month}月`
}

/**
 * 取得指定月份所有日期及其星期
 * @param {string} yyyyMM
 * @returns {Array} [{ day: 1, dateStr: '2025-03-01', dayOfWeek: 6 }, ...]
 */
export function getMonthDays(yyyyMM) {
  const year = parseInt(yyyyMM.slice(0, 4))
  const month = parseInt(yyyyMM.slice(4, 6))
  const daysCount = getDaysInMonth(yyyyMM)
  const days = []
  for (let d = 1; d <= daysCount; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const date = new Date(dateStr + 'T12:00:00+08:00')
    days.push({
      day: d,
      dateStr,
      dayOfWeek: date.getDay()
    })
  }
  return days
}

/**
 * 星期中文縮寫
 */
export const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']
