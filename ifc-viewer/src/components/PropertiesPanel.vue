<template>
  <div class="properties-panel" :class="{ collapsed }">
    <div class="properties-toggle" @click="collapsed = !collapsed">
      <i class="fas fa-info-circle"></i>
      <span>Properties</span>
    </div>
    <div class="properties-content">
      <div v-if="!selectedElement" class="no-selection">
        No element selected
      </div>
      <template v-else>
        <div class="properties-group">
          <h3>Basic Properties</h3>
          <div class="property-item">
            <div class="property-label">Type</div>
            <div class="property-value">{{ selectedElement.type }}</div>
          </div>
          <div v-if="selectedElement.name" class="property-item">
            <div class="property-label">Name</div>
            <div class="property-value">{{ selectedElement.name }}</div>
          </div>
          <div class="property-item">
            <div class="property-label">Express ID</div>
            <div class="property-value">{{ selectedElement.expressID }}</div>
          </div>
        </div>

        <div v-if="selectedElement.properties" class="properties-group">
          <h3>IFC Properties</h3>
          <div
            v-for="(value, key) in filteredProperties"
            :key="key"
            class="property-item"
          >
            <div class="property-label">{{ formatKey(key) }}</div>
            <div class="property-value">{{ formatValue(value) }}</div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType, ref, computed } from "vue";
import type { IFCElement } from "@/types/ifc";

export default defineComponent({
  name: "PropertiesPanel",
  props: {
    selectedElement: {
      type: Object as PropType<IFCElement>,
      default: null,
    },
  },
  setup() {
    const collapsed = ref(false);

    const filteredProperties = computed(() => {
      if (!props.selectedElement?.properties) return {};

      return Object.entries(props.selectedElement.properties)
        .filter(([key]) => !key.startsWith("_") && key !== "type")
        .reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {} as Record<string, any>);
    });

    function formatKey(key: string): string {
      return key
        .replace(/([A-Z])/g, " $1")
        .trim()
        .replace(/^./, (str) => str.toUpperCase());
    }

    function formatValue(value: any): string {
      if (value === null || value === undefined) return "-";
      if (typeof value === "object" && value.value !== undefined) {
        return value.value.toString();
      }
      return value.toString();
    }

    return {
      collapsed,
      filteredProperties,
      formatKey,
      formatValue,
    };
  },
});
</script>

<style scoped>
.properties-panel {
  position: fixed;
  right: 1rem;
  top: 5rem;
  width: 300px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 100;
  transition: transform 0.3s ease;
}

.properties-panel.collapsed {
  transform: translateX(290px);
}

.properties-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
}

.properties-content {
  max-height: calc(100vh - 8rem);
  overflow-y: auto;
  padding: 1rem;
}

.no-selection {
  text-align: center;
  color: #6c757d;
  padding: 1rem;
}

.properties-group {
  margin-bottom: 1.5rem;
}

.properties-group:last-child {
  margin-bottom: 0;
}

.properties-group h3 {
  font-size: 1rem;
  font-weight: 500;
  margin: 0 0 1rem 0;
  color: #495057;
}

.property-item {
  display: flex;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.property-item:last-child {
  margin-bottom: 0;
}

.property-label {
  flex: 1;
  color: #6c757d;
  padding-right: 1rem;
}

.property-value {
  flex: 2;
  color: #212529;
  word-break: break-word;
}
</style>
