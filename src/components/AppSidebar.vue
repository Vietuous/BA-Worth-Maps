<template>
  <aside class="sidebar" :class="{ open: isOpen, 'dark-mode': isDarkMode }">
    <div class="sidebar-header">
      <h3>Details & Metadata</h3>
    </div>
    <div class="sidebar-content" v-if="selectedNode && currentMode !== 'evaluation'">
      <div>
        <h4>{{ selectedNode.name }}</h4>
        <div class="meta-item meta-id">
          <strong>ID:</strong> {{ selectedNode.id }}
        </div>
        <div class="meta-item">
          <strong>Layer:</strong> {{ selectedNode.type.toUpperCase() }}
        </div>

        <div class="sidebar-card">
          <h4>Worth Evidence Notes</h4>

          <textarea ref="evidenceInput" rows="3" placeholder="Describe the evidence (e.g. quote, observation)..."
            :value="selectedNode.evidenceNotes" @change="updateEvidence" @input="autoResize"
            class="auto-expand"></textarea>
        </div>

        <div class="warning-box warning" v-if="selectedNode.validationStatus === 'invalid'">
          <span class="icon-large">!</span>
          <span>This connection is currently invalid!</span>
        </div>

        <div class="sidebar-card">
          <h4>Stakeholder Impact</h4>
          <textarea rows="2" placeholder="What concrete impact does this have on the stakeholder?"
            :value="selectedNode.stakeholderImpact" @change="updateStakeholderImpact"></textarea>
        </div>

        <div class="sidebar-card">
          <h4>Observation Reference</h4>
          <textarea rows="2" placeholder="Reference to raw data (e.g. Interview #3, Min 12:00)"
            :value="selectedNode.observationReference" @change="updateObservationReference"></textarea>
        </div>
      </div>
    </div>
    <div class="sidebar-content" v-else-if="currentMode === 'evaluation'">
      <h3>Evaluation Summary</h3>

      <div class="metrics-container">
        <div class="metric-item">
          <span class="metric-label">WORTH CHAINS</span>
          <span class="metric-value-box">{{ graphStats?.fullChainCount || 0 }}</span>
        </div>
      </div>

      <hr class="sidebar-divider" />

      <div v-if="selectedNode">
        <h4>Selected HOE Analysis</h4>
        <p>
          <b>Goal: {{ selectedNode?.name }}</b>
        </p>
        <p>This path is supported by:</p>
        <div class="analysis-path-list" v-if="sortedSelectedPath.length > 1">
          <div v-for="node in sortedSelectedPath" :key="node.id" class="analysis-item">
            <span class="analysis-type">{{ getLayerLabel(node.type) }}:</span> {{ node.name }}
          </div>
        </div>
        <div class="analysis-path-list empty" v-else>
          <p>No connections as of yet.</p>
        </div>

        <h4>Aggregated Evidence Notes</h4>
        <div class="read-only-text">
          <p v-if="aggregatedEvidence">{{ aggregatedEvidence }}</p>
          <p v-else>No evidence recorded in this path.</p>
        </div>

        <h4>Stakeholder Impact Summary</h4>
        <p class="read-only-text" v-if="selectedNode.evidenceNotes">{{ selectedNode.evidenceNotes }}</p>
        <p class="read-only-text" v-else>No specific impact recorded for this outcome.</p>
      </div>
      <div v-else>
        <p class="meta-hint">Select a HOE node to see detailed analysis.</p>
      </div>
    </div>
    <div class="sidebar-content" v-else>
      <div class="empty-state">
        <p>Select a node to see details.</p>
      </div>
    </div>
  </aside>
</template>

<script setup>
const props = defineProps({
  isOpen: Boolean,
  selectedNode: Object,
  currentMode: String,
  sortedSelectedPath: {
    type: Array,
    default: () => []
  },
  graphStats: Object,
  isDarkMode: Boolean
});

import { computed, nextTick, ref, watch } from 'vue';
import { safeLevels } from './useStyling';

const emit = defineEmits(['update-node', 'highlight-level']);

const getLayerLabel = (type) => {
  const level = safeLevels.find(l => l.id === type);
  if (!level) return type;
  // Append (Req) if it's a requested layer (negative index in safeLevels logic)
  return level.index < 0 ? `${level.label} (Req)` : level.label;
};

const evidenceInput = ref(null);

const autoResize = () => {
  if (evidenceInput.value) {
    evidenceInput.value.style.height = 'auto';
    evidenceInput.value.style.height = evidenceInput.value.scrollHeight + 'px';
  }
};

watch(() => props.selectedNode, () => {
  nextTick(autoResize);
});

const updateEvidence = (event) => {
  emit('update-node', {
    id: props.selectedNode.id,
    changes: { evidenceNotes: event.target.value }
  });
};

const updateStakeholderImpact = (event) => {
  emit('update-node', {
    id: props.selectedNode.id,
    changes: { stakeholderImpact: event.target.value }
  });
};

const updateObservationReference = (event) => {
  emit('update-node', {
    id: props.selectedNode.id,
    changes: { observationReference: event.target.value }
  });
};

const aggregatedEvidence = computed(() => {
  if (!props.sortedSelectedPath?.length) return "";
  return props.sortedSelectedPath
    .filter(n => n.evidenceNotes && n.evidenceNotes.trim() !== "")
    .map(n => `[${getLayerLabel(n.type)}]: ${n.evidenceNotes}`)
    .join("\n\n");
});
</script>

<style scoped>
.sidebar {
  width: 0;
  background: #fcfcfc;
  border-left: 1px solid #d0d7de;
  box-shadow: -2px 0 5px rgba(0, 0, 0, 0.05);
  transition: width 0.3s ease;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  font-family: 'Segoe UI', sans-serif;
}

.sidebar-header {
  padding: 15px 20px;
  border-bottom: 1px solid #e0e0e0;
  background: #fff;
}

.sidebar-content {
  padding: 20px;
  font-size: 0.9rem;
  color: #24292f;
}

.sidebar-content h4 {
  margin: 10px 0 5px 0;
  font-size: 1rem;
}

.sidebar-card {
  background: transparent;
  margin-bottom: 15px;
  border-radius: 8px;
  /* Optional: Add border or bg if desired, but user asked for sections */
}

.metrics-container {
  display: flex;
  justify-content: space-between;
  margin-bottom: 15px;
}

.metric-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.metric-label {
  font-size: 0.7rem;
  color: #9DA3AE;
  text-transform: uppercase;
  margin-bottom: 5px;
}

.metric-value-box {
  font-size: 1.1rem;
  font-weight: bold;
  color: #000;
  background: #e0e0e0;
  padding: 8px 0;
  width: 100%;
  text-align: center;
  border-radius: 4px;
  border: 1px solid #ccc;
}

.info-tooltip {
  display: inline-block;
  width: 14px;
  height: 14px;
  background: #555;
  color: white;
  border-radius: 50%;
  text-align: center;
  line-height: 14px;
  font-size: 10px;
  cursor: help;
  margin-left: 4px;
}

.sidebar-divider {
  border: 0;
  border-top: 1px solid #3e3e42;
  margin: 15px 0;
}

.read-only-text {
  font-style: italic;
  color: #9DA3AE;
  font-size: 0.85rem;
  white-space: pre-wrap;
}

.meta-item {
  margin-bottom: 4px;
}

.meta-id {
  font-size: 0.85rem;
  color: #666;
}

.meta-hint {
  font-style: italic;
  color: #57606a;
  font-size: 0.8rem;
  margin-top: 8px;
  margin-bottom: 4px;
}

.icon-large {
  font-size: 24px;
  font-weight: bold;
}

.warning-box {
  padding: 10px;
  border-radius: 4px;
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.warning-box.warning {
  background-color: #fff3cd;
  color: #856404;
  border: 1px solid #ffeeba;
}

.warning-box.error {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

textarea {
  width: 100%;
  padding: 10px;
  border-radius: 6px;
  border: 2px solid #e0e0e0;
  background-color: #f6f8fa;
  margin-top: 5px;
  margin-bottom: 15px;
  resize: vertical;
  font-family: inherit;
  font-size: 0.9rem;
  color: #24292f;
  transition: border-color 0.2s;
}

textarea:focus {
  border-color: #42b983;
  background-color: #fff;
  outline: none;
}

.auto-expand {
  resize: none;
  overflow-y: hidden;
}

.analysis-path-list {
  background: #e0e0e0;
  color: #000;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 10px;
  max-height: 300px;
  overflow-y: auto;
}

.analysis-path-list.empty {
  font-style: italic;
  color: #666;
}

.analysis-item {
  margin-bottom: 8px;
  font-size: 0.9rem;
}

.analysis-type {
  font-weight: bold;
  color: #666;
  font-size: 0.8rem;
  text-transform: uppercase;
}

.semantic-check-wrapper {
  margin-top: 10px;
  padding: 8px;
  background: #f0f2f5;
  border-radius: 4px;
  border: 1px solid #e0e0e0;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
  color: #2c3e50;
}

/* Dark Mode Support */
.sidebar.dark-mode {
  background-color: #161B22 !important;
  border-left-color: #30363D !important;
  color: #E6E8EB !important;
}

.sidebar.dark-mode .sidebar-header {
  background: #161B22 !important;
  border-bottom-color: #30363D !important;
}

.sidebar.dark-mode .sidebar-content {
  color: #E6E8EB;
}

.sidebar.dark-mode textarea {
  background-color: #0D1117;
  /* Darker than sidebar */
  border-color: #30363D;
  color: #E6E8EB;
}

.sidebar.dark-mode .metric-value-box {
  color: #E6E8EB !important;
  background: #21262D !important;
  border-color: #30363D !important;
}

.sidebar.dark-mode .menu-section-label {
  color: #9DA3AE;
}

.sidebar.dark-mode .meta-hint {
  color: #9DA3AE;
}

.sidebar.dark-mode .meta-id {
  color: #9DA3AE;
}

.sidebar.dark-mode .warning-box.warning {
  background-color: rgba(255, 243, 205, 0.1);
  color: #ffeeba;
  border-color: #ffeeba;
}

.sidebar.dark-mode .analysis-path-list {
  background-color: #0D1117 !important;
  color: #E6E8EB !important;
  border-color: #30363D !important;
}

.sidebar.dark-mode .analysis-type {
  color: #9DA3AE;
}

.sidebar.dark-mode .analysis-path-list.empty {
  color: #35373a;
}

.sidebar.dark-mode .semantic-check-wrapper {
  background-color: #21262D !important;
  border-color: #30363D !important;
}

.sidebar.dark-mode .semantic-check-wrapper {
  background-color: #2E3138 !important;
  border-color: #454952 !important;
}

.sidebar.dark-mode .checkbox-label {
  color: #E6E8EB;
}
</style>