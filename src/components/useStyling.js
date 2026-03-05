// c:\Users\Destiny\worth-map-tool\src\components\useStyling.js
import * as d3 from 'd3'

export const safeLevels = [
  { id: 'nshc', label: 'NSHC', index: 0 },
  { id: 'feature', label: 'Feature', index: 1 },
  { id: 'quality', label: 'Quality', index: 2 },
  { id: 'hoe', label: 'HOE', index: 3 },
  { id: 'feature_req', label: 'Feature', index: -1 },
  { id: 'quality_req', label: 'Quality', index: -2 },
  { id: 'hoe_req', label: 'HOE', index: -3 }
]

export const colors = {
  hoe: '#F44336', // red
  quality: '#2E7D32', // green (darker/richer)
  feature: '#9C27B0', // purple
  nshc: '#FFC107', // gold/amber
  feature_req: '#9C27B0', // purple
  quality_req: '#2E7D32', // green
  hoe_req: '#F44336' // red
}

export const safeGetColor = (type) => colors[type] || '#ccc'

export const generateColorPalette = (baseColor) => {
  const c = d3.color(baseColor)
  if (!c) return []
  return [
    c.brighter(1.2).formatHex(),
    c.brighter(0.6).formatHex(),
    baseColor,
    c.darker(0.6).formatHex(),
    c.darker(1.2).formatHex()
  ]
}

export const linkPalette = [
  '#999999',
  '#F44336',
  '#9C27B0',
  '#2196F3',
  '#00BCD4',
  '#4CAF50',
  '#FFEB3B',
  '#FF9800',
  '#795548',
  '#607D8B'
]

export const getLinkPalette = () => linkPalette

// Cache for text widths for performance optimization
const widthCache = new Map()

export const getTextWidth = (text, font = '14px sans-serif') => {
  if (typeof document === 'undefined') return 100

  const key = `${text}-${font}`
  if (widthCache.has(key)) return widthCache.get(key)

  const canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement('canvas'))
  const context = canvas.getContext('2d')
  context.font = font
  const metrics = context.measureText(text)

  // Limit cache to avoid memory leaks
  if (widthCache.size > 1000) widthCache.clear()

  widthCache.set(key, metrics.width)
  return metrics.width
}

export const safeGetNodeWidth = (d) => {
  const text = d.name || ''
  const minWidth = 120
  const padding = 40
  const contentWidth = getTextWidth(text) + padding
  return Math.max(minWidth, contentWidth)
}

export const safeGetNodeHeight = (d) => 60
