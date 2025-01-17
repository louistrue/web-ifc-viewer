<template>
  <div class="settings-panel">
    <div class="settings-header">
      <i class="fas fa-cog"></i>
      <span>View Settings</span>
    </div>
    <div class="settings-content">
      <div class="setting-item">
        <label>
          <input type="checkbox" v-model="showGrid" />
          Show Grid
        </label>
      </div>
      <div class="setting-item">
        <label>
          <input type="checkbox" v-model="showAxes" />
          Show Axes
        </label>
      </div>
      <div class="setting-item">
        <label>
          <input type="checkbox" v-model="enableShadows" />
          Enable Shadows
        </label>
      </div>
      <div class="setting-item">
        <label>
          Opacity
          <input
            type="range"
            v-model="opacity"
            min="0"
            max="100"
            step="1"
            class="opacity-slider"
          />
          {{ opacity }}%
        </label>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, watch } from "vue";

export default defineComponent({
  name: "ViewerToolbar",
  emits: ["update:settings"],
  setup(_, { emit }) {
    const showGrid = ref(false);
    const showAxes = ref(false);
    const enableShadows = ref(false);
    const opacity = ref(100);

    watch([showGrid, showAxes, enableShadows, opacity], () => {
      emit("update:settings", {
        showGrid: showGrid.value,
        showAxes: showAxes.value,
        enableShadows: enableShadows.value,
        opacity: opacity.value / 100,
      });
    });

    return {
      showGrid,
      showAxes,
      enableShadows,
      opacity,
    };
  },
});
</script>

<style scoped>
.settings-panel {
  position: fixed;
  top: 1rem;
  right: 1rem;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  width: 250px;
  z-index: 100;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  border-radius: 8px 8px 0 0;
}

.settings-content {
  padding: 1rem;
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
  cursor: pointer;
}

.opacity-slider {
  flex: 1;
  margin: 0 0.5rem;
}

input[type="range"] {
  -webkit-appearance: none;
  width: 100%;
  height: 4px;
  background: #e9ecef;
  border-radius: 2px;
  outline: none;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: #3498db;
  border-radius: 50%;
  cursor: pointer;
}

input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #3498db;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}
</style>
