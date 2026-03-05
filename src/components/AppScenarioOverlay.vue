<template>
    <Transition name="slide-down">
        <div v-if="activeScenario" class="scenario-overlay" :class="{ collapsed: isCollapsed }">
            <div class="scenario-card">
                <div class="card-header">
                    <span class="header-title">Study Tasks</span>
                    <div class="header-controls">
                        <button class="icon-btn" @click="isCollapsed = !isCollapsed">{{ isCollapsed ? 'Show' : '_'
                            }}</button>
                        <button class="icon-btn" @click="$emit('close')">×</button>
                    </div>
                </div>

                <div v-show="!isCollapsed" class="card-content">
                    <h4>Task {{ activeScenario?.id }}: {{ activeScenario?.title }}</h4>
                    <p class="scenario-description">{{ activeScenario?.description }}</p>
                    <div class="scenario-actions">
                        <button class="primary-btn" @click="$emit('next')">Next Task</button>
                        <button class="secondary-btn" @click="$emit('end')">End Scenario</button>
                    </div>
                </div>
            </div>
        </div>
    </Transition>
</template>

<script setup>
defineProps({
    activeScenario: Object
});

defineEmits(['next', 'end', 'close']);

import { ref } from 'vue';
const isCollapsed = ref(false);
</script>

<style scoped>
.scenario-overlay {
    position: absolute;
    top: 80px;
    left: 20px;
    z-index: 100;
    width: 350px;
    /* Fixed width */
    max-width: 90vw;
    transition: all 0.3s ease;
}

.scenario-overlay.collapsed {
    width: auto;
    min-width: 150px;
}

.scenario-card {
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
    border: 1px solid #e0e0e0;
    overflow: hidden;
}

.card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: #f8f9fa;
    border-bottom: 1px solid #eee;
}

.header-title {
    font-weight: bold;
    font-size: 0.9rem;
}

.icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.1rem;
    padding: 0 5px;
    color: #666;
}

.card-content {
    padding: 15px 20px;
    border-left: 5px solid #42b983;
    max-height: 60vh;
    /* Limit height */
    overflow-y: auto;
    /* Enable scrolling */
}

.scenario-description {
    white-space: pre-wrap;
    /* Preserve newlines for bullet points */
    line-height: 1.5;
}

.scenario-actions {
    margin-top: 15px;
    display: flex;
    gap: 10px;
    justify-content: flex-end;
}

h4 {
    margin-top: 0;
    margin-bottom: 10px;
}

button {
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    border: none;
}

.primary-btn {
    background-color: #42b983;
    color: white;
}

.secondary-btn {
    background-color: #e0e0e0;
    color: #333;
}

.slide-down-enter-active,
.slide-down-leave-active {
    transition: all 0.3s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
    transform: translate(-50%, -20px);
    opacity: 0;
}

/* Dark Mode Support */
:global(.dark-mode) .scenario-card {
    background: #23252B;
    border-color: #30363D;
    color: #E6E8EB;
}

:global(.dark-mode) .card-header {
    background-color: #21262D;
    border-bottom-color: #30363D;
}


:global(.dark-mode) .secondary-btn {
    background-color: #3E4148;
    color: #E6E8EB;
}

:global(.dark-mode) .secondary-btn:hover {
    background-color: #4E5158;
}
</style>