// c:\Users\Destiny\worth-map-tool\src\components\useGraphTraversal.js

/**
 * GRAPH TRAVERSAL ENGINE
 *
 * This module provides the algorithmic foundation for analyzing the causal chains
 * within a Worth Map. It enables the "Evaluation Mode" by identifying how value
 * flows through the network.
 */

/* -------------------------------------------------------------------------- */
/* --- PERFORMANCE OPTIMIZATIONS ---                                          */
/* -------------------------------------------------------------------------- */

/**
 * Optimization: buildAdjacencyList
 *
 * Converts a flat array of links into a bi-directional adjacency map.
 * This pre-processing step enables O(1) neighbor lookups, which is critical
 * for maintaining 60FPS performance during real-time graph interactions.
 *
 * @param {Array} links - The array of link objects from the graph data.
 * @returns {Object} { incoming: Map, outgoing: Map }
 */
const buildAdjacencyList = (links) => {
  const incoming = new Map()
  const outgoing = new Map()

  for (let i = 0; i < links.length; i++) {
    const l = links[i]
    const s = l.source.id || l.source
    const t = l.target.id || l.target

    if (!incoming.has(t)) incoming.set(t, [])
    incoming.get(t).push(s)

    if (!outgoing.has(s)) outgoing.set(s, [])
    outgoing.get(s).push(t)
  }
  return { incoming, outgoing }
}

/* -------------------------------------------------------------------------- */
/* --- TRAVERSAL ALGORITHMS ---                                               */
/* -------------------------------------------------------------------------- */

/**
 * Algorithm: getConnectedPath (Impact Analysis)
 *
 * Implements a bi-directional Breadth-First Search (BFS) starting from a target node.
 *
 * 1. Upstream Traversal: Finds all 'Causes' (moving from Feature back to NSHC).
 * 2. Downstream Traversal: Finds all 'Effects' (moving from Feature toward HOE).
 *
 * The union of these sets represents the full "Value Creation Chain" for a specific
 * element, allowing designers to isolate and evaluate specific logic paths.
 *
 * @param {string} targetNodeId - The ID of the node to analyze.
 * @param {Array} links - The current set of graph connections.
 * @returns {Set} A Set of all Node IDs involved in the causal chain.
 */
export const getConnectedPath = (targetNodeId, links) => {
  const visited = new Set([targetNodeId])
  const { incoming, outgoing } = buildAdjacencyList(links)

  /**
   * Internal BFS Helper
   */
  const traverse = (startNode, adjMap) => {
    const queue = [startNode]
    const seen = new Set([startNode]) // Safety: prevents infinite recursion in cyclic graphs

    while (queue.length > 0) {
      const curr = queue.shift()
      visited.add(curr)

      const neighbors = adjMap.get(curr)
      if (neighbors) {
        for (let i = 0; i < neighbors.length; i++) {
          const next = neighbors[i]
          if (!seen.has(next)) {
            seen.add(next)
            queue.push(next)
          }
        }
      }
    }
  }

  // Step 1: Find all nodes that lead INTO the target
  traverse(targetNodeId, incoming)

  // Step 2: Find all nodes that lead OUT of the target
  traverse(targetNodeId, outgoing)

  return visited
}

/* -------------------------------------------------------------------------- */
/* --- UI UTILITIES ---                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Utility: getDirectionalNodes
 *
 * Performs a shallow (Depth-1) search for neighbors. Used primarily for
 * high-performance UI feedback like immediate neighbor highlighting.
 */
export const getDirectionalNodes = (targetNodeId, direction, links) => {
  const nodes = new Set([targetNodeId])

  // Single pass optimization (O(E)) is sufficient for depth-1 lookup
  // No need to build full adjacency list for just one step
  for (let i = 0; i < links.length; i++) {
    const l = links[i]
    const sId = l.source.id || l.source
    const tId = l.target.id || l.target

    if (direction === 'in' && tId === targetNodeId) {
      nodes.add(sId)
    } else if (direction === 'out' && sId === targetNodeId) {
      nodes.add(tId)
    }
  }

  return nodes
}
