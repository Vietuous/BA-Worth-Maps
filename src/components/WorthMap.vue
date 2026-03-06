<template>
  <div ref="mapContainer" class="worth-map-container" :class="[
    `bg-${mode}`,
    { 'highlight-active': isHighlightActive },
    { 'dark-mode': isDarkMode }
  ]">
    <!-- D3 will insert the SVG here -->

    <!-- Evaluation Mode Vignette -->
    <div v-if="mode === 'evaluation'" class="vignette-overlay"></div>

    <!-- Tutorial Hint (Dynamic) -->
    <Transition name="fade">
      <div v-if="tutorialHint" class="tutorial-hint-toast">
        {{ tutorialHint }}
      </div>
    </Transition>

    <!-- Tutorial Overlay -->
    <div v-if="tutorialStep && mode === 'map' && showTutorial" class="tutorial-overlay-container">
      <div class="tutorial-card" :style="getFixedTutorialPosition(tutorialStep)">
        <button class="close-tutorial-btn" @click="$emit('toggle-tutorial')" title="Close Tutorial">×</button>
        <h4>{{ tutorialContent[tutorialStep]?.title }}</h4>
        <p>{{ tutorialContent[tutorialStep]?.text }}</p>
        <button v-if="tutorialContent[tutorialStep]?.isOptional" class="skip-btn" @click="handleSkipStep">Skip
          Step</button>
      </div>
    </div>

    <!-- Evaluation Mode Info -->
    <div v-if="mode === 'evaluation'" class="evaluation-info-card" :class="{ collapsed: isEvalInfoCollapsed }">
      <div class="info-header">
        <h4>Evaluation Mode</h4>
        <button class="toggle-info-btn" @click="isEvalInfoCollapsed = !isEvalInfoCollapsed">
          {{ isEvalInfoCollapsed ? 'ℹ️' : '×' }}
        </button>
      </div>
      <div class="info-content" v-if="!isEvalInfoCollapsed">
        <p>Click on any node to highlight its value creation chain. Use this view to present the flow from Feature to
          Human Value.</p>
      </div>
    </div>

    <!-- Validation Tooltip -->
    <div v-if="validationMsg" class="validation-tooltip"
      :style="{ left: screenMousePosition.x + 15 + 'px', top: screenMousePosition.y + 15 + 'px' }">
      {{ validationMsg }}
    </div>

    <!-- Context Menu -->
    <AppContextMenu :visible="contextMenu.visible" :x="contextMenu.x" :y="contextMenu.y" :item="contextMenu.item"
      :type="contextMenu.type" v-model:view="contextMenu.view" @action="handleContextAction" />

    <!-- Minimap -->
    <AppMinimap ref="minimapComponent" :visible="isMinimapVisible" @minimap-click="handleMinimapClick" />
  </div>
</template>

<script setup>
import * as d3 from "d3";
import { isRef, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import AppContextMenu from "./AppContextMenu.vue";
import AppMinimap from "./AppMinimap.vue";
import { useGraphData } from "./useGraphData";
import { getConnectedPath, getDirectionalNodes } from "./useGraphTraversal";
import { resolveOverlaps } from "./useLayout";
import { linkPalette, safeGetColor, safeGetNodeHeight, safeGetNodeWidth, safeLevels } from "./useStyling";
import { checkFullChain, countFullChains, useTutorial } from "./useTutorial";
import { useValidation } from "./useValidation";

const props = defineProps({
  mode: {
    type: String,
    default: "map", // 'map' or 'evaluation'
  },
  isLinkingMode: {
    type: Boolean,
    default: false
  },
  visibleLayers: {
    type: Array,
    default: () => ['nshc', 'feature', 'quality', 'hoe', 'feature_req', 'quality_req', 'hoe_req']
  },
  analyzingView: {
    type: String,
    default: 'axis' // 'axis' or 'zones'
  },
  isDarkMode: {
    type: Boolean,
    default: false
  },
  showTutorial: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(["node-selected", "graph-stats", "toggle-tutorial"]);

const mapContainer = ref(null);
const minimapComponent = ref(null);
let resizeObserver = null;
let simulation = null;
let svg = null;
let zoomBehavior = null;
let linkSelection = null;
let nodeSelection = null;
let dragHandler = null;
let connectionDragHandler = null;
let tempLine = null;
let containerWidth = 0;
let containerHeight = 0;
let linkPathsVisible = null;
let linkPathsHit = null;
let quadtree = null; // For performant node lookups
const mousePosition = ref({ x: 0, y: 0 });
const isInitializing = ref(false); // Fix: Prevent recursive updates during init
const isInternalUpdate = ref(false); // Fix: Prevent recursive updates from validation
const pendingConnectionSource = ref(null); // For "Start Connection" via menu
const validationMsg = ref(null);
const screenMousePosition = ref({ x: 0, y: 0 });
const currentZoomTransform = ref(d3.zoomIdentity);
const editingNode = ref(null);
const graphUpdateTrigger = ref(0);
let lastEmittedStats = null;
let statsTimeout = null;

const linkColors = linkPalette;

// State for UI Overlays
const contextMenu = ref({ visible: false, x: 0, y: 0, item: null, type: null, view: 'main' });
const highlightedNodes = ref(new Set());
const selectedNodeIds = ref(new Set()); // For Multi-Selection (Cluster)
const isHighlightActive = ref(false);
const isHoverHighlight = ref(false);
const initialViewParsed = ref(false);
const isMinimapVisible = ref(false);
const collapsedGroups = ref({
  appreciated: false,
  requested: false
});
const layerCounts = ref({ nshc: 0, feature: 0, quality: 0, hoe: 0, feature_req: 0, quality_req: 0, hoe_req: 0 });
const isEvalInfoCollapsed = ref(false);

// Tutorial Logic Composable
const { tutorialStep, tutorialHint, shakingNodeId, activeSpotlightNodes, validateAction, updateTutorialStep, tutorialContent, skipCurrentStep } = useTutorial(
  props,
  () => simulation ? simulation.nodes() : [],
  editingNode,
  graphUpdateTrigger
);

// Fixed position based on layer logic (Screen coordinates)
const getFixedTutorialPosition = (step) => {
  const content = tutorialContent[step];
  if (!content) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  // Calculate position based on Graph Coordinates (Layers)
  const h = mapContainer.value?.clientHeight || 800;
  const centerY = h / 2;
  const transform = currentZoomTransform.value;

  const layer = content.targetLayer;
  let graphY = centerY;

  // Map layer ID to Y coordinate (same logic as layout)
  const layerOffsets = {
    hoe: -225,
    quality: -75,
    feature: 75,
    nshc: 225,
    feature_req: 375,
    quality_req: 525,
    hoe_req: 675
  };

  if (layer && layerOffsets[layer] !== undefined) {
    graphY = centerY + layerOffsets[layer];
  }

  // Project to Screen Coordinates
  const screenY = transform.applyY(graphY);
  // Fixed X offset (e.g., right side of the screen or relative to center)
  const screenX = transform.applyX(0) + 300 * transform.k;

  // Ensure it stays on screen
  const safeX = Math.min(Math.max(screenX, 320), (mapContainer.value?.clientWidth || 1000) - 300);
  const safeY = Math.min(Math.max(screenY, 100), (mapContainer.value?.clientHeight || 800) - 100);

  return { top: `${safeY}px`, left: `${safeX}px`, transform: 'translate(0, -50%)' };
};


const {
  graphData: _graphData,
  addNodeToData,
  updateNode,
  updateNodesBulk,
  addLinkToData,
  deleteLinkFromData,
  deleteNodeFromData,
  updateLinkColor,
  resetGraphData,
  loadGraphData,
  getGraphData,
  createNode,
} = useGraphData();

// IMPORTANT: We pass the Ref directly to useValidation
const {
  nodeWarnings,
  nodeStatus,
  validationStats,
  isValidConnection: checkConnection,
  validateGraph,
} = useValidation(_graphData);

// Helper to safely access graphData (Deep copy for D3)
const getRawData = () => {
  const data = isRef(_graphData) ? _graphData.value : _graphData;
  try {
    return {
      nodes: JSON.parse(JSON.stringify(data?.nodes || [])),
      links: JSON.parse(JSON.stringify(data?.links || []))
    };
  } catch (e) {
    console.error("Error copying data:", e);
    return { nodes: [], links: [] };
  }
};

const getValidationError = (source, target) => {
  if (props.mode === 'sketch') return null;

  const sLevel = safeLevels.find(l => l.id === source.type);
  const tLevel = safeLevels.find(l => l.id === target.type);
  if (!sLevel || !tLevel) return null;

  // NSHC (0)
  if (sLevel.index === 0) {
    if (Math.abs(tLevel.index) === 1) return null;
    return `NSHC can only be connected to Feature (Appreciated) or Feature (Requested).`;
  }

  // Appreciated (>0)
  if (sLevel.index > 0) {
    const diff = tLevel.index - sLevel.index;
    if (diff === 1) return null;
    if (diff <= 0) return `Regression: ${sLevel.label} cannot lead directly to ${tLevel.label}.`;
    return `Gap: Layer skipped.`;
  }

  // Requested (<0)
  if (sLevel.index < 0) {
    const diff = tLevel.index - sLevel.index;
    if (diff === -1) return null;
    if (diff >= 0) return `Regression: ${sLevel.label} cannot lead directly to ${tLevel.label}.`;
    return `Gap: Layer skipped.`;
  }
  return "Invalid Connection.";
};

const deleteNode = (nodeId) => {
  deleteNodeFromData(nodeId);
  nextTick(() => updateGraph());
};

const deleteLink = (linkData) => {
  deleteLinkFromData(linkData);
  nextTick(() => updateGraph());
};

const toggleGroup = (group) => {
  collapsedGroups.value[group] = !collapsedGroups.value[group];
  updateGraph();
};

const handleSkipStep = () => {
  skipCurrentStep();
  updateGraph(); // Trigger tutorial update
};

const isLayerVisible = (layerId) => {
  // Check global filter from props
  if (!props.visibleLayers.includes(layerId)) return false;

  // Check group collapse state
  if (['hoe', 'quality', 'feature'].includes(layerId)) return !collapsedGroups.value.appreciated;
  if (['feature_req', 'quality_req', 'hoe_req'].includes(layerId)) return !collapsedGroups.value.requested;

  // NSHC is independent or always visible unless filtered globally
  return true;
};

// --- SVG Controls Logic (+ Buttons) ---
const drawControls = () => {
  if (!svg) return;

  const controlsLayer = svg.select(".controls-layer");
  if (controlsLayer.empty()) return;

  // Only show in Map Mode
  if (props.mode !== 'map') {
    controlsLayer.selectAll("*").remove();
    return;
  }

  const h = mapContainer.value?.clientHeight || 800;
  const centerY = h / 2;
  const counts = layerCounts.value;

  const showLayer = {
    nshc: true,
    feature: (!props.showTutorial || counts.nshc > 0 || counts.feature > 0) && isLayerVisible('feature'),
    quality: (!props.showTutorial || counts.feature > 0 || counts.quality > 0) && isLayerVisible('quality'),
    hoe: (!props.showTutorial || counts.quality > 0 || counts.hoe > 0) && isLayerVisible('hoe'),
    feature_req: isLayerVisible('feature_req'),
    quality_req: isLayerVisible('quality_req'),
    hoe_req: isLayerVisible('hoe_req')
  };

  const buttonData = safeLevels.filter(l => showLayer[l.id]).map(level => {
    const rawY = centerY + (1.5 - level.index) * 150;
    // X is now calculated separately in updateControlPositions to save performance
    return { id: level.id, y: rawY, label: level.label };
  });

  const buttons = controlsLayer.selectAll("g.add-btn-group")
    .data(buttonData, d => d.id);

  const enter = buttons.enter().append("g")
    .attr("class", "add-btn-group")
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      event.stopPropagation();
      if (!validateAction('create', d.id)) return; // Check tutorial constraint
      addNodeAt(d.id, d.x, d.y);
    });

  enter.append("circle")
    .attr("r", 12)
    .attr("fill", "transparent")
    .attr("stroke", d => safeGetColor(d.id))
    .attr("stroke-width", 2)
    .attr("stroke-opacity", 0.7); // More visible (was 0.4)

  enter.append("text")
    .text("+")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .attr("dy", "1px") // Optical centering
    .attr("fill", d => safeGetColor(d.id))
    .attr("font-family", "Arial, sans-serif") // Ensure consistent rendering
    .attr("font-size", "16px")
    .attr("font-weight", "bold")
    .attr("opacity", 0.9); // More visible (was 0.6)

  const merge = buttons.merge(enter);
  merge
    .classed("shake-animation", d => shakingNodeId.value === d.id); // Apply shake class

  // Update colors/opacity if needed
  merge.select("circle").attr("stroke", d => safeGetColor(d.id));
  merge.select("text").attr("fill", d => safeGetColor(d.id));

  buttons.exit().remove();

  // Initial Positioning
  updateControlPositions();
};

const updateControlPositions = () => {
  if (!svg) return;

  // Performance Optimization: Calculate max X for all layers in one pass
  const layerMaxX = {};
  if (simulation) {
    const nodes = simulation.nodes();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const x = (n.fx ?? n.x) || 0;
      if (layerMaxX[n.type] === undefined || x > layerMaxX[n.type]) {
        layerMaxX[n.type] = x;
      }
    }
  }

  const controlsLayer = svg.select(".controls-layer");
  // Nur Transformation updaten, keine DOM-Elemente erzeugen/löschen
  // Only update transformation, do not create/delete DOM elements
  controlsLayer.selectAll("g.add-btn-group").attr("transform", function (d) {
    let rawX = 0;
    if (layerMaxX[d.id] !== undefined) {
      rawX = layerMaxX[d.id] + 160;
    }
    return `translate(${rawX}, ${d.y})`;
  });
};

const lastAddTimestamp = ref(0);
const addNodeAt = (type, x, y) => {
  const GAP = 40;
  let targetX = x;

  // 1. Shift existing nodes of this layer to the left
  // We update both simulation nodes (live) and graphData (persistence)
  if (simulation) {
    const simNodes = simulation.nodes();
    const layerSimNodes = simNodes.filter(n => n.type === type);

    if (layerSimNodes.length > 0) {
      // Append to the right: Find max X and add step
      // We need the width of the right-most node
      const rightMostNode = layerSimNodes.reduce((prev, curr) => ((prev.fx ?? prev.x) > (curr.fx ?? curr.x) ? prev : curr));
      targetX = (rightMostNode.fx ?? rightMostNode.x) + safeGetNodeWidth(rightMostNode) / 2 + GAP + 60; // +60 for half of new node (approx)
    }
  }

  // Fix: Prevent double creation (Debounce)
  const now = Date.now();
  if (now - lastAddTimestamp.value < 500) return;
  lastAddTimestamp.value = now;

  const newNode = createNode(type, targetX, y);
  addNodeToData(newNode);
  nextTick(() => updateGraph());
};

const updateSpotlight = () => {
  if (!svg) return;
  const overlay = svg.select(".spotlight-path");

  if (!props.showTutorial || activeSpotlightNodes.value.length === 0) {
    overlay.attr("d", null);
    overlay.style("pointer-events", "none");
    return;
  }

  overlay.style("pointer-events", "auto");

  const w = containerWidth || mapContainer.value.clientWidth;
  const h = containerHeight || mapContainer.value.clientHeight;
  const transform = currentZoomTransform.value;

  // Outer rect (counter-clockwise) covering the whole viewport
  let path = `M0,0 H${w} V${h} H0 Z`;

  // Inner rects (clockwise) to create holes for each highlighted node
  activeSpotlightNodes.value.forEach(node => {
    const nw = safeGetNodeWidth(node);
    const nh = safeGetNodeHeight(node);
    const nx = transform.applyX(node.x);
    const ny = transform.applyY(node.y);
    const scaledW = nw * transform.k;
    const scaledH = nh * transform.k;

    const x0 = nx - scaledW / 2 - 40; // Increased padding for interaction
    const y0 = ny - scaledH / 2 - 40;
    const x1 = nx + scaledW / 2 + 40;
    const y1 = ny + scaledH / 2 + 40;

    path += ` M${x0},${y0} V${y1} H${x1} V${y0} Z`;
  });

  overlay.attr("d", path).attr("fill-rule", "evenodd");
};

const updateGraph = () => {
  if (isInitializing.value) return;
  if (isInternalUpdate.value) return;
  if (!svg) return;

  // IMPORTANT: Always get selections fresh from layers
  const linkGroup = svg.select(".links-layer");
  const nodeGroup = svg.select(".nodes-layer");
  const gridLayer = svg.select(".grid-layer");
  const controlsLayer = svg.select(".controls-layer");

  if (linkGroup.empty() || nodeGroup.empty()) return;

  try {
    isInternalUpdate.value = true;
    validateGraph();
  } catch (e) {
    console.error("Validation error:", e);
  } finally {
    isInternalUpdate.value = false;
  }

  const rawData = getRawData();
  // Filter: Keep all data for simulation, but hide visually if needed
  let nodes = rawData.nodes;
  let links = rawData.links;

  // Pre-calculate HOE connectivity for layout logic
  const hoeReceivers = new Set();
  links.forEach(l => {
    const sId = l.source.id || l.source;
    const tId = l.target.id || l.target;
    const s = nodes.find(n => n.id === sId);
    const t = nodes.find(n => n.id === tId);
    if (s && t) {
      const sIsHoe = s.type === 'hoe' || s.type === 'hoe_req';
      const tIsHoe = t.type === 'hoe' || t.type === 'hoe_req';
      if (sIsHoe && tIsHoe) hoeReceivers.add(tId);
    }
  });

  // Evaluation Mode: Filter out placeholder nodes to clean up the view
  if (props.mode === 'evaluation') {
    const nodeIds = new Set(nodes.map(n => n.id));
    links = links.filter(l => nodeIds.has(l.source.id || l.source) && nodeIds.has(l.target.id || l.target));
  }

  // Preserve positions from running simulation to prevent reset
  if (simulation) {
    const oldNodes = new Map(simulation.nodes().map(n => [n.id, n]));
    const h = mapContainer.value?.clientHeight || 800;
    const centerY = h / 2;

    nodes.forEach(n => {
      const old = oldNodes.get(n.id);
      if (old) {
        n.x = old.x;
        n.y = old.y;
        n.vx = old.vx;
        n.vy = old.vy;
        n.fx = old.fx; // Fix: Fix position so nodes don't jump
        n.fy = old.fy;
      }

      // Layout Logic: ALWAYS snap Y position to the correct layer
      const level = safeLevels.find(l => l.id === n.type);
      if (level) {
        const layerCenter = centerY + (1.5 - level.index) * 150;

        // Preserve horizontal position if it exists (from drag or load)
        if (n.fx === undefined || n.fx === null) {
          n.fx = n.x;
        }

        // ALWAYS recalculate and enforce vertical position
        if (n.type === 'hoe' || n.type === 'hoe_req') {
          const row1 = layerCenter;
          const row2 = n.type === 'hoe' ? layerCenter - 80 : layerCenter + 80;

          // Enforce row logic: Children (with incoming HOE links) go to the second row.
          n.fy = hoeReceivers.has(n.id) ? row2 : row1;
        } else {
          n.fy = layerCenter;
        }

        // For new nodes, or nodes without a previous simulation state, place them at their fixed position immediately
        if (!old) {
          n.x = n.fx;
          n.y = n.fy;
        }
      }
      // Cache dimensions for performance in tick/intersection
      n._width = safeGetNodeWidth(n);
      n._height = safeGetNodeHeight(n);
    });

  }

  // Initial View: Center camera on leftmost column (only once at start)
  if (!initialViewParsed.value && nodes.length > 0 && svg && zoomBehavior) {
    const minX = d3.min(nodes, n => n.x) || 0;
    // Move camera so that layer names (x=-480) are visible.
    // Translate X = 600 ensures that x=-480 is at Screen X=120.
    svg.call(zoomBehavior.transform, d3.zoomIdentity.translate(600, 0));
    initialViewParsed.value = true;

    // Force update of sticky labels after camera move
    const t = d3.zoomIdentity.translate(600, 0);
    const fixedX = (50 - t.x) / t.k;
    svg.selectAll(".layer-label").attr("x", fixedX);
    svg.selectAll(".group-label").attr("transform", d => `translate(${fixedX - 25}, ${d.y}) rotate(-90)`);
  }

  // Stats Calculation for Progressive Disclosure
  const nodeCounts = { nshc: 0, feature: 0, quality: 0, hoe: 0, feature_req: 0, quality_req: 0, hoe_req: 0 };
  nodes.forEach(n => { if (nodeCounts[n.type] !== undefined) nodeCounts[n.type]++; });
  layerCounts.value = nodeCounts;

  try {
    updateTutorialStep(nodes, links);
  } catch (e) {
    console.warn("Tutorial update failed:", e);
  }

  const newStats = {
    nodeCounts,
    hasFullChain: checkFullChain(nodes, links),
    fullChainCount: countFullChains(nodes, links),
    validationStats: { ...validationStats }
  };

  // Debounce stats emission to prevent recursive update loops in parent
  if (statsTimeout) clearTimeout(statsTimeout);
  statsTimeout = setTimeout(() => {
    if (JSON.stringify(lastEmittedStats) !== JSON.stringify(newStats)) {
      emit('graph-stats', newStats);
      lastEmittedStats = newStats;
    }
  }, 500); // Increased debounce to prevent recursive updates

  graphUpdateTrigger.value++;

  // 0. Draw Zones (Visible in Sketch for orientation)
  if (props.mode !== 'evaluation' || props.analyzingView === 'zones') {
    // Cleanup Axis elements if switching from Axis view
    gridLayer.selectAll(".axis-element").remove();

    const h = mapContainer.value?.clientHeight || 800;
    const centerY = h / 2;
    const zoneWidth = 40000; // Sufficiently wide
    const xStart = -zoneWidth / 2;
    const xEnd = zoneWidth / 2;

    // 4. Visual Hierarchy: Background Bands
    const getEvaluationColor = (id) => {
      const isDark = props.isDarkMode;
      if (id === 'hoe' || id === 'hoe_req') return isDark ? 'rgba(244, 67, 54, 0.15)' : 'rgba(138,107,46,0.08)';
      if (id === 'quality' || id === 'quality_req') return isDark ? 'rgba(46, 125, 50, 0.15)' : 'rgba(106,76,99,0.08)';
      if (id === 'feature' || id === 'feature_req') return isDark ? 'rgba(156, 39, 176, 0.15)' : 'rgba(62,92,118,0.08)';
      if (id === 'nshc') return isDark ? 'rgba(255, 193, 7, 0.15)' : 'rgba(85,107,47,0.08)';
      return safeGetColor(id);
    };

    const getColor = (id) => props.mode === 'evaluation' ? getEvaluationColor(id) : safeGetColor(id);

    const bands = [
      { id: 'hoe', y: -20000, height: (centerY - 150) - (-20000), color: getColor('hoe') },
      { id: 'quality', y: centerY - 150, height: 150, color: getColor('quality') },
      { id: 'feature', y: centerY, height: 150, color: getColor('feature') },
      { id: 'nshc', y: centerY + 150, height: 150, color: getColor('nshc') },
      { id: 'feature_req', y: centerY + 300, height: 150, color: getColor('feature_req') },
      { id: 'quality_req', y: centerY + 450, height: 150, color: getColor('quality_req') },
      { id: 'hoe_req', y: centerY + 600, height: 1000, color: getColor('hoe_req') }
    ];

    // Optimization: Use D3 join instead of remove/append for better performance
    gridLayer.selectAll(".layer-bg")
      .data(bands.filter(b => b.height > 0), d => d.id)
      .join("rect")
      .attr("class", d => `layer-bg layer-bg-${d.id}`)
      .attr("x", xStart).attr("y", d => d.y).attr("width", zoneWidth).attr("height", d => d.height)
      .attr("fill", d => d.color)
      .attr("opacity", d => isLayerVisible(d.id) ? (props.mode === 'evaluation' ? 1 : 0.18) : 0.01)
      .style("pointer-events", "none")
      .style("transition", "opacity 0.3s ease");

    // Lines relative to center: centerY - 150, centerY, centerY + 150
    // HOE < -150 < Quality < 0 < Feature < 150 < NSHC
    const lines = [
      { y: centerY - 150, style: 'dashed' },
      { y: centerY, style: 'dashed' },
      { y: centerY + 150, style: 'solid' }, // NSHC Separator Top
      { y: centerY + 300, style: 'solid' }, // NSHC Separator Bottom (now solid)
      { y: centerY + 450, style: 'dashed' },
      { y: centerY + 600, style: 'dashed' }
    ];

    // Filter lines based on progressive disclosure (same logic as buttons)
    const showLayer = {
      nshc: true,
      feature: nodeCounts.nshc > 0 || nodeCounts.feature > 0,
      quality: nodeCounts.feature > 0 || nodeCounts.quality > 0,
      hoe: nodeCounts.quality > 0 || nodeCounts.hoe > 0,
      feature_req: true,
      quality_req: true,
      hoe_req: true
    };

    gridLayer.selectAll(".grid-line")
      .data(lines, (d, i) => i)
      .join("line")
      .attr("class", "grid-line")
      .attr("x1", xStart).attr("x2", xEnd)
      .attr("y1", d => d.y).attr("y2", d => d.y)
      .attr("stroke", "#999").attr("stroke-width", 3)
      .attr("stroke-dasharray", d => d.style === 'dashed' ? "5,5" : null)
      .attr("opacity", 0.8);

    // Calculate fixed X positions for sticky labels (Layer Names)
    const transform = d3.zoomTransform(svg.node());
    const fixedLayerX = (50 - transform.x) / transform.k; // 50px margin from left

    // Labels (Positioned left, but within zoom range)
    const labels = [
      { text: "Human-Oriented Elements", y: centerY - 225 },
      { text: "Quality", y: centerY - 75 },
      { text: "Feature", y: centerY + 75 },
      { text: "NSHC", y: centerY + 225 },
      { text: "Feature", y: centerY + 375 },
      { text: "Quality", y: centerY + 525 },
      { text: "Human-Oriented Elements", y: centerY + 675 }
    ];

    gridLayer.selectAll(".layer-label")
      .data(labels, (d, i) => i)
      .join("text")
      .attr("class", "layer-label")
      .attr("x", fixedLayerX).attr("y", d => d.y).attr("dy", "0.35em")
      .attr("fill", "#555")
      .attr("font-size", "12px").attr("font-weight", "bold").style("text-transform", "uppercase")
      .style("pointer-events", "none").text(d => d.text);

    // Group Labels (Vertical)
    const drawGroupLabel = (text, groupKey, yPos) => {
      const isCollapsed = collapsedGroups.value[groupKey];
      const labelText = `${isCollapsed ? '[+]' : '[-]'} ${text}`;

      const gLabel = gridLayer.append("g")
        .attr("class", `group-label group-label-${groupKey}`) // Added 'group-label' for sticky selection
        .datum({ y: yPos }) // Bind data for zoom updates
        .attr("transform", `translate(${fixedLayerX - 25}, ${yPos}) rotate(-90)`)
        .style("cursor", "pointer")
        .on("click", () => toggleGroup(groupKey));

      gLabel.append("text")
        .attr("class", "group-label-text")
        .attr("text-anchor", "middle")
        .attr("fill", "#666")
        .attr("font-size", "16px").attr("font-weight", "bold").style("text-transform", "uppercase")
        .text(labelText);

      // Hit area rect
      gLabel.append("rect").attr("class", "hit-area").attr("x", -150).attr("y", -20).attr("width", 300).attr("height", 40).attr("fill", "transparent");
    };

    // Simple redraw for group labels as they are interactive and few
    gridLayer.selectAll(".group-label-appreciated, .group-label-requested").remove();
    if (props.mode !== 'evaluation' || props.analyzingView === 'zones') {
      drawGroupLabel("Appreciated Worth", "appreciated", centerY - 75);
      drawGroupLabel("Requested Worth", "requested", centerY + 525);
    }

  } else if (props.mode === 'evaluation' && props.analyzingView === 'axis') {
    // 5. Butterfly Mode Visuals (Symmetry Axis)
    gridLayer.selectAll("*").remove(); // Clear zones if switching to axis
    const h = mapContainer.value?.clientHeight || 800;
    const centerY = h / 2;

    // Axis through NSHC (Pivot)
    gridLayer.append("line")
      .attr("class", "axis-element")
      .attr("x1", -4000).attr("x2", 4000)
      .attr("y1", centerY + 225).attr("y2", centerY + 225)
      .attr("stroke", "#42b983").attr("stroke-width", 2).attr("stroke-dasharray", "10,5").attr("opacity", 0.5);

    gridLayer.append("text")
      .attr("class", "axis-element")
      .attr("x", -450).attr("y", centerY + 220)
      .attr("text-anchor", "start")
      .attr("fill", "#42b983").attr("font-size", "10px").attr("font-weight", "bold").style("letter-spacing", "2px")
      .text("VALUE EXCHANGE AXIS");
  }

  // Update Controls Structure (Add/Remove Buttons) - Always call to ensure cleanup in Eval mode
  drawControls();

  // 1. Feed Simulation
  if (simulation) {
    simulation.nodes(nodes);
    simulation.force("link").links(links);

    // Forces removed for static positioning
    // We only use the simulation tick to update the DOM

    simulation.alpha(0.3).restart();
  }

  // 2. Bind Links
  linkSelection = linkGroup
    .selectAll("g.link-wrapper")
    .data(links, (d) => (d.source.id || d.source) + "-" + (d.target.id || d.target));

  linkSelection = linkSelection.join(
    enter => {
      const g = enter.append("g").attr("class", "link-wrapper");
      // Visible Link
      g.append("path")
        .attr("class", "link-visible")
        .attr("fill", "none")
        .attr("marker-end", d => `url(#arrowhead-${(d.color || '#999').replace('#', '')})`);
      // Hit Area Link (Invisible, wider)
      g.append("path")
        .attr("class", "link-hit-area")
        .attr("stroke", "#000") // Solid color base
        .attr("stroke-opacity", 0) // Fully transparent
        .attr("stroke-width", 60) // Increased hit area further
        .attr("fill", "none")
        .style("pointer-events", "stroke") // Ensure it captures events
        .style("cursor", "pointer");
      return g;
    }
  );

  // Cache selections for tick performance
  linkPathsVisible = linkSelection.select(".link-visible");
  linkPathsHit = linkSelection.select(".link-hit-area");

  // Performance: Build quadtree for fast node searching (hover, click, drag)
  quadtree = d3.quadtree().x(d => d.x).y(d => d.y).addAll(nodes);

  // Update attributes
  linkSelection.select(".link-visible")
    .attr("stroke", (d) => d.color || "#999")
    .attr("stroke-opacity", 0.6)
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "none") // Ensure solid lines in Mapping Mode
    .attr("marker-end", d => `url(#arrowhead-${(d.color || '#999').replace('#', '')})`) // Update marker immediately
    .classed("layer-filtered", (d) => {
      // Check if source or target layer is hidden
      const getNodeType = (ref) => (ref.type ? ref.type : nodes.find(n => n.id === ref)?.type);
      const sType = getNodeType(d.source);
      const tType = getNodeType(d.target);
      return !isLayerVisible(sType) || !isLayerVisible(tType);
    });

  // Evaluation Mode Link Styling
  if (props.mode === 'evaluation') {
    linkSelection.select(".link-visible")
      .attr("stroke", (d) => d.color || (props.isDarkMode ? "#555" : "#D8DEE9"))
      .attr("stroke-opacity", 0.9)
      .attr("stroke-width", 2) // consistent width
      .attr("stroke-dasharray", (d) => {
        const s = nodes.find(n => n.id === (d.source.id || d.source));
        const t = nodes.find(n => n.id === (d.target.id || d.target));
        // A link is considered "without evidence" if either connected node lacks it.
        return (!s?.evidenceNotes || !t?.evidenceNotes) ? "4,4" : "none";
      })
      .attr("stroke", (d) => {
        const s = nodes.find(n => n.id === (d.source.id || d.source));
        const t = nodes.find(n => n.id === (d.target.id || d.target));
        if (!s?.evidenceNotes || !t?.evidenceNotes) {
          return "#EBCB8B"; // Yellow warning color for no evidence
        }
        return d.color || (props.isDarkMode ? "#555" : "#D8DEE9"); // Use custom color or default
      });
  }

  linkSelection
    .on("contextmenu", (event, d) => {
      event.preventDefault();
      if (props.mode === "evaluation") return;

      contextMenu.value = {
        visible: true,
        x: event.clientX,
        y: event.clientY,
        item: d,
        type: 'link',
        view: 'main'
      };
    });

  // Connectivity Check for Styling (WS vs WM)
  const connectedNodeIds = new Set();
  links.forEach(l => {
    connectedNodeIds.add(l.source.id || l.source);
    connectedNodeIds.add(l.target.id || l.target);
  });

  // 3. Bind Nodes
  nodeSelection = nodeGroup
    .selectAll("g.node")
    .data(nodes, (d) => d.id);

  nodeSelection = nodeSelection.join(
    (enter) => {
      const g = enter.append("g").attr("class", "node")
        .style("cursor", "grab")
        .style("pointer-events", "all")
        .on("mouseenter", (event, d) => handleNodeHover(d, true))
        .on("mouseleave", (event, d) => handleNodeHover(d, false));

      // Rectangle
      g.append("rect")
        .attr("fill", "#fff")
        .attr("stroke-width", 3)
        .style("pointer-events", "all"); // IMPORTANT for Dragging

      // Text Container
      const fo = g.append("foreignObject")
        .style("pointer-events", "none");

      fo.append("xhtml:div")
        .attr("class", "node-label-div")
        .style("color", "#000")
        .style("display", "flex")
        .style("align-items", "center")
        .style("justify-content", "center")
        .style("height", "100%")
        .style("width", "100%");

      // Idea Badge (Worth Sketch Indicator)
      const ideaBadge = g.append("g").attr("class", "idea-badge").style("display", "none");
      ideaBadge.append("rect").attr("rx", 4).attr("ry", 4).attr("width", 34).attr("height", 16).attr("fill", "#f5f5f5").attr("stroke", "#ccc");
      ideaBadge.append("text").text("IDEA").attr("x", 17).attr("y", 11).attr("text-anchor", "middle").attr("font-size", "9px").attr("fill", "#888").style("font-weight", "bold");

      // Connection Handle (Top Right)
      const handle = g.append("g")
        .attr("class", "connection-handle")
        .style("cursor", "crosshair");

      handle.append("circle")
        .attr("r", 8)
        .attr("fill", "#fff")
        .attr("stroke", "#333")
        .attr("stroke-width", 1.5);

      handle.append("path")
        .attr("d", "M-3,3 L3,-3 M3,-3 L-1,-3 M3,-3 L3,1") // Arrow pointing NE (2 o'clock)
        .attr("stroke", "#333")
        .attr("stroke-width", 1.5)
        .attr("fill", "none");

      g.each(function (d) {
        if (d.isEditing) {
          d3.select(this).style("pointer-events", "all");
          enterEditMode(d3.select(this), d);
          delete d.isEditing;
        }
      });

      // Bind Drag Handler immediately upon creation
      if (dragHandler) g.call(dragHandler);

      // Separate Drag Handler for Connection Handle
      if (connectionDragHandler) handle.call(connectionDragHandler);

      return g;
    }
  );

  // Update attributes (for all)
  nodeSelection.select("rect")
    .attr("width", (d) => safeGetNodeWidth(d))
    .attr("height", (d) => safeGetNodeHeight(d))
    .attr("x", (d) => -safeGetNodeWidth(d) / 2)
    .attr("y", (d) => -safeGetNodeHeight(d) / 2)
    .attr("rx", 6)
    .attr("ry", 6)
    .attr("stroke-width", 3)
    .attr("stroke", (d) => d.customColor || safeGetColor(d.type))
    .attr("stroke-opacity", (d) => !connectedNodeIds.has(d.id) ? 0.6 : 1)
    // Methodological Visualization (A, B, C, D)
    .attr("stroke-dasharray", (d) => {
      if (props.mode === 'sketch') return !connectedNodeIds.has(d.id) ? "8,4" : "none";
      const status = nodeStatus.get(d.id);
      if (!status) return "none";
      return "none"; // All solid lines now for A, B, C, D
    });

  // Evaluation Mode Styling
  if (props.mode === 'evaluation') {
    nodeSelection.select("rect")
      .attr("stroke", (d) => {
        const status = nodeStatus.get(d.id);
        if (status?.level === 'A') return "#28a745"; // Green (Evidence)
        if (status?.level === 'B') return "#5CA4D6"; // Blue (Plausible)
        if (status?.level === 'C') return "#dc3545"; // Red (Broken)
        if (status?.level === 'D') return "#ffc107"; // Orange (Semantic)
        return safeGetColor(d.type);
      })
      .attr("stroke-width", (d) => nodeStatus.get(d.id)?.level === 'A' ? 4 : 2)
      .style("filter", (d) => nodeStatus.get(d.id)?.level === 'A' ? "drop-shadow(0 0 8px rgba(40, 167, 69, 0.4))" : "none")
      .style("opacity", (d) => (nodeStatus.get(d.id)?.level === 'C') ? 0.5 : 1);
  }

  // Selection Frame (Multi-Select)
  nodeSelection.select("rect")
    .attr("stroke", (d) => selectedNodeIds.value.has(d.id) ? "#2c3e50" : (d.customColor || safeGetColor(d.type)))
    .style("filter", (d) => selectedNodeIds.value.has(d.id) ? "drop-shadow(0 0 6px rgba(66, 185, 131, 0.6))" : null);

  // Apply filter class to group (so text/icons also fade)
  nodeSelection.attr("class", (d) => `node type-${d.type} ${!isLayerVisible(d.type) ? 'layer-filtered' : ''}`);

  // Tutorial Highlight Class
  const spotlightedIds = new Set(activeSpotlightNodes.value.map(n => n.id));
  nodeSelection.classed("tutorial-glow", d => props.showTutorial && spotlightedIds.has(d.id));

  nodeSelection.select("foreignObject")
    .attr("width", (d) => safeGetNodeWidth(d))
    .attr("height", (d) => safeGetNodeHeight(d))
    .attr("x", (d) => -safeGetNodeWidth(d) / 2)
    .attr("y", (d) => -safeGetNodeHeight(d) / 2);

  nodeSelection.select(".node-label-div").html((d) => d.name);

  nodeSelection.select(".idea-badge")
    .style("display", (d) => !connectedNodeIds.has(d.id) && props.mode !== 'analyzing' ? "block" : "none")
    .attr("transform", (d) => `translate(${-safeGetNodeWidth(d) / 2}, ${-safeGetNodeHeight(d) / 2 - 20})`);

  nodeSelection.select(".connection-handle")
    .attr("transform", (d) => `translate(${safeGetNodeWidth(d) / 2}, -${safeGetNodeHeight(d) / 2})`)
    .style("display", props.mode === "evaluation" ? "none" : "block");

  nodeSelection.on("click", (event, d) => {
    event.stopPropagation();

    // Feature: Start connection (via context menu)
    if (pendingConnectionSource.value) {
      const sourceId = pendingConnectionSource.value;
      if (sourceId !== d.id && checkConnection({ id: sourceId, type: getRawData().nodes.find(n => n.id === sourceId)?.type }, d, props.mode)) {
        addLinkToData({ source: sourceId, target: d.id });
        pendingConnectionSource.value = null;
        tempLine.attr("opacity", 0);
        validationMsg.value = null;
        nextTick(() => updateGraph());
        return;
      } else {
        // Feedback why it failed
        validationMsg.value = getValidationError({ id: sourceId, type: getRawData().nodes.find(n => n.id === sourceId)?.type }, d);
      }
    }

    if (props.mode === "evaluation") {
      isHoverHighlight.value = false; // Click fixes the highlight
      selectNodeForPresentation(d);
    } else {
      // Multi-Selection Logic
      if (event.shiftKey) {
        if (selectedNodeIds.value.has(d.id)) selectedNodeIds.value.delete(d.id);
        else selectedNodeIds.value.add(d.id);
        updateGraph(); // Redraw for frame
      } else {
        selectedNodeIds.value.clear();
        selectedNodeIds.value.add(d.id);
        emit("node-selected", { node: d });
        updateGraph();
      }
    }
  });

  nodeSelection.on("dblclick", (event, d) => {
    if (props.mode === "evaluation") return;

    // Lockout Logic
    if (props.mode === 'map' && props.showTutorial && tutorialStep.value && tutorialStep.value !== 'tutorial_complete' && !activeSpotlightNodes.value.some(n => n.id === d.id) && tutorialStep.value !== 'rename_node') {
      return; // Prevent editing if not the target node
    }

    event.stopPropagation();
    enterEditMode(d3.select(event.currentTarget), d);
  });

  nodeSelection.on("contextmenu", (event, d) => {
    event.preventDefault();

    // Lockout Logic for Context Menu
    if (props.showTutorial && tutorialStep.value && !activeSpotlightNodes.value.some(n => n.id === d.id) && tutorialStep.value !== 'rename_node' && tutorialStep.value !== 'rename_feature') {
      return;
    }

    if (props.mode !== "evaluation") {
      // Calculate Y to prevent overflow
      const menuHeight = 220; // Approx height of context menu
      const windowHeight = window.innerHeight;
      let y = event.clientY;
      if (y + menuHeight > windowHeight) y = windowHeight - menuHeight - 10;

      contextMenu.value = {
        visible: true,
        x: event.clientX,
        y: y,
        item: d,
        type: 'node',
        view: 'main'
      };
    }
  });

  // Attach to component instance for parent access
  // (Note: defineExpose handles the public API, but we need to pass this internal function)
  // We'll add it to defineExpose below.
};

function enterEditMode(nodeSelection, d) {
  const fo = nodeSelection.select("foreignObject");
  const div = fo.select("div");

  editingNode.value = d;
  updateTutorialStep(getRawData().nodes, getRawData().links); // Force update to show 'rename_node'

  div.style("display", "none");

  const input = fo.append("xhtml:input")
    .attr("class", "node-input")
    .property("value", d.name)
    .on("blur", function () {
      d.name = this.value;
      if (!d.name.trim()) d.name = "New Node";
      updateNode(d.id, { name: d.name }); // Persist name change
      editingNode.value = null;
      updateGraph(); // Update for dynamic width
      div.html(d.name).style("display", "flex");
      d3.select(this).remove();
    })
    .on("keydown", function (event) {
      if (event.key === "Enter") {
        this.blur();
      }
    });

  input.node().focus({ preventScroll: true });
  input.node().select(); // Select text directly for overwriting
}

const zoomToPath = () => {
  if (!svg || !zoomBehavior || !mapContainer.value || highlightedNodes.value.size === 0) return;

  const pathNodes = simulation.nodes().filter(n => highlightedNodes.value.has(n.id));
  if (pathNodes.length === 0) return;

  const width = mapContainer.value.clientWidth;
  const height = mapContainer.value.clientHeight;
  const padding = 80; // More padding

  const x0 = d3.min(pathNodes, d => d.x);
  const x1 = d3.max(pathNodes, d => d.x);
  const y0 = d3.min(pathNodes, d => d.y);
  const y1 = d3.max(pathNodes, d => d.y);

  const gw = (x1 - x0) + 200; // account for node width
  const gh = (y1 - y0) + 100; // account for node height

  const scale = Math.min((width - padding * 2) / gw, (height - padding * 2) / gh, 1.5); // cap zoom at 1.5x
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const transform = d3.zoomIdentity.translate(width / 2, height / 2).scale(scale).translate(-cx, -cy);
  svg.transition().duration(750).call(zoomBehavior.transform, transform);
};

// 1. Temporary Highlight (Hover)
function handleNodeHover(d, isHovering) {
  // If a click highlight is active (not hover), ignore hover
  if (props.mode === 'evaluation') return; // Disable hover highlight in Evaluation Mode
  if (isHighlightActive.value && !isHoverHighlight.value) return;

  if (isHovering) {
    isHoverHighlight.value = true;
    highlightPath(d);
  } else {
    // Reset
    if (isHoverHighlight.value) {
      isHighlightActive.value = false;
      highlightedNodes.value.clear();
      updateVisualsForHighlight();
      isHoverHighlight.value = false;
    }
  }
}

function highlightPath(targetNode) {
  highlightedNodes.value.clear();
  isHighlightActive.value = true;

  const visited = getConnectedPath(targetNode.id, getRawData().links);

  highlightedNodes.value = visited;

  // If node is isolated (no connections), do not activate highlight/dimming
  if (visited.size <= 1) {
    isHighlightActive.value = false;
    highlightedNodes.value.clear();
  }

  // Update Visuals
  updateVisualsForHighlight();
  if (svg && isHighlightActive.value) {
    svg.selectAll(".node").classed("selected-highlight", d => d.id === targetNode.id);
    // Auto-zoom in evaluation mode
    if (props.mode === 'evaluation') {
      zoomToPath();
    }
  }

  // Ensure axis text is dimmed when highlighting
  if (svg) {
    svg.selectAll(".axis-element").classed("dimmed", isHighlightActive.value);
  }
}

function highlightDirectional(targetNode, direction) {
  highlightedNodes.value.clear();
  isHighlightActive.value = true;
  highlightedNodes.value = getDirectionalNodes(targetNode.id, direction, getRawData().links);
  updateVisualsForHighlight();
}

function updateVisualsForHighlight() {
  if (svg) {
    const isEvalHighlight = isHighlightActive.value;

    svg.selectAll(".node")
      .classed("dimmed", isEvalHighlight ? d => !highlightedNodes.value.has(d.id) : false)
      .classed("path-active", isEvalHighlight ? d => highlightedNodes.value.has(d.id) : false);

    svg.selectAll(".link-wrapper") // target the wrapper for easier logic
      .classed("dimmed", isEvalHighlight ? d => {
        const sId = d.source.id || d.source;
        const tId = d.target.id || d.target;
        return !(highlightedNodes.value.has(sId) && highlightedNodes.value.has(tId));
      } : false)
      .classed("path-active", isEvalHighlight ? d => {
        const sId = d.source.id || d.source;
        const tId = d.target.id || d.target;
        return highlightedNodes.value.has(sId) && highlightedNodes.value.has(tId);
      } : false);
  }
}

// Helper: Calculate intersection point on target node border for arrows
const getNodeIntersection = (source, target) => {
  const w = (target._width || safeGetNodeWidth(target)) / 2;
  const h = (target._height || safeGetNodeHeight(target)) / 2;

  const dx = target.x - source.x;
  const dy = target.y - source.y;

  if (dx === 0 && dy === 0) return { x: target.x, y: target.y };

  // Calculate intersection with box
  // If |dy/dx| > h/w, it hits top/bottom. Else left/right.
  // Avoid div by zero with fallback
  const slope = dx !== 0 ? dy / dx : 10000;

  if (Math.abs(dy * w) > Math.abs(dx * h)) {
    // Hits top or bottom
    const edgeY = (dy > 0) ? -h : h; // If target is below (dy>0), hit top (-h)
    return { x: target.x + edgeY / slope, y: target.y + edgeY };
  } else {
    // Hits left or right
    const edgeX = (dx > 0) ? -w : w; // If target is right (dx>0), hit left (-w)
    return { x: target.x + edgeX, y: target.y + edgeX * slope };
  }
};

onMounted(() => {
  if (!mapContainer.value) return;

  const width = mapContainer.value.clientWidth;
  const height = mapContainer.value.clientHeight;
  containerWidth = width;
  containerHeight = height;

  svg = d3.select(mapContainer.value)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .on("click", () => {
      emit("node-selected", null); // Deselect

      // Close Context Menu
      contextMenu.value.visible = false;

      // Cancel pending connection
      if (pendingConnectionSource.value) {
        pendingConnectionSource.value = null;
        tempLine.attr("opacity", 0);
        validationMsg.value = null;
      }

      clearSelection(); // Clears highlights and selection state for all modes
    })
    .on("mousemove", (event) => {
      // Fix: Transform coordinates to graph space using interactionLayer
      const interactionNode = svg.select(".interaction-layer").node();
      if (!interactionNode) return;
      const [x, y] = d3.pointer(event, interactionNode);
      mousePosition.value = { x, y };

      // Screen Position for Tooltip
      const [sx, sy] = d3.pointer(event, mapContainer.value);
      screenMousePosition.value = { x: sx, y: sy };

      // Update line for pending connection
      if (pendingConnectionSource.value) {
        const sourceNode = simulation.nodes().find(n => n.id === pendingConnectionSource.value);
        if (sourceNode) {
          const w = safeGetNodeWidth(sourceNode);
          const h = safeGetNodeHeight(sourceNode);
          tempLine
            .attr("x1", sourceNode.x + w / 2).attr("y1", sourceNode.y - h / 2) // Start at 2 o'clock (Top Right)
            .attr("x2", x).attr("y2", y)
            .attr("opacity", 1);

          // Validation Check for Pending Connection
          // Use quadtree for faster lookup. Search radius of 50px to find nearest node.
          const target = quadtree ? quadtree.find(x, y, 50) : null;


          if (target) {
            const isValid = checkConnection(sourceNode, target, props.mode);
            validationMsg.value = isValid ? null : getValidationError(sourceNode, target);
          } else {
            validationMsg.value = null;
          }
        }
      }
    });

  // Markers for arrowheads
  const defs = svg.append("defs");

  // Generate markers for all supported colors + default
  const allColors = [...linkColors, '#999', '#999999'];
  allColors.forEach(color => {
    const safeId = color.replace('#', '');
    defs.append("marker")
      .attr("id", `arrowhead-${safeId}`)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 10)
      .attr("refY", 0)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", color);
  });

  const g = svg.append("g").attr("class", "graph-content");
  const gridLayer = g.append("g").attr("class", "grid-layer");
  const controlsLayer = g.append("g").attr("class", "controls-layer"); // Layer for + Buttons (Background)
  const linkLayer = g.append("g").attr("class", "links-layer");
  const nodeLayer = g.append("g").attr("class", "nodes-layer");
  const interactionLayer = g.append("g").attr("class", "interaction-layer");

  // Spotlight Layer (SVG based for multiple holes support)
  // Appended after graph content to sit on top
  svg.append("path").attr("class", "spotlight-path").attr("fill-rule", "evenodd");

  // Temporary line for connections
  tempLine = interactionLayer.append("line")
    .attr("stroke", "#999")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "5,5")
    .attr("opacity", 0);

  // Custom Force: Separate nodes only within their specific row (Lane Separation)
  // This allows nodes to stack vertically (different rows) without pushing each other
  const rowSeparationForce = (alpha) => {
    const nodes = simulation.nodes();
    const rows = new Map();

    // Group nodes by their Y position (Row) with a small tolerance
    nodes.forEach(n => {
      const rowKey = Math.round((n.fy ?? n.y) / 40) * 40; // Increased tolerance for row grouping
      if (!rows.has(rowKey)) rows.set(rowKey, []);
      rows.get(rowKey).push(n);
    });

    rows.forEach(rowNodes => {
      rowNodes.sort((a, b) => (a.fx ?? a.x) - (b.fx ?? b.x));
      for (let i = 0; i < rowNodes.length - 1; i++) {
        const a = rowNodes[i];
        const b = rowNodes[i + 1];
        const minDist = (safeGetNodeWidth(a) + safeGetNodeWidth(b)) / 2 + 60; // 60px gap for consistency
        const dist = (b.fx ?? b.x) - (a.fx ?? a.x);
        if (dist < minDist) {
          const push = (minDist - dist) * alpha * 0.8;
          a.vx -= push;
          b.vx += push;
        }
      }
    });
  };

  // Start Simulation
  simulation = d3.forceSimulation([])
    // No "Ragdoll" physics (Charge 0, Link Strength 0)
    .force("link", d3.forceLink([]).id((d) => d.id).distance(300).strength(0.1))
    .force("charge", d3.forceManyBody().strength(-800))
    .force("x", d3.forceX(0).strength(0.02))
    .force("y", null)
    .force("collide", null) // Disable circular collision to allow stacking
    .force("rowSep", rowSeparationForce) // Use custom row separation
    .velocityDecay(0.6); // Keep decay to stop momentum quickly

  // Forces are set in updateGraph() depending on mode

  let tickCounter = 0;
  simulation.on("tick", () => {
    tickCounter++;

    // Update Button Positions on Tick (smooth movement)
    // Throttle Controls (Performance Optimization: only every 4th frame)
    if (tickCounter % 4 === 0) updateControlPositions();

    updateSpotlight(); // Update spotlight holes as nodes move

    // Throttle Minimap (Performance Optimization: only every 4th frame)
    if (tickCounter % 4 === 0) updateMinimap();

    // Use the selections we updated in updateGraph
    if (linkSelection && nodeSelection) {
      // Re-select to be safe if DOM changed, but usually variables are fine
      // const currentNodes = nodeLayer.selectAll("g.node"); 

      // Fix: Explicitly update both paths to ensure hitboxes don't lag
      const linkPathGenerator = (d) => {
        // Calculate intersection to make arrow visible at node border
        const source = d.source;
        const target = d.target;
        const end = getNodeIntersection(source, target);
        return `M${source.x},${source.y} L${end.x},${end.y}`;
      };

      // Use cached selections to avoid DOM query overhead
      if (linkPathsVisible) linkPathsVisible.attr("d", linkPathGenerator);
      if (linkPathsHit) linkPathsHit.attr("d", linkPathGenerator);

      nodeSelection.attr("transform", (d) => {
        // No more boundary constraints, as map is zoomable/pannable
        return `translate(${d.x},${d.y})`;
      });
    }
  });

  // Drag Handler
  let isDrawing = false;
  dragHandler = d3.drag()
    .filter(event => !event.button) // Ignore right clicks
    .on("start", (event, d) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();

      // Save start position for swap logic
      d.startX = d.fx ?? d.x;
      d.startY = d.fy ?? d.y;

      // HOE Constraint: Check if connected to another HOE
      d.isHoeLockedRow = false;
      if (d.type === 'hoe' || d.type === 'hoe_req') {
        const links = simulation.force("link").links(); // Optimization: Use simulation links instead of deep copy
        const isConnectedToHoe = links.some(l => {
          const s = l.source.id || l.source;
          const t = l.target.id || l.target;
          if (s === d.id || t === d.id) {
            const otherId = s === d.id ? t : s;
            const other = simulation.nodes().find(n => n.id === otherId);
            return other && (other.type === 'hoe' || other.type === 'hoe_req');
          }
          return false;
        });
        if (isConnectedToHoe) d.isHoeLockedRow = true;
      }

      // Check for Shift/Ctrl or Linking Mode
      if ((event.sourceEvent.shiftKey || event.sourceEvent.ctrlKey || props.isLinkingMode) && props.mode !== "analyzing") {
        isDrawing = true;
        tempLine.attr("x1", d.x).attr("y1", d.y).attr("x2", d.x).attr("y2", d.y).attr("opacity", 1);
        // Do NOT set fx/fy here, so the node doesn't get stuck if we are just drawing
      } else {
        // Normal Move
        const nodeEl = event.sourceEvent.target.closest(".node");
        if (nodeEl) d3.select(nodeEl).classed("dragging", true);
        d.fx = d.x;
        d.fy = d.y;
        d.lastFx = d.fx; // For delta calculation
        d.lastFy = d.fy;
      }
    })
    .on("drag", (event, d) => {
      if (isDrawing) {
        const [mx, my] = d3.pointer(event, interactionLayer.node());
        tempLine.attr("x2", mx).attr("y2", my);
      } else {
        const oldFx = d.fx;
        const oldFy = d.fy;
        d.fx = event.x;
        d.fy = event.y;

        // Removed fixed Grid Snap X to allow smooth dragging of variable width nodes
        // d.fx = Math.round(event.x / GRID_STEP) * GRID_STEP;

        const h = mapContainer.value?.clientHeight || 800;
        // Snap Y to Layer Center
        const level = safeLevels.find(l => l.id === d.type);
        const centerY = h / 2;
        if (level) {
          const layerCenter = centerY + (1.5 - level.index) * 150;
          if (d.type === 'hoe' || d.type === 'hoe_req') {
            // Snap to 2 rows
            if (d.isHoeLockedRow) {
              d.fy = d.startY; // Keep original row
            } else {
              const row1 = layerCenter;
              const row2 = d.type === 'hoe' ? layerCenter - 80 : layerCenter + 80;
              d.fy = (Math.abs(event.y - row2) < Math.abs(event.y - row1)) ? row2 : row1;
            }
          } else {
            d.fy = layerCenter;
          }
        }
      }
    })
    .on("end", (event, d) => {
      const nodeEl = event.sourceEvent.target.closest(".node");
      if (nodeEl) d3.select(nodeEl).classed("dragging", false);

      if (isDrawing) {
        isDrawing = false;
        tempLine.attr("opacity", 0);
        const [mx, my] = d3.pointer(event, interactionLayer.node());
        // Use quadtree for faster lookup. Search radius of 50px.
        const target = quadtree ? quadtree.find(mx, my, 50) : null;
        if (target && checkConnection(d, target, props.mode)) {
          addLinkToData({ source: d.id, target: target.id }); // Use IDs for clean data
          nextTick(() => updateGraph());
        }
      } else {
        if (!event.active) simulation.alphaTarget(0);

        // On Release: Snap to zone
        // Logic is now handled during drag (snap), but ensure it here too
        const h = mapContainer.value?.clientHeight || 800;
        const level = safeLevels.find(l => l.id === d.type);
        const centerY = h / 2;
        if (level) {
          const layerCenter = centerY + (1.5 - level.index) * 150;
          if (d.type === 'hoe' || d.type === 'hoe_req') {
            // Snap to 2 rows
            if (d.isHoeLockedRow) {
              d.fy = d.startY; // Lock to start row if connected
            } else {
              d.fy = (Math.abs(d.y - row2) < Math.abs(d.y - row1)) ? row2 : row1;
            }
          } else {
            d.fy = layerCenter;
          }
        }

        // Ensure X is snapped (re-apply logic from drag to be safe)
        // const GRID_STEP = 160;
        // if (d.fx !== undefined) d.fx = Math.round(d.fx / GRID_STEP) * GRID_STEP;

        // Swap Logic: Check if space is occupied
        const GRID_TOLERANCE = 20;
        const overlappingNode = simulation.nodes().find(n =>
          n.id !== d.id &&
          Math.abs((n.fx ?? n.x) - d.fx) < GRID_TOLERANCE &&
          Math.abs((n.fy ?? n.y) - d.fy) < GRID_TOLERANCE
        );

        if (overlappingNode) {
          // Swap positions
          overlappingNode.fx = d.startX;
          overlappingNode.fy = d.startY;
          overlappingNode.x = d.startX;
          overlappingNode.y = d.startY;
          // d takes the new position (already set by d.fx/d.fy)

          // Ensure nodes are properly distanced after swap
          resolveOverlaps(simulation.nodes());
          simulation.alpha(0.1).restart(); // Gentle restart to settle positions
        }

        // Fix: Force position to avoid discrepancy between fx and x
        d.x = d.fx;
        d.y = d.fy;
        d.vx = 0;
        d.vy = 0;

        // Persist position to store
        updateNode(d.id, { x: d.x, y: d.y, fx: d.fx, fy: d.fy });
      }
    });

  // Separate Handler for the Connection Handle (Circle)
  connectionDragHandler = d3.drag()
    .on("start", (event, d) => {
      event.sourceEvent.stopPropagation(); // Prevent node drag
      if (props.mode === "evaluation") return;

      const w = safeGetNodeWidth(d);
      const h = safeGetNodeHeight(d);
      tempLine
        .attr("x1", d.x + w / 2).attr("y1", d.y - h / 2) // Start at 2 o'clock (Top Right)
        .attr("x2", d.x + w / 2).attr("y2", d.y - h / 2)
        .attr("opacity", 1);

      // 2. Visual Feedback: Highlight target layer
      const sourceLevel = safeLevels.find(l => l.id === d.type);
      if (sourceLevel) {
        // Valid target is usually next level (index + 1)
        const targetLevel = safeLevels.find(l => l.index === sourceLevel.index + 1);
        if (targetLevel) {
          svg.selectAll(`.layer-bg-${targetLevel.id}`)
            .attr("opacity", 0.3); // Intensify glow color
        }
      }
    })
    .on("drag", (event, d) => {
      if (props.mode === "evaluation") return;
      // event.x/y are relative to the handle's parent (the node group), 

      // Update Screen Position for Tooltip
      const [sx, sy] = d3.pointer(event, mapContainer.value);
      screenMousePosition.value = { x: sx, y: sy };

      // Let's use d3.pointer on the interactionLayer.
      const [mx, my] = d3.pointer(event, interactionLayer.node());
      tempLine.attr("x2", mx).attr("y2", my);

      // 4. Constraints Feedback: Highlight valid targets
      // Reset styles first
      svg.selectAll(".node rect")
        .attr("stroke", (n) => safeGetColor(n.type))
        .attr("stroke-width", 3);

      // Fix: Use quadtree to find target
      const target = quadtree ? quadtree.find(mx, my, 50) : null;

      if (target && target.id !== d.id) {
        const isValid = checkConnection(d, target, props.mode);
        tempLine.attr("stroke", isValid ? "#28a745" : "#dc3545");

        if (isValid) {
          // Highlight valid target
          svg.selectAll(".node").filter(n => n.id === target.id).select("rect")
            .attr("stroke", "#28a745")
            .attr("stroke-width", 5);
        }

        validationMsg.value = isValid ? null : getValidationError(d, target);
      } else {
        tempLine.attr("stroke", "#999");
        validationMsg.value = null;
      }
    })
    .on("end", (event, d) => {
      if (props.mode === "evaluation") return;
      tempLine.attr("opacity", 0);

      // Reset Layer Highlight
      svg.selectAll(".layer-bg").attr("opacity", 0.07);
      validationMsg.value = null;

      // Reset node styles
      svg.selectAll(".node rect")
        .attr("stroke", (n) => safeGetColor(n.type))
        .attr("stroke-width", 3);

      // Find target
      const [mx, my] = d3.pointer(event, interactionLayer.node());

      // Use quadtree for faster lookup. Search radius of 50px.
      const target = quadtree ? quadtree.find(mx, my, 50) : null;
      if (target && checkConnection(d, target, props.mode)) {
        addLinkToData({ source: d.id, target: target.id });
        nextTick(() => updateGraph());
      }
    });

  // Initialize Zoom Behavior
  zoomBehavior = d3.zoom()
    .scaleExtent([0.1, 2])
    .translateExtent([[-8000, -2000], [8000, 4000]]) // Expanded panning range
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
      currentZoomTransform.value = event.transform; // Update reactive state for spotlight

      // Fixed Layer Names (Sticky Labels)
      const fixedLayerX = (50 - event.transform.x) / event.transform.k;
      g.selectAll(".layer-label").attr("x", fixedLayerX);

      // Sticky Group Labels (Vertical)
      // Positioned slightly to the left of layer labels
      g.selectAll(".group-label").attr("transform", d => `translate(${fixedLayerX - 25}, ${d.y}) rotate(-90)`);

      // drawControls(); // Not necessary on zoom, as buttons are in the SVG graph
      updateMinimap();
      updateSpotlight(); // Update spotlight on zoom
    });

  // Custom Wheel Handling for Pan vs Zoom
  svg.call(zoomBehavior)
    .on("wheel.zoom", null) // Disable default wheel zoom
    .on("wheel", (event) => {
      event.preventDefault();
      const transform = d3.zoomTransform(svg.node());

      if (event.ctrlKey) {
        // Ctrl + Wheel = Zoom
        // Smooth pinch-to-zoom using deltaY
        zoomBehavior.scaleBy(svg, Math.pow(2, -event.deltaY * 0.005));
      } else {
        // Wheel = Pan
        // Touchpad sends deltaX/deltaY directly. Mouse wheel sends deltaY.
        let dx = -event.deltaX;
        let dy = -event.deltaY;

        // Shift + Wheel = Horizontal Pan (for mice without horizontal scroll)
        if (event.shiftKey && Math.abs(dx) < Math.abs(dy)) {
          dx = -event.deltaY;
          dy = 0;
        }

        // Apply translation (account for current scale to keep pan speed consistent)
        zoomBehavior.translateBy(svg, dx / transform.k, dy / transform.k);
      }
    });

  // Resize Observer
  resizeObserver = new ResizeObserver(() => {
    if (mapContainer.value && simulation) {
      const w = containerWidth || mapContainer.value.clientWidth;
      const h = containerHeight || mapContainer.value.clientHeight;
      containerWidth = w;
      containerHeight = h;
      if (svg) svg.attr("width", w).attr("height", h);

      // No forces on resize for static layout
      // Just restart to ensure rendering
      simulation.alpha(0.1).restart();
    }
  });
  resizeObserver.observe(mapContainer.value);

  // Initial Draw
  updateGraph();

  // Check if we need to initialize default nodes
  const data = getGraphData();
  if (data.nodes.length < 7) {
    initializeDefaultGraph();
  } else {
    // Data exists (e.g. from autosave), ensure layout is correct
    setTimeout(() => {
      updateGraph();
      zoomToFit();
    }, 250);
  }
});

const updateMinimap = () => {
  if (!svg || !mapContainer.value || !simulation || !minimapComponent.value) return;

  const nodes = simulation.nodes();
  const links = simulation.force("link").links();

  isMinimapVisible.value = nodes.length > 0;
  if (!isMinimapVisible.value) return;

  const mainTransform = d3.zoomTransform(svg.node());
  const mainW = mapContainer.value.clientWidth;
  const mainH = mapContainer.value.clientHeight;

  minimapComponent.value.update(nodes, links, mainTransform, mainW, mainH, {
    isHighlightActive: props.mode === 'evaluation' && isHighlightActive.value,
    highlightedNodes: highlightedNodes.value
  });
};

const handleMinimapClick = ({ x, y }) => {
  if (!svg || !zoomBehavior || !mapContainer.value) return;

  const width = mapContainer.value.clientWidth;
  const height = mapContainer.value.clientHeight;
  const currentTransform = d3.zoomTransform(svg.node());

  svg.transition().duration(750).call(
    zoomBehavior.transform, // Zoom to clicked point
    d3.zoomIdentity.translate(width / 2, height / 2).scale(currentTransform.k).translate(-x, -y)
  );
};

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect();
  if (simulation) simulation.stop();
  if (statsTimeout) clearTimeout(statsTimeout);
});

watch(() => props.mode, () => {
  // Reset Highlight state on mode change
  isHighlightActive.value = false;
  highlightedNodes.value.clear();
  if (svg) {
    svg.selectAll(".node, .link").classed("dimmed", false);
    svg.selectAll(".node").classed("selected-highlight", false);
  }

  updateGraph();
  updateSpotlight();
  if (simulation) simulation.alpha(1).restart();

  // Fix: Ensure tutorial step updates when switching drafts/modes to prevent blocking
  const { nodes, links } = getRawData();
  try {
    updateTutorialStep(nodes, links, false);
  } catch (e) {
    console.warn("Tutorial update failed on mode switch:", e);
  }
});

watch(_graphData, (newData, oldData) => {
  if (isInitializing.value || isInternalUpdate.value) return;
  updateGraph();

  // Auto-fit if we went from empty/small to populated (loading from autosave)
  const oldLen = oldData?.nodes?.length || 0;
  const newLen = newData?.nodes?.length || 0;
  if (oldLen < 2 && newLen > 2) {
    setTimeout(zoomToFit, 150);
  }
  // updateTutorialStep is called inside updateGraph
}, { deep: true });

watch(() => props.visibleLayers, () => {
  updateGraph();
}, { deep: true });

watch(() => props.analyzingView, () => {
  updateGraph();
});

watch(() => props.isDarkMode, () => {
  updateGraph();
});

watch(() => props.showTutorial, () => {
  updateSpotlight();
});

// Watcher for Tutorial Highlighting (Pulsing)
watch(activeSpotlightNodes, () => {
  updateSpotlight();
  if (nodeSelection) {
    const spotlightedIds = new Set(activeSpotlightNodes.value.map(n => n.id));
    nodeSelection.classed("tutorial-glow", d => props.showTutorial && spotlightedIds.has(d.id));
  }
}, { deep: true });

// Context Menu Actions
const handleContextAction = (action, payload) => {
  const target = contextMenu.value.item;
  if (!target) return;

  if (action === 'delete') {
    deleteNode(target.id);
  } else if (action === 'rename') {
    // Trigger edit mode manually (needs selection logic or event simulation, simplified here)
    // Find the node element and trigger edit
    svg.selectAll(".node").filter(d => d.id === target.id).each(function (d) {
      enterEditMode(d3.select(this), d);
    });
  } else if (action === 'color-menu') {
    contextMenu.value.view = 'color';
    return; // Keep menu open
  } else if (action === 'set-color') {
    if (contextMenu.value.type === 'node') {
      target.customColor = payload;
      updateGraph();
    } else {
      updateLinkColor(target, payload);
      nextTick(() => updateGraph());
    }
  } else if (action === 'start-connection') {
    pendingConnectionSource.value = target.id;
    // Visual feedback handled in mousemove
    // Trigger immediate visual update if mouse is already moving
    if (mousePosition.value.x !== 0) {
      const sourceNode = simulation.nodes().find(n => n.id === target.id);
      if (sourceNode) {
        const w = safeGetNodeWidth(sourceNode);
        const h = safeGetNodeHeight(sourceNode);
        tempLine
          .attr("x1", sourceNode.x + w / 2).attr("y1", sourceNode.y - h / 2)
          .attr("x2", mousePosition.value.x).attr("y2", mousePosition.value.y)
          .attr("opacity", 1);
      }
    }
  } else if (action === 'duplicate' && target) {
    // Duplicate on same Y axis (same layer), shifted X
    const newNode = createNode(target.type, target.x + 50, target.y, {
      name: target.name + " (Copy)"
    });
    addNodeToData(newNode);
    nextTick(() => updateGraph());
  } else if (action === 'highlight-in') {
    highlightDirectional(target, 'in');
  } else if (action === 'highlight-out') {
    highlightDirectional(target, 'out');
  } else if (action === 'link-delete') {
    deleteLink(target);
  } else if (action === 'info') {
    emit('node-selected', target);
    // Sidebar opens via App.vue
  }
  contextMenu.value.visible = false;
};

const zoom = (factor) => {
  if (svg && zoomBehavior) {
    svg.transition().duration(300).call(zoomBehavior.scaleBy, factor);
  }
};

const resetGraph = () => {
  resetGraphData();
  nextTick(() => updateGraph());
};

const smartLayout = () => {
  if (!simulation) return;
  const h = mapContainer.value?.clientHeight || 800;
  const centerY = h / 2;
  const { links, nodes } = getRawData();

  // 1. Reset velocities and positions for deterministic result
  simulation.nodes().forEach((n, i) => {
    n.fx = null; // Unlock X to allow optimization
    n.vx = 0;
    n.vy = 0;
    // Deterministic initial spread to avoid stacking at exact 0
    n.x = (i % 2 === 0 ? 1 : -1) * (i * 50); // Wider initial spread
    n.y = 0; // Reset Y to neutral
    n.fy = null;
  });

  // 2. Identify HOE nodes and set constraints
  const hoeNodes = [];
  simulation.nodes().forEach(n => {
    const level = safeLevels.find(l => l.id === n.type);
    if (level) {
      const layerCenter = centerY + (1.5 - level.index) * 150;
      if (n.type === 'hoe' || n.type === 'hoe_req') {
        const row1 = layerCenter;
        const row2 = n.type === 'hoe' ? layerCenter - 80 : layerCenter + 80;

        // Determine preference based on connectivity (Root vs Child)
        const isChild = links.some(l => {
          const s = l.source.id || l.source;
          const t = l.target.id || l.target;
          const srcNode = nodes.find(node => node.id === s);
          return t === n.id && srcNode && (srcNode.type === 'hoe' || srcNode.type === 'hoe_req');
        });

        // STRICTLY enforce row based on logic, ignoring current position
        n.fy = isChild ? row2 : row1;
        n.y = n.fy; // Set current y to target immediately
      } else {
        // Non-HOE: Pin to layer center
        n.fy = layerCenter;
        n.y = layerCenter;
      }
    }
  });

  // Custom Force to prevent horizontal overlap on the same row (Rectangular Collision)
  const rectCollide = (alpha) => {
    const nodes = simulation.nodes();
    const paddingX = 80; // Significantly increased padding to prevent overlap
    const paddingY = 60; // Vertical padding to detect "same row"

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const wA = a._width || safeGetNodeWidth(a);

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];

        // Check Y proximity (Are they in the same visual row?)
        // We check if vertical distance is small enough to consider them colliding horizontally
        if (Math.abs(a.y - b.y) < paddingY) {
          const wB = b._width || safeGetNodeWidth(b);
          const minDist = (wA + wB) / 2 + paddingX;
          const dx = a.x - b.x;
          const absDx = Math.abs(dx);

          if (absDx < minDist) {
            // Overlap detected! Push apart strongly.
            const overlap = minDist - absDx;
            // Deterministic resolution: if dx is 0, use index to decide direction
            let sign = dx > 0 ? 1 : -1;
            if (dx === 0) sign = (i < j) ? -1 : 1;

            const push = overlap * alpha * 5; // Very strong push to resolve overlaps immediately

            a.vx += sign * push;
            b.vx -= sign * push;
          }
        }
      }
    }
  };

  // 3. Run Layout Simulation
  const layoutSim = d3.forceSimulation(simulation.nodes())
    .force("link", d3.forceLink(links).id(d => d.id).strength(2).distance(40)) // Strong links to keep structure
    .force("charge", d3.forceManyBody().strength(-4000).distanceMax(2000)) // Stronger repulsion
    .force("x", d3.forceX(0).strength(0.05)) // Weak centering to allow rectangular shape
    // Note: forceY is not needed as fy is set for all nodes, effectively pinning Y
    .force("rectCollide", rectCollide) // Custom rectangular collision
    .alpha(1)
    .stop();

  // Run simulation ticks
  for (let i = 0; i < 2000; ++i) layoutSim.tick(); // High tick count for stability

  // 4. Final Snap and Lock
  simulation.nodes().forEach(n => {
    n.fx = n.x; // Lock X });
  });

  // 5. Update
  const updates = simulation.nodes().map(n => {

    return { id: n.id, changes: { x: n.x, y: n.y, fx: n.fx, fy: n.fy } };
  });
  updateNodesBulk(updates);

  nextTick(() => {
    zoomToFit();
  });
};

const loadGraphDataHandler = (data) => {
  // 1. Lock updates to prevent watcher interference during data swap
  isInitializing.value = true;

  // 2. Stop simulation temporarily
  if (simulation) simulation.stop();

  // 3. Load data into store
  loadGraphData(data);

  // 4. Check for empty data (e.g. New Draft) and populate defaults
  const { nodes } = getRawData();
  if (nodes.length === 0) {
    isInitializing.value = false; // Unlock so initialize can run
    initializeDefaultGraph();
    return;
  }

  initialViewParsed.value = false; // Force re-center on new data load

  // 5. Force update sequence
  requestAnimationFrame(() => {
    isInitializing.value = false;
    updateGraph();
    // Use setTimeout to allow D3 simulation a moment to tick and stabilize
    setTimeout(() => {
      updateGraph();
      zoomToFit();
    }, 50);
  });
};

const zoomToFit = () => {
  if (!svg || !zoomBehavior || !mapContainer.value) return;
  const nodes = simulation.nodes();
  if (nodes.length === 0) return;

  const width = mapContainer.value.clientWidth;
  const height = mapContainer.value.clientHeight;
  const padding = 100;

  const x0 = d3.min(nodes, d => d.x);
  const x1 = d3.max(nodes, d => d.x);
  const y0 = d3.min(nodes, d => d.y);
  const y1 = d3.max(nodes, d => d.y);

  const gw = x1 - x0 || 1;
  const gh = y1 - y0 || 1;

  const scale = Math.min((width - padding * 2) / gw, (height - padding * 2) / gh);
  const clampedScale = Math.min(Math.max(scale, 0.1), 2);

  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;

  const transform = d3.zoomIdentity.translate(width / 2, height / 2).scale(clampedScale).translate(-cx, -cy);

  svg.transition().duration(750).call(zoomBehavior.transform, transform);
};

const centerOnNode = (nodeId) => {
  const { nodes } = getRawData();
  const target = nodes.find(n => n.id === nodeId);
  if (target && svg && zoomBehavior && mapContainer.value) {
    const width = mapContainer.value.clientWidth;
    const height = mapContainer.value.clientHeight;
    const scale = 1.5;
    const x = -target.x * scale + width / 2;
    const y = -target.y * scale + height / 2;

    svg.transition().duration(750).call(zoomBehavior.transform, d3.zoomIdentity.translate(x, y).scale(scale));
    emit('node-selected', target);
  }
};

const selectNodeForPresentation = (node) => {
  isHoverHighlight.value = false;
  highlightPath(node);
  const rawNodes = getRawData().nodes;
  const pathNodes = rawNodes.filter(n => highlightedNodes.value.has(n.id));
  emit("node-selected", { node: node, path: pathNodes });
};

const highlightLevel = (level) => {
  if (!level) {
    clearSelection();
    return;
  }

  highlightedNodes.value.clear();
  isHighlightActive.value = true;

  const rawNodes = getRawData().nodes;
  rawNodes.forEach(n => {
    const status = nodeStatus.get(n.id);
    if (status && status.level === level) {
      highlightedNodes.value.add(n.id);
    }
  });
  updateVisualsForHighlight();
};

const clearSelection = () => {
  emit("node-selected", null);
  isHighlightActive.value = false;
  isHoverHighlight.value = false;
  highlightedNodes.value.clear();
  selectedNodeIds.value.clear();
  if (svg) {
    svg.selectAll(".node, .link-wrapper").classed("dimmed", false);
    svg.selectAll(".node").classed("selected-highlight", false);
    svg.selectAll(".axis-element").classed("dimmed", false);
    svg.selectAll(".node").classed("path-active", false);
    svg.selectAll(".link-wrapper").classed("path-active", false);
    svg.selectAll(".node").classed("tutorial-glow", false); // Ensure glow is removed

    // FIX: Clear inline styles for multi-select glow to remove persistent highlight
    svg.selectAll(".node rect")
      .style("filter", null)
      .attr("stroke", d => d.customColor || safeGetColor(d.type));
  }
};

const initializeDefaultGraph = () => {
  if (!svg || !mapContainer.value) return;
  if (isInitializing.value) return; // Fix: Prevent re-entry

  // IMPORTANT: isInitializing prevents updateGraph from running during this setup
  isInitializing.value = true; // Fix: Lock updates

  // Fix: Reset Zoom to Identity to ensure coordinates align with UI controls
  if (zoomBehavior) {
    svg.call(zoomBehavior.transform, d3.zoomIdentity);
  }

  // Clean start: Reset data completely
  resetGraphData();

  const transform = d3.zoomTransform(svg.node());
  const centerY = (mapContainer.value.clientHeight / 2 - transform.y) / transform.k;

  const nodeTemplates = [
    { id: 'nshc', name: 'Start: New NSHC' },
    { id: 'feature', name: 'Next: New Feature' },
    { id: 'quality', name: 'Next: New Quality' },
    { id: 'hoe', name: 'Goal: New HOE' },
    { id: 'feature_req', name: 'Next: New Feature' },
    { id: 'quality_req', name: 'Next: New Quality' },
    { id: 'hoe_req', name: 'Goal: New HOE' },
  ];

  const initialNodes = nodeTemplates.map(template => {
    const level = safeLevels.find(l => l.id === template.id);
    if (!level) return null;
    const layerY = centerY + (1.5 - level.index) * 150;
    return createNode(template.id, 0, layerY, {
      name: template.name,
      isEditing: false,
      fx: 0,
      fy: layerY
    });
  }).filter(Boolean);

  initialNodes.forEach(n => addNodeToData(n));

  setTimeout(() => {
    isInitializing.value = false;
    nextTick(() => {
      updateGraph();
      zoomToFit();
    });
  }, 100);
};

const forceUpdate = () => updateGraph();

defineExpose({
  updateNodeData: (id, changes) => updateNode(id, changes),
  addNodeAt,
  zoom,
  resetGraph,
  initializeDefaultGraph,
  getGraphData: getRawData,
  loadGraphData: loadGraphDataHandler,
  zoomToFit,
  centerOnNode,
  selectNodeForPresentation,
  clearSelection,
  highlightLevel,
  smartLayout,
  forceUpdate
});
</script>

<style scoped>
.worth-map-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  background-color: #f8f9fa;
  /* Standard Background */
  transition: background-color 0.3s;
}

.worth-map-container.dark-mode {
  background-color: #0B0E14;
}

/* Evaluation Mode Light Mode Fix (Less Bright) */
.bg-evaluation {
  background-color: #e0e0e0;
}

.vignette-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  background: radial-gradient(circle, transparent 60%, rgba(11, 14, 20, 0.8) 100%);
  z-index: 5;
}

:deep(.node rect) {
  transition: all 0.3s ease;
  cursor: grab;
  will-change: transform;
  /* Performance Boost: GPU Layering */
}

:deep(.node.dragging rect) {
  stroke-dasharray: 5, 5;
  stroke-opacity: 0.8;
}

:deep(.node:active) {
  cursor: grabbing;
}

:deep(.node text) {
  pointer-events: none;
  font-family: sans-serif;
  font-size: 14px;
  user-select: none;
}

:deep(.link) {
  transition: stroke 0.3s, stroke-width 0.3s;
  cursor: pointer;
}

:deep(.link-visible) {
  pointer-events: none;
  /* Events handled by group or hit area */
}

:deep(.connection-handle:hover) {
  fill: #42b983;
  stroke: #2c3e50;
}

:deep(.link-wrapper:hover .link-visible) {
  stroke-width: 6px;
  stroke-opacity: 1;
}

/* New Evaluation Mode Highlighting */
.highlight-active :deep(.node.dimmed),
.highlight-active :deep(.link-wrapper.dimmed) {
  opacity: 0.3 !important;
  transition: opacity 0.5s ease;
}

.highlight-active :deep(.node.path-active rect) {
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.12);
  stroke-width: 2.5px;
}

@keyframes flow-animation {
  to {
    stroke-dashoffset: -20;
  }
}

.highlight-active :deep(.link-wrapper.path-active .link-visible) {
  stroke-width: 3px;
  stroke-opacity: 1;
  stroke-dasharray: 10, 5;
  animation: flow-animation 1s linear infinite;
}

.highlight-active :deep(.node.selected-highlight rect) {
  filter: drop-shadow(0 0 15px rgba(66, 185, 131, 0.6));
}

.dark-mode .highlight-active :deep(.node.selected-highlight rect) {
  filter: drop-shadow(0 0 20px rgba(66, 185, 131, 0.8));
}

:deep(.axis-element.dimmed) {
  opacity: 0.1 !important;
  transition: opacity 0.5s ease;
}

:deep(.node-label-div) {
  padding: 5px;
  box-sizing: border-box;
  text-align: center;
  word-wrap: break-word;
  font-size: 12px !important;
  line-height: 1.2;
  user-select: none;
}

:deep(.node rect) {
  stroke-width: 3px;
  /* Ensure colored border is visible */
}

:deep(.node-input) {
  width: 100%;
  height: 100%;
  text-align: center;
  border: 1px solid #42b983;
  outline: none;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 4px;
  font-size: 12px;
  font-family: sans-serif;
  color: #000;
}

.dark-mode :deep(.node-input) {
  background: #23252B;
  color: #E6E8EB;
  border-color: #42b983;
}

:deep(.spotlight-path) {
  fill: rgba(0, 0, 0, 0.6);
  /* Less dark, only slight dimming */
  fill-rule: evenodd;
  pointer-events: auto;
  z-index: 10;
}

.tutorial-overlay-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 15;
}

.tutorial-hint-toast {
  position: absolute;
  top: 10%;
  left: 50%;
  transform: translateX(-50%);
  background: #ff4d4f;
  color: white;
  padding: 10px 20px;
  border-radius: 20px;
  font-weight: bold;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

@keyframes bounce-card {

  0%,
  100% {
    transform: translateY(-50%) translateY(0);
  }

  50% {
    transform: translateY(-50%) translateY(-8px);
  }
}

.tutorial-card {
  position: absolute;
  background: rgba(0, 0, 0, 0.75);
  color: white;
  padding: 15px 20px;
  border-radius: 8px;
  border-left: 4px solid #42b983;
  max-width: 250px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  animation: bounce-card 2s infinite ease-in-out;
  pointer-events: auto;
}

.close-tutorial-btn {
  position: absolute;
  top: 5px;
  right: 5px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0 5px;
}

.skip-btn {
  display: block;
  margin-top: 10px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.5);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.tutorial-card h4 {
  margin-top: 0;
  color: #42b983;
}

.tutorial-card p {
  font-size: 0.9rem;
  margin-bottom: 0;
}

.evaluation-info-card {
  position: absolute;
  bottom: 80px;
  right: 30px;
  /* Same as legend */
  background: rgba(255, 255, 255, 0.95);
  padding: 15px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-width: 300px;
  z-index: 20;
  border-left: 4px solid #42b983;
  pointer-events: auto;
  transition: all 0.3s ease;
}

.evaluation-info-card.collapsed {
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid #ccc;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
}

.evaluation-info-card.collapsed .info-header h4,
.evaluation-info-card.collapsed .info-content {
  display: none;
}

.evaluation-info-card.collapsed .toggle-info-btn {
  position: static;
  background: transparent;
  color: #444;
  font-size: 1.2rem;
}

.info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.info-header h4 {
  margin: 0;
  font-size: 1rem;
  color: #2c3e50;
}

.toggle-info-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #666;
  padding: 0 5px;
}

.info-content p {
  margin: 0;
  font-size: 0.9rem;
  color: #555;
}

.info-icon {
  font-size: 24px;
}

/* Filtered State */
:deep(.layer-filtered) {
  opacity: 0.05 !important;
  filter: grayscale(100%);
  pointer-events: none;
}

.validation-tooltip {
  position: absolute;
  background: rgba(220, 53, 69, 0.9);
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
  z-index: 1000;
  white-space: nowrap;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* Shake Animation */
@keyframes shake {

  0%,
  100% {
    transform: translateX(0);
  }

  10%,
  30%,
  50%,
  70%,
  90% {
    transform: translateX(-5px);
  }

  20%,
  40%,
  60%,
  80% {
    transform: translateX(5px);
  }
}

:deep(.shake-animation) {
  animation: shake 0.5s cubic-bezier(.36, .07, .19, .97) both;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Dark Mode Overrides */
/* Node Styling: Dark background, colored border */
.dark-mode :deep(.node rect) {
  fill: rgba(25, 25, 25, 0.8) !important;
  /* Glassmorphism background */
  stroke-width: 2px;
  /* Performance: Removed generic heavy drop-shadow */
  /* filter: drop-shadow(0 0 10px rgba(0, 0, 0, 0.5)); */
}

/* Tutorial Glow Animation */
.tutorial-glow :deep(rect) {
  stroke: #42b983 !important;
  stroke-width: 4px !important;
  animation: pulse-glow 2s infinite;
}

/* Add Button Hover Effect (SVG) */
:deep(.add-btn-group:hover circle) {
  stroke-opacity: 1;
  stroke-width: 3px;
}

.dark-mode .evaluation-info-card {
  background: #23252B;
  color: #0a0a0a;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.dark-mode .evaluation-info-card .info-header h4 {
  color: #E6E8EB;
}

.dark-mode .evaluation-info-card .info-content p {
  color: #B0B8C4;
}

.dark-mode .evaluation-info-card .toggle-info-btn {
  color: #E6E8EB;
}

@keyframes pulse-glow {
  0% {
    filter: drop-shadow(0 0 5px rgba(66, 185, 131, 0.8));
    stroke-width: 4px;
  }

  50% {
    filter: drop-shadow(0 0 20px rgba(66, 185, 131, 1));
    stroke-width: 6px;
  }

  100% {
    filter: drop-shadow(0 0 5px rgba(66, 185, 131, 0.8));
    stroke-width: 4px;
  }
}

@keyframes pulse-border {
  0% {
    box-shadow: 0 0 0 0 rgba(66, 185, 131, 0.7), 0 0 0 9999px rgba(0, 0, 0, 0.7);
  }

  50% {
    box-shadow: 0 0 0 10px rgba(66, 185, 131, 0), 0 0 0 9999px rgba(0, 0, 0, 0.7);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(66, 185, 131, 0), 0 0 0 9999px rgba(0, 0, 0, 0.7);
  }
}

.dark-mode :deep(.node-label-div) {
  color: #E6E8EB !important;
  /* Primary Text */
}

/* Zone Backgrounds (Subtle) */
.dark-mode :deep(.layer-bg-hoe),
.dark-mode :deep(.layer-bg-hoe_req) {
  fill: rgba(244, 67, 54, 0.1) !important;
  /* Red */
  opacity: 1 !important;
}

.dark-mode :deep(.layer-bg-quality),
.dark-mode :deep(.layer-bg-quality_req) {
  fill: rgba(46, 125, 50, 0.1) !important;
  /* Green */
  opacity: 1 !important;
}

.dark-mode :deep(.layer-bg-feature),
.dark-mode :deep(.layer-bg-feature_req) {
  fill: rgba(156, 39, 176, 0.1) !important;
  /* Purple */
  opacity: 1 !important;
}

.dark-mode :deep(.layer-bg-nshc) {
  fill: rgba(255, 193, 7, 0.1) !important;
  /* Gold */
  opacity: 1 !important;
}

.dark-mode :deep(.grid-layer line) {
  stroke: #666;
  /* Separator color */
  opacity: 1;
}

.dark-mode :deep(.layer-label) {
  fill: #E6E8EB;
  font-weight: 900;
  opacity: 1;
}

.dark-mode :deep(.group-label text) {
  fill: #E6E8EB;
  font-weight: 900;
}

/* Links: Slightly lighter than background */
.dark-mode :deep(.link-visible) {
  stroke: #4A4D55 !important;
}

.dark-mode :deep(.layer-label) {
  opacity: 0.3;
  transition: opacity 0.3s;
}

.dark-mode :deep(.layer-label:hover) {
  opacity: 1;
}

/* Context Menu Styling to match Draft Menu */
:deep(.context-menu) {
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  position: fixed;
  background: white;
  border: 1px solid #ccc;
  box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
  padding: 5px 0;
  border-radius: 4px;
  z-index: 1000;
  min-width: 150px;
}

:deep(.context-menu button) {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 8px 15px;
  color: #333;
  cursor: pointer;
  font-weight: bold;
}
</style>
