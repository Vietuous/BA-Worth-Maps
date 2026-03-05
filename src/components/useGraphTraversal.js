// c:\Users\Destiny\worth-map-tool\src\components\useGraphTraversal.js

// Helper to build adjacency list for O(1) lookups
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

export const getConnectedPath = (targetNodeId, links) => {
  const visited = new Set([targetNodeId])
  const { incoming, outgoing } = buildAdjacencyList(links)

  // BFS Helper
  const traverse = (startNode, adjMap) => {
    const queue = [startNode]
    const seen = new Set([startNode]) // Local seen set to avoid cycles in one direction

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

  // 1. Upstream (Incoming)
  traverse(targetNodeId, incoming)

  // 2. Downstream (Outgoing)
  traverse(targetNodeId, outgoing)

  return visited
}

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
