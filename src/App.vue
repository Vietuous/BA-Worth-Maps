<template>
  <div id="app" class="app-layout" :class="{ 'dark-mode': isDarkMode }">
    <!-- 1. Top-Toolbar -->
    <AppTopbar :current-mode="currentMode" :can-evaluate="canEvaluate" :is-menu-open="isMenuOpen"
      v-model:search-query="searchQuery" :can-undo="canUndo" :can-redo="canRedo" @set-mode="setMode"
      @execute-search="executeSearch" @toggle-menu="isMenuOpen = !isMenuOpen" :last-saved="lastSaved"
      :save-status="saveStatus" @export-json="handleExportJson(currentScenarioName)" @import-json="handleImportJson"
      @share="handleShare" @undo="undo" @redo="redo" @toggle-tutorial="toggleTutorial" :show-tutorial="showTutorial"
      @reset="handleReset" @zoom="triggerZoom" @zoom-to-fit="handleZoomToFit" @toggle-tasks="toggleTasks"
      @toggle-sus="toggleSus" />

    <!-- SUS Success Toast -->
    <Transition name="fade">
      <div v-if="susSuccessMessage" class="sus-success-toast">
        {{ susSuccessMessage }}
      </div>
    </Transition>

    <div class="main-layout">
      <!-- 1. & 5. Zentrale Canvas (Responsive) -->
      <div class="canvas-wrapper">
        <WorthMap ref="worthMapComponent" :mode="currentMode" :analyzing-view="analyzingView"
          :visible-layers="visibleLayers" :is-dark-mode="isDarkMode" :show-tutorial="showTutorial"
          @node-selected="handleNodeSelection" @graph-stats="handleGraphStats" @toggle-tutorial="toggleTutorial" />

        <AppCanvasToolBars v-if="currentMode !== 'evaluation'" :current-mode="currentMode"
          :visible-layers="visibleLayers" :show-tutorial="showTutorial" :is-dark-mode="isDarkMode"
          :graph-stats="graphStats" @toggle-layer="toggleLayer" @toggle-tutorial="toggleTutorial"
          @smart-layout="handleSmartLayout" @toggle-dark-mode="toggleDarkMode" />

        <AppScenarioOverlay v-if="showTasksOverlay" :active-scenario="activeScenario" @next="nextScenario"
          @end="endEvaluation" @close="showTasksOverlay = false" />

        <!-- Legend is here, ensure z-index is high enough -->
        <AppLegend v-model:show-legend="showLegend" :current-mode="currentMode" :is-linking-mode="isLinkingMode" />

        <AppScenarioTabs :scenarios="scenarios" :current-scenario-id="currentScenarioId" @switch="switchScenario"
          @add="addScenario" @delete="deleteScenario" @rename="renameScenario" @clone="cloneScenario"
          @update-name="handleScenarioRename" />
      </div>

      <!-- 1. & 2. Sidebar rechts (Interaktiv) -->
      <AppSidebar :is-open="isSidebarOpen" :selected-node="selectedNode" :current-mode="currentMode"
        :sorted-selected-path="sortedSelectedPath" :graph-stats="graphStats" @update-node="handleNodeUpdate" />
    </div>
  </div>

  <!-- Phase 7: SUS Modal (Optional) -->
  <AppSusModal :show="showSusModal" :questions="susQuestions" @close="showSusModal = false" @submit="handleSusSubmit" />
</template>

<script setup>
import { computed, ref, watch } from "vue";
import AppCanvasToolBars from "./components/AppCanvasToolBars.vue";
import AppLegend from "./components/AppLegend.vue";
import AppScenarioOverlay from "./components/AppScenarioOverlay.vue";
import AppScenarioTabs from "./components/AppScenarioTabs.vue";
import AppSidebar from "./components/AppSidebar.vue";
import AppSusModal from "./components/AppSusModal.vue";
import AppTopbar from "./components/AppTopbar.vue";
import { useAutoSave } from "./components/useAutoSave";
import { useFileIO } from "./components/useFileIO";
import { useGraphData } from "./components/useGraphData";
import { useScenarios } from "./components/useScenarios";
import WorthMap from "./components/WorthMap.vue";

const currentMode = ref("map"); // 'map' or 'evaluation'
const isSidebarOpen = ref(true);
const selectedNode = ref(null);
const selectedPath = ref([]);
const worthMapComponent = ref(null);
const showLegend = ref(false);
const visibleLayers = ref(['nshc', 'feature', 'quality', 'hoe', 'feature_req', 'quality_req', 'hoe_req']);
const isLinkingMode = ref(false);
const isMenuOpen = ref(false);
const searchQuery = ref("");
const canEvaluate = ref(false);
const graphStats = ref(null);
const analyzingView = ref('axis'); // 'axis' or 'zones'
const isDarkMode = ref(false);
const showTutorial = ref(false); // Optimization: Tutorial hidden by default

// Composables
const { scenarios, currentScenarioId, switchScenario, addScenario, deleteScenario, renameScenario, cloneScenario, updateScenarioName } = useScenarios();
const { handleExportJson, handleImportJson, handleShare } = useFileIO(worthMapComponent);
const { undo, redo, canUndo, canRedo, getGraphData, graphData, loadGraphData } = useGraphData();

// Auto-Save Feature
const { lastSaved, status: saveStatus } = useAutoSave(scenarios, currentScenarioId, graphData, (loadedData) => {
  if (loadedData.scenarios && loadedData.scenarios.length > 0) {
    scenarios.value = loadedData.scenarios;
    currentScenarioId.value = loadedData.currentScenarioId || loadedData.scenarios[0].id;

    // Load the graph data for the active scenario
    const current = scenarios.value.find(s => s.id === currentScenarioId.value);
    if (current) loadGraphData(current.data);
  }
});

// Phase 7 State
const activeScenario = ref(null);
const showTasksOverlay = ref(false);
const showSusModal = ref(false);
const susSuccessMessage = ref(null);

const evalScenarios = [
  {
    id: 1,
    title: "Task 1: Creation",
    description:
      "You are introducing a new learning app. Start on a new draft and rename the draft to your liking. Next, click on 'Show Tutorial' on the right canvas toolbar. Follow the tutorial until you have created one complete value chain successfully. Use the following for each layer: NSHC: More Frequent Usage, Feature: Gamification Elements, Quality: Increased Motivation, HOE: More Consistent Study Behaviour. Create 1 more HOE node and drag it to the second row of the layer and rename it to 'Better Exam Performance' but do not link it to your current value chain.",
  },
  {
    id: 2,
    title: "Task 2: Evaluation",
    description:
      "Switch to Evaluation Mode located in the top bar. This mode is purely for reviewing your mapping, so select one HOE and examine the visual highlighting and sidebar. Then switch back to Mapping Mode.",
  },
  {
    id: 3,
    title: "Task 3: Save and Load",
    description:
      "Save your project by clicking on the drop down menu on the right side of the top bar. Create a new draft and load in the just created .JSON file to confirm it was saved successfully.",
  },
  {
    id: 4,
    title: "Bonus Functionalities",
    description: "If you have not found all of the functionalities in this web page, check here:\n\n• Dark Mode Toggle to lessen eye strain.\n• Optimize Layout for organizing your Worth Map with no overlapping.\n• Recolor any connection by right clicking and selecting a color.\n• A legend to see short cuts.\n• A minimap to see your Worth Map node outline.\n• A prominent filter bar to hide selected layers.\n• Stickied zones on the left to collapse and expand by clicking [+] and [-].\n• Combined Evidence Notes will appear on a whole value chain in Evaluation Mode.\n• Undo and Redo button in drop down menu.\n• Reset All button to reset the Worth Map.\n• Fit to Screen button for ease of use."
  }
];

const susQuestions = [
  "I think that I would like to use this system frequently.",
  "I found the system unnecessarily complex.",
  "I thought the system was easy to use.",
  "I think that I would need the support of a technical person to be able to use this system.",
  "I found the various functions in this system were well integrated.",
  "I thought there was too much inconsistency in this system.",
  "I would imagine that most people would learn to use this system very quickly.",
  "I found the system very cumbersome to use.",
  "I felt very confident using the system.",
  "I needed to learn a lot of things before I could get going with this system."
];

const currentScenarioName = computed(() => {
  const s = scenarios.value.find(s => s.id === currentScenarioId.value);
  return s ? s.name : 'worth-map';
});

const handleNodeSelection = (payload) => {
  if (!payload) {
    selectedNode.value = null;
    selectedPath.value = [];
  } else {
    // Support both simple node and {node, path} payload
    selectedNode.value = payload.node || payload;
    selectedPath.value = payload.path || [];
    // Sidebar automatisch öffnen bei Selektion (Details-on-Demand)
    if (!isSidebarOpen.value) isSidebarOpen.value = true;
  }
};

const handleGraphStats = (stats) => {
  if (JSON.stringify(graphStats.value) !== JSON.stringify(stats)) {
    canEvaluate.value = stats.hasFullChain;
    graphStats.value = stats;

    // Auto-initialize if graph is empty (e.g. new draft)
    if (stats.nodeCounts && Object.values(stats.nodeCounts).reduce((a, b) => a + b, 0) === 0) {
      worthMapComponent.value?.initializeDefaultGraph();
    }
  }
};

const handleNodeUpdate = ({ id, changes }) => {
  if (worthMapComponent.value) {
    worthMapComponent.value.updateNodeData(id, changes);
  }
  // Update local state immediately so Sidebar reflects changes
  if (selectedNode.value && selectedNode.value.id === id) {
    Object.assign(selectedNode.value, changes);
  }
};

const handleScenarioRename = ({ id, name }) => {
  updateScenarioName(id, name);
};

const setMode = (mode) => {
  currentMode.value = mode;
};

const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value;
};

watch(isDarkMode, (val) => {
  document.body.classList.toggle('dark-mode', val);
});

const toggleTutorial = () => {
  showTutorial.value = !showTutorial.value;
};

const toggleLayer = (layer) => {
  if (visibleLayers.value.includes(layer)) {
    visibleLayers.value = visibleLayers.value.filter(l => l !== layer);
  } else {
    visibleLayers.value.push(layer);
  }
};

const triggerZoom = (scaleFactor) => {
  if (worthMapComponent.value) {
    worthMapComponent.value.zoom(scaleFactor);
  }
};

const handleSmartLayout = () => {
  if (worthMapComponent.value && worthMapComponent.value.smartLayout) {
    worthMapComponent.value.smartLayout();
  }
};

const handleZoomToFit = () => {
  if (worthMapComponent.value && worthMapComponent.value.zoomToFit) {
    worthMapComponent.value.zoomToFit();
  }
};

const handleReset = () => {
  if (confirm("Do you really want to delete the entire Worth Map?")) {
    worthMapComponent.value?.resetGraph();
  }
};

const executeSearch = () => {
  if (!searchQuery.value) return;
  const data = getGraphData();
  const foundNode = data.nodes.find(n => n.name.toLowerCase().includes(searchQuery.value.toLowerCase()));
  if (foundNode && worthMapComponent.value) {
    worthMapComponent.value.centerOnNode(foundNode.id);
  }
};

// Phase 7 Logic
const toggleTasks = () => {
  showTasksOverlay.value = !showTasksOverlay.value;
  if (showTasksOverlay.value && !activeScenario.value) {
    // Start first task if none active
    activeScenario.value = evalScenarios[0];
  }
};

const handleSusSubmit = () => {
  susSuccessMessage.value = "Successfully submitted, thank you for participating and for your time!";
  setTimeout(() => {
    susSuccessMessage.value = null;
    showSusModal.value = false;
  }, 5000);
};

const toggleSus = () => {
  showSusModal.value = true;
  isMenuOpen.value = false;
};

const nextScenario = () => {
  const currentId = activeScenario.value.id;
  if (currentId < evalScenarios.length) {
    activeScenario.value = evalScenarios[currentId];
  } else {
    endEvaluation();
  }
};

const endEvaluation = () => {
  activeScenario.value = null;
  showTasksOverlay.value = false;
};

const sortedSelectedPath = computed(() => {
  const order = ['nshc', 'feature', 'feature_req', 'quality', 'quality_req', 'hoe', 'hoe_req'];
  return [...selectedPath.value].sort((a, b) => {
    return order.indexOf(a.type) - order.indexOf(b.type);
  });
});
</script>

<style>
/* Reset & Base Layout */
body,
html {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

#app {
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  color: #2c3e50;
  display: flex;
  flex-direction: column;
  position: fixed;
  top: -3.5vh;
  left: -1.7vw;
  height: 107vh;
  width: 103.2vw;
  max-width: none;
  margin: 0;
  overflow: hidden;
  /* Prevent body scroll */
}

/* Main Layout Area */
.main-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.canvas-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
  /* Hintergrund wird in WorthMap.vue gesteuert */
}

/* Force pre-wrap for task descriptions to show bullet points */
:deep(.scenario-description),
:deep(p) {
  white-space: pre-wrap;
}

/* Responsive Anpassungen */
@media (max-width: 768px) {
  .toolbar {
    height: auto;
    flex-wrap: wrap;
    padding: 10px;
  }

  .center-controls {
    order: 3;
    width: 100%;
    justify-content: center;
    margin-top: 10px;
    flex-wrap: wrap;
  }

}

.analysis-path-list {
  background: #f9f9f9;
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 10px;
  max-height: 300px;
  overflow-y: auto;
}

/* Dark Mode Styles */
.dark-mode {
  background-color: #0B0E14;
  /* Deep Navy-Blue-Gray */
  /* Canvas Background */
  color: #E6EDF3;
  /* Off-White */
  /* Text Primary */
}

.dark-mode button {
  background-color: #161B22;
  border-color: #30363D;
  color: #E6E8EB;
}

.dark-mode button:hover {
  background-color: #444;
}

.dark-mode button.active {
  background-color: #2da44e;
  border-color: #2da44e;
  color: white;
}


/* Global Dark Mode Styles for Components not in context (e.g. ScenarioTabs) */
.dark-mode .scenario-tabs {
  background-color: #0D1117 !important;
  border-top-color: #30363D !important;
}

.dark-mode .tab {
  background-color: #161B22;
  border-color: #30363D;
  color: #9DA3AE;
}

.dark-mode .tab.active {
  background-color: #21262D;
  color: #E6E8EB;
  border-top-color: #42b983;
}

/* Global Dark Mode Overrides for Child Components */
/* Toolbar */
.dark-mode .toolbar {
  background-color: #161B22 !important;
  border-bottom-color: #30363D !important;
  color: #E6E8EB !important;
}

.dark-mode .toolbar button {
  background-color: #21262D !important;
  border-color: #30363D !important;
  color: #E6E8EB !important;
}

.dark-mode .toolbar button:hover {
  background-color: #444 !important;
}

.dark-mode .toolbar button.active {
  background-color: #42b983 !important;
  color: white !important;
  border-color: #3aa876 !important;
}

.dark-mode .toolbar input[type="text"] {
  background-color: #0D1117 !important;
  border-color: #30363D !important;
  color: #E6E8EB !important;
}

/* Sidebar */
.dark-mode .sidebar {
  background-color: #161B22 !important;
  border-left-color: #30363D !important;
  color: #E6E8EB !important;
}

.dark-mode .sidebar-header {
  background-color: #23252B !important;
  border-bottom-color: #3e3e42 !important;
}

.dark-mode .sidebar-content {
  color: #E6E8EB !important;
}

.dark-mode .sidebar textarea {
  background-color: #181A1F !important;
  border-color: #3e3e42 !important;
  color: #E6E8EB !important;
}

/* Legend */
.dark-mode .legend {
  background-color: rgba(35, 37, 43, 0.95) !important;
  border-color: #3e3e42 !important;
  color: #E6E8EB !important;
}

.dark-mode .legend-toggle-btn {
  background-color: #23252B !important;
  border-color: #3e3e42 !important;
  color: #E6E8EB !important;
}

/* Minimap */
.dark-mode .minimap {
  background-color: rgba(35, 37, 43, 0.95) !important;
  border-color: #3e3e42 !important;
}

.dark-mode .minimap-toggle {
  background-color: #23252B !important;
  border-color: #3e3e42 !important;
  color: #E6E8EB !important;
}

/* Context Menu & Dropdowns */
.dark-mode .context-menu,
.dark-mode .dropdown-content {
  background-color: #23252B !important;
  border-color: #3e3e42 !important;
  color: #E6E8EB !important;
}

.dark-mode .menu-header {
  background-color: #2E3138 !important;
  border-bottom-color: #3e3e42 !important;
}

/* Force white text for all context menus in dark mode */
.dark-mode .context-menu button {
  color: #E6E8EB !important;
}

/* Hide delete button in tabs to prevent accidental deletion - Global Override */
:global(.scenario-tabs .delete-btn),
:global(.scenario-tabs button.delete),
:global(.scenario-tabs .close-tab) {
  display: none !important;
}

/* AppCanvasToolBars Dark Mode Overrides (Explicit Global) */
.dark-mode .toolbar-panel {
  background-color: #161B22 !important;
  border-color: #30363D !important;
}

.dark-mode .action-btn {
  background-color: #21262D;
  border-color: #30363D;
  color: #E6E8EB;
}

.dark-mode .action-btn:hover {
  background-color: #30363D;
}

.dark-mode .action-btn.active {
  background-color: #42b983;
  border-color: #42b983;
  color: white;
}

.dark-mode .filter-pill {
  background-color: #21262D;
  border-color: #30363D;
  color: #E6E8EB;
}

.dark-mode .filter-pill:hover {
  background-color: #21262D;
  color: #E6E8EB;
}

.dark-mode .filter-pill.active {
  background-color: #42b983;
  border-color: #42b983;
  color: white;
}

.dark-mode .drawer-toggle-btn {
  background-color: #161B22;
  border-color: #30363D;
  color: #E6E8EB;
}

.dark-mode .tasks-wrapper {
  background-color: #161B22;
  border-color: #30363D;
}

.dark-mode .tasks-header-bar {
  background-color: #21262D;
  border-bottom-color: #30363D;
  color: #E6E8EB;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.sus-success-toast {
  position: absolute;
  top: 15%;
  left: 50%;
  transform: translateX(-50%);
  background: #28a745;
  color: white;
  padding: 15px 25px;
  border-radius: 8px;
  font-weight: bold;
  z-index: 3100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  text-align: center;
}
</style>
