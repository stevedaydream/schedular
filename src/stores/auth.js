import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api/gas.js'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const token = ref(null)
  const loading = ref(false)
  const error = ref(null)

  const isLoggedIn = computed(() => !!token.value)
  const isScheduler = computed(() => user.value?.role === 'scheduler' || user.value?.role === 'superadmin')
  const isSuperAdmin = computed(() => user.value?.role === 'superadmin')
  const isMember = computed(() => !!user.value)

  function parseJWT(jwtToken) {
    try {
      const base64Url = jwtToken.split('.')[1]
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      )
      return JSON.parse(jsonPayload)
    } catch {
      return null
    }
  }

  function setAuth(jwtToken) {
    const payload = parseJWT(jwtToken)
    if (!payload) return false

    // Check expiry
    if (payload.exp && Date.now() / 1000 > payload.exp) return false

    token.value = jwtToken
    user.value = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      name: payload.name || payload.email
    }
    localStorage.setItem('authToken', jwtToken)
    localStorage.setItem('authUser', JSON.stringify(user.value))
    return true
  }

  async function login(credentials) {
    loading.value = true
    error.value = null
    try {
      // Hash password client-side with SHA-256
      const passwordHash = await hashPassword(credentials.password)
      const result = await api.login({
        email: credentials.email,
        passwordHash
      })
      if (!result.success) {
        error.value = result.error || '登入失敗'
        return false
      }
      return setAuth(result.data.token)
    } catch (err) {
      error.value = err.message || '登入時發生錯誤'
      return false
    } finally {
      loading.value = false
    }
  }

  async function googleLogin(idToken) {
    loading.value = true
    error.value = null
    try {
      const result = await api.googleLogin({ idToken })
      if (!result.success) {
        error.value = result.error || 'Google 登入失敗'
        return false
      }
      return setAuth(result.data.token)
    } catch (err) {
      error.value = err.message || 'Google 登入時發生錯誤'
      return false
    } finally {
      loading.value = false
    }
  }

  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem('authToken')
    localStorage.removeItem('authUser')
  }

  function checkAuth() {
    const storedToken = localStorage.getItem('authToken')
    if (storedToken) {
      const valid = setAuth(storedToken)
      if (!valid) {
        logout()
      }
    }
  }

  async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password)
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  return {
    user,
    token,
    loading,
    error,
    isLoggedIn,
    isScheduler,
    isSuperAdmin,
    isMember,
    login,
    googleLogin,
    logout,
    checkAuth
  }
})
