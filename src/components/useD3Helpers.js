import * as d3 from 'd3'

export const calculateGraphBounds = (nodes, padding = 0) => {
  if (!nodes.length) return { x: 0, y: 0, w: 0, h: 0 }

  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (n.x < x0) x0 = n.x
    if (n.x > x1) x1 = n.x
    if (n.y < y0) y0 = n.y
    if (n.y > y1) y1 = n.y
  }

  return {
    x: x0 - padding,
    y: y0 - padding,
    w: x1 - x0 + padding * 2,
    h: y1 - y0 + padding * 2
  }
}

export const calculateMinimapTransform = (bounds, width, height) => {
  if (bounds.w === 0 || bounds.h === 0) return d3.zoomIdentity
  const scale = Math.min(width / bounds.w, height / bounds.h)
  const tx = (width - bounds.w * scale) / 2 - bounds.x * scale
  const ty = (height - bounds.h * scale) / 2 - bounds.y * scale
  return d3.zoomIdentity.translate(tx, ty).scale(scale)
}
