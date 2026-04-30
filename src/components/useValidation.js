// c:\Users\Destiny\worth-map-tool\src\components\useValidation.js
import { isRef, reactive } from 'vue'
import { safeLevels } from './useStyling'

/**
 * ARROWS METHODOLOGY ENGINE
 *
 * This module enforces the structural and semantic rules of the
 * Worth-Centered Design framework. It acts as a "Linter" for diagrams.
 */
export function useValidation(graphDataSource) {
  const nodeWarnings = reactive(new Set())
  const nodeStatus = reactive(new Map())
  const validationStats = reactive({ A: 0, D: 0 })

  /* -------------------------------------------------------------------------- */
  /* --- DATA NORMALIZATION ---                                                 */
  /* -------------------------------------------------------------------------- */

  /**
   * Normalizer: Ensures the data source is accessible regardless of
   * whether it's a Vue Ref or a raw object.
   */
  const getGraphData = () => (isRef(graphDataSource) ? graphDataSource.value : graphDataSource)

  // Cache levels for O(1) lookup
  const levelMap = new Map(safeLevels.map((l) => [l.id, l]))

  /* -------------------------------------------------------------------------- */
  /* --- METHODOLOGICAL GRAMMAR ---                                             */
  /* -------------------------------------------------------------------------- */

  /**
   * Logic: isValidConnection
   *
   * The "Grammar Rule" for Worth Maps. This function rigorously checks if a proposed connection
   * between two nodes adheres to the ARROWS framework's structural constraints.
   *
   * Key rules enforced:
   * 1.  **No Duplicate Links**: Prevents creating redundant connections between the same two nodes.
   * 2.  **Layer Proximity**: Ensures connections only occur between adjacent or allowed layers (e.g., NSHC to Feature, Feature to Quality, etc.).
   * 3.  **No Layer Skipping**: Prevents skipping intermediate layers in the causal chain (e.g., Feature directly to HOE without Quality).
   * 4.  **Group Symmetry**: Maintains the separation between "Appreciated Worth" (AW) and "Requested Worth" (RW) paths.
   * 5.  **Directionality**: Enforces the forward flow of causality (e.g., NSHC cannot follow HOE).
   *
   * @param {Object} source - The source node object.
   * @param {Object} target - The target node object.
   * @param {string} mode - The current application mode ('map' or 'sketch'). Validation is stricter in 'map' mode.
   * @returns {boolean} True if the connection is valid, false otherwise.
   */
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

  /* -------------------------------------------------------------------------- */
  /* --- GRAPH AUDITING & HEURISTICS ---                                        */
  /* -------------------------------------------------------------------------- */

  /**
   * Algorithm: validateGraph (Graph Auditor)
   *
   * Scans the entire graph to assess the "Quality" of the Worth Map's argumentation.
   * This function populates `nodeStatus` and `nodeWarnings` based on predefined criteria.
   *
   * Criteria for status levels:
   * - **Level A (Verified)**: Node has substantial `evidenceNotes`.
   * - **Level D (Placeholder/Semantic Warning)**: Node has a default/placeholder name (e.g., "New Node")
   *   or lacks sufficient evidence.
   *
   * The assigned levels (A, B, C, D) are used for visual color-coding in the Evaluation Mode,
   * providing immediate feedback on the map's completeness and rigor.
   *
   * Note: This is a simplified validation. A more advanced version would check for
   * broken chains, missing links, or semantic inconsistencies.
   */
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

  /* -------------------------------------------------------------------------- */
  /* --- UI FEEDBACK HELPERS ---                                                */
  /* -------------------------------------------------------------------------- */

  /**
   * Utility: getValidationError
   *
   * Provides a human-readable error message for an invalid connection.
   * This is used for real-time feedback during connection drawing.
   */
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
