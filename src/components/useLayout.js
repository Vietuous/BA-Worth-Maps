// c:\Users\Destiny\worth-map-tool\src\components\useLayout.js
import { safeGetNodeWidth, safeLevels } from './useStyling'

// Pre-compute level map for O(1) access instead of .find() every time
const levelMap = new Map(safeLevels.map((l) => [l.id, l]))

export const resolveOverlaps = (nodes) => {
  const GAP = 40

  // Group nodes by type using a Map to avoid object prototype overhead
  const layers = new Map()

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (!layers.has(n.type)) layers.set(n.type, [])
    layers.get(n.type).push(n)
  }

  // Resolve overlaps per layer
  for (const layerNodes of layers.values()) {
    // Sort by visual X position
    layerNodes.sort((a, b) => (a.fx ?? a.x) - (b.fx ?? b.x))

    for (let i = 1; i < layerNodes.length; i++) {
      const prev = layerNodes[i - 1]
      const curr = layerNodes[i]

      // If current node is locked, we generally don't want to push it automatically
      if (curr.locked) continue

      const prevX = prev.fx ?? prev.x
      const currX = curr.fx ?? curr.x

      // Calculate boundaries
      const prevRight = prevX + safeGetNodeWidth(prev) / 2
      const currLeft = currX - safeGetNodeWidth(curr) / 2

      if (currLeft < prevRight + GAP) {
        const shift = prevRight + GAP - currLeft
        // Apply shift to fixed position if it exists, else x
        curr.fx = currX + shift
        curr.x = curr.fx
      }
    }
  }
}

export const getLayerConstraints = (type, h) => {
  const centerY = h / 2
  const padding = 40
  const level = levelMap.get(type)

  if (!level) return { min: padding, max: h - padding }

  // Optimized switch instead of multiple if statements
  switch (level.index) {
    case 3:
      return { min: padding, max: centerY - 150 } // HOE
    case 2:
      return { min: centerY - 150, max: centerY } // Quality
    case 1:
      return { min: centerY, max: centerY + 150 } // Feature
    case 0:
      return { min: centerY + 150, max: centerY + 300 } // NSHC
    case -1:
      return { min: centerY + 300, max: centerY + 450 } // Feature Req
    case -2:
      return { min: centerY + 450, max: centerY + 600 } // Quality Req
    case -3:
      return { min: centerY + 600, max: h - padding } // HOE Req
    default:
      return { min: padding, max: h - padding }
  }
}
