<template>
  <div class="app">
    <IFCViewer />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import IFCViewer from "@/components/IFCViewer.vue";

export default defineComponent({
  name: "App",
  components: {
    IFCViewer,
  },
});
</script>

<style>
@import "@/assets/style.css";

.app {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
</style>
