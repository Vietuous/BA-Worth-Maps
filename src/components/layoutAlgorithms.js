import * as d3 from 'd3'
import { safeGetNodeWidth } from './useStyling'

/**
 * LAYOUT ALGORITHMS MODULE
 *
 * This module provides algorithms for automatically arranging nodes in a Worth Map,
 * aiming for a clear, readable, and methodologically consistent layout.
 */

/**
 * Algorithm: runSmartLayout
 *
 * Implements a barycenter-based layout heuristic, inspired by Sugiyama-style graph drawing.
 * It iteratively refines node positions to minimize edge crossings and improve readability.
 *
 * @param {d3.Simulation} simulation - The D3 force simulation instance.
 * @param {Array} nodes - The array of node objects.
 * @param {Array} links - The array of link objects.
 */
export const runSmartLayout = (simulation, nodes, links) => {
  if (!simulation) return

  const GAP = 40

  /* -------------------------------------------------------------------------- */
  /* --- LAYER CLUSTERING ---                                                   */
  /* -------------------------------------------------------------------------- */

  // 1. Group nodes into virtual layers based on Type AND Y-Position (Row)
  // This handles the HOE split (Row 1 vs Row 2) automatically
  /**
   * Internal Logic: virtualLayers
   *
   * Groups nodes into logical "rows" based on their type and rounded Y-position.
   */
  const virtualLayers = new Map()

  nodes.forEach((n) => {
    // Round Y to group roughly aligned nodes (tolerance 20px)
    const yKey = Math.round((n.fy ?? n.y) / 20) * 20
    const key = `${n.type}_${yKey}`

    if (!virtualLayers.has(key)) {
      virtualLayers.set(key, {
        id: key,
        y: yKey,
        nodes: []
      })
    }
    virtualLayers.get(key).nodes.push(n)
  })

  // 2. Sort layers Top-to-Bottom based on Y position
  const sortedLayers = Array.from(virtualLayers.values()).sort((a, b) => a.y - b.y)
  const layerIds = sortedLayers.map((l) => l.id)
  const layersMap = Object.fromEntries(sortedLayers.map((l) => [l.id, l.nodes]))

  /* -------------------------------------------------------------------------- */
  /* --- BARYCENTER CALCULATION ---                                             */
  /* -------------------------------------------------------------------------- */

  /**
   * Helper: getNeighbors
   * Finds connected nodes within a specific target layer.
   */
  const getNeighbors = (node, targetLayerId) => {
    const neighbors = []
    links.forEach((l) => {
      const s = l.source.id || l.source
      const t = l.target.id || l.target
      if (s === node.id) {
        const target = nodes.find((n) => n.id === t)
        if (target && layersMap[targetLayerId].includes(target)) neighbors.push(target)
      }
      if (t === node.id) {
        const source = nodes.find((n) => n.id === s)
        if (source && layersMap[targetLayerId].includes(source)) neighbors.push(source)
      }
    })
    return neighbors
  }

  /* -------------------------------------------------------------------------- */
  /* --- ITERATIVE POSITIONING (SWEEP) ---                                      */
  /* -------------------------------------------------------------------------- */

  /**
   * Heuristic: Barycenter Method
   * Iteratively adjusts node X-positions based on the average X-position of their neighbors in adjacent layers.
   */
  // Barycenter Heuristic (multiple passes for smoothing)
  for (let i = 0; i < 8; i++) {
    // Down sweep
    for (let j = 1; j < layerIds.length; j++) {
      const layer = layersMap[layerIds[j]]
      const prevLayerId = layerIds[j - 1]
      layer.forEach((n) => {
        const neighbors = getNeighbors(n, prevLayerId)
        n.barycenter =
          neighbors.length > 0 ? d3.mean(neighbors, (nb) => nb.fx || nb.x) : n.fx || n.x
      })
      layer.sort((a, b) => a.barycenter - b.barycenter)
      distributeLayer(layer, GAP)
    }
    // Up sweep
    for (let j = layerIds.length - 2; j >= 0; j--) {
      const layer = layersMap[layerIds[j]]
      const nextLayerId = layerIds[j + 1]
      layer.forEach((n) => {
        const neighbors = getNeighbors(n, nextLayerId)
        n.barycenter =
          neighbors.length > 0 ? d3.mean(neighbors, (nb) => nb.fx || nb.x) : n.fx || n.x
      })
      layer.sort((a, b) => a.barycenter - b.barycenter)
      distributeLayer(layer, GAP)
    }
  }

  simulation.alpha(0.3).restart()
}

/* -------------------------------------------------------------------------- */
/* --- HORIZONTAL DISTRIBUTION ---                                            */
/* -------------------------------------------------------------------------- */

/**
 * Helper: distributeLayer
 * Evenly spaces nodes horizontally within a given layer, ensuring a minimum gap.
 */
function distributeLayer(layer, gap) {
  let totalWidth = 0
  layer.forEach((n) => {
    totalWidth += safeGetNodeWidth(n)
  })
  totalWidth += (layer.length - 1) * gap

  let currentX = -totalWidth / 2
  layer.forEach((n) => {
    const w = safeGetNodeWidth(n)
    if (!n.locked) {
      n.fx = currentX + w / 2
      n.x = n.fx
    }
    currentX += w + gap
  })
}
