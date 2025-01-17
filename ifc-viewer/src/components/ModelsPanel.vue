<template>
  <div class="models-panel" :class="{ collapsed }">
    <div class="models-toggle" @click="collapsed = !collapsed">
      <i class="fas fa-list"></i>
      <span>Models</span>
    </div>
    <div class="models-content">
      <div v-if="modelsList.length === 0" class="no-models">
        No models loaded
      </div>
      <div v-else id="models-list">
        <div
          v-for="model in modelsList"
          :key="model.id"
          class="model-item"
          :id="`model-${model.id}`"
        >
          <div class="model-header">
            <div class="model-name" :title="model.name">
              {{ model.name }}
            </div>
            <div class="model-controls">
              <button
                class="model-control-btn"
                :title="model.visible ? 'Hide Model' : 'Show Model'"
                @click="toggleModelVisibility(model.id)"
              >
                <i
                  :class="model.visible ? 'fas fa-eye' : 'fas fa-eye-slash'"
                ></i>
              </button>
              <button
                class="model-control-btn"
                title="Delete Model"
                @click="deleteModel(model.id)"
              >
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
          <div class="model-info">
            <div>Size: {{ formatDimensions(model.size) }}</div>
            <div>Center: {{ formatPosition(model.center) }}</div>
          </div>
          <div class="model-tree-section">
            <TreeView
              :items="getTreeForModel(model.id)"
              :selected-model-id="selectedModelID"
              :selected-express-id="selectedExpressID"
              :expanded-items="expandedItems"
              @select="handleTreeItemSelect"
              @toggle-expand="handleTreeItemExpand"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, ref, watch } from "vue";
import { Vector3, Box3 } from "three";
import type { IFCModel, TreeItem } from "@/types/ifc";
import TreeView from "./TreeView.vue";
import { useIFCTree } from "@/composables/useIFCTree";

interface ModelInfo {
  id: number;
  name: string;
  visible: boolean;
  size: Vector3;
  center: Vector3;
}

export default defineComponent({
  name: "ModelsPanel",
  components: {
    TreeView,
  },
  props: {
    models: {
      type: Map as () => Map<number, IFCModel>,
      required: true,
    },
  },
  emits: ["delete-model", "toggle-visibility", "select-element"],
  setup(props, { emit }) {
    const collapsed = ref(false);
    const selectedModelID = ref<number | null>(null);
    const selectedExpressID = ref<number | null>(null);
    const expandedItems = ref<Set<string>>(new Set());

    const { treeData, updateTreeForModel } = useIFCTree({
      onElementSelected: (modelID, expressID) => {
        emit("select-element", { modelID, expressID });
      },
    });

    const modelsList = computed<ModelInfo[]>(() => {
      return Array.from(props.models.entries()).map(([id, model]) => {
        const box = new Box3().setFromObject(model.object);
        const size = box.getSize(new Vector3());
        const center = box.getCenter(new Vector3());

        return {
          id,
          name: model.name,
          visible: model.visible,
          size,
          center,
        };
      });
    });

    function formatDimensions(vec: Vector3) {
      return `${vec.x.toFixed(2)} x ${vec.y.toFixed(2)} x ${vec.z.toFixed(2)}`;
    }

    function formatPosition(vec: Vector3) {
      return `(${vec.x.toFixed(2)}, ${vec.y.toFixed(2)}, ${vec.z.toFixed(2)})`;
    }

    function toggleModelVisibility(id: number) {
      emit("toggle-visibility", id);
    }

    function deleteModel(id: number) {
      emit("delete-model", id);
    }

    function getTreeForModel(id: number): TreeItem[] {
      return treeData.value.filter((item) => {
        const model = props.models.get(id);
        return model && item.modelID === model.modelID;
      });
    }

    function handleTreeItemSelect(item: TreeItem) {
      selectedModelID.value = item.modelID;
      selectedExpressID.value = item.expressID;
      emit("select-element", {
        modelID: item.modelID,
        expressID: item.expressID,
      });
    }

    function handleTreeItemExpand(item: TreeItem) {
      const key = `${item.modelID}-${item.expressID}`;
      if (expandedItems.value.has(key)) {
        expandedItems.value.delete(key);
      } else {
        expandedItems.value.add(key);
      }
    }

    // Watch for changes in models and update tree
    watch(
      () => props.models,
      async (newModels) => {
        for (const [_, model] of newModels.entries()) {
          if (model.modelID) {
            await updateTreeForModel(model.ifcAPI!, model.modelID);
          }
        }
      },
      { deep: true }
    );

    return {
      collapsed,
      modelsList,
      selectedModelID,
      selectedExpressID,
      expandedItems,
      formatDimensions,
      formatPosition,
      toggleModelVisibility,
      deleteModel,
      getTreeForModel,
      handleTreeItemSelect,
      handleTreeItemExpand,
    };
  },
});
</script>

<style scoped>
.models-panel {
  position: fixed;
  left: 1rem;
  top: 5rem;
  width: 300px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 100;
  transition: transform 0.3s ease;
}

.models-panel.collapsed {
  transform: translateX(-290px);
}

.models-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
}

.models-content {
  max-height: calc(100vh - 8rem);
  overflow-y: auto;
  padding: 1rem;
}

.no-models {
  text-align: center;
  color: #6c757d;
  padding: 1rem;
}

.model-item {
  margin-bottom: 1rem;
  padding: 0.5rem;
  border: 1px solid #e9ecef;
  border-radius: 4px;
}

.model-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.model-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-controls {
  display: flex;
  gap: 0.5rem;
}

.model-control-btn {
  background: none;
  border: none;
  padding: 0.25rem;
  cursor: pointer;
  color: #6c757d;
  transition: color 0.2s;
}

.model-control-btn:hover {
  color: #3498db;
}

.model-info {
  font-size: 0.9rem;
  color: #6c757d;
  margin-bottom: 0.5rem;
}

.model-tree-section {
  margin-top: 0.5rem;
  border-top: 1px solid #e9ecef;
  padding-top: 0.5rem;
}
</style>
