import { onMounted, ref, toRaw, watch } from 'vue'

// IndexedDB Helper
const DB_NAME = 'WorthMapDB'
const STORE_NAME = 'maps'
const DB_VERSION = 1

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

const saveToLocal = async (key, data) => {
  const db = await initDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.put({ id: key, content: data, timestamp: Date.now() })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

const loadFromLocal = async (key) => {
  const db = await initDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const LOCAL_KEY = 'current-map'

export function useAutoSave(scenarios, currentScenarioId, graphData, onLoaded) {
  const status = ref('idle') // 'idle', 'saving', 'saved', 'error', 'local'
  const lastSaved = ref(null)
  const isDirty = ref(false)
  let timeoutId = null

  const persistToLocal = async () => {
    if (!scenarios.value) return

    // Sync current graphData to the active scenario before saving
    if (currentScenarioId.value && graphData) {
      const current = scenarios.value.find((s) => s.id === currentScenarioId.value)
      if (current) {
        // Deep copy to avoid reference issues
        current.data = JSON.parse(JSON.stringify(toRaw(graphData)))
      }
    }

    status.value = 'saving'

    const data = {
      scenarios: JSON.parse(JSON.stringify(toRaw(scenarios.value))),
      currentScenarioId: currentScenarioId.value
    }

    try {
      // 1. Immediate Local Save (IndexedDB)
      await saveToLocal(LOCAL_KEY, data)
      lastSaved.value = new Date().toLocaleTimeString('de-DE', {
        timeZone: 'Europe/Berlin',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
      status.value = 'saved'
      isDirty.value = false
      setTimeout(() => {
        if (status.value === 'saved') status.value = 'idle' // Reset after a while
      }, 3000)
    } catch (e) {
      console.error('Auto-save error:', e)
      status.value = 'error'
    }
  }

  const triggerSave = () => {
    status.value = 'saving'
    clearTimeout(timeoutId)
    timeoutId = setTimeout(persistToLocal, 15000) // 15s Debounce for inactivity
  }

  onMounted(async () => {
    // Initial Load
    const localMap = await loadFromLocal(LOCAL_KEY)
    if (localMap?.content && onLoaded) {
      onLoaded(localMap.content)
    }
  })

  watch(
    [scenarios, currentScenarioId, graphData],
    () => {
      isDirty.value = true
      triggerSave()
    },
    { deep: true }
  )

  return {
    clearAutoSave: async () => {
      const db = await initDB()
      db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear()
    },
    lastSaved,
    status
  }
}
