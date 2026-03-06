<template>
    <Transition name="fade">
        <div v-if="showLegend && currentMode !== 'evaluation'" class="legend">
            <div class="legend-header">
                <h4>Legend</h4>
                <button class="close-btn" @click="$emit('update:showLegend', false)" title="Close">×</button>
            </div>
            <div class="legend-section">
                <strong>Shortcuts:</strong>
                <ul>
                    <li><kbd>Scroll</kbd> Pan View</li>
                    <li><kbd>Shift</kbd> + <kbd>Scroll</kbd> Pan Horizontally</li>
                    <li><kbd>Ctrl</kbd> + <kbd>Scroll</kbd> Zoom In/Out</li>
                    <li><kbd>Shift</kbd> + Drag: Connect</li>
                    <li>Double-click Node: Rename</li>
                </ul>
            </div>
            <div class="legend-section" v-if="isLinkingMode && currentMode !== 'evaluation'">
                <strong>Mode:</strong>
                <ul>
                    <li>🔗 Linking Active</li>
                </ul>
            </div>
        </div>
    </Transition>
    <button v-if="!showLegend && currentMode !== 'evaluation'" class="legend-toggle-btn"
        @click="$emit('update:showLegend', true)" title="Open Legend">
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
    bottom: 80px;
    right: 30px;
    border: 2px solid #333;
    background: rgba(255, 255, 255, 0.9);
    padding: 10px 15px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 100;
    min-width: 200px;
}

.legend h4 {
    margin-top: 0;
    margin-bottom: 10px;
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
}

.legend-section {
    margin-bottom: 10px;
    border-bottom: 1px solid #eee;
    padding-bottom: 5px;
}

.legend-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
}

.legend-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}

.close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    line-height: 1;
    padding: 0 5px;
    cursor: pointer;
    color: #666;
}

.close-btn:hover {
    color: #000;
    background: none;
}

.legend-toggle-btn {
    position: absolute;
    bottom: 50px;
    right: 30px;
    z-index: 90;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    font-size: 1.2rem;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border: 1px solid #ccc;
    color: #444;
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

:global(.dark-mode) .close-btn {
    color: #9DA3AE;
}

:global(.dark-mode) .close-btn:hover {
    color: #E6E8EB;
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
</style>