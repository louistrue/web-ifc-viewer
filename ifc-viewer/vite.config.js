import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  server: {
    port: 3000,
    fs: {
      allow: [".."],
    },
  },
  optimizeDeps: {
    exclude: ["web-ifc"],
  },
  build: {
    commonjsOptions: {
      include: [/web-ifc-three/, /three/],
    },
  },
  resolve: {
    alias: {
      "web-ifc": resolve(__dirname, "node_modules/web-ifc"),
    },
  },
});
