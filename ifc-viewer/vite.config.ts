import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "url";
import { resolve } from "path";
import fs from "fs";

// Copy web-ifc.wasm to public directory
const wasmPath = resolve(__dirname, "node_modules/web-ifc/web-ifc.wasm");
const destPath = resolve(__dirname, "public/web-ifc.wasm");
if (!fs.existsSync("public")) {
  fs.mkdirSync("public");
}
if (fs.existsSync(wasmPath)) {
  fs.copyFileSync(wasmPath, destPath);
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ["web-ifc"],
    include: ["three"],
  },
  build: {
    target: "esnext",
    commonjsOptions: {
      include: [/web-ifc/, /three/],
    },
  },
});
