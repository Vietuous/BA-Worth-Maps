<template>
    <div class="minimap-wrapper" v-show="visible">
        <div class="minimap" v-show="!collapsed" @click="handleClick" ref="minimapContainer">
            <svg ref="svgRef" width="100%" height="100%"></svg>
        </div>
        <button class="minimap-toggle" @click="collapsed = !collapsed" title="Toggle Minimap">🗺️</button>
    </div>
</template>

<script setup>
import * as d3 from "d3";
import { ref } from "vue";
import { safeGetColor } from "./useStyling";

const props = defineProps({
    visible: Boolean
});

const emit = defineEmits(['minimap-click']);

const collapsed = ref(false);
const svgRef = ref(null);
const minimapContainer = ref(null);
const minimapTransform = ref(d3.zoomIdentity);

const calculateGraphBounds = (nodes, padding = 0) => {
    if (!nodes || nodes.length === 0) return { x: [0, 1], y: [0, 1] };
    const x = d3.extent(nodes, d => d.x);
    const y = d3.extent(nodes, d => d.y);
    return {
        x: [x[0] - padding, x[1] + padding],
        y: [y[0] - padding, y[1] + padding]
    };
};

const calculateMinimapTransform = (bounds, width, height) => {
    const dx = bounds.x[1] - bounds.x[0];
    const dy = bounds.y[1] - bounds.y[0];
    const scale = Math.min(width / dx, height / dy);
    const translateX = -bounds.x[0] * scale;
    const translateY = -bounds.y[0] * scale;
    return d3.zoomIdentity.translate(translateX, translateY).scale(scale);
};

const update = (nodes, links, mainTransform, mainWidth, mainHeight, highlightInfo = {}) => {
    if (!svgRef.value || !minimapContainer.value || !nodes || nodes.length === 0) return;

    const svg = d3.select(svgRef.value);

    // Calculate bounds
    const padding = 200;
    const bounds = calculateGraphBounds(nodes, padding);
    const mmWidth = minimapContainer.value.clientWidth;
    const mmHeight = minimapContainer.value.clientHeight;
    const mmTransform = calculateMinimapTransform(bounds, mmWidth, mmHeight);
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
    bottom: 45px;
    left: 30px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    z-index: 90;
}

.minimap {
    width: 240px;
    height: 200px;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    cursor: pointer;
    border: 1px solid #414141;
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