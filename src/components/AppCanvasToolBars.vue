<template>
    <div class="top-ui-shell">
        <!-- 1. Filter Bar Panel -->
        <div class="panel-wrapper" :class="{ collapsed: !isFilterPanelOpen }">
            <div class="toolbar-panel filter-panel">
                <div v-if="currentMode === 'map'" class="methodology-filter-bar">
                    <template v-for="(group, index) in filterGroups" :key="group.label">
                        <div class="filter-column">
                            <div class="filter-header">{{ group.label }}</div>
                            <div class="chip-group">
                                <button v-for="layer in group.layers" :key="layer.id" class="filter-pill"
                                    :class="[layer.id, { active: visibleLayers.includes(layer.id) }]"
                                    @click="$emit('toggle-layer', layer.id)" :title="layer.title">
                                    {{ layer.text }}
                                    <span v-if="layerCounts[layer.id]" class="count-badge">{{ layerCounts[layer.id]
                                        }}</span>
                                </button>
                            </div>
                        </div>
                        <!-- Arrow between layers -->
                        <div v-if="index < filterGroups.length - 1" class="separator">→</div>
                    </template>
                </div>
            </div>
            <button class="drawer-toggle-btn" @click="isFilterPanelOpen = !isFilterPanelOpen" title="Toggle Filters">
                {{ isFilterPanelOpen ? '↑' : '↓' }}
            </button>
        </div>

        <!-- 2. Actions Panel -->
        <div class="panel-wrapper" :class="{ collapsed: !isActionsPanelOpen }">
            <div class="toolbar-panel actions-panel">
                <button class="action-btn" @click="$emit('toggle-tutorial')" :class="{ active: showTutorial }"
                    title="Toggle Tutorial">
                    {{ showTutorial ? 'Hide Tutorial' : 'Show Tutorial' }}
                </button>

                <button class="action-btn" @click="$emit('smart-layout')" title="Automatically arrange nodes">
                    Optimize Layout
                </button>

                <button class="action-btn" @click="$emit('toggle-dark-mode')" title="Toggle Theme">
                    {{ isDarkMode ? 'Light Mode' : 'Dark Mode' }}
                </button>
            </div>
            <button class="drawer-toggle-btn" @click="isActionsPanelOpen = !isActionsPanelOpen" title="Toggle Actions">
                {{ isActionsPanelOpen ? '↑' : '↓' }}
            </button>
        </div>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
    currentMode: String,
    visibleLayers: Array,
    showTutorial: Boolean,
    isDarkMode: Boolean,
    graphStats: Object
});

defineEmits(['toggle-layer', 'toggle-tutorial', 'smart-layout', 'toggle-dark-mode']);

const isFilterPanelOpen = ref(true);
const isActionsPanelOpen = ref(true);

// Static definitions for filter groups
const FILTER_DEFINITIONS = [
    {
        label: 'NSHC',
        layers: [{ id: 'nshc', title: 'Show/Hide NSHC', class: 'nshc' }]
    },
    {
        label: 'Feature',
        layers: [
            { id: 'feature', text: 'AW', title: 'Appreciated Worth', class: 'ap' },
            { id: 'feature_req', text: 'RW', title: 'Requested Worth', class: 'req' }
        ]
    },
    {
        label: 'Quality',
        layers: [
            { id: 'quality', text: 'AW', title: 'Appreciated Worth', class: 'ap' },
            { id: 'quality_req', text: 'RW', title: 'Requested Worth', class: 'req' }
        ]
    },
    {
        label: 'HOE',
        layers: [
            { id: 'hoe', text: 'AW', title: 'Appreciated Worth', class: 'ap' },
            { id: 'hoe_req', text: 'RW', title: 'Requested Worth', class: 'req' }
        ]
    }
];

const filterGroups = computed(() => [
    { ...FILTER_DEFINITIONS[0], layers: [{ ...FILTER_DEFINITIONS[0].layers[0], text: props.visibleLayers.includes('nshc') ? 'Hide' : 'Show' }] },
    FILTER_DEFINITIONS[1],
    FILTER_DEFINITIONS[2],
    FILTER_DEFINITIONS[3]
]);

const layerCounts = computed(() => {
    return props.graphStats?.nodeCounts || {};
});
</script>

<style scoped>
.top-ui-shell {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    background: transparent;
    z-index: 90;
    transition: transform 0.3s ease;
    display: flex;
    justify-content: flex-end;
    gap: 20px;
    padding-right: 0;
    align-items: flex-start;
    pointer-events: none;
}

.panel-wrapper {
    position: relative;
    transition: transform 0.3s ease;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.panel-wrapper.collapsed {
    transform: translateY(-100%);
}

.toolbar-panel {
    pointer-events: auto;
    background: white;
    padding: 10px 20px;
    border-radius: 0 0 12px 12px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    border: 1px solid #e0e0e0;
    border-top: none;
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    /* Keep in one line */
    align-items: center;
    justify-content: space-between;
    /* Distribute evenly */
    min-width: 300px;
    /* Ensure enough space for distribution */
    gap: 15px;
    position: relative;
}

.actions-panel {
    border-top-right-radius: 0;
    /* Attach to right edge visually */
    border-bottom-right-radius: 0;
    border-right: none;
    padding-right: 25px;
    padding-left: 25px;
    margin-right: 0;
    border-top-left-radius: 0;
    /* Make it look like a tab attached to screen edge if desired, or keep rounded */
}


.filter-panel {
    padding: 12px 30px;
    /* Enlarge left toolbar */
}

.drawer-toggle-btn {
    position: absolute;
    bottom: -20px;
    left: 50%;
    transform: translateX(-50%);
    width: 40px;
    height: 20px;
    background: white;
    border: 1px solid #e0e0e0;
    border-top: none;
    border-radius: 0 0 8px 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    font-size: 12px;
    color: #666;
    pointer-events: auto;
    z-index: 100;
    margin-top: -1px;
    /* Overlap border to look attached */
    transition: background-color 0.3s, border-color 0.3s;
}

.action-btn {
    padding: 4px 12px;
    font-size: 0.85rem;
    border: 1px solid #d0d7de;
    /* Outlined Ghost Button */
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    color: #444;
    box-shadow: none;
    flex: 1;
    /* Distribute evenly */
    white-space: nowrap;
}

.action-btn:focus {
    outline: none;
    box-shadow: none;
}

.action-btn:hover {
    background: #f3f4f6;
}

.action-btn.active {
    background: #42b983;
    color: white;
    border-color: #3aa876;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.toggle-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: #444;
}

.toggle-switch {
    width: 40px;
    height: 22px;
    background: #ccc;
    border-radius: 11px;
    position: relative;
    transition: background 0.3s;
}

.toggle-switch.active {
    background: #42b983;
}

.toggle-switch.light-mode-switch {
    background: #ccc;
}

.toggle-knob {
    width: 18px;
    height: 18px;
    background: white;
    border-radius: 50%;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: left 0.3s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.toggle-switch.active .toggle-knob {
    left: 20px;
}

/* Filter Bar Styles */
.methodology-filter-bar {
    display: flex;
    align-items: center;
    gap: 12px;
}

.filter-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.filter-header {
    font-size: 0.65rem;
    color: #999;
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 2px;
    letter-spacing: 0.5px;
}

.chip-group {
    display: flex;
    gap: 4px;
}

.filter-pill {
    padding: 4px 12px;
    font-size: 0.75rem;
    border: 1px solid transparent;
    background: #f0f2f5;
    border-radius: 12px;
    cursor: pointer;
    color: #666;
    min-width: 40px;
    display: flex;
    align-items: center;
    gap: 6px;
    text-align: center;
    transition: all 0.2s ease;
    font-weight: 500;
}

.filter-pill:hover {
    filter: brightness(0.95);
}

.filter-pill.active {
    color: white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* Layer Colors */
.filter-pill.nshc.active {
    background-color: #FFC107;
    /* NSHC Gold */
    border-color: #FFC107;
}

.filter-pill.feature.active,
.filter-pill.feature_req.active {
    background-color: #9C27B0;
    border-color: #9C27B0;
}

.filter-pill.quality.active,
.filter-pill.quality_req.active {
    background-color: #2E7D32;
    border-color: #2E7D32;
}

.filter-pill.hoe.active,
.filter-pill.hoe_req.active {
    background-color: #F44336;
    border-color: #F44336;
}

.count-badge {
    background: rgba(0, 0, 0, 0.15);
    color: inherit;
    padding: 0 5px;
    border-radius: 8px;
    font-size: 0.7em;
}

.separator {
    color: #42b983;
    font-size: 1.2rem;
    line-height: 1;
    margin: 0 4px;
    font-weight: bold;
}

/* Dark Mode Support */
:global(.dark-mode) .toolbar-panel {
    background-color: #161B22 !important;
    border-color: #30363D !important;
}

:global(.dark-mode) .top-ui-shell,
:global(.dark-mode) .panel-wrapper {
    background: transparent !important;
}

:global(.dark-mode) .drawer-toggle-btn {
    background-color: #161B22;
    border-color: #30363D;
    border-top: none;
    color: #E6E8EB;
}

:global(.dark-mode) .action-btn {
    background-color: #21262D;
    /* Dark Surface */
    border-color: #30363D;
    color: #E6E8EB;
}

:global(.dark-mode) .action-btn:hover {
    background-color: #30363D;
}

:global(.dark-mode) .action-btn.active {
    background-color: #42b983;
    border-color: #42b983;
    color: white;
}

:global(.dark-mode) .toggle-switch {
    background: #444;
}

:global(.dark-mode) .toggle-switch.active {
    background: #42b983;
}

/* Dark Mode for Filter Bar */
:global(.dark-mode) .filter-pill {
    background: transparent;
    /* Ghost Pill */
    color: #9DA3AE;
    border-color: #30363D;
}

:global(.dark-mode) .filter-pill:hover {
    background-color: #444;
}

:global(.dark-mode) .filter-pill.active {
    /* Active state colors are handled by specific classes above, but we ensure text is white */
    color: white;
}

:global(.dark-mode) .filter-header {
    color: #9DA3AE;
    /* Lighter gray for dark mode readability */
}

:global(.dark-mode) .toggle-switch.light-mode-switch {
    background: #555;
}

/* Dark Mode for Right Toolbar Tab */
:global(.dark-mode) .actions-panel+.drawer-toggle-btn {
    background-color: #161B22;
    border-color: #30363D;
}
</style>
