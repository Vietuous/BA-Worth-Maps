<template>
    <Transition name="fade">
        <div v-if="showLegend && currentMode !== 'evaluation'" class="legend">
            <div class="legend-header">
                <h4>Shortcuts</h4>
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
        @click="$emit('update:showLegend', !showLegend)" :class="{ active: showLegend }" title="Toggle Legend">
        ℹ️
    </button>
</template>

<script setup>
defineProps({
    showLegend: Boolean,
    currentMode: String,
    isLinkingMode: Boolean
});

defineEmits(['update:showLegend']);
</script>

<style scoped>
.legend {
    position: absolute;
    bottom: 82px;
    right: 30px;
    width: 220px;
    height: 190px;
    border: 1px solid #414141;
    background: rgba(255, 255, 255, 0.9);
    padding: 8px 12px;
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
    margin-bottom: 5px;
    font-size: 0.9rem;
}

.legend-content {
    overflow-y: auto;
    flex-grow: 1;
}

.legend-section {
    margin-bottom: 10px;
}

.legend-section:last-child {
    margin-bottom: 0;
}

.legend-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;
    flex-shrink: 0;
}

.legend-header h4 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 700;
    /* Bold as requested */
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
    background: #f0f0f0;
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
:global(.dark-mode) .legend {
    background: rgba(35, 37, 43, 0.95) !important;
    border-color: #555 !important;
    color: #E6E8EB !important;
}

:global(.dark-mode) .legend-toggle-btn {
    background-color: #23252B;
    border: 1px solid #555;
    color: #E6E8EB;
}

:global(.dark-mode) kbd {
    background-color: #2E3138;
    border-color: #555;
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