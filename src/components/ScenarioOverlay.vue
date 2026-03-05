<template>
  <div class="scenario-overlay">
    <div class="scenario-card">
      <h4>Aufgabe {{ scenario.id }}: {{ scenario.title }}</h4>
      <p>{{ scenario.description }}</p>
      <div class="scenario-actions">
        <button @click="$emit('next')">Nächste Aufgabe</button>
        <button @click="$emit('end')" class="secondary">Beenden</button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  scenario: Object,
});

defineEmits(["next", "end"]);
</script>

<style scoped>
.scenario-overlay {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  width: 80%;
  max-width: 600px;
}
.scenario-card {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-left: 5px solid #42b983;
}
.scenario-actions {
  margin-top: 15px;
  display: flex;
  gap: 10px;
}
</style>
