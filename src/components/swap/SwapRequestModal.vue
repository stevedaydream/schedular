<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">申請換班</h3>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <!-- Month -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">月份</label>
          <input v-model="form.yyyyMM" type="month" class="input-field" required @change="onMonthChange" />
        </div>

        <!-- Day -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">日期</label>
          <input
            v-model.number="form.day"
            type="number" min="1" max="31"
            class="input-field" required placeholder="例：15"
            @change="onDayChange"
          />
        </div>

        <!-- My shift (auto-filled) -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            我的班別
            <span v-if="loadingShifts" class="text-xs text-gray-400 ml-1">載入中...</span>
          </label>
          <div
            v-if="form.fromShift"
            :class="['px-3 py-2 rounded-md text-sm font-medium border', shiftClass(form.fromShift)]"
          >
            {{ form.fromShift }}
            <span class="text-xs text-gray-400 ml-2 font-normal">（自動帶入）</span>
          </div>
          <div v-else class="px-3 py-2 rounded-md text-sm text-gray-400 border border-gray-200 bg-gray-50">
            {{ form.day ? '此日無班別資料' : '請先選擇日期' }}
          </div>
        </div>

        <!-- Target user -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">換班對象</label>
          <select v-model="form.toUserId" class="input-field" required @change="onTargetChange">
            <option value="">請選擇</option>
            <option v-for="user in otherUsers" :key="user.userId" :value="user.userId">
              {{ user.name }}
            </option>
          </select>
        </div>

        <!-- Target shift (auto-filled) -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">對方班別</label>
          <div
            v-if="form.toShift"
            :class="['px-3 py-2 rounded-md text-sm font-medium border', shiftClass(form.toShift)]"
          >
            {{ form.toShift }}
            <span class="text-xs text-gray-400 ml-2 font-normal">（自動帶入）</span>
          </div>
          <div v-else class="px-3 py-2 rounded-md text-sm text-gray-400 border border-gray-200 bg-gray-50">
            {{ form.toUserId && form.day ? '對方此日無班別資料' : '請先選擇對象與日期' }}
          </div>
        </div>

        <!-- Swap preview -->
        <div v-if="form.fromShift && form.toShift" class="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-center">
          <span class="font-medium">{{ currentUserName }}</span>
          <span class="mx-2 text-blue-500 font-bold">{{ form.fromShift }}</span>
          <span class="text-gray-500">↔</span>
          <span class="mx-2 text-blue-500 font-bold">{{ form.toShift }}</span>
          <span class="font-medium">{{ targetUserName }}</span>
        </div>

        <div v-if="error" class="text-sm text-red-600">{{ error }}</div>

        <div class="flex gap-2 justify-end pt-2">
          <button type="button" @click="emit('close')" class="btn-secondary">取消</button>
          <button
            type="submit"
            class="btn-primary"
            :disabled="submitting || !form.fromShift || !form.toShift"
          >
            {{ submitting ? '送出中...' : '送出申請' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { api } from '../../api/gas.js'
import { getCurrentYYYYMM } from '../../utils/dateHelper.js'

const props = defineProps({
  users: { type: Array, default: () => [] },
  currentUserId: { type: String, default: null }
})

const emit = defineEmits(['close', 'submitted'])

const submitting = ref(false)
const loadingShifts = ref(false)
const error = ref(null)
const scheduleData = ref({})  // { userId: { day_1: 'D', ... } }

const currentYYYYMM = getCurrentYYYYMM()
const defaultMonth = `${currentYYYYMM.slice(0, 4)}-${currentYYYYMM.slice(4, 6)}`

const form = reactive({
  yyyyMM: defaultMonth,
  day: null,
  fromShift: '',
  toUserId: '',
  toShift: ''
})

const otherUsers = computed(() =>
  props.users.filter(u => u.userId !== props.currentUserId && u.isActive !== false && u.isActive !== 'false')
)

const currentUserName = computed(() =>
  props.users.find(u => u.userId === props.currentUserId)?.name || '我'
)

const targetUserName = computed(() =>
  props.users.find(u => u.userId === form.toUserId)?.name || '對方'
)

const SHIFT_COLOR_MAP = {
  D: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  N: 'bg-blue-100 text-blue-800 border-blue-300',
  Off: 'bg-green-100 text-green-800 border-green-300',
  AM: 'bg-pink-100 text-pink-800 border-pink-300'
}

function shiftClass(shift) {
  return SHIFT_COLOR_MAP[shift] || 'bg-gray-100 text-gray-700 border-gray-200'
}

function getShift(userId, day) {
  if (!userId || !day) return ''
  return scheduleData.value[userId]?.[`day_${day}`] || ''
}

function autoFillShifts() {
  form.fromShift = getShift(props.currentUserId, form.day)
  form.toShift = getShift(form.toUserId, form.day)
}

async function loadSchedule() {
  const yyyyMM = form.yyyyMM.replace('-', '')
  if (!yyyyMM || yyyyMM.length !== 6) return
  loadingShifts.value = true
  try {
    const result = await api.getSchedule(yyyyMM)
    if (result.success) {
      scheduleData.value = result.data.schedule || {}
      autoFillShifts()
    }
  } catch {
    // silent
  } finally {
    loadingShifts.value = false
  }
}

function onMonthChange() {
  form.day = null
  form.fromShift = ''
  form.toShift = ''
  loadSchedule()
}

function onDayChange() {
  autoFillShifts()
}

function onTargetChange() {
  form.toShift = getShift(form.toUserId, form.day)
}

async function handleSubmit() {
  if (!form.fromShift) { error.value = '您在該日無班別資料'; return }
  if (!form.toShift) { error.value = '對方在該日無班別資料'; return }

  submitting.value = true
  error.value = null
  try {
    const yyyyMM = form.yyyyMM.replace('-', '')
    const result = await api.submitSwap({
      yyyyMM,
      day: form.day,
      fromShift: form.fromShift,
      toUserId: form.toUserId,
      toShift: form.toShift
    })
    if (!result.success) {
      error.value = result.error || '送出失敗'
    } else {
      emit('submitted')
    }
  } catch (err) {
    error.value = err.message || '送出時發生錯誤'
  } finally {
    submitting.value = false
  }
}

// Load schedule on mount
loadSchedule()
</script>
