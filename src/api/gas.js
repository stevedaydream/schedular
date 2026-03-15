/**
 * GAS API 統一管理
 * 所有 GAS 呼叫都由此模組發出
 */

const GAS_URL = import.meta.env.VITE_GAS_URL

function getToken() {
  return localStorage.getItem('authToken')
}

/**
 * GET 請求
 * GAS 支援 CORS 時使用一般 fetch；回傳格式 { success, data/error }
 */
async function gasGet(action, params = {}) {
  const url = new URL(GAS_URL)
  url.searchParams.set('action', action)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, v)
    }
  })

  const token = getToken()
  const headers = {}
  if (token) {
    // GAS doesn't expose Authorization header, so include token as query param
    url.searchParams.set('token', token)
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers,
    redirect: 'follow'
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const data = await response.json()
  return data
}

/**
 * POST 請求
 * Use Content-Type: text/plain to avoid CORS preflight
 * Token is embedded in body since GAS doesn't forward Authorization header
 */
async function gasPost(action, data = {}) {
  const token = getToken()
  const body = {
    action,
    token,
    ...data
  }

  const response = await fetch(GAS_URL, {
    method: 'POST',
    mode: 'cors',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const result = await response.json()
  return result
}

export const api = {
  // GET endpoints
  getSchedule: (yyyyMM) => gasGet('getSchedule', { yyyyMM }),
  getRequests: (yyyyMM) => gasGet('getRequests', { yyyyMM }),
  getNotifications: (userId) => gasGet('getNotifications', { userId }),
  getHolidays: (year) => gasGet('getHolidays', { year }),
  getGovHolidays: (year) => gasGet('getGovHolidays', { year }),
  getSettings: () => gasGet('getSettings'),
  getShiftTypes: () => gasGet('getShiftTypes'),
  getUsers: () => gasGet('getUsers'),
  getRotationState: () => gasGet('getRotationState'),
  getShiftBalance: () => gasGet('getShiftBalance'),
  getRecentRotationRecord: (yyyyMM) => gasGet('getRecentRotationRecord', { yyyyMM }),

  // POST endpoints
  login: (data) => gasPost('login', data),
  googleLogin: (data) => gasPost('googleLogin', data),
  saveShift: (data) => gasPost('saveShift', data),
  batchSaveShifts: (data) => gasPost('batchSaveShifts', data),
  saveRequest: (data) => gasPost('saveRequest', data),
  lockSchedule: (data) => gasPost('lockSchedule', data),
  unlockSchedule: (data) => gasPost('unlockSchedule', data),
  transferScheduler: (data) => gasPost('transferScheduler', data),
  submitSwap: (data) => gasPost('submitSwap', data),
  respondSwap: (data) => gasPost('respondSwap', data),
  updateSettings: (data) => gasPost('updateSettings', data),
  saveShiftTypes: (data) => gasPost('saveShiftTypes', data),
  updateUser: (data) => gasPost('updateUser', data),
  addUser: (data) => gasPost('addUser', data),
  batchAddUsers: (data) => gasPost('batchAddUsers', data),
  removeUser: (data) => gasPost('removeUser', data),
  batchRemoveUsers: (data) => gasPost('batchRemoveUsers', data),
  applyMonthlyShiftQuota: (data) => gasPost('applyMonthlyShiftQuota', data),
  commitShiftBalance: (data) => gasPost('commitShiftBalance', data),
  saveHolidayDuty: (data) => gasPost('saveHolidayDuty', data),
  clearSchedule: (data) => gasPost('clearSchedule', data),
  saveHolidays: (data) => gasPost('saveHolidays', data),
  saveAllRotationPools: (data) => gasPost('saveAllRotationPools', data)
}
