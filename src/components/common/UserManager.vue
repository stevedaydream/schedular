<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <h3 class="text-base font-semibold text-gray-800">人員管理</h3>
        <span v-if="selectedIds.size > 0" class="text-sm text-gray-500">已選 {{ selectedIds.size }} 人</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="selectedIds.size > 0"
          @click="batchRemoveConfirm = true"
          class="btn-danger text-sm"
        >刪除選取 ({{ selectedIds.size }})</button>
        <button @click="downloadTemplate" class="btn-secondary text-sm">下載範本</button>
        <label class="btn-secondary text-sm cursor-pointer">
          匯入 CSV
          <input type="file" accept=".csv" class="hidden" ref="importCsvInput" @change="handleImportCSV" />
        </label>
        <button @click="openAddForm" class="btn-primary text-sm">新增人員</button>
      </div>
    </div>

    <!-- Error -->
    <div v-if="settingsStore.error" class="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
      {{ settingsStore.error }}
    </div>

    <!-- Loading -->
    <div v-if="settingsStore.loading" class="text-center py-8 text-gray-500">載入中...</div>

    <!-- User table -->
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="bg-gray-50 border-b border-gray-200">
            <th class="px-3 py-3 w-10">
              <input
                type="checkbox"
                class="rounded"
                :checked="allSelected"
                :indeterminate="someSelected"
                @change="toggleSelectAll"
              />
            </th>
            <th class="text-center px-3 py-3 font-medium text-gray-700 w-14">代號</th>
            <th class="text-left px-4 py-3 font-medium text-gray-700">姓名</th>
            <th class="text-left px-4 py-3 font-medium text-gray-700">電子郵件</th>
            <th class="text-left px-4 py-3 font-medium text-gray-700">角色</th>
            <th class="text-center px-4 py-3 font-medium text-gray-700">帳號狀態</th>
            <th class="text-center px-4 py-3 font-medium text-gray-700">支援模式</th>
            <th class="text-center px-4 py-3 font-medium text-gray-700">排序</th>
            <th class="text-right px-4 py-3 font-medium text-gray-700">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in sortedUsers"
            :key="user.userId"
            :class="['border-b border-gray-100 hover:bg-gray-50', selectedIds.has(user.userId) ? 'bg-blue-50/40' : '']"
          >
            <td class="px-3 py-3 text-center">
              <input
                type="checkbox"
                class="rounded"
                :checked="selectedIds.has(user.userId)"
                @change="toggleSelect(user.userId)"
              />
            </td>
            <td class="px-3 py-3 text-center">
              <span class="inline-block font-mono font-semibold text-sm bg-gray-100 text-gray-700 rounded px-1.5 py-0.5 min-w-[2rem] text-center">
                {{ user.code || '—' }}
              </span>
            </td>
            <td class="px-4 py-3 font-medium text-gray-900">{{ user.name }}</td>
            <td class="px-4 py-3 text-gray-600">{{ user.email }}</td>
            <td class="px-4 py-3">
              <span :class="roleClass(user.role)">{{ roleLabel(user.role) }}</span>
            </td>
            <td class="px-4 py-3 text-center">
              <button
                @click="toggleActive(user)"
                :class="[
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  user.isActive !== false && user.isActive !== 'false'
                    ? (user.noSchedule === true || user.noSchedule === 'true'
                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200')
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                ]"
              >
                {{ user.isActive !== false && user.isActive !== 'false'
                    ? (user.noSchedule === true || user.noSchedule === 'true' ? '僅登入' : '已啟用')
                    : '已停用' }}
              </button>
            </td>
            <td class="px-4 py-3 text-center">
              <span
                v-if="user.isActive !== false && user.isActive !== 'false'"
                :class="(user.isSupport === true || user.isSupport === 'true') ? 'text-amber-500' : 'text-gray-300'"
              >
                {{ (user.isSupport === true || user.isSupport === 'true') ? '⚙️' : '—' }}
              </span>
              <span v-else class="text-gray-200">—</span>
            </td>
            <td class="px-4 py-3 text-center text-gray-500">{{ user.sortOrder }}</td>
            <td class="px-4 py-3 text-right">
              <button @click="openEditForm(user)" class="text-blue-600 hover:text-blue-800 text-xs mr-3">編輯</button>
              <button @click="confirmRemove(user)" class="text-red-500 hover:text-red-700 text-xs">移除</button>
            </td>
          </tr>
          <tr v-if="settingsStore.users.length === 0">
            <td colspan="6" class="text-center py-8 text-gray-400">尚無人員</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add/Edit modal -->
    <div
      v-if="showForm"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 class="text-lg font-semibold mb-4">{{ editingUser ? '編輯人員' : '新增人員' }}</h3>
        <form @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
            <input v-model="form.name" type="text" required class="input-field" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">電子郵件 *</label>
            <input v-model="form.email" type="email" required class="input-field" :disabled="!!editingUser" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              {{ editingUser ? '重設密碼' : '密碼' }}
            </label>
            <input v-model="form.password" type="password" class="input-field"
              :placeholder="editingUser ? '留空則不變更密碼' : '留空則無密碼登入'" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">角色</label>
            <select v-model="form.role" class="input-field">
              <option value="member">成員</option>
              <option value="scheduler">排班者</option>
              <option value="superadmin">管理員</option>
            </select>
          </div>
          <div class="flex items-center gap-2">
            <input v-model="form.isActive" type="checkbox" id="isActive" class="rounded" />
            <label for="isActive" class="text-sm text-gray-700">帳號啟用</label>
          </div>
          <div v-if="form.isActive" class="flex items-center gap-2">
            <input v-model="form.noSchedule" type="checkbox" id="noSchedule" class="rounded" />
            <label for="noSchedule" class="text-sm text-gray-700">
              不參與排班
              <span class="text-xs text-gray-400 ml-1">（可登入系統，但不排入班表）</span>
            </label>
          </div>
          <div v-if="form.isActive" class="flex items-center gap-2">
            <input v-model="form.isSupport" type="checkbox" id="isSupport" class="rounded" />
            <label for="isSupport" class="text-sm text-gray-700">
              支援模式
              <span class="text-xs text-gray-400 ml-1">（僅參與 D/N/AM，不佔 Off 配額）</span>
            </label>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">代號</label>
            <input
              v-model="form.code"
              type="text"
              maxlength="4"
              class="input-field w-24 font-mono uppercase"
              placeholder="如 A、B1"
              @input="form.code = form.code.toUpperCase()"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">顯示順序</label>
            <input v-model.number="form.sortOrder" type="number" min="0" class="input-field" />
          </div>
          <div v-if="formError" class="text-sm text-red-600">{{ formError }}</div>
          <div class="flex gap-2 justify-end pt-2">
            <button type="button" @click="closeForm" class="btn-secondary">取消</button>
            <button type="submit" class="btn-primary" :disabled="submitting">
              {{ submitting ? '處理中...' : (editingUser ? '儲存' : '新增') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Import preview modal -->
    <div
      v-if="importPreview.show"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] flex flex-col">
        <h3 class="text-lg font-semibold mb-1">確認匯入人員</h3>
        <p class="text-sm text-gray-500 mb-4">
          共 {{ importPreview.rows.length }} 筆，其中
          <span class="text-green-600 font-medium">{{ importPreview.rows.filter(r => !r._error).length }} 筆</span>可匯入，
          <span v-if="importPreview.rows.some(r => r._error)" class="text-red-500 font-medium">{{ importPreview.rows.filter(r => r._error).length }} 筆有問題</span>
        </p>

        <div class="overflow-y-auto flex-1 border border-gray-200 rounded mb-4">
          <table class="w-full text-xs">
            <thead class="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th class="text-left px-3 py-2 font-medium text-gray-700 w-6">#</th>
                <th class="text-left px-3 py-2 font-medium text-gray-700">姓名</th>
                <th class="text-left px-3 py-2 font-medium text-gray-700">電子郵件</th>
                <th class="text-left px-3 py-2 font-medium text-gray-700 w-20">角色</th>
                <th class="text-left px-3 py-2 font-medium text-gray-700 w-12">代號</th>
                <th class="text-center px-3 py-2 font-medium text-gray-700 w-16">排班</th>
                <th class="text-center px-3 py-2 font-medium text-gray-700 w-16">排序</th>
                <th class="text-left px-3 py-2 font-medium text-gray-700">備註</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in importPreview.rows"
                :key="i"
                :class="row._error ? 'bg-red-50' : 'hover:bg-gray-50'"
              >
                <td class="px-3 py-1.5 text-gray-400">{{ i + 1 }}</td>
                <td class="px-3 py-1.5 font-medium text-gray-800">{{ row.name }}</td>
                <td class="px-3 py-1.5 text-gray-600">{{ row.email }}</td>
                <td class="px-3 py-1.5 text-gray-600">{{ roleLabel(row.role) }}</td>
                <td class="px-3 py-1.5 font-mono text-gray-500">{{ row.code }}</td>
                <td class="px-3 py-1.5 text-center">{{ row.isActive ? '✓' : '—' }}</td>
                <td class="px-3 py-1.5 text-center text-gray-400">{{ row.sortOrder }}</td>
                <td class="px-3 py-1.5">
                  <span v-if="row._error" class="text-red-500">{{ row._error }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="importResult" class="mb-3 p-2 rounded text-sm"
          :class="importResult.errors?.length ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-green-50 border border-green-200 text-green-700'"
        >
          已新增 {{ importResult.added?.length }} 人。
          <span v-if="importResult.errors?.length">{{ importResult.errors.length }} 筆略過：{{ importResult.errors.map(e => e.email + '（' + e.error + '）').join('、') }}</span>
        </div>

        <div class="flex gap-2 justify-end">
          <button @click="closeImport" class="btn-secondary">{{ importResult ? '關閉' : '取消' }}</button>
          <button
            v-if="!importResult"
            @click="confirmImport"
            :disabled="importing || !importPreview.rows.some(r => !r._error)"
            class="btn-primary"
          >
            {{ importing ? '匯入中...' : '確認匯入' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Batch remove confirmation modal -->
    <div
      v-if="batchRemoveConfirm"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <div class="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h3 class="text-lg font-semibold mb-2">確認批量刪除</h3>
        <p class="text-gray-600 mb-2">確定要刪除以下 {{ selectedIds.size }} 位人員？此操作無法復原。</p>
        <ul class="mb-4 max-h-40 overflow-y-auto text-sm text-gray-700 space-y-1">
          <li v-for="id in [...selectedIds]" :key="id" class="flex items-center gap-2">
            <span class="font-mono text-xs text-gray-400">{{ getUserCode(id) }}</span>
            {{ getUserName(id) }}
          </li>
        </ul>
        <div class="flex gap-2 justify-end">
          <button @click="batchRemoveConfirm = false" class="btn-secondary">取消</button>
          <button @click="handleBatchRemove" class="btn-danger" :disabled="submitting">
            {{ submitting ? '刪除中...' : '確認刪除' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Remove confirmation modal -->
    <div
      v-if="removeTarget"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <div class="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h3 class="text-lg font-semibold mb-2">確認移除</h3>
        <p class="text-gray-600 mb-4">確定要移除「{{ removeTarget.name }}」嗎？此操作無法復原。</p>
        <div class="flex gap-2 justify-end">
          <button @click="removeTarget = null" class="btn-secondary">取消</button>
          <button @click="handleRemove" class="btn-danger" :disabled="submitting">
            {{ submitting ? '移除中...' : '確認移除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useSettingsStore } from '../../stores/settings.js'

const settingsStore = useSettingsStore()

// ── Batch selection ───────────────────────────────────────────
const selectedIds = ref(new Set())
const batchRemoveConfirm = ref(false)

const allSelected = computed(() =>
  sortedUsers.value.length > 0 && sortedUsers.value.every(u => selectedIds.value.has(u.userId))
)
const someSelected = computed(() =>
  selectedIds.value.size > 0 && !allSelected.value
)

function toggleSelect(userId) {
  const s = new Set(selectedIds.value)
  s.has(userId) ? s.delete(userId) : s.add(userId)
  selectedIds.value = s
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(sortedUsers.value.map(u => u.userId))
  }
}

function getUserName(userId) {
  return settingsStore.users.find(u => u.userId === userId)?.name || userId
}

function getUserCode(userId) {
  return settingsStore.users.find(u => u.userId === userId)?.code || ''
}

async function toggleActive(user) {
  const newActive = !(user.isActive !== false && user.isActive !== 'false')
  await settingsStore.updateUser({ userId: user.userId, isActive: newActive })
}

async function handleBatchRemove() {
  submitting.value = true
  const ids = [...selectedIds.value]
  const ok = await settingsStore.batchRemoveUsers(ids)
  if (ok) {
    selectedIds.value = new Set()
    batchRemoveConfirm.value = false
  }
  submitting.value = false
}

// ── CSV Template ──────────────────────────────────────────────
const CSV_HEADERS = ['姓名', '電子郵件', '密碼', '角色', '代號', '帳號啟用', '支援模式']
const CSV_TEMPLATE_ROWS = [
  ['王小明', 'wang@example.com', 'password123', 'member', 'A', 'TRUE', 'FALSE'],
  ['李大華', 'li@example.com', '', 'member', 'B', 'TRUE', 'FALSE']
]

function downloadTemplate() {
  const lines = [CSV_HEADERS.join(','), ...CSV_TEMPLATE_ROWS.map(r => r.join(','))]
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '人員匯入範本.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ── CSV Import ────────────────────────────────────────────────
const importCsvInput = ref(null)
const importing = ref(false)
const importResult = ref(null)
const importPreview = reactive({ show: false, rows: [] })

const ROLE_MAP = { '成員': 'member', '排班者': 'scheduler', '管理員': 'superadmin', member: 'member', scheduler: 'scheduler', superadmin: 'superadmin' }

function parseImportCSV(text) {
  const cleaned = text.replace(/^\uFEFF/, '')
  const lines = cleaned.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))

  const col = (names) => {
    for (const n of names) {
      const idx = headers.findIndex(h => h === n)
      if (idx !== -1) return idx
    }
    return -1
  }

  const nameCol     = col(['姓名', 'name'])
  const emailCol    = col(['電子郵件', 'email'])
  const pwCol       = col(['密碼', 'password'])
  const roleCol     = col(['角色', 'role'])
  const codeCol     = col(['代號', 'code'])
  const activeCol   = col(['帳號啟用', 'isActive'])
  const supportCol  = col(['支援模式', 'isSupport'])
  const baseSort    = settingsStore.users.length

  if (nameCol === -1 || emailCol === -1) throw new Error('找不到「姓名」或「電子郵件」欄位')

  const existingEmails = new Set(settingsStore.users.map(u => u.email))
  const seenEmails = new Set()
  const rows = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
    const name  = nameCol  !== -1 ? cols[nameCol]  || '' : ''
    const email = emailCol !== -1 ? cols[emailCol] || '' : ''
    if (!name && !email) continue

    let _error = null
    if (!name)  _error = '姓名為必填'
    else if (!email) _error = 'Email 為必填'
    else if (existingEmails.has(email) || seenEmails.has(email)) _error = 'Email 重複'

    const rawRole = roleCol !== -1 ? cols[roleCol] || '' : ''
    const role = ROLE_MAP[rawRole] || 'member'
    const isActive = activeCol !== -1 ? !['FALSE', 'false', '否', '0', 'no'].includes(cols[activeCol]) : true
    const isSupport = supportCol !== -1 ? ['TRUE', 'true', '是', '1', 'yes'].includes(cols[supportCol]) : false

    if (!_error) seenEmails.add(email)

    rows.push({
      name,
      email,
      password: pwCol !== -1 ? cols[pwCol] || '' : '',
      role,
      code: codeCol !== -1 ? (cols[codeCol] || '').toUpperCase() : '',
      sortOrder: baseSort + (rows.length),   // 自動接在現有人員後面
      isActive,
      isSupport,
      _error
    })
  }
  return rows
}

function handleImportCSV(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const rows = parseImportCSV(e.target.result)
      if (rows.length === 0) { alert('找不到有效資料，請確認 CSV 格式'); return }
      importPreview.rows = rows
      importPreview.show = true
      importResult.value = null
    } catch (err) {
      alert('解析失敗：' + err.message)
    } finally {
      if (importCsvInput.value) importCsvInput.value.value = ''
    }
  }
  reader.readAsText(file, 'UTF-8')
}

async function confirmImport() {
  importing.value = true
  importResult.value = null
  try {
    const validRows = importPreview.rows.filter(r => !r._error)
    // Hash passwords on client side
    const usersToSend = await Promise.all(validRows.map(async (row) => {
      let passwordHash = ''
      if (row.password) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(row.password))
        passwordHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
      }
      return { name: row.name, email: row.email, passwordHash, role: row.role, code: row.code, sortOrder: row.sortOrder, isActive: row.isActive, isSupport: row.isSupport }
    }))
    const result = await settingsStore.batchImportUsers(usersToSend)
    if (result) {
      importResult.value = result
    } else {
      importResult.value = { added: [], errors: [{ email: '', error: settingsStore.error || '匯入失敗' }] }
    }
  } finally {
    importing.value = false
  }
}

function closeImport() {
  importPreview.show = false
  importPreview.rows = []
  importResult.value = null
}

const showForm = ref(false)
const editingUser = ref(null)
const removeTarget = ref(null)
const submitting = ref(false)
const formError = ref(null)

const form = reactive({
  name: '',
  email: '',
  password: '',
  role: 'member',
  isActive: true,
  isSupport: false,
  noSchedule: false,
  sortOrder: 0,
  code: ''
})

const sortedUsers = computed(() =>
  [...settingsStore.users].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
)

// 將 0-based 索引轉字母代號：0→A, 1→B, …, 25→Z, 26→AA…（供自動建議使用）
function indexToCode(index) {
  let code = ''
  let n = index
  do {
    code = String.fromCharCode(65 + (n % 26)) + code
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return code
}

// 建議下一個未使用的代號
function nextAvailableCode() {
  const used = new Set(settingsStore.users.map(u => u.code).filter(Boolean))
  for (let i = 0; i < 702; i++) { // A–ZZ
    const c = indexToCode(i)
    if (!used.has(c)) return c
  }
  return ''
}

function roleLabel(role) {
  const map = { superadmin: '管理員', scheduler: '排班者', member: '成員' }
  return map[role] || role
}

function roleClass(role) {
  const map = {
    superadmin: 'text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full',
    scheduler: 'text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full',
    member: 'text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full'
  }
  return map[role] || 'text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full'
}

function openAddForm() {
  editingUser.value = null
  Object.assign(form, {
    name: '',
    email: '',
    password: '',
    role: 'member',
    isActive: true,
    isSupport: false,
    noSchedule: false,
    sortOrder: settingsStore.users.length,
    code: nextAvailableCode()
  })
  formError.value = null
  showForm.value = true
}

function openEditForm(user) {
  editingUser.value = user
  Object.assign(form, {
    name: user.name,
    email: user.email,
    password: '',
    role: user.role,
    isActive: user.isActive !== false && user.isActive !== 'false',
    isSupport: user.isSupport === true || user.isSupport === 'true',
    noSchedule: user.noSchedule === true || user.noSchedule === 'true',
    sortOrder: user.sortOrder || 0,
    code: user.code || ''
  })
  formError.value = null
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  editingUser.value = null
}

function confirmRemove(user) {
  removeTarget.value = user
}

async function handleSubmit() {
  submitting.value = true
  formError.value = null

  let success
  if (editingUser.value) {
    let passwordHash = undefined
    if (form.password) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(form.password))
      passwordHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
    }
    success = await settingsStore.updateUser({
      userId: editingUser.value.userId,
      name: form.name,
      role: form.role,
      isActive: form.isActive,
      isSupport: form.isSupport,
      noSchedule: form.noSchedule,
      sortOrder: form.sortOrder,
      code: form.code.toUpperCase(),
      ...(passwordHash !== undefined && { passwordHash })
    })
  } else {
    // Hash password if provided
    let passwordHash = ''
    if (form.password) {
      const msgBuffer = new TextEncoder().encode(form.password)
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    }
    success = await settingsStore.addUser({
      name: form.name,
      email: form.email,
      passwordHash,
      role: form.role,
      isActive: form.isActive,
      isSupport: form.isSupport,
      noSchedule: form.noSchedule,
      sortOrder: form.sortOrder,
      code: form.code.toUpperCase()
    })
  }

  if (success) {
    closeForm()
  } else {
    formError.value = settingsStore.error || '操作失敗'
  }
  submitting.value = false
}

async function handleRemove() {
  if (!removeTarget.value) return
  submitting.value = true
  const success = await settingsStore.removeUser(removeTarget.value.userId)
  if (success) {
    removeTarget.value = null
  }
  submitting.value = false
}
</script>
