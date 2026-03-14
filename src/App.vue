<template>
  <RouterView />
</template>

<script setup>
import { onMounted } from 'vue'
import { useAuthStore } from './stores/auth.js'
import { useShiftTypesStore } from './stores/shiftTypes.js'

const authStore = useAuthStore()
const shiftTypesStore = useShiftTypesStore()

onMounted(() => {
  authStore.checkAuth()
  shiftTypesStore.fetchShiftTypes()
})
</script>
