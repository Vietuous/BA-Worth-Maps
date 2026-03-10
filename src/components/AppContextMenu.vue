<!-- c:\Users\Destiny\worth-map-tool\src\components\AppContextMenu.vue -->
<template>
    <Teleport to="body">
        <div v-if="visible" class="context-menu" :style="style" @click.stop>
            <div v-if="view === 'main'">
                <div class="menu-header" v-if="item">
                    <span class="menu-title">{{ type === 'node' ? item.name : 'Connection' }}</span>
                </div>

                <template v-if="type === 'node'">

                    <button @click="emitAction('rename')">✏️ Rename</button>
                    <button @click="emitAction('duplicate')">📑 Duplicate</button>
                    <button @click="emitAction('delete')" class="danger-text">
                        {{ deleteConfirm ? '⚠️ Confirm Delete?' : '🗑️ Delete' }}
                    </button>
                    <hr />
                    <button @click="emitAction('start-connection')">🔗 Start Connection</button>
                    <button @click="emitAction('highlight-in')">⬅️ Highlight Incoming</button>
                    <button @click="emitAction('highlight-out')">➡️ Highlight Outgoing</button>
                    <hr />
                </template>

                <template v-if="type === 'link'">
                    <button @click="emitAction('color-menu')">🎨 Color...</button>
                    <hr />
                    <button @click="emitAction('link-delete')" class="danger-text">
                        {{ linkDeleteConfirm ? '⚠️ Confirm Delete?' : '🗑️ Delete Connection' }}
                    </button>
                </template>
            </div>

            <div v-else-if="view === 'color'">
                <div class="menu-header">
                    <button class="back-btn" @click="view = 'main'">←</button>
                    <span class="menu-title">Select Color</span>
                </div>
                <div class="color-grid">
                    <div v-for="color in colors" :key="color" class="color-swatch" :style="{ backgroundColor: color }"
                        @click="emitAction('set-color', color)"></div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { linkPalette } from './useStyling';

const props = defineProps({
    visible: Boolean,
    x: Number,
    y: Number,
    item: Object,
    type: String,
    view: String
});

const emit = defineEmits(['update:view', 'action']);

const style = computed(() => ({
    top: `${props.y}px`,
    left: `${props.x}px`
}));

const colors = linkPalette;

const deleteConfirm = ref(false);
const linkDeleteConfirm = ref(false);

// Reset confirmation state when menu closes or item changes
watch(() => props.visible, () => {
    deleteConfirm.value = false;
    linkDeleteConfirm.value = false;
});

const emitAction = (action, payload) => {
    if (action === 'delete') {
        if (!deleteConfirm.value) {
            deleteConfirm.value = true;
            return;
        }
    }
    if (action === 'link-delete') {
        if (!linkDeleteConfirm.value) {
            linkDeleteConfirm.value = true;
            return;
        }
    }
    emit('action', action, payload);
};
</script>

<style scoped>
.context-menu {
    position: fixed;
    background: white;
    border: 1px solid #000;
    /* Outlined as requested */
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border-radius: 6px;
    z-index: 2000;
    min-width: 180px;
    overflow: hidden;
    font-family: sans-serif;
    font-size: 0.9rem;
}

.menu-header {
    background: #f8f9fa;
    padding: 8px 12px;
    border-bottom: 1px solid #eee;
    font-weight: bold;
    color: #555;
    display: flex;
    align-items: center;
    gap: 8px;
}

.menu-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 150px;
}

button {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 8px 12px;
    cursor: pointer;
    color: #333;
    transition: background 0.1s;
}

button:hover {
    background: #f0f0f0;
}

.danger-text {
    color: #dc3545;
}

.danger-text:hover {
    background: #fff5f5;
}

hr {
    margin: 4px 0;
    border: 0;
    border-top: 1px solid #eee;
}

.back-btn {
    width: auto;
    padding: 0 4px;
    font-size: 1.1rem;
    color: #666;
}

.color-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
    padding: 8px;
}

.color-swatch {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid rgba(0, 0, 0, 0.1);
}

.color-swatch:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* Force Dark Mode if parent has it, or handle via global class */
:global(.dark-mode) .context-menu {
    background: #23252B;
    border: 1px solid #444;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    color: #E6E8EB;
}

/* Dark Mode */
:global(.dark-mode) .context-menu {
    background: #23252B;
    border-color: #444;
    color: #E6E8EB;
}

:global(.dark-mode) .menu-header {
    background: #2E3138;
    border-bottom-color: #444;
    color: #E6E8EB;
}

:global(.dark-mode) button {
    color: #E6E8EB;
}

:global(.dark-mode) button:hover {
    background: #3E4148;
}

:global(.dark-mode) hr {
    border-top-color: #444;
}
</style>
