<template>
  <div class="legend">
    <h4>Legende</h4>
    <ul>
      <li><span class="icon-valid">✔</span> Valid</li>
      <li><span class="icon-incomplete">⚠️</span> Incomplete</li>
      <li><span class="icon-error">❌</span> Methodological Error</li>
    </ul>
  </div>
</template>

<style scoped>
.legend {
  position: absolute;
  bottom: 30px;
  right: 30px;
  border: 1px solid #ccc;
  background: rgba(255, 255, 255, 0.9);
  padding: 10px 15px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  font-size: 0.9rem;
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

.legend .icon-valid {
  color: #28a745;
}

.legend .icon-incomplete {
  color: #ffc107;
}

.legend .icon-error {
  color: #dc3545;
}

/* Dark Mode Support */
:global(.dark-mode) .legend {
  background: rgba(35, 37, 43, 0.95);
  border-color: #555;
  color: #E6E8EB;
}
</style>
