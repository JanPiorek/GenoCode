import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { page, PAGES, sitemap } from "./docs.js";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const src = (name: string) => fileURLToPath(new URL(`../${name}/src/index.ts`, import.meta.url));

/** The kinds of file in Blockly's media folder, so browsers will show them (an SVG needs this). */
const TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
  ".cur": "image/x-icon",
  ".mp3": "audio/mpeg",
};

/**
 * Blockly's own pictures and cursors (dropdown arrows and the like), served from its package at
 * `blockly-media/` and copied there in the build, so nothing is fetched from elsewhere.
 */
function blocklyMedia(): Plugin {
  const require = createRequire(import.meta.url);
  const media = join(dirname(require.resolve("blockly")), "media");
  return {
    name: "blockly-media",
    configureServer(server) {
      server.middlewares.use("/blockly-media", (req, res, next) => {
        const file = join(media, decodeURIComponent((req.url ?? "").split("?")[0]!));
        if (!file.startsWith(media)) return next();
        try {
          const body = readFileSync(file);
          res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
          res.end(body);
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      for (const name of readdirSync(media)) {
        this.emitFile({
          type: "asset",
          fileName: `blockly-media/${name}`,
          source: readFileSync(join(media, name)),
        });
      }
    },
  };
}

/** The documentation pages, made from docs/ (see docs.ts), served at `docs/`, and the sitemap. */
function documentation(): Plugin {
  return {
    name: "documentation",
    configureServer(server) {
      server.middlewares.use("/docs", (req, res, next) => {
        // Pages link to the app and each other relative to docs/, so it needs its slash.
        if (req.originalUrl === "/docs") {
          res.statusCode = 301;
          res.setHeader("Location", "/docs/");
          res.end();
          return;
        }
        const html = page((req.url ?? "/").split("?")[0]!.replace(/^\//, "") || "index.html");
        if (!html) return next();
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(html);
      });
    },
    generateBundle() {
      for (const p of PAGES) {
        this.emitFile({ type: "asset", fileName: `docs/${p.file}`, source: page(p.file)! });
      }
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap() });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [blocklyMedia(), documentation()],
  resolve: {
    // Use the other packages' sources directly, so changes show up without rebuilding them.
    alias: {
      // Just the pattern drawing, for the web worker, without three.js.
      "@genocode/render/patterns": fileURLToPath(
        new URL("../render/src/patterns.ts", import.meta.url),
      ),
      "@genocode/core": src("core"),
      "@genocode/render": src("render"),
      "@genocode/controls": src("controls"),
      "@genocode/music": src("music"),
      "@genocode/dance": src("dance"),
      "@genocode/blocks": src("blocks"),
    },
  },
  server: { fs: { allow: [repo] } },
  // three.js alone is about 500 kB, CodeMirror about 400 kB and Blockly about 800 kB.
  build: { target: "es2022", outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 2500 },
});
