import { ref } from 'vue'

const STORAGE_KEY = 'dayEvents_v1'

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch { return {} }
}

function saveAll(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { }
}

// Singleton state shared across all callers
const events = ref(loadAll())

export function useDayEvents() {
  function getEvent(dateStr) {
    return events.value[dateStr] || null
  }

  function setEvent(dateStr, { meeting = false, reporter = '' } = {}) {
    if (!meeting && !reporter.trim()) {
      const copy = { ...events.value }
      delete copy[dateStr]
      events.value = copy
    } else {
      events.value = { ...events.value, [dateStr]: { meeting, reporter: reporter.trim() } }
    }
    saveAll(events.value)
  }

  function clearEvent(dateStr) {
    const copy = { ...events.value }
    delete copy[dateStr]
    events.value = copy
    saveAll(events.value)
  }

  return { events, getEvent, setEvent, clearEvent }
}
