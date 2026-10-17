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
      "@genocode/music": src("music"),
      "@genocode/dance": src("dance"),
    },
  },
  server: { fs: { allow: [repo] } },
  // three.js alone is about 500 kB, and CodeMirror about 400 kB; the app is about 1.4 MB in all.
  build: { target: "es2022", outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
