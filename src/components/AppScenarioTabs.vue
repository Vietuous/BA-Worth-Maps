<template>
    <div class="scenario-tabs">
        <div v-for="scenario in scenarios" :key="scenario.id" class="tab"
            :class="{ active: currentScenarioId === scenario.id }" @click="$emit('switch', scenario.id)"
            @contextmenu.prevent="openContextMenu($event, scenario)">
            <input v-if="editingId === scenario.id" ref="editInput" v-model="editName" @blur="finishEditing(scenario)"
                @keyup.enter="finishEditing(scenario)" @keyup.escape="cancelEditing" class="tab-edit-input" />
            <span v-else>{{ scenario.name }}</span>


        </div>
        <button class="add-tab-btn" @click="$emit('add')" title="Neues Szenario">+</button>

        <!-- Scenario Context Menu -->
        <Teleport to="body">
            <div v-if="menu.visible" class="context-menu" :style="menuStyle" @click.stop>
                <button @click="triggerRename(menu.id)">✏️ Rename</button>
                <button @click="$emit('clone', menu.id); closeMenu()">📑 Duplicate</button>
                <hr />
                <button @click="$emit('delete', menu.id); closeMenu()" class="danger-text">🗑️ Delete</button>
            </div>
        </Teleport>
    </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUpdate, onMounted, onUnmounted, ref } from 'vue';


const props = defineProps({
    scenarios: {
        type: Array,
        required: true
    },
    currentScenarioId: {
        type: [Number, String],
        required: true
    }
});

const emit = defineEmits(['switch', 'add', 'delete', 'rename', 'clone', 'update-name']);

const editingId = ref(null);
const editName = ref('');
const editInput = ref([]);

onBeforeUpdate(() => {
    editInput.value = [];
});

const startEditing = (scenario) => {
    editingId.value = scenario.id;
    editName.value = scenario.name;
    nextTick(() => {
        if (editInput.value && editInput.value[0]) {
            editInput.value[0].focus();
            editInput.value[0].select();
        }
    });
};

const finishEditing = (scenario) => {
    if (editingId.value === scenario.id) {
        if (editName.value.trim()) {
            emit('update-name', { id: scenario.id, name: editName.value });
        }
        // Always exit edit mode, even if name was empty (cancel)
        editingId.value = null;
    }
};

const cancelEditing = () => {
    editingId.value = null;
};

const menu = ref({ visible: false, x: 0, y: 0, id: null });

const openContextMenu = (event, scenario) => {
    menu.value = {
        visible: true,
        x: event.clientX,
        y: event.clientY, // We'll use this to calculate bottom position
        id: scenario.id
    };
};

const menuStyle = computed(() => {
    if (!menu.value.visible) return {};
    // Prevent menu from going off-screen
    const x = Math.min(menu.value.x, window.innerWidth - 160); // 160px approx width
    const y = menu.value.y;
    // If close to bottom, show above
    if (y > window.innerHeight - 150) {
        return { left: `${x}px`, bottom: `${window.innerHeight - y}px` };
    }
    return { left: `${x}px`, top: `${y}px` };
});

const triggerRename = (id) => {
    const scenario = props.scenarios.find(s => s.id === id);
    if (scenario) {
        startEditing(scenario);
    }
    closeMenu();
};

const closeMenu = () => {
    menu.value.visible = false;
};

const handleGlobalClick = () => {
    if (menu.value.visible) closeMenu();
};

onMounted(() => {
    window.addEventListener('click', handleGlobalClick);
});

onUnmounted(() => {
    window.removeEventListener('click', handleGlobalClick);
});
</script>

<style scoped>
.scenario-tabs {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    background: #e6e6e6;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 10px 0 10px;
    border-top: 1px solid #ccc;
    z-index: 2000;
    /* Higher than tutorial overlay (15) and toolbars (90) */
}

.tab {
    padding: 6px 12px;
    background: #d9d9d9;
    border: 1px solid #ccc;
    border-bottom: none;
    border-radius: 4px 4px 0 0;
    font-size: 0.85rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    color: #444;
    margin-bottom: 0;
}

.tab.active {
    background: #fff;
    color: #2c3e50;
    font-weight: 600;
    border-top: 3px solid #42b983;
    padding-bottom: 8px;
}

.tab-actions {
    display: flex;
    align-items: center;
    gap: 6px;
}

.tab-edit-input {
    border: none;
    background: transparent;
    font-size: inherit;
    font-family: inherit;
    color: inherit;
    width: 80px;
    outline: none;
    border-bottom: 1px solid #42b983;
}

.close-tab {
    font-size: 1rem;
    line-height: 0.8;
    opacity: 0.6;
}

.close-tab:hover {
    opacity: 1;
}

.clone-tab {
    font-size: 0.9rem;
    opacity: 0.6;
    line-height: 1;
}

.clone-tab:hover {
    opacity: 1;
}

.add-tab-btn {
    padding: 2px 8px;
    font-size: 1rem;
    background: transparent;
    border: 1px dashed #ccc;
    color: #999;
}

.add-tab-btn:hover {
    border-color: #666;
    color: #666;
    background: transparent;
}

/* Context Menu Styles (Scoped) */
.context-menu {
    position: fixed;
    background: white;
    border: 1px solid #ccc;
    box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
    padding: 5px 0;
    border-radius: 4px;
    z-index: 1000;
    min-width: 150px;
}

.context-menu button {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 8px 15px;
    color: #333;
    /* Explicit color for light mode readability */
    cursor: pointer;
}

.context-menu button:hover {
    background: #f0f0f0;
}

.context-menu hr {
    margin: 5px 0;
    border: 0;
    border-top: 1px solid #eee;
}

.danger-text {
    color: #dc3545 !important;
}

/* Dark Mode Support */
:global(.dark-mode) .scenario-tabs {
    background-color: #181A1F;
    border-top-color: #2E3138;
}

:global(.dark-mode) .tab {
    background-color: #2E3138;
    border-color: #2E3138;
    color: #9DA3AE;
}

:global(.dark-mode) .tab.active {
    background-color: #1E1F23;
    color: #E6E8EB;
    border-top-color: #42b983;
}

:global(.dark-mode) .context-menu {
    background-color: #23252B;
    box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.5);
    border-color: #444;
    color: #E6E8EB;
}

:global(.dark-mode) .context-menu button {
    color: #E6E8EB !important;
    /* White/Gray for readability */
}

:global(.dark-mode) .context-menu button:hover {
    background-color: #3E4148;
}
</style>