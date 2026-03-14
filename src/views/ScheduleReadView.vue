<template>
  <div class="min-h-screen bg-gray-50">
    <NavBar />

    <main class="max-w-full px-4 py-6">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <MonthSwitcher
          :currentMonth="scheduleStore.currentMonth"
          @change="onMonthChange"
        />
        <div class="flex items-center gap-2">
          <span
            v-if="scheduleStore.isLocked"
            class="text-xs bg-green-100 text-green-700 border border-green-300 rounded-full px-3 py-1"
          >
            已鎖定
          </span>
          <span
            v-else
            class="text-xs bg-yellow-100 text-yellow-700 border border-yellow-300 rounded-full px-3 py-1"
          >
            排班中
          </span>
        </div>
      </div>

      <div v-if="scheduleStore.loading" class="text-center py-12 text-gray-500">
        載入班表中...
      </div>

      <ScheduleGrid
        v-else
        :scheduleData="scheduleStore.scheduleData"
        :users="settingsStore.users"
        :holidays="holidays"
        :settings="settingsStore.settings"
        :currentMonth="scheduleStore.currentMonth"
        :meta="scheduleStore.meta"
        :isEditable="false"
        :highlightUserId="authStore.user?.userId"
      />
    </main>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useScheduleStore } from '../stores/schedule.js'
import { useSettingsStore } from '../stores/settings.js'
import { useAuthStore } from '../stores/auth.js'
import { useHoliday } from '../composables/useHoliday.js'
import NavBar from '../components/common/NavBar.vue'
import MonthSwitcher from '../components/common/MonthSwitcher.vue'
import ScheduleGrid from '../components/schedule/ScheduleGrid.vue'

const scheduleStore = useScheduleStore()
const settingsStore = useSettingsStore()
const authStore = useAuthStore()
const { holidays, fetchHolidays } = useHoliday()

onMounted(async () => {
  await Promise.all([
    settingsStore.fetchSettings(),
    settingsStore.fetchUsers(),
    scheduleStore.fetchSchedule(scheduleStore.currentMonth)
  ])
  const year = parseInt(scheduleStore.currentMonth.slice(0, 4))
  await fetchHolidays(year)
})

async function onMonthChange(yyyyMM) {
  await scheduleStore.fetchSchedule(yyyyMM)
  const year = parseInt(yyyyMM.slice(0, 4))
  await fetchHolidays(year)
}
</script>
