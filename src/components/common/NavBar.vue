<template>
  <nav class="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
    <div class="max-w-full px-4">
      <div class="flex items-center justify-between h-14">
        <!-- Left: Logo + Nav Links -->
        <div class="flex items-center gap-6">
          <span class="text-blue-700 font-bold text-lg">排班系統</span>

          <div class="hidden sm:flex items-center gap-1">
            <!-- Scheduler & SuperAdmin see /schedule -->
            <RouterLink
              v-if="authStore.isScheduler"
              to="/schedule"
              :class="navLinkClass('/schedule')"
            >
              班表管理
            </RouterLink>

            <!-- All members see /schedule/view -->
            <RouterLink
              to="/schedule/view"
              :class="navLinkClass('/schedule/view')"
            >
              查看班表
            </RouterLink>

            <RouterLink
              to="/request"
              :class="navLinkClass('/request')"
            >
              班別預約
            </RouterLink>

            <RouterLink
              to="/swap"
              :class="navLinkClass('/swap')"
            >
              換班申請
            </RouterLink>

            <!-- SuperAdmin only -->
            <RouterLink
              v-if="authStore.isSuperAdmin"
              to="/admin"
              :class="navLinkClass('/admin')"
            >
              系統管理
            </RouterLink>
          </div>
        </div>

        <!-- Right: Notifications + User -->
        <div class="flex items-center gap-3">
          <!-- Notifications bell -->
          <RouterLink to="/notifications" class="relative p-2 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
            </svg>
            <span
              v-if="notificationStore.unreadCount > 0"
              class="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center leading-none"
            >
              {{ notificationStore.unreadCount > 9 ? '9+' : notificationStore.unreadCount }}
            </span>
          </RouterLink>

          <!-- User info -->
          <div class="flex items-center gap-2">
            <div class="hidden sm:block text-right">
              <div class="text-sm font-medium text-gray-800">{{ authStore.user?.name }}</div>
              <div class="text-xs text-gray-400">{{ roleLabel(authStore.user?.role) }}</div>
            </div>
            <span
              v-if="systemLabel"
              class="hidden sm:inline-block text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-mono"
              :title="'目前連線：' + systemLabel"
            >{{ systemLabel }}</span>
          <button
              @click="handleLogout"
              class="text-sm text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
            >
              登出
            </button>
          </div>
        </div>
      </div>

      <!-- Mobile nav -->
      <div class="sm:hidden flex gap-1 py-2 overflow-x-auto">
        <RouterLink
          v-if="authStore.isScheduler"
          to="/schedule"
          :class="mobileNavLinkClass('/schedule')"
        >
          班表管理
        </RouterLink>
        <RouterLink
          to="/schedule/view"
          :class="mobileNavLinkClass('/schedule/view')"
        >
          查看班表
        </RouterLink>
        <RouterLink to="/request" :class="mobileNavLinkClass('/request')">預約</RouterLink>
        <RouterLink to="/swap" :class="mobileNavLinkClass('/swap')">換班</RouterLink>
        <RouterLink v-if="authStore.isSuperAdmin" to="/admin" :class="mobileNavLinkClass('/admin')">管理</RouterLink>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import { useNotificationStore } from '../../stores/notification.js'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const notificationStore = useNotificationStore()

const systemLabel = import.meta.env.VITE_SYSTEM_LABEL || ''

function navLinkClass(path) {
  const active = route.path === path || route.path.startsWith(path + '/')
  return [
    'px-3 py-1.5 text-sm rounded-md transition-colors font-medium',
    active
      ? 'bg-blue-50 text-blue-700'
      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
  ]
}

function mobileNavLinkClass(path) {
  const active = route.path === path
  return [
    'px-3 py-1 text-xs rounded-md whitespace-nowrap transition-colors',
    active
      ? 'bg-blue-50 text-blue-700 font-medium'
      : 'text-gray-600 hover:bg-gray-100'
  ]
}

function roleLabel(role) {
  const map = {
    superadmin: '管理員',
    scheduler: '排班者',
    member: '成員'
  }
  return map[role] || role
}

async function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>
