// Copies the language definition, the starter creatures, the dance styles and the pattern kinds written in
// GenoCode into this package, so that they ship with it: tools in other repositories read them through
// @genocode/core.

import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const out = new URL("../reference/", import.meta.url);

rmSync(out, { recursive: true, force: true });
cpSync(new URL("docs/LANGUAGE.md", root), new URL("LANGUAGE.md", out));
for (const folder of ["creatures", "dances", "patterns"]) {
  mkdirSync(new URL(`${folder}/`, out), { recursive: true });
  for (const f of readdirSync(new URL(`${folder}/`, root)).filter((f) => f.endsWith(".genie"))) {
    cpSync(new URL(`${folder}/${f}`, root), new URL(`${folder}/${f}`, out));
  }
}
