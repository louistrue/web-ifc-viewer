<template>
  <div class="file-input">
    <input
      type="file"
      id="file-input"
      accept=".ifc"
      @change="handleFileChange"
      class="hidden"
    />
    <label for="file-input" class="file-input-label">
      <i class="fas fa-file-upload"></i>
      <span>Load IFC File</span>
    </label>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  name: "FileInput",
  emits: ["file-selected"],
  setup(_, { emit }) {
    const handleFileChange = (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (input.files && input.files[0]) {
        emit("file-selected", input.files[0]);
      }
    };

    return {
      handleFileChange,
    };
  },
});
</script>

<style scoped>
.file-input {
  position: fixed;
  top: 1rem;
  left: 1rem;
  z-index: 100;
}

.hidden {
  display: none;
}

.file-input-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background-color: #3498db;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.file-input-label:hover {
  background-color: #2980b9;
}

.file-input-label i {
  font-size: 1.2rem;
}
</style>
