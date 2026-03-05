// c:\Users\Destiny\worth-map-tool\src\components\useValidation.js
import { isRef, reactive } from 'vue'
import { safeLevels } from './useStyling'

export function useValidation(graphDataSource) {
  const nodeWarnings = reactive(new Set())
  const nodeStatus = reactive(new Map())
  const validationStats = reactive({ A: 0, D: 0 })

  const getGraphData = () => (isRef(graphDataSource) ? graphDataSource.value : graphDataSource)

  // Cache levels for O(1) lookup
  const levelMap = new Map(safeLevels.map((l) => [l.id, l]))

  const isValidConnection = (source, target, mode) => {
    if (!source || !target || source.id === target.id) return false

    const graphData = getGraphData()
    // Check for existing link (undirected check)
    const exists = graphData.links.some((l) => {
      const s = l.source.id || l.source
      const t = l.target.id || l.target
      return (s === source.id && t === target.id) || (s === target.id && t === source.id)
    })
    if (exists) return false

    if (mode === 'sketch') return true

    const sourceLevel = levelMap.get(source.type)
    const targetLevel = levelMap.get(target.type)
    if (!sourceLevel || !targetLevel) return false

    const sIdx = sourceLevel.index
    const tIdx = targetLevel.index

    // Rule 1: NSHC (0) can only connect to Feature (1 or -1)
    if (sIdx === 0) {
      return Math.abs(tIdx) === 1
    }

    // Rule 2: Cannot connect back to NSHC
    if (tIdx === 0) {
      return false
    }

    // Rule 3: Appreciated Worth path (AW > 0)
    if (sIdx > 0) {
      // AW Feature (1) can go to AW Quality (2), RW Quality (-2), or skip to AW HOE (3)
      if (sIdx === 1) {
        return tIdx === 2 || tIdx === -2 || tIdx === 3
      }
      // AW Quality (2) can only go to AW HOE (3)
      if (sIdx === 2) {
        return tIdx === 3
      }
      // AW HOE (3) can connect to AW HOE (3)
      if (sIdx === 3) {
        return tIdx === 3
      }
    }

    // Rule 4: Requested Worth path (RW < 0)
    if (sIdx < 0) {
      // RW Feature (-1) can go to RW Quality (-2) or skip to RW HOE (-3)
      if (sIdx === -1) {
        return tIdx === -2 || tIdx === -3
      }
      // RW Quality (-2) can only go to RW HOE (-3)
      if (sIdx === -2) {
        return tIdx === -3
      }
      // RW HOE (-3) can connect to RW HOE (-3)
      if (sIdx === -3) {
        return tIdx === -3
      }
    }

    return false // Default deny
  }

  const validateGraph = () => {
    // Clear previous state
    nodeWarnings.clear()
    nodeStatus.clear()
    validationStats.A = 0

    const graphData = getGraphData()
    if (!graphData?.nodes?.length) return

    const inMap = new Map()
    const outMap = new Map()

    // Build adjacency
    graphData.links.forEach((l) => {
      const s = l.source.id || l.source
      const t = l.target.id || l.target
      if (!outMap.has(s)) outMap.set(s, [])
      outMap.get(s).push(l)
      if (!inMap.has(t)) inMap.set(t, [])
      inMap.get(t).push(l)
    })

    // Validate Nodes
    graphData.nodes.forEach((n) => {
      const inLinks = inMap.get(n.id) || []

      // Simplified validation: Check for evidence and placeholder names
      if (n.evidenceNotes && n.evidenceNotes.length > 5) {
        nodeStatus.set(n.id, { level: 'A', msg: 'Evidence backed.' })
        validationStats.A++
      } else if (
        n.name.startsWith('New ') ||
        n.name.startsWith('Start:') ||
        n.name.startsWith('Next:') ||
        n.name.startsWith('Goal:')
      ) {
        nodeStatus.set(n.id, { level: 'D', msg: 'Rename this node.' })
        nodeWarnings.add(n.id)
      }
    })
  }

  const getValidationError = (source, target) => {
    if (!isValidConnection(source, target, 'map')) {
      return 'Invalid connection for this methodology.'
    }
    return null
  }

  return {
    nodeWarnings,
    nodeStatus,
    validationStats,
    isValidConnection,
    validateGraph,
    getValidationError
  }
}
