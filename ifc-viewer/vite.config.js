import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "url";
import { resolve } from "path";
import fs from "fs";

export default defineConfig({
  plugins: [
    vue(),
    {
      name: "copy-wasm",
      buildStart() {
        const wasmPath = resolve(
          __dirname,
          "node_modules/web-ifc/web-ifc.wasm"
        );
        const destPath = resolve(__dirname, "public/web-ifc.wasm");
        if (!fs.existsSync("public")) {
          fs.mkdirSync("public");
        }
        fs.copyFileSync(wasmPath, destPath);
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "web-ifc": resolve(__dirname, "node_modules/web-ifc"),
    },
  },
  optimizeDeps: {
    exclude: ["web-ifc"],
  },
  build: {
    commonjsOptions: {
      include: [/web-ifc/, /three/],
    },
  },
});
