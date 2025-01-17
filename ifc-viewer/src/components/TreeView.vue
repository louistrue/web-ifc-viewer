<template>
  <div class="tree-view">
    <div
      v-for="item in items"
      :key="`${item.modelID}-${item.expressID}`"
      class="tree-item"
    >
      <div
        class="tree-item-header"
        :class="{ selected: isSelected(item) }"
        :data-model-id="item.modelID"
        :data-express-id="item.expressID"
        @click="handleClick($event, item)"
      >
        <div
          v-if="item.children && item.children.length > 0"
          class="tree-item-toggle"
          @click.stop="toggleExpand(item)"
        >
          <i
            class="fas"
            :class="isExpanded(item) ? 'fa-chevron-down' : 'fa-chevron-right'"
          ></i>
        </div>
        <div v-else class="tree-item-toggle-placeholder"></div>
        <div class="tree-item-icon">
          <i :class="item.icon"></i>
        </div>
        <div class="tree-item-label" :title="item.label">
          {{ item.label }}
        </div>
      </div>
      <div
        v-if="item.children && item.children.length > 0"
        class="tree-item-children"
        :class="{ expanded: isExpanded(item) }"
      >
        <TreeView
          :items="item.children"
          :selected-model-id="selectedModelID"
          :selected-express-id="selectedExpressID"
          :expanded-items="expandedItems"
          @select="$emit('select', $event)"
          @toggle-expand="$emit('toggle-expand', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import type { TreeItem } from "@/types/ifc";

export default defineComponent({
  name: "TreeView",
  props: {
    items: {
      type: Array as PropType<TreeItem[]>,
      required: true,
    },
    selectedModelID: {
      type: Number,
      default: null,
    },
    selectedExpressID: {
      type: Number,
      default: null,
    },
    expandedItems: {
      type: Set as PropType<Set<string>>,
      required: true,
    },
  },
  emits: ["select", "toggle-expand"],
  setup(props, { emit }) {
    function isSelected(item: TreeItem): boolean {
      return (
        item.modelID === props.selectedModelID &&
        item.expressID === props.selectedExpressID
      );
    }

    function isExpanded(item: TreeItem): boolean {
      return props.expandedItems.has(`${item.modelID}-${item.expressID}`);
    }

    function handleClick(event: MouseEvent, item: TreeItem) {
      if (
        !event.target ||
        !(event.target as Element).closest(".tree-item-toggle")
      ) {
        emit("select", item);
      }
    }

    function toggleExpand(item: TreeItem) {
      emit("toggle-expand", item);
    }

    return {
      isSelected,
      isExpanded,
      handleClick,
      toggleExpand,
    };
  },
});
</script>

<style scoped>
.tree-view {
  font-size: 0.9rem;
  user-select: none;
}

.tree-item {
  margin: 0.25rem 0;
}

.tree-item-header {
  display: flex;
  align-items: center;
  padding: 0.25rem;
  border-radius: 4px;
  cursor: pointer;
}

.tree-item-header:hover {
  background-color: #f8f9fa;
}

.tree-item-header.selected {
  background-color: #e3f2fd;
  color: #1976d2;
}

.tree-item-toggle,
.tree-item-toggle-placeholder {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 0.25rem;
}

.tree-item-toggle {
  cursor: pointer;
}

.tree-item-icon {
  width: 20px;
  margin-right: 0.5rem;
  text-align: center;
}

.tree-item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-item-children {
  margin-left: 1.5rem;
  display: none;
}

.tree-item-children.expanded {
  display: block;
}
</style>
