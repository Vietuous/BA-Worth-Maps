<template>
    <Transition name="fade">
        <div v-if="showLegend && currentMode !== 'evaluation'" class="legend" :class="{ 'dark-mode': isDarkMode }">
            <div class="legend-header">
                <h4><b>Shortcuts</b></h4>
            </div>
            <div class="legend-content">
                <div class="legend-section">
                    <ul>
                        <li>Scroll: Pan View</li>
                        <li>Shift + Scroll: Pan Horizontally</li>
                        <li>Ctrl + Scroll: Zoom In/Out</li>
                        <li>Shift + Drag: Connect</li>
                        <li>Double Click: Edit Node</li>
                    </ul>
                </div>
                <div class="legend-section" v-if="isLinkingMode && currentMode !== 'evaluation'">
                    <strong>Mode:</strong>
                    <ul>
                        <li>🔗 Linking Active</li>
                    </ul>
                </div>
            </div>
        </div>
    </Transition>
    <button v-if="currentMode !== 'evaluation'" class="legend-toggle-btn"
        @click="$emit('update:showLegend', !showLegend)" :class="{ active: showLegend, 'dark-mode': isDarkMode }"
        title="Toggle Legend">
        ℹ️
    </button>
</template>

<script setup>
defineProps({
    showLegend: Boolean,
    currentMode: String,
    isLinkingMode: Boolean,
    isDarkMode: Boolean
});

defineEmits(['update:showLegend']);
</script>

<style scoped>
.legend {
    position: absolute;
    bottom: 80px;
    right: 30px;
    width: 240px;
    height: auto;
    border: 1px solid #414141;
    background: rgba(255, 255, 255, 0.95);
    padding: 2px 12px 8px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 100;
    display: flex;
    flex-direction: column;
}

.legend ul {
    list-style: none;
    padding: 0;
    margin: 0;
}

.legend li {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 3px;
    font-size: 0.85rem;
}

.legend-content {
    overflow-y: hidden;
    /* flex-grow: 1; */
    /* Removed to allow content to sit at the top */
}

.legend-section {
    margin-bottom: 5px;
}

.legend-section:last-child {
    margin-bottom: 0;
}

.legend-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 5px;
    flex-shrink: 0;
}

.legend-header h4 {
    margin: 0;
}

.legend-toggle-btn {
    position: absolute;
    bottom: 45px;
    right: 30px;
    z-index: 90;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    font-size: 1rem;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border: 1px solid #ccc;
    color: #444;
    cursor: pointer;
}

.legend-toggle-btn:hover,
.legend-toggle-btn.active {
    background-color: #f0f0f0;
    /* Light mode hover/active */
}

kbd {
    background-color: #eee;
    border-radius: 3px;
    border: 1px solid #b4b4b4;
    box-shadow: 0 1px 1px rgba(0, 0, 0, .2), 0 2px 0 0 rgba(255, 255, 255, .7) inset;
    color: #333;
    display: inline-block;
    font-size: .85em;
    font-weight: 700;
    line-height: 1;
    padding: 2px 4px;
    white-space: nowrap;
    margin-right: 5px;
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

/* Dark Mode Support */
.legend.dark-mode {
    background-color: #161B22 !important;
    border-color: #30363D !important;
    color: #E6E8EB !important;
}

.legend-toggle-btn.dark-mode {
    background-color: #161B22 !important;
    border: 1px solid #30363D !important;
    color: #E6E8EB !important;
}

.legend-toggle-btn.dark-mode:hover,
.legend-toggle-btn.dark-mode.active {
    background-color: #21262D !important;
}

.legend.dark-mode kbd {
    background-color: #21262D;
    border-color: #30363D;
    color: #E6E8EB;
    box-shadow: 0 1px 1px rgba(0, 0, 0, .5), 0 2px 0 0 rgba(255, 255, 255, .1) inset;
}

/* Responsive Scaling */
@media (max-width: 1600px) {
    /* .legend {
        transform: scale(0.9);
        transform-origin: bottom right;
    } */
}
</style>