<template>
  <div ref="mapContainer" class="worth-map-container" :class="[
    `bg-${mode}`,
    { 'highlight-active': isHighlightActive },
    { 'dark-mode': isDarkMode }
  ]">
    <!-- D3 wird das SVG hier einfügen -->

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
import { runSmartLayout } from "./layoutAlgorithms";
import { useGraphData } from "./useGraphData";
import { getConnectedPath, getDirectionalNodes } from "./useGraphTraversal";
import { resolveOverlaps } from "./useLayout";
import { safeGetColor, safeGetNodeHeight, safeGetNodeWidth, safeLevels } from "./useStyling";
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
const mousePosition = ref({ x: 0, y: 0 });
const isInitializing = ref(false); // Fix: Prevent recursive updates during init
const pendingConnectionSource = ref(null); // Für "Verbindung starten" via Menü
const validationMsg = ref(null);
const screenMousePosition = ref({ x: 0, y: 0 });
const currentZoomTransform = ref(d3.zoomIdentity);
const editingNode = ref(null);
const graphUpdateTrigger = ref(0);

// Supported colors for links (must match AppContextMenu)
const linkColors = [
  '#F44336', '#E91E63', '#9C27B0', '#673AB7',
  '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4',
  '#009688', '#4CAF50', '#8BC34A', '#CDDC39',
  '#FFEB3B', '#FFC107', '#FF9800', '#FF5722',
  '#795548', '#9E9E9E', '#607D8B', '#ffffff'
];

// State für UI Overlays
const contextMenu = ref({ visible: false, x: 0, y: 0, item: null, type: null, view: 'main' });
const highlightedNodes = ref(new Set());
const selectedNodeIds = ref(new Set()); // Für Multi-Selektion (Cluster)
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

// WICHTIG: Wir übergeben die Ref direkt an useValidation
const {
  nodeWarnings,
  nodeStatus,
  validationStats,
  isValidConnection: checkConnection,
  validateGraph,
} = useValidation(_graphData);

// Helper um sicher auf graphData zuzugreifen (Tiefe Kopie für D3)
const getRawData = () => {
  const data = isRef(_graphData) ? _graphData.value : _graphData;
  try {
    return {
      nodes: JSON.parse(JSON.stringify(data?.nodes || [])),
      links: JSON.parse(JSON.stringify(data?.links || []))
    };
  } catch (e) {
    console.error("Fehler beim Kopieren der Daten:", e);
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
const updateControls = () => {
  if (!svg) return;

  const controlsLayer = svg.select(".controls-layer");
  if (controlsLayer.empty()) return;

  // Nur im Map Mode anzeigen
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
    const layerNodes = simulation ? simulation.nodes().filter(n => n.type === level.id) : [];
    let rawX = 0;
    if (layerNodes.length > 0) {
      const maxX = Math.max(...layerNodes.map(n => (n.fx ?? n.x) || 0));
      rawX = maxX + 160;
    }
    return { id: level.id, x: rawX, y: rawY, label: level.label };
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
    .attr("fill", "transparent") // Hit area
    .attr("stroke", d => safeGetColor(d.id))
    .attr("stroke-width", 2)
    .attr("stroke-opacity", 0.7); // Sichtbarer (war 0.4)

  enter.append("text")
    .text("+")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .attr("dy", "1px") // Optical centering
    .attr("fill", d => safeGetColor(d.id))
    .attr("font-family", "Arial, sans-serif") // Ensure consistent rendering
    .attr("font-size", "16px")
    .attr("font-weight", "bold")
    .attr("opacity", 0.9); // Sichtbarer (war 0.6)

  const merge = buttons.merge(enter);
  merge
    .attr("transform", d => `translate(${d.x}, ${d.y})`)
    .classed("shake-animation", d => shakingNodeId.value === d.id); // Apply shake class

  // Update colors/opacity if needed
  merge.select("circle").attr("stroke", d => safeGetColor(d.id));
  merge.select("text").attr("fill", d => safeGetColor(d.id));

  buttons.exit().remove();
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

  const w = mapContainer.value.clientWidth;
  const h = mapContainer.value.clientHeight;
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
  if (isInitializing.value) return; // Fix: Skip updates during initialization
  if (!svg) return;

  // WICHTIG: Selektionen immer frisch von den Layern holen
  const linkGroup = svg.select(".links-layer");
  const nodeGroup = svg.select(".nodes-layer");
  const gridLayer = svg.select(".grid-layer");
  const controlsLayer = svg.select(".controls-layer");

  if (linkGroup.empty() || nodeGroup.empty()) return;

  try {
    validateGraph();
  } catch (e) {
    console.error("Validation error:", e);
  }

  const rawData = getRawData();
  // Filter: Wir behalten alle Daten für die Simulation, blenden aber visuell aus
  let nodes = rawData.nodes;
  let links = rawData.links;

  // Evaluation Mode: Filter out placeholder nodes to clean up the view
  if (props.mode === 'evaluation') {
    const nodeIds = new Set(nodes.map(n => n.id));
    links = links.filter(l => nodeIds.has(l.source.id || l.source) && nodeIds.has(l.target.id || l.target));
  }

  // Positionen aus der laufenden Simulation übernehmen, um Reset zu verhindern
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
        n.fx = old.fx; // Fix: Position fixieren, damit Knoten nicht springen
        n.fy = old.fy;
      }

      // Layout Logic: Grid Snap & HOE Rows
      if (n.fx === undefined || n.fx === null || n.fy === undefined || n.fy === null) {
        // Fix: If we have valid saved positions (from load/draft switch), trust them!
        // Do not re-snap to default rows, which causes jumping/stacking issues.
        if (n.x !== undefined && n.y !== undefined) {
          n.fx = n.x;
          n.fy = n.y;
        } else {
          const level = safeLevels.find(l => l.id === n.type);
          if (level) {
            const layerCenter = centerY + (1.5 - level.index) * 150;
            n.fx = n.x !== undefined ? n.x : 0; // Keep X if set, otherwise 0

            // Y: Snap to Layer Center (Single Level) or HOE Rows
            if (n.type === 'hoe' || n.type === 'hoe_req') {
              // 2 Rows for HOE
              const row1 = layerCenter;
              const row2 = n.type === 'hoe' ? layerCenter - 80 : layerCenter + 80;
              // Default to row 1 if new, or snap to closest if existing
              n.fy = (n.y && Math.abs(n.y - row2) < Math.abs(n.y - row1) - 10) ? row2 : row1;
            } else {
              n.fy = layerCenter;
            }

            // Koordinaten synchronisieren, um Animation zu vermeiden
            n.x = n.fx;
            n.y = n.fy;
          }
        }
      }
    });

  }

  // Initial View: Kamera auf linkeste Spalte zentrieren (nur einmal beim Start)
  if (!initialViewParsed.value && nodes.length > 0 && svg && zoomBehavior) {
    const minX = d3.min(nodes, n => n.x) || 0;
    // Verschiebe Kamera so, dass Ebenennamen (x=-480) sichtbar sind.
    // Translate X = 600 sorgt dafür, dass x=-480 bei Screen X=120 liegt.
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

  emit('graph-stats', {
    nodeCounts,
    hasFullChain: checkFullChain(nodes, links),
    fullChainCount: countFullChains(nodes, links),
    validationStats: { ...validationStats }
  });

  graphUpdateTrigger.value++;

  // 0. Zonen zeichnen (Jetzt auch in Sketch sichtbar für Orientierung)
  if (props.mode !== 'evaluation' || props.analyzingView === 'zones') {
    // Cleanup Axis elements if switching from Axis view
    gridLayer.selectAll(".axis-element").remove();

    const h = mapContainer.value?.clientHeight || 800;
    const centerY = h / 2;
    const zoneWidth = 40000; // Ausreichend breit
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

    // Linien relativ zur Mitte: centerY - 150, centerY, centerY + 150
    // HOE < -150 < Quality < 0 < Feature < 150 < NSHC
    const lines = [
      { y: centerY - 150, style: 'dashed' },
      { y: centerY, style: 'dashed' },
      { y: centerY + 150, style: 'solid' }, // NSHC Trennlinie Oben
      { y: centerY + 300, style: 'solid' }, // NSHC Trennlinie Unten (jetzt durchgezogen)
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

    // Calculate fixed X positions for sticky labels
    const transform = d3.zoomTransform(svg.node());
    const fixedLayerX = (50 - transform.x) / transform.k; // 50px margin from left

    // Labels (Links positioniert, aber im Zoom-Bereich)
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

  // 1. Simulation füttern
  if (simulation) {
    simulation.nodes(nodes);
    simulation.force("link").links(links);

    // Forces removed for static positioning
    // We only use the simulation tick to update the DOM

    simulation.alpha(0.3).restart();
  }

  // 2. Links binden
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

  // Connectivity Check für Styling (WS vs WM)
  const connectedNodeIds = new Set();
  links.forEach(l => {
    connectedNodeIds.add(l.source.id || l.source);
    connectedNodeIds.add(l.target.id || l.target);
  });

  // 3. Nodes binden
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

      // Rechteck
      g.append("rect")
        .attr("fill", "#fff")
        .attr("stroke-width", 3)
        .style("pointer-events", "all"); // WICHTIG für Dragging

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

      // Drag Handler direkt beim Erstellen binden
      if (dragHandler) g.call(dragHandler);

      // Separate Drag Handler for Connection Handle
      if (connectionDragHandler) handle.call(connectionDragHandler);

      return g;
    }
  );

  // Attribute aktualisieren (für alle)
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
    // Methodische Visualisierung (A, B, C, D)
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

  // Selektions-Rahmen (Multi-Select)
  nodeSelection.select("rect")
    .attr("stroke", (d) => selectedNodeIds.value.has(d.id) ? "#2c3e50" : (d.customColor || safeGetColor(d.type)))
    .style("filter", (d) => selectedNodeIds.value.has(d.id) ? "drop-shadow(0 0 6px rgba(66, 185, 131, 0.6))" : null);

  // Filter-Klasse auf die Gruppe anwenden (damit auch Text/Icons verblassen)
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

    // Feature: Verbindung starten (via Kontextmenü)
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
      isHoverHighlight.value = false; // Klick fixiert das Highlight
      selectNodeForPresentation(d);
    } else {
      // Multi-Selektion Logik
      if (event.shiftKey) {
        if (selectedNodeIds.value.has(d.id)) selectedNodeIds.value.delete(d.id);
        else selectedNodeIds.value.add(d.id);
        updateGraph(); // Neu zeichnen für Rahmen
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
      updateGraph(); // Update für dynamische Breite
      div.html(d.name).style("display", "flex");
      d3.select(this).remove();
    })
    .on("keydown", function (event) {
      if (event.key === "Enter") {
        this.blur();
      }
    });

  input.node().focus({ preventScroll: true });
  input.node().select(); // Text direkt markieren zum Überschreiben
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

// 1. Temporäre Hervorhebung (Hover)
function handleNodeHover(d, isHovering) {
  // Wenn ein Klick-Highlight aktiv ist (nicht Hover), dann Hover ignorieren
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

  // Wenn Knoten isoliert ist (keine Verbindungen), kein Highlight/Dimming aktivieren
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
  const w = safeGetNodeWidth(target) / 2;
  const h = safeGetNodeHeight(target) / 2;

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

      // Screen Position für Tooltip
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
          const currentNodes = simulation ? simulation.nodes() : [];
          const target = currentNodes.find(n => {
            const nw = safeGetNodeWidth(n);
            const nh = safeGetNodeHeight(n);
            return Math.abs(n.x - x) < nw / 2 + 20 && Math.abs(n.y - y) < nh / 2 + 20 && n.id !== sourceNode.id;
          });

          if (target) {
            const isValid = checkConnection(sourceNode, target, props.mode);
            validationMsg.value = isValid ? null : getValidationError(sourceNode, target);
          } else {
            validationMsg.value = null;
          }
        }
      }
    });

  // Marker für Pfeilspitzen
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
  const controlsLayer = g.append("g").attr("class", "controls-layer"); // Layer für + Buttons (Hintergrund)
  const linkLayer = g.append("g").attr("class", "links-layer");
  const nodeLayer = g.append("g").attr("class", "nodes-layer");
  const interactionLayer = g.append("g").attr("class", "interaction-layer");

  // Spotlight Layer (SVG based for multiple holes support)
  // Appended after graph content to sit on top
  svg.append("path").attr("class", "spotlight-path").attr("fill-rule", "evenodd");

  // Temporäre Linie für Verbindungen
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
        const minDist = (safeGetNodeWidth(a) + safeGetNodeWidth(b)) / 2 + 30; // 30px gap
        const dist = (b.fx ?? b.x) - (a.fx ?? a.x);
        if (dist < minDist) {
          const push = (minDist - dist) * alpha * 0.8;
          a.vx -= push;
          b.vx += push;
        }
      }
    });
  };

  // Simulation starten
  simulation = d3.forceSimulation([])
    // Keine "Ragdoll" Physik (Charge 0, Link Strength 0)
    .force("link", d3.forceLink([]).id((d) => d.id).distance(300).strength(0.1))
    .force("charge", d3.forceManyBody().strength(-800))
    .force("x", d3.forceX(0).strength(0.02))
    .force("y", null)
    .force("collide", null) // Disable circular collision to allow stacking
    .force("rowSep", rowSeparationForce) // Use custom row separation
    .velocityDecay(0.6); // Keep decay to stop momentum quickly

  // Forces werden in updateGraph() je nach Modus gesetzt

  simulation.on("tick", () => {
    // Update Button Positions on Tick (smooth movement)
    updateControls();
    updateMinimap();
    updateSpotlight(); // Update spotlight holes as nodes move

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

      linkSelection.select(".link-visible").attr("d", linkPathGenerator);
      linkSelection.select(".link-hit-area").attr("d", linkPathGenerator);

      nodeSelection.attr("transform", (d) => {
        // Keine Boundary Constraints mehr, da Map zoombar/pannbar ist
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

      // Startposition speichern für Swap-Logik
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
        d.lastFx = d.fx; // Für Delta-Berechnung
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
        // FIX: Nutze aktuelle Simulations-Knoten für korrekte Koordinaten beim Hit-Testing
        const currentNodes = simulation ? simulation.nodes() : [];
        const [mx, my] = d3.pointer(event, interactionLayer.node());
        const target = currentNodes.find((n) => {
          const dx = n.x - mx;
          const dy = n.y - my;
          // Größerer Trefferbereich
          const w = safeGetNodeWidth(n);
          const h = safeGetNodeHeight(n);
          return Math.abs(dx) < w / 2 + 20 && Math.abs(dy) < h / 2 + 20 && n.id !== d.id;
        });
        if (target && checkConnection(d, target, props.mode)) {
          addLinkToData({ source: d.id, target: target.id }); // IDs verwenden für saubere Daten
          nextTick(() => updateGraph());
        }
      } else {
        if (!event.active) simulation.alphaTarget(0);

        // Beim Loslassen: In die Zone einrasten (Map/Analyze)
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

        // Swap Logic: Prüfen ob Platz belegt ist
        const GRID_TOLERANCE = 20;
        const overlappingNode = simulation.nodes().find(n =>
          n.id !== d.id &&
          Math.abs((n.fx ?? n.x) - d.fx) < GRID_TOLERANCE &&
          Math.abs((n.fy ?? n.y) - d.fy) < GRID_TOLERANCE
        );

        if (overlappingNode) {
          // Tausche Positionen
          overlappingNode.fx = d.startX;
          overlappingNode.fy = d.startY;
          overlappingNode.x = d.startX;
          overlappingNode.y = d.startY;
          // d nimmt die neue Position ein (bereits gesetzt durch d.fx/d.fy)

          // Ensure nodes are properly distanced after swap
          resolveOverlaps(simulation.nodes());
          simulation.alpha(0.1).restart(); // Gentle restart to settle positions
        }

        // Fix: Position erzwingen, damit keine Diskrepanz zwischen fx und x entsteht
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

      // 2. Visuelles Feedback: Ziel-Ebene hervorheben
      const sourceLevel = safeLevels.find(l => l.id === d.type);
      if (sourceLevel) {
        // Valid target is usually next level (index + 1)
        const targetLevel = safeLevels.find(l => l.index === sourceLevel.index + 1);
        if (targetLevel) {
          svg.selectAll(`.layer-bg-${targetLevel.id}`)
            .attr("opacity", 0.3); // Leuchtfarbe verstärken
        }
      }
    })
    .on("drag", (event, d) => {
      if (props.mode === "evaluation") return;
      // event.x/y are relative to the handle's parent (the node group), 

      // Update Screen Position für Tooltip
      const [sx, sy] = d3.pointer(event, mapContainer.value);
      screenMousePosition.value = { x: sx, y: sy };

      // but we need global coordinates for the line.
      // Actually d3.drag on the handle receives coordinates relative to the subject?
      // Let's use the mouse position from the event which is usually in the container space if we use the right transform.
      // Easier: Use d.x + event.x (if event.x is local delta) or just use the global mouse pointer.
      // d3.drag event exposes x/y which are the subject's new coordinates.
      // Since we didn't set a subject, it defaults to mouse position relative to container?
      // Let's use d3.pointer on the interactionLayer.
      const [mx, my] = d3.pointer(event, interactionLayer.node());
      tempLine.attr("x2", mx).attr("y2", my);

      // 4. Constraints Feedback: Highlight valid targets
      const currentNodes = simulation ? simulation.nodes() : [];
      // Reset styles first
      svg.selectAll(".node rect")
        .attr("stroke", (n) => safeGetColor(n.type))
        .attr("stroke-width", 3);

      const target = currentNodes.find(n => {
        const w = safeGetNodeWidth(n);
        const h = safeGetNodeHeight(n);
        return Math.abs(n.x - mx) < w / 2 + 20 && Math.abs(n.y - my) < h / 2 + 20 && n.id !== d.id;
      });

      if (target) {
        const isValid = checkConnection(d, target, props.mode);
        tempLine.attr("stroke", isValid ? "#28a745" : "#dc3545");
        svg.select(`.node rect`).filter((n) => n.id === target.id) // Select specific node rect
          .attr("stroke", isValid ? "#28a745" : "#dc3545")
          .attr("stroke-width", 5);
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

      // Find target
      const [mx, my] = d3.pointer(event, interactionLayer.node());

      // Nutze die aktuellen Simulations-Knoten für korrekte Koordinaten
      const currentNodes = simulation ? simulation.nodes() : [];
      const target = currentNodes.find(n => {
        const w = safeGetNodeWidth(n);
        const h = safeGetNodeHeight(n);
        return Math.abs(n.x - mx) < w / 2 && Math.abs(n.y - my) < h / 2 && n.id !== d.id;
      });

      if (target && checkConnection(d, target, props.mode)) {
        addLinkToData({ source: d.id, target: target.id });
        nextTick(() => updateGraph());
      }

      // Reset styles
      tempLine.attr("stroke", "#999");
      updateGraph(); // Redraws original styles
    });

  // Zoom
  zoomBehavior = d3.zoom()
    .scaleExtent([0.6, 4]) // Max Zoom Out begrenzt (0.6), damit man nicht zu weit rauszoomt
    .translateExtent([[-4000, -350], [5000, 1700]]) // Limit panning vertically to keep content in view
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
      currentZoomTransform.value = event.transform; // Update reactive state for spotlight

      // Fixierte Ebenennamen (Sticky Labels)
      const fixedLayerX = (50 - event.transform.x) / event.transform.k;
      g.selectAll(".layer-label").attr("x", fixedLayerX);

      // Sticky Group Labels (Vertical)
      // Positioned slightly to the left of layer labels
      g.selectAll(".group-label").attr("transform", d => `translate(${fixedLayerX - 25}, ${d.y}) rotate(-90)`);

      // updateControls(); // Nicht nötig bei Zoom, da Buttons im SVG-Graph sind
      updateMinimap();
      updateSpotlight(); // Update spotlight on zoom
    });
  svg.call(zoomBehavior);

  // Resize Observer
  resizeObserver = new ResizeObserver(() => {
    if (mapContainer.value && simulation) {
      const w = mapContainer.value.clientWidth;
      const h = mapContainer.value.clientHeight;
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

watch(_graphData, () => {
  updateGraph();
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

// Watcher für Tutorial-Highlighting (Pulsieren)
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

  // 1. Ensure Y positions are snapped correctly before running X layout
  simulation.nodes().forEach(n => {
    const level = safeLevels.find(l => l.id === n.type);
    if (level) {
      const layerCenter = centerY + (1.5 - level.index) * 150;
      if (n.type === 'hoe' || n.type === 'hoe_req') {
        const row1 = layerCenter;
        const row2 = n.type === 'hoe' ? layerCenter - 80 : layerCenter + 80;
        // Snap to closest row to maintain current preference
        n.fy = (n.y && Math.abs(n.y - row2) < Math.abs(n.y - row1) - 10) ? row2 : row1;
      } else {
        n.fy = layerCenter;
      }
      n.y = n.fy; // Sync y to fy
    }
  });

  // 2. Run the algorithm to calculate fx positions (Barycenter)
  const { links } = getRawData();
  runSmartLayout(simulation, simulation.nodes(), links);

  // 3. Persist the calculated positions
  const updates = simulation.nodes().map(n => {
    return { id: n.id, changes: { x: n.x, y: n.y, fx: n.fx, fy: n.fy } };
  });
  updateNodesBulk(updates);
};

const loadGraphDataHandler = (data) => {
  // 1. Lock updates to prevent watcher interference during data swap
  isInitializing.value = true;

  // 2. Stop simulation but DO NOT clear nodes array to prevent flicker/ghosting
  if (simulation) {
    simulation.stop();
    simulation.nodes([]); // Clear nodes to force full re-bind
  }

  // 3. Load data
  loadGraphData(data);
  initialViewParsed.value = false; // Force re-center on new data load

  // 4. Unlock and update on next tick
  nextTick(() => {
    isInitializing.value = false;
    updateGraph();
  });
};

const zoomToFit = () => {
  if (!svg || !zoomBehavior || !mapContainer.value) return;
  const nodes = simulation.nodes();
  if (nodes.length === 0) return;

  const width = mapContainer.value.clientWidth;
  const height = mapContainer.value.clientHeight;
  const padding = 100; // Increased padding to avoid UI overlap

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

  // WICHTIG: isInitializing prevents updateGraph from running during this setup
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

  isInitializing.value = false; // Fix: Unlock updates

  nextTick(() => updateGraph());
};

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
  smartLayout
});
</script>

<style scoped>
.worth-map-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  background-color: #f8f9fa;
  /* Standard Hintergrund */
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
  /* Weniger dunkel, nur leichtes Dimmen */
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
  /* Glow effect handled by specific types below or generic shadow */
  filter: drop-shadow(0 0 10px rgba(0, 0, 0, 0.5));
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
