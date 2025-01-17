import { defineConfig } from "vite";
import { resolve } from "path";
import fs from "fs";

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
  plugins: [
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
});
