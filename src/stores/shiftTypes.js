import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api/gas.js'

export const COLOR_OPTIONS = [
  { value: 'yellow', label: '黃',  cell: 'bg-yellow-100 text-yellow-800', active: 'bg-yellow-200 text-yellow-800', hover: 'bg-yellow-100', swatch: 'bg-yellow-400' },
  { value: 'blue',   label: '藍',  cell: 'bg-blue-100 text-blue-800',     active: 'bg-blue-200 text-blue-800',     hover: 'bg-blue-100',   swatch: 'bg-blue-400' },
  { value: 'green',  label: '綠',  cell: 'bg-green-100 text-green-800',   active: 'bg-green-200 text-green-800',   hover: 'bg-green-100',  swatch: 'bg-green-400' },
  { value: 'pink',   label: '粉',  cell: 'bg-pink-100 text-pink-800',     active: 'bg-pink-200 text-pink-800',     hover: 'bg-pink-100',   swatch: 'bg-pink-400' },
  { value: 'purple', label: '紫',  cell: 'bg-purple-100 text-purple-800', active: 'bg-purple-200 text-purple-800', hover: 'bg-purple-100', swatch: 'bg-purple-400' },
  { value: 'orange', label: '橙',  cell: 'bg-orange-100 text-orange-800', active: 'bg-orange-200 text-orange-800', hover: 'bg-orange-100', swatch: 'bg-orange-400' },
  { value: 'red',    label: '紅',  cell: 'bg-red-100 text-red-800',       active: 'bg-red-200 text-red-800',       hover: 'bg-red-100',    swatch: 'bg-red-400' },
  { value: 'indigo', label: '靛',  cell: 'bg-indigo-100 text-indigo-800', active: 'bg-indigo-200 text-indigo-800', hover: 'bg-indigo-100', swatch: 'bg-indigo-400' },
  { value: 'teal',   label: '青',  cell: 'bg-teal-100 text-teal-800',     active: 'bg-teal-200 text-teal-800',     hover: 'bg-teal-100',   swatch: 'bg-teal-400' },
  { value: 'gray',   label: '灰',  cell: 'bg-gray-100 text-gray-600',     active: 'bg-gray-200 text-gray-600',     hover: 'bg-gray-100',   swatch: 'bg-gray-400' },
]

const COLOR_MAP = Object.fromEntries(COLOR_OPTIONS.map(c => [c.value, c]))

export const DAY_TYPE_OPTIONS = [
  { value: 'weekday',  label: '平日' },
  { value: 'saturday', label: '週六' },
  { value: 'sunday',   label: '週日' },
  { value: 'holiday',  label: '假日' },
]

// applicableDays: [] = 不限; ['saturday'] = 僅週六
// quota: { weekday: null, saturday: 3 } — null 表示不設需求
export const DEFAULT_SHIFT_TYPES = [
  { id: 'D',   label: 'D',   color: 'yellow', active: true, applicableDays: [], quota: { weekday: 1, saturday: 1, sunday: 1, holiday: 1 } },
  { id: 'N',   label: 'N',   color: 'blue',   active: true, applicableDays: [], quota: { weekday: 1, saturday: 1, sunday: 1, holiday: 1 } },
  { id: 'Off', label: 'Off', color: 'green',  active: true, applicableDays: [], quota: {} },
  { id: 'H3',  label: 'H3',  color: 'pink',   active: true, applicableDays: ['saturday'], quota: { saturday: 3 } },
]

// 僅用於班別預約的排除選項，不儲存到 GAS 班別設定，不受 fetchShiftTypes 覆蓋
const REQUEST_EXCLUSION_TYPES = [
  { id: 'NO_DN', label: '勿值', color: 'red',    active: true, requestOnly: true, applicableDays: [], quota: {} },
  { id: 'NO_D',  label: '勿D',  color: 'orange', active: true, requestOnly: true, applicableDays: [], quota: {} },
  { id: 'NO_N',  label: '勿N',  color: 'purple', active: true, requestOnly: true, applicableDays: [], quota: {} },
]

export const useShiftTypesStore = defineStore('shiftTypes', () => {
  const shiftTypes = ref(DEFAULT_SHIFT_TYPES.map(t => ({ ...t, applicableDays: [...(t.applicableDays || [])], quota: { ...(t.quota || {}) } })))
  const loading = ref(false)
  const error = ref(null)

  // 排班格用：GAS 管理的班別（不含排除選項）
  const activeTypes = computed(() => shiftTypes.value.filter(t => t.active !== false))
  // 班別預約用：含硬編碼排除選項，不受 fetchShiftTypes 覆蓋
  const requestTypes = computed(() => [...activeTypes.value, ...REQUEST_EXCLUSION_TYPES])

  // 所有類型（含排除選項）供 label/color 查詢
  const allTypes = computed(() => [...shiftTypes.value, ...REQUEST_EXCLUSION_TYPES])

  function getColor(id) {
    const t = allTypes.value.find(t => t.id === id)
    return t ? (COLOR_MAP[t.color] || COLOR_MAP.gray) : null
  }

  function getCellClass(id) {
    return getColor(id)?.cell || 'bg-white text-gray-400'
  }

  function getActiveClass(id) {
    return getColor(id)?.active || 'bg-gray-200 text-gray-600'
  }

  function getHoverClass(id) {
    return getColor(id)?.hover || 'bg-gray-100'
  }

  /**
   * 取得某班別在某日別的需求人數
   * @returns {number|null} null = 不設需求
   */
  function getRequiredCount(shiftId, dayType) {
    const t = allTypes.value.find(t => t.id === shiftId)
    if (!t || !t.quota) return null
    const val = t.quota[dayType]
    return (val !== undefined && val !== null && val !== '') ? Number(val) : null
  }

  /**
   * 判斷某班別是否適用於該日別
   */
  function isApplicable(shiftId, dayType) {
    const t = allTypes.value.find(t => t.id === shiftId)
    if (!t) return true
    if (!t.applicableDays || t.applicableDays.length === 0) return true
    return t.applicableDays.includes(dayType)
  }

  async function fetchShiftTypes() {
    loading.value = true
    error.value = null
    try {
      const result = await api.getShiftTypes()
      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        shiftTypes.value = result.data.map(t => ({
          ...t,
          applicableDays: t.applicableDays || [],
          quota: t.quota || {}
        }))
      }
    } catch {
      // 載入失敗時保持預設值
    } finally {
      loading.value = false
    }
  }

  async function saveShiftTypes(types) {
    error.value = null
    try {
      const result = await api.saveShiftTypes({ shiftTypes: types })
      if (!result.success) {
        error.value = result.error || '儲存失敗'
        return false
      }
      shiftTypes.value = types
      return true
    } catch (err) {
      error.value = err.message
      return false
    }
  }

  return {
    shiftTypes, activeTypes, requestTypes, allTypes, loading, error,
    getCellClass, getActiveClass, getHoverClass,
    getRequiredCount, isApplicable,
    fetchShiftTypes, saveShiftTypes
  }
})
