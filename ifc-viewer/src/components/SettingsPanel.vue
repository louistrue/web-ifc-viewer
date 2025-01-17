<template>
  <div class="settings-panel" :class="{ collapsed }">
    <div class="settings-toggle" @click="collapsed = !collapsed">
      <i class="fas fa-cog"></i>
      <span>Settings</span>
    </div>
    <div class="settings-content">
      <div class="settings-group">
        <h3>Display</h3>
        <div class="setting-item">
          <label>
            <input
              type="checkbox"
              v-model="showGrid"
              @change="$emit('toggle-grid')"
            />
            Show Grid
          </label>
        </div>
        <div class="setting-item">
          <label>
            <input
              type="checkbox"
              v-model="showAxes"
              @change="$emit('toggle-axes')"
            />
            Show Axes
          </label>
        </div>
        <div class="setting-item">
          <label>
            <input
              type="checkbox"
              v-model="shadows"
              @change="$emit('toggle-shadows')"
            />
            Enable Shadows
          </label>
        </div>
      </div>
      <div class="settings-group">
        <h3>Model</h3>
        <div class="setting-item">
          <label>
            Opacity
            <input
              type="range"
              min="0"
              max="100"
              v-model="opacity"
              @input="$emit('update-opacity', Number(opacity) / 100)"
            />
            {{ opacity }}%
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from "vue";

export default defineComponent({
  name: "SettingsPanel",
  emits: ["toggle-grid", "toggle-axes", "toggle-shadows", "update-opacity"],
  setup() {
    const collapsed = ref(false);
    const showGrid = ref(true);
    const showAxes = ref(true);
    const shadows = ref(true);
    const opacity = ref(100);

    return {
      collapsed,
      showGrid,
      showAxes,
      shadows,
      opacity,
    };
  },
});
</script>

<style scoped>
.settings-panel {
  position: fixed;
  left: 1rem;
  bottom: 1rem;
  width: 300px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 100;
  transition: transform 0.3s ease;
}

.settings-panel.collapsed {
  transform: translateX(-290px);
}

.settings-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
}

.settings-content {
  padding: 1rem;
}

.settings-group {
  margin-bottom: 1.5rem;
}

.settings-group:last-child {
  margin-bottom: 0;
}

.settings-group h3 {
  font-size: 1rem;
  font-weight: 500;
  margin: 0 0 1rem 0;
  color: #495057;
}

.setting-item {
  margin-bottom: 0.75rem;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-item label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #6c757d;
  cursor: pointer;
}

.setting-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.setting-item input[type="range"] {
  flex: 1;
  margin: 0 0.5rem;
}
</style>
