import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../api/gas.js'

export const useSettingsStore = defineStore('settings', () => {
  // settings: { wdAM, wdD, wdN, satAM, holD, holN, sunD, sunN }
  const settings = ref({
    wdAM: 3,
    wdD: 1,
    wdN: 1,
    satAM: 3,
    satD: 1,
    satN: 1,
    holD: 1,
    holN: 1,
    sunD: 1,
    sunN: 1
  })
  const users = ref([])
  const rotationPools = ref([])
  const loading = ref(false)
  const error = ref(null)

  async function fetchSettings() {
    loading.value = true
    error.value = null
    try {
      const result = await api.getSettings()
      if (!result.success) {
        error.value = result.error || '無法取得設定'
        return
      }
      settings.value = { ...settings.value, ...result.data }
    } catch (err) {
      error.value = err.message || '取得設定時發生錯誤'
    } finally {
      loading.value = false
    }
  }

  async function fetchUsers() {
    loading.value = true
    error.value = null
    try {
      const result = await api.getUsers()
      if (!result.success) {
        error.value = result.error || '無法取得人員清單'
        return
      }
      users.value = result.data || []
    } catch (err) {
      error.value = err.message || '取得人員清單時發生錯誤'
    } finally {
      loading.value = false
    }
  }

  async function updateSettings(data) {
    error.value = null
    try {
      const result = await api.updateSettings(data)
      if (!result.success) {
        error.value = result.error || '更新設定失敗'
        return false
      }
      settings.value = { ...settings.value, ...data }
      return true
    } catch (err) {
      error.value = err.message || '更新設定時發生錯誤'
      return false
    }
  }

  async function addUser(data) {
    error.value = null
    try {
      const result = await api.addUser(data)
      if (!result.success) {
        error.value = result.error || '新增人員失敗'
        return false
      }
      users.value.push(result.data)
      return true
    } catch (err) {
      error.value = err.message || '新增人員時發生錯誤'
      return false
    }
  }

  async function updateUser(data) {
    error.value = null
    try {
      const result = await api.updateUser(data)
      if (!result.success) {
        error.value = result.error || '更新人員失敗'
        return false
      }
      const idx = users.value.findIndex(u => u.userId === data.userId)
      if (idx !== -1) {
        users.value[idx] = { ...users.value[idx], ...data }
      }
      return true
    } catch (err) {
      error.value = err.message || '更新人員時發生錯誤'
      return false
    }
  }

  async function batchImportUsers(newUsers) {
    error.value = null
    try {
      const result = await api.batchAddUsers({ users: newUsers })
      if (!result.success) {
        error.value = result.error || '批次匯入失敗'
        return null
      }
      result.data.added.forEach(u => users.value.push(u))
      return result.data
    } catch (err) {
      error.value = err.message || '批次匯入時發生錯誤'
      return null
    }
  }

  async function removeUser(userId) {
    error.value = null
    try {
      const result = await api.removeUser({ userId })
      if (!result.success) {
        error.value = result.error || '移除人員失敗'
        return false
      }
      users.value = users.value.filter(u => u.userId !== userId)
      return true
    } catch (err) {
      error.value = err.message || '移除人員時發生錯誤'
      return false
    }
  }

  async function batchRemoveUsers(userIds) {
    error.value = null
    try {
      const result = await api.batchRemoveUsers({ userIds })
      if (!result.success) {
        error.value = result.error || '批次移除失敗'
        return false
      }
      users.value = users.value.filter(u => !userIds.includes(u.userId))
      return true
    } catch (err) {
      error.value = err.message || '批次移除時發生錯誤'
      return false
    }
  }

  async function fetchRotationPools() {
    loading.value = true
    error.value = null
    try {
      const result = await api.getRotationState()
      if (!result.success) {
        error.value = result.error || '無法取得輪序池'
        return
      }
      rotationPools.value = result.data || []
    } catch (err) {
      error.value = err.message || '取得輪序池時發生錯誤'
    } finally {
      loading.value = false
    }
  }

  return {
    settings,
    users,
    rotationPools,
    loading,
    error,
    fetchSettings,
    fetchUsers,
    updateSettings,
    addUser,
    batchImportUsers,
    updateUser,
    removeUser,
    batchRemoveUsers,
    fetchRotationPools
  }
})
