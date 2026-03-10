<template>
    <header class="toolbar" :class="currentMode">
        <div class="brand-container">
            <div class="brand">Worth Mapper</div>
        </div>

        <div class="center-controls">
            <div class="undo-redo-group">
                <button @click="$emit('undo')" :disabled="!canUndo" title="Undo">↩️</button>
                <button @click="$emit('redo')" :disabled="!canRedo" title="Redo">↪️</button>
            </div>
            <div class="mode-toggle">
                <button :class="{ active: currentMode === 'map' }" @click="$emit('set-mode', 'map')"
                    title="Formal Mapping Mode">
                    Mapping
                </button>
                <button :class="{ active: currentMode === 'evaluation' }" @click="$emit('set-mode', 'evaluation')"
                    :disabled="!canEvaluate" title="Evaluation & Presentation Mode">
                    Evaluation
                </button>
            </div>
        </div>
        <div class="right-controls">
            <div class="search-box">
                <input type="text" :value="searchQuery" @input="$emit('update:searchQuery', $event.target.value)"
                    @keyup.enter="$emit('execute-search')" placeholder="Search nodes..."
                    title="Enter name and press Enter" />
                <div class="menu-dropdown" ref="menuDropdown">
                    <button @click="$emit('toggle-menu')" :class="{ active: isMenuOpen }">
                        Menu ▾
                    </button>
                    <div v-if="isMenuOpen" class="dropdown-content">
                        <div class="menu-section-label">File</div>
                        <button @click="$emit('export-json')">💾 Save</button>
                        <button @click="triggerImport">📂 Load</button>

                        <hr />
                        <div class="menu-section-label">Edit</div>
                        <button @click="$emit('reset')" class="danger-text">🗑️ Reset All</button>
                        <hr />
                        <div class="menu-section-label">View</div>
                        <button @click="$emit('zoom-to-fit')">⤢ Fit to Screen</button>
                        <div class="menu-section-label">Study</div>
                        <button @click="$emit('toggle-sus')">📋 SUS-Questionnaire</button>
                    </div>
                </div>
                <input type="file" ref="fileInput" style="display: none" accept=".json" @change="handleFileChange" />
            </div>
        </div>
    </header>
</template>

<script setup>
import { ref } from "vue";

defineProps({
    currentMode: String,
    canEvaluate: Boolean,
    isMenuOpen: Boolean,
    searchQuery: String,
    canUndo: Boolean,
    canRedo: Boolean,
    showTutorial: Boolean
});

const emit = defineEmits([
    "set-mode",
    "update:searchQuery",
    "execute-search",
    "toggle-menu",
    "export-json",
    "import-json",
    "share",
    "undo",
    "redo",
    "reset",
    "zoom",
    "zoom-to-fit",
    "toggle-tasks",
    "toggle-sus",
    "toggle-tutorial"
]);

const fileInput = ref(null);

const triggerImport = () => {
    fileInput.value.click();
};

const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    emit('import-json', file);
    event.target.value = ""; // Reset input
};
</script>

<style scoped>
.toolbar {
    height: auto;
    min-height: 60px;
    background-color: #fff;
    border-bottom: 2px solid #ccc;
    padding: 10px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    z-index: 10;
    transition: all 0.3s ease;
    position: relative;
    /* For absolute centering of controls */
}

.toolbar.evaluation {
    border-bottom: 4px solid #5CA4D6;
    /* Distinct visual indicator for Evaluation Phase */
}

.brand-container {
    display: flex;
    flex-direction: row;
    align-items: baseline;
    gap: 10px;
}

.brand {
    font-weight: bold;
    font-size: 1.2rem;
}

.save-indicator {
    font-size: 0.7rem;
    color: #888;
}

.last-saved {
    color: #888;
}

.status-saving {
    color: #42b983;
    font-weight: bold;
}

.undo-redo-group {
    display: flex;
    margin-right: 15px;
}

.center-controls {
    display: flex;
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
}

.right-controls {
    display: flex;
    align-items: center;
    gap: 10px;
}

.search-box {
    display: flex;
    align-items: center;
    margin-right: 15px;
}

input[type="text"] {
    background: #ffffff;
    color: #24292f;
    border: 1px solid #d0d7de;
}

button {
    padding: 6px 14px;
    border: 1px solid #d0d7de;
    background: #ffffff;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 600;
    color: #24292f;
    font-size: 0.9rem;
    box-shadow: 0 1px 0 rgba(27, 31, 36, 0.04);
}

button:hover {
    background: #f3f4f6;
    border-color: #b9c0c9;
}

button.active {
    background: #42b983;
    color: white;
    border-color: #3aa876;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.menu-dropdown {
    position: relative;
    display: inline-block;
}

.dropdown-content {
    position: absolute;
    top: 100%;
    right: 0;
    background-color: white;
    min-width: 180px;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
    z-index: 200;
    border-radius: 4px;
    border: 1px solid #ddd;
    padding: 5px 0;
}

.dropdown-content button {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    padding: 10px 15px;
    margin: 0;
    border-radius: 0;
}

.dropdown-content button:hover {
    background-color: #f1f1f1;
}

.dropdown-content hr {
    margin: 5px 0;
    border: 0;
    border-top: 1px solid #eee;
}

.menu-section-label {
    padding: 5px 15px;
    font-size: 0.75rem;
    color: #888;
    font-weight: bold;
    text-transform: uppercase;
}

.danger-text {
    color: #dc3545 !important;
}

.badge-check {
    display: inline-block;
    margin-left: 5px;
    color: #fff;
    font-weight: bold;
}

button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Dark Mode Support */
:global(.dark-mode) .toolbar {
    background: #23252B !important;
    border-bottom-color: #555 !important;
    color: #E6E8EB !important;
}

:global(.dark-mode) button {
    background-color: #2E3138;
    border-color: #555;
    color: #E6E8EB;
}

:global(.dark-mode) button:hover {
    background-color: #444;
}

:global(.dark-mode) button.active {
    background-color: #2da44e;
    border-color: #2da44e;
    color: white;
}

:global(.dark-mode) .dropdown-content {
    background: #23252B !important;
    border-color: #555;
    color: #E6E8EB;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.5);
}

:global(.dark-mode) .dropdown-content button {
    background-color: transparent;
    border: none;
    color: #E6E8EB;
}

:global(.dark-mode) .dropdown-content button:hover {
    background-color: #3E4148;
}

:global(.dark-mode) .dropdown-content hr {
    border-top-color: #555;
}

:global(.dark-mode) .menu-section-label {
    color: #9DA3AE;
}

:global(.dark-mode) input[type="text"] {
    background-color: #181A1F;
    border-color: #555;
    color: #E6E8EB;
}
</style>
