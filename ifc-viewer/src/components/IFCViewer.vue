<template>
  <div class="viewer-container" ref="container">
    <LoadingOverlay v-if="loading" />
    <FileInput @file-selected="loadIFC" />
    <ViewerToolbar />
    <ModelsPanel
      :models="models"
      @delete-model="deleteModel"
      @toggle-visibility="toggleModelVisibility"
      @select-element="selectElement"
    />
    <PropertiesPanel :selected-element="selectedElement" />
    <SettingsPanel
      @toggle-grid="toggleGrid"
      @toggle-axes="toggleAxes"
      @toggle-shadows="toggleShadows"
      @update-opacity="updateOpacity"
    />
    <FloatingMenu
      :has-selection="!!selectedElement"
      @toggle-visibility="toggleSelectedVisibility"
      @isolate="isolateSelected"
      @show-all="showAll"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted } from "vue";
import { useIFCViewer } from "@/composables/useIFCViewer";
import LoadingOverlay from "./LoadingOverlay.vue";
import FileInput from "./FileInput.vue";
import ViewerToolbar from "./ViewerToolbar.vue";
import ModelsPanel from "./ModelsPanel.vue";
import PropertiesPanel from "./PropertiesPanel.vue";
import SettingsPanel from "./SettingsPanel.vue";
import FloatingMenu from "./FloatingMenu.vue";
import type { IFCElement } from "@/types/ifc";

export default defineComponent({
  name: "IFCViewer",
  components: {
    LoadingOverlay,
    FileInput,
    ViewerToolbar,
    ModelsPanel,
    PropertiesPanel,
    SettingsPanel,
    FloatingMenu,
  },
  setup() {
    const container = ref<HTMLElement | null>(null);
    const loading = ref(false);
    const selectedElement = ref<IFCElement | null>(null);

    const {
      models,
      initViewer,
      loadIFC,
      dispose,
      selectedObject,
      toggleSelectedVisibility,
      isolateSelected,
      showAll,
      grid,
      axes,
      toggleGrid,
      toggleAxes,
      toggleShadows,
      updateOpacity,
    } = useIFCViewer({
      onLoadingStart: () => (loading.value = true),
      onLoadingEnd: () => (loading.value = false),
      onElementSelected: (element) => (selectedElement.value = element),
    });

    onMounted(async () => {
      if (container.value) {
        await initViewer(container.value);
      }
    });

    onUnmounted(() => {
      dispose();
    });

    function deleteModel(id: number) {
      const model = models.value.get(id);
      if (model) {
        // Clear selection if it belongs to this model
        if (
          selectedObject.value &&
          selectedObject.value.modelID === model.modelID
        ) {
          selectedElement.value = null;
        }
        models.value.delete(id);
      }
    }

    function toggleModelVisibility(id: number) {
      const model = models.value.get(id);
      if (model) {
        model.visible = !model.visible;
        model.object.visible = model.visible;
      }
    }

    function selectElement(data: { modelID: number; expressID: number }) {
      const model = Array.from(models.value.values()).find(
        (m) => m.modelID === data.modelID
      );
      if (model) {
        model.object.traverse((child) => {
          if (
            child.name === `Element_${data.expressID}` &&
            child.parent === model.object
          ) {
            // Highlight the element
            child.traverse((mesh: any) => {
              if (mesh.isMesh) {
                if (!mesh.originalMaterial) {
                  mesh.originalMaterial = mesh.material;
                }
                mesh.material = selectedObject.value?.material;
              }
            });
          }
        });
      }
    }

    return {
      container,
      loading,
      models,
      selectedElement,
      loadIFC,
      deleteModel,
      toggleModelVisibility,
      selectElement,
      toggleSelectedVisibility,
      isolateSelected,
      showAll,
      toggleGrid,
      toggleAxes,
      toggleShadows,
      updateOpacity,
    };
  },
});
</script>

<style scoped>
.viewer-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background-color: #f0f0f0;
}

.viewer-container canvas {
  width: 100% !important;
  height: 100% !important;
  outline: none;
}
</style>
