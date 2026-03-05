// c:\Users\Destiny\worth-map-tool\src\components\useGraphData.js
import { computed, reactive, ref, toRaw } from 'vue'
import { safeLevels } from './useStyling'

// Singleton State
const graphData = reactive({
  nodes: [],
  links: []
})

// History State
const history = ref([])
const future = ref([])

// FIX: toRaw removes the Vue proxy so structuredClone works safely
const clone = (data) => structuredClone(toRaw(data))

export function useGraphData() {
  const saveState = () => {
    if (history.value.length > 20) history.value.shift()
    history.value.push(clone(graphData))
    future.value = []
  }

  const undo = () => {
    if (history.value.length === 0) return
    future.value.push(clone(graphData))
    const prev = history.value.pop()
    // Empty arrays and refill to maintain reactivity
    graphData.nodes.splice(0, graphData.nodes.length, ...prev.nodes)
    graphData.links.splice(0, graphData.links.length, ...prev.links)
  }

  const redo = () => {
    if (future.value.length === 0) return
    const next = future.value.pop()
    history.value.push(clone(graphData))
    graphData.nodes.splice(0, graphData.nodes.length, ...next.nodes)
    graphData.links.splice(0, graphData.links.length, ...next.links)
  }

  const addNodeToData = (node) => {
    saveState()
    graphData.nodes.push(node)
  }

  const updateNode = (nodeId, updates) => {
    saveState()
    const node = graphData.nodes.find((n) => n.id === nodeId)
    if (node) {
      Object.assign(node, updates)
    }
  }

  const updateNodesBulk = (updatesArray) => {
    saveState()
    updatesArray.forEach(({ id, changes }) => {
      const node = graphData.nodes.find((n) => n.id === id)
      if (node) Object.assign(node, changes)
    })
  }

  const addLinkToData = (link) => {
    saveState()
    if (!link.color) link.color = '#999'
    graphData.links.push(link)
  }

  const deleteLinkFromData = (linkToDelete) => {
    saveState()
    const sourceIdToDelete = linkToDelete.source.id || linkToDelete.source
    const targetIdToDelete = linkToDelete.target.id || linkToDelete.target

    const lIndex = graphData.links.findIndex((l) => {
      const sourceId = l.source.id || l.source
      const targetId = l.target.id || l.target
      return (
        (sourceId === sourceIdToDelete && targetId === targetIdToDelete) ||
        (sourceId === targetIdToDelete && targetId === sourceIdToDelete)
      )
    })

    if (lIndex > -1) {
      graphData.links.splice(lIndex, 1)
    }
  }

  const deleteNodeFromData = (nodeId) => {
    saveState()
    const nIndex = graphData.nodes.findIndex((n) => n.id === nodeId)
    if (nIndex > -1) graphData.nodes.splice(nIndex, 1)

    for (let i = graphData.links.length - 1; i >= 0; i--) {
      const l = graphData.links[i]
      const sourceId = l.source.id || l.source
      const targetId = l.target.id || l.target
      if (sourceId === nodeId || targetId === nodeId) {
        graphData.links.splice(i, 1)
      }
    }
  }

  const updateLinkColor = (linkObj, newColor) => {
    saveState()
    const sId = linkObj.source.id || linkObj.source
    const tId = linkObj.target.id || linkObj.target
    const targetLink = graphData.links.find((l) => {
      const lS = l.source.id || l.source
      const lT = l.target.id || l.target
      return lS === sId && lT === tId
    })
    if (targetLink) targetLink.color = newColor
  }

  const resetGraphData = () => {
    // No saveState here if we want to reset completely,
    // or we save the empty state as a new history entry.
    // To avoid initialization errors, we check if data exists.
    if (graphData.nodes.length > 0) saveState()
    graphData.nodes.length = 0
    graphData.links.length = 0
  }

  const loadGraphData = (data) => {
    saveState()
    if (!data || !data.nodes || !data.links) {
      graphData.nodes.length = 0
      graphData.links.length = 0
      return
    }
    graphData.nodes.splice(0, graphData.nodes.length, ...data.nodes)
    graphData.links.splice(0, graphData.links.length, ...data.links)
  }

  const getGraphData = () => {
    // Return a clean copy (no reactivity, no D3 references)
    return structuredClone(toRaw(graphData))
  }

  const createNode = (type, x, y, options = {}) => {
    const level = safeLevels.find((l) => l.id === type)
    const label = level ? level.label : 'Node'
    return {
      id: `node-${Math.random().toString(36).substr(2, 9)}`,
      name: `New ${label}`,
      type: type,
      x: x,
      y: y,
      fx: x,
      fy: y,
      validationStatus: 'incomplete',
      evidenceNotes: '',
      isEditing: true,
      ...options
    }
  }

  return {
    graphData,
    addNodeToData,
    updateNode,
    updateNodesBulk,
    addLinkToData,
    deleteLinkFromData,
    deleteNodeFromData,
    updateLinkColor,
    resetGraphData,
    loadGraphData,
    getGraphData,
    createNode,
    undo,
    redo,
    canUndo: computed(() => history.value.length > 0),
    canRedo: computed(() => future.value.length > 0)
  }
}
