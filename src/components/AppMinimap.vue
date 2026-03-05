<template>
    <div class="minimap-wrapper" v-show="visible">
        <div class="minimap" v-show="!collapsed" @click="handleClick">
            <svg ref="svgRef" width="100%" height="100%"></svg>
        </div>
        <button class="minimap-toggle" @click="collapsed = !collapsed" title="Minimap umschalten">🗺️</button>
    </div>
</template>

<script setup>
import * as d3 from "d3";
import { ref } from "vue";
import { calculateGraphBounds, calculateMinimapTransform } from "./useD3Helpers";
import { safeGetColor } from "./useStyling";

const props = defineProps({
    visible: Boolean
});

const emit = defineEmits(['minimap-click']);

const collapsed = ref(false);
const svgRef = ref(null);
const minimapTransform = ref(d3.zoomIdentity);

const update = (nodes, links, mainTransform, mainWidth, mainHeight, highlightInfo = {}) => {
    if (!svgRef.value || !nodes || nodes.length === 0) return;

    const svg = d3.select(svgRef.value);

    // Calculate bounds
    const padding = 200;
    const bounds = calculateGraphBounds(nodes, padding);

    const mmTransform = calculateMinimapTransform(bounds, 200, 150);
    minimapTransform.value = mmTransform;

    const { isHighlightActive, highlightedNodes } = highlightInfo;

    // Draw Links
    const linkSel = svg.selectAll("line").data(links);
    linkSel.enter().append("line").attr("stroke", "#ccc").attr("stroke-width", 1)
        .merge(linkSel)
        .attr("x1", d => mmTransform.applyX(d.source.x))
        .attr("y1", d => mmTransform.applyY(d.source.y))
        .attr("x2", d => mmTransform.applyX(d.target.x))
        .attr("y2", d => mmTransform.applyY(d.target.y))
        .attr("stroke-opacity", d => {
            if (!isHighlightActive) return 1;
            const sId = d.source.id || d.source;
            const tId = d.target.id || d.target;
            return highlightedNodes.has(sId) && highlightedNodes.has(tId) ? 1 : 0.1;
        });
    linkSel.exit().remove();

    // Draw Nodes
    const nodeSel = svg.selectAll("circle").data(nodes);
    nodeSel.enter().append("circle").attr("r", 2)
        .merge(nodeSel)
        .attr("cx", d => mmTransform.applyX(d.x))
        .attr("cy", d => mmTransform.applyY(d.y))
        .attr("fill", d => safeGetColor(d.type))
        .attr("fill-opacity", d => {
            if (!isHighlightActive) return 1;
            return highlightedNodes.has(d.id) ? 1 : 0.1;
        });
    nodeSel.exit().remove();

    // Viewport Rect
    const viewX = -mainTransform.x / mainTransform.k;
    const viewY = -mainTransform.y / mainTransform.k;
    const viewW = mainWidth / mainTransform.k;
    const viewH = mainHeight / mainTransform.k;

    let viewport = svg.select(".viewport-rect");
    if (viewport.empty()) {
        viewport = svg.append("rect")
            .attr("class", "viewport-rect")
            .attr("fill", "none")
            .attr("stroke", "rgba(66, 185, 131, 0.5)")
            .attr("stroke-width", 1);
    }

    viewport
        .attr("x", mmTransform.applyX(viewX))
        .attr("y", mmTransform.applyY(viewY))
        .attr("width", viewW * mmTransform.k)
        .attr("height", viewH * mmTransform.k);
};

const handleClick = (event) => {
    const [mx, my] = d3.pointer(event, svgRef.value);
    const transform = minimapTransform.value;
    const [graphX, graphY] = transform.invert([mx, my]);
    emit('minimap-click', { x: graphX, y: graphY });
};

defineExpose({ update });
</script>

<style scoped>
.minimap-wrapper {
    position: absolute;
    bottom: 50px;
    left: 60px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    z-index: 90;
}

.minimap {
    width: 200px;
    height: 150px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #ccc;
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    cursor: pointer;
}

.minimap-toggle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid #ccc;
    background: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.minimap-toggle:hover {
    background: #f0f0f0;
}

/* Dark Mode Support */
:global(.dark-mode) .minimap {
    background: rgba(35, 37, 43, 0.95) !important;
    border-color: #555 !important;
}

:global(.dark-mode) .minimap-toggle {
    background: #23252B;
    border-color: #555;
    color: #E6E8EB;
}

:global(.dark-mode) .minimap-toggle:hover {
    background: #444;
}
</style>