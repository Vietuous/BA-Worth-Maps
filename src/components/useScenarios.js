// c:\Users\Destiny\worth-map-tool\src\components\useScenarios.js
import { onMounted, ref, watch } from 'vue'
import { useGraphData } from './useGraphData'

const SCENARIOS_STORAGE_KEY = 'worth-map-scenarios-v1'

export function useScenarios() {
  const { getGraphData } = useGraphData()
  const scenarios = ref([{ id: 1, name: 'Draft 1', data: null }])
  const currentScenarioId = ref(1)
  const isSwitching = ref(false) // Lock to prevent watcher from overwriting data during switch

  // Load scenarios from local storage
  onMounted(() => {
    const saved = localStorage.getItem(SCENARIOS_STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          scenarios.value = parsed
          // Ensure current ID is valid
          if (!scenarios.value.some((s) => s.id === currentScenarioId.value)) {
            currentScenarioId.value = scenarios.value[0].id
          }
        }
      } catch (e) {
        console.error('Failed to load scenarios', e)
      }
    }
  })

  // Helper to save current graph state into the scenario object
  const syncCurrentScenarioData = () => {
    const current = scenarios.value.find((s) => s.id === currentScenarioId.value)
    if (current) {
      current.data = getGraphData()
    }
  }

  // Persist scenarios to localStorage
  // We only save to localStorage here. Syncing graph -> scenario object happens explicitly or via auto-save logic elsewhere if needed.
  // But to be safe, we sync on change, BUT skip if we are in the middle of switching.
  let saveTimeout = null
  watch(
    [scenarios, currentScenarioId],
    () => {
      if (isSwitching.value) return

      if (saveTimeout) clearTimeout(saveTimeout)
      saveTimeout = setTimeout(() => {
        // Sync current state before saving to disk
        syncCurrentScenarioData()
        localStorage.setItem(SCENARIOS_STORAGE_KEY, JSON.stringify(scenarios.value))
      }, 1000) // 1 second debounce for disk writes
    },
    { deep: true }
  )

  const switchScenario = (id) => {
    if (currentScenarioId.value === id) return

    isSwitching.value = true // Lock watcher

    // 1. Save current state
    syncCurrentScenarioData()

    // 2. Switch
    currentScenarioId.value = id

    // Unlock watcher and save the switch to storage
    setTimeout(() => {
      isSwitching.value = false
      localStorage.setItem(SCENARIOS_STORAGE_KEY, JSON.stringify(scenarios.value))
    }, 0)
  }

  const addScenario = () => {
    isSwitching.value = true
    syncCurrentScenarioData()

    const newId = Date.now()

    let counter = 1
    let newName = `Draft ${counter}`
    while (scenarios.value.some((s) => s.name === newName)) {
      counter++
      newName = `Draft ${counter}`
    }

    scenarios.value.push({ id: newId, name: newName, data: null })
    currentScenarioId.value = newId

    setTimeout(() => {
      isSwitching.value = false
      localStorage.setItem(SCENARIOS_STORAGE_KEY, JSON.stringify(scenarios.value))
    }, 0)
  }

  const deleteScenario = (id) => {
    const index = scenarios.value.findIndex((s) => s.id === id)
    if (index !== -1) {
      if (currentScenarioId.value === id) {
        // If deleting current, switch to neighbor
        const nextIndex = Math.max(0, index - 1)
        if (scenarios.value.length > 1) {
          const nextId = scenarios.value[nextIndex === index ? index + 1 : nextIndex].id
          switchScenario(nextId)
        }
      }
      scenarios.value.splice(index, 1)
      // Watcher will handle persistence
    }
  }

  const renameScenario = (id) => {
    const scenario = scenarios.value.find((s) => s.id === id)
    if (scenario) {
      const newName = prompt('New name for scenario:', scenario.name)
      if (newName && newName.trim() !== '') {
        scenario.name = newName
      }
    }
  }

  const updateScenarioName = (id, newName) => {
    const scenario = scenarios.value.find((s) => s.id === id)
    if (scenario) {
      scenario.name = newName
    }
  }

  const cloneScenario = (id) => {
    const original = scenarios.value.find((s) => s.id === id)
    if (!original) return

    let dataToClone = original.data
    // If cloning the active one, take the live data
    if (currentScenarioId.value === id) {
      dataToClone = getGraphData()
    }

    // Use structuredClone for better performance and safety
    const clonedData = dataToClone ? structuredClone(dataToClone) : null
    const newId = Date.now()

    // Add and switch
    isSwitching.value = true
    syncCurrentScenarioData()

    scenarios.value.push({ id: newId, name: `${original.name} (Copy)`, data: clonedData })
    currentScenarioId.value = newId

    setTimeout(() => {
      isSwitching.value = false
      localStorage.setItem(SCENARIOS_STORAGE_KEY, JSON.stringify(scenarios.value))
    }, 0)
  }

  return {
    scenarios,
    currentScenarioId,
    switchScenario,
    addScenario,
    deleteScenario,
    renameScenario,
    cloneScenario,
    updateScenarioName
  }
}
