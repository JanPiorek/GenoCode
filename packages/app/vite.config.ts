import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { creatureFiles } from "./creatures.js";
import { docs } from "./docs.js";
import { sitemap, type SiteFile } from "./site.js";

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
 * `app/blockly-media/` and copied there in the build, so nothing is fetched from elsewhere.
 */
function blocklyMedia(): Plugin {
  const require = createRequire(import.meta.url);
  const media = join(dirname(require.resolve("blockly")), "media");
  return {
    name: "blockly-media",
    configureServer(server) {
      server.middlewares.use("/app/blockly-media", (req, res, next) => {
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
          fileName: `app/blockly-media/${name}`,
          source: readFileSync(join(media, name)),
        });
      }
    },
  };
}

/** The website's own pages around the app (see site.ts): every one, and the sitemap. */
function siteFiles(): SiteFile[] {
  const files = [...docs(), ...creatureFiles()];
  const pages = files.filter((f) => f.path.endsWith(".html")).map((f) => f.path);
  return [...files, { path: "sitemap.xml", type: "application/xml", make: () => sitemap(pages) }];
}

/**
 * Cloudflare Web Analytics: counts visits to every page, without cookies. Only the build gets it,
 * so visits while developing aren't counted.
 */
const ANALYTICS = `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "248bb111f7a845ab8bd85e4bf5506cb1"}'></script>`;

/** Adds ANALYTICS to an HTML page's head. */
const withAnalytics = (html: string) => html.replace("</head>", `${ANALYTICS}\n</head>`);

/** Puts the analytics script in the front page and the app when they're built. */
function analytics(): Plugin {
  return { name: "analytics", apply: "build", transformIndexHtml: withAnalytics };
}

/** Serves the website's pages while developing, and writes them out in the build. */
function site(): Plugin {
  return {
    name: "site",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let path = decodeURIComponent((req.url ?? "/").split("?")[0]!).replace(/^\//, "");
        // Folders' pages link to the others relative to the folder, so they need their slash.
        if (path === "docs" || path === "creatures") {
          res.statusCode = 301;
          res.setHeader("Location", `/${path}/`);
          res.end();
          return;
        }
        if (path === "" || path.endsWith("/")) path += "index.html";
        // The front page and the app are Vite's own.
        if (path === "index.html" || path.startsWith("app/")) return next();
        const file = siteFiles().find((f) => f.path === path);
        if (!file) return next();
        res.setHeader("Content-Type", file.type);
        res.end(file.make());
      });
    },
    generateBundle() {
      for (const f of siteFiles()) {
        const source = f.path.endsWith(".html") ? withAnalytics(f.make() as string) : f.make();
        this.emitFile({ type: "asset", fileName: f.path, source });
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [blocklyMedia(), site(), analytics()],
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
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    // The libraries' copyright notices, which the minified code no longer carries.
    license: { fileName: "licenses.txt" },
    // The front page, and the app itself at app/.
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL("index.html", import.meta.url)),
        app: fileURLToPath(new URL("app/index.html", import.meta.url)),
      },
    },
  },
});
