<template>
  <div class="floating-menu">
    <button
      class="menu-btn"
      title="Hide/Show Selected (Space)"
      :disabled="!hasSelection"
      @click="$emit('toggle-visibility')"
    >
      <i class="fas fa-eye"></i>
    </button>
    <button
      class="menu-btn"
      title="Isolate Selected"
      :disabled="!hasSelection"
      @click="$emit('isolate')"
    >
      <i class="fas fa-expand"></i>
    </button>
    <button class="menu-btn" title="Show All" @click="$emit('show-all')">
      <i class="fas fa-border-all"></i>
    </button>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  name: "FloatingMenu",
  props: {
    hasSelection: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["toggle-visibility", "isolate", "show-all"],
});
</script>

<style scoped>
.floating-menu {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 100;
}

.menu-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  color: #6c757d;
  cursor: pointer;
  transition: all 0.2s;
}

.menu-btn:hover:not(:disabled) {
  background-color: #f8f9fa;
  color: #3498db;
  border-color: #3498db;
}

.menu-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
