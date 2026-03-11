<template>
  <div id="app" class="app-layout" :class="{ 'dark-mode': isDarkMode }">
    <!-- 1. Top Toolbar -->
    <AppTopbar :current-mode="currentMode" :can-evaluate="canEvaluate" :is-menu-open="isMenuOpen"
      v-model:search-query="searchQuery" :can-undo="canUndo" :can-redo="canRedo" @set-mode="setMode"
      @execute-search="executeSearch" @toggle-menu="isMenuOpen = !isMenuOpen" :is-dark-mode="isDarkMode"
      @export-json="handleExportJson(currentScenarioName)" @import-json="handleImportJson" @share="handleShare"
      @undo="undo" @redo="redo" @toggle-tutorial="toggleTutorial" :show-tutorial="showTutorial" @reset="handleReset"
      @zoom="triggerZoom" @zoom-to-fit="handleZoomToFit" @toggle-sus="toggleSus" />

    <!-- SUS Success Toast -->
    <Transition name="fade">
      <div v-if="susSuccessMessage" class="sus-success-toast">
        {{ susSuccessMessage }}
      </div>
    </Transition>

    <div class="main-layout">
      <!-- 1. & 5. Central Canvas (Responsive) -->
      <div class="canvas-wrapper">
        <WorthMap ref="worthMapComponent" :mode="currentMode" :analyzing-view="analyzingView"
          :visible-layers="visibleLayers" :is-dark-mode="isDarkMode" :show-tutorial="showTutorial"
          @node-selected="handleNodeSelection" @graph-stats="handleGraphStats" @toggle-tutorial="toggleTutorial" />

        <AppCanvasToolBars v-if="currentMode !== 'evaluation'" :current-mode="currentMode"
          :visible-layers="visibleLayers" :show-tutorial="showTutorial" :is-dark-mode="isDarkMode"
          :graph-stats="graphStats" @toggle-layer="toggleLayer" @toggle-tutorial="toggleTutorial"
          @smart-layout="handleSmartLayout" @toggle-dark-mode="toggleDarkMode" />

        <!-- Legend is here, ensure z-index is high enough -->
        <AppLegend v-model:show-legend="showLegend" :current-mode="currentMode" :is-linking-mode="isLinkingMode"
          :is-dark-mode="isDarkMode" />


        <AppScenarioTabs :scenarios="scenarios" :current-scenario-id="currentScenarioId" @switch="switchScenario"
          :is-dark-mode="isDarkMode" @add="addScenario" @delete="deleteScenario" @rename="renameScenario"
          @clone="cloneScenario" @update-name="handleScenarioRename" />
      </div>

      <!-- Resize Handle -->
      <div class="resize-handle" @mousedown="startResize"></div>

      <!-- 1. & 2. Right Sidebar (Interactive) -->
      <AppSidebar :is-open="isSidebarOpen" :selected-node="selectedNode" :current-mode="currentMode"
        :sorted-selected-path="sortedSelectedPath" :graph-stats="graphStats" @update-node="handleNodeUpdate"
        :style="sidebarStyle" :is-dark-mode="isDarkMode" />
    </div>
  </div>

  <!-- Phase 7: SUS Modal (Optional) -->
  <AppSusModal :show="showSusModal" :questions="extendedSusQuestions" @close="showSusModal = false"
    @submit="handleSusSubmit" :is-dark-mode="isDarkMode" />
</template>

<script setup>
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import AppCanvasToolBars from "./components/AppCanvasToolBars.vue";
import AppLegend from "./components/AppLegend.vue";
import AppScenarioTabs from "./components/AppScenarioTabs.vue";
import AppSidebar from "./components/AppSidebar.vue";
import AppSusModal from "./components/AppSusModal.vue";
import AppTopbar from "./components/AppTopbar.vue";
import { susQuestions } from "./components/studyData";
import { useFileIO } from "./components/useFileIO";
import { useGraphData } from "./components/useGraphData";
import { useScenarios } from "./components/useScenarios";
import WorthMap from "./components/WorthMap.vue";

const currentMode = ref("map"); // 'map' or 'evaluation'
const isSidebarOpen = ref(true);
const selectedNode = ref(null);
const selectedPath = ref([]);
const worthMapComponent = ref(null);
const showLegend = ref(true);
const visibleLayers = ref(['nshc', 'feature', 'quality', 'hoe', 'feature_req', 'quality_req', 'hoe_req']);
const isLinkingMode = ref(false);
const isMenuOpen = ref(false);
const searchQuery = ref("");
const canEvaluate = ref(false);
const graphStats = shallowRef(null);
const analyzingView = ref('axis'); // 'axis' or 'zones'
const isDarkMode = ref(false);
const showTutorial = ref(false);
const showSusModal = ref(false);

// Composables
const { scenarios, currentScenarioId, switchScenario, addScenario, deleteScenario, renameScenario, cloneScenario, updateScenarioName } = useScenarios();
const { handleExportJson, handleImportJson, handleShare } = useFileIO(worthMapComponent);
const { undo, redo, canUndo, canRedo, getGraphData, graphData } = useGraphData();
const susSuccessMessage = ref(null);

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
    // Automatically open sidebar on selection (Details-on-Demand)
    if (!isSidebarOpen.value) isSidebarOpen.value = true;
  }
};

onMounted(() => {
  // Initialize Graph with current scenario data (loaded by useScenarios)
  const current = scenarios.value.find(s => s.id === currentScenarioId.value);
  if (current && worthMapComponent.value) {
    // Use nextTick to ensure WorthMap is fully mounted and ready
    import('vue').then(({ nextTick }) => {
      nextTick(() => worthMapComponent.value.loadGraphData(current.data));
    });
  }
});

// 3. Sync GraphData to Current Scenario (Debounced)
let syncTimeout = null;
watch(graphData, (val) => {
  if (syncTimeout) clearTimeout(syncTimeout);

  // Debounce to avoid freezing UI during heavy interactions
  syncTimeout = setTimeout(() => {
    const current = scenarios.value.find(s => s.id === currentScenarioId.value);
    if (current) {
      // Update the scenario data. This triggers the watcher in useScenarios to save to localStorage.
      current.data = JSON.parse(JSON.stringify(val));
    }
  }, 500);
}, { deep: true });

/* 
   REMOVED: Duplicate localStorage logic. 
   useScenarios.js handles the actual saving to 'worth-map-scenarios-v1'.
*/

// 4. Watch for Scenario Switch to load data
watch(currentScenarioId, (newId) => {
  const current = scenarios.value.find(s => s.id === currentScenarioId.value);
  if (current && worthMapComponent.value) {
    worthMapComponent.value.loadGraphData(current.data);
  }
});

const handleGraphStats = (stats) => {
  // Simple assignment, relying on WorthMap's debounce to prevent recursion
  canEvaluate.value = stats.hasFullChain;
  graphStats.value = stats;
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

const sortedSelectedPath = computed(() => {
  const order = ['nshc', 'feature', 'feature_req', 'quality', 'quality_req', 'hoe', 'hoe_req'];
  return [...selectedPath.value].sort((a, b) => {
    return order.indexOf(a.type) - order.indexOf(b.type);
  });
});

const extendedSusQuestions = computed(() => {
  const newQuestions = [
    {
      id: 'familiar_wm',
      text: "How familiar are you with Worth Maps?",
      options: ["Novice", "Passing Knowledge", "Knowledgeable", "Expert"]
    },
    {
      id: 'familiar_tools',
      text: "How familiar with similar tools (for instance online diagram creation, such as bpmn.io or VisualParadigm)?",
      options: ["Novice", "Passing Knowledge", "Knowledgeable", "Expert"]
    }
  ];
  // Insert new questions AFTER the standard 10 questions (susQuestions) and before open-ended (handled by modal)
  return [...susQuestions, ...newQuestions];
});

// Sidebar Resizing Logic
const sidebarWidth = ref(400); // Default width
const isResizing = ref(false);

const sidebarStyle = computed(() => ({
  width: isSidebarOpen.value ? `${sidebarWidth.value}px` : '0px',
  transition: isResizing.value ? 'none' : undefined
}));

const startResize = () => {
  isResizing.value = true;
  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', stopResize);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
};

const handleResize = (e) => {
  const newWidth = window.innerWidth - e.clientX;
  if (newWidth > 250 && newWidth < 400) sidebarWidth.value = newWidth;
};

const stopResize = () => {
  isResizing.value = false;
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
};
</script>

<style>
/* Reset & Base Layout */
html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: #fff;
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
  position: absolute;
  inset: 0;
  top: 0;
  left: 0;
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  margin: 0 !important;
  padding: 0 !important;
}

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
  min-width: 0;
  /* Fix: Allow canvas wrapper to shrink properly in flex layout */
  /* Background is controlled in WorthMap.vue */
}

.resize-handle {
  width: 5px;
  cursor: col-resize;
  background-color: transparent;
  transition: background-color 0.2s;
  z-index: 100;
}

.resize-handle:hover,
.resize-handle:active {
  background-color: #42b983;
}

/* Force pre-wrap for task descriptions to show bullet points */
:deep(.scenario-description),
:deep(p) {
  white-space: pre-wrap;
}

/* Responsive Adjustments */
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
