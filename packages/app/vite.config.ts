import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const src = (name: string) => fileURLToPath(new URL(`../${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  base: "./",
  resolve: {
    // Use the other packages' sources directly, so changes show up without rebuilding them.
    alias: {
      "@genocode/core": src("core"),
      "@genocode/render": src("render"),
    },
  },
  server: { fs: { allow: [repo] } },
  // three.js alone is about 500 kB.
  build: { target: "es2022", outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 800 },
});
