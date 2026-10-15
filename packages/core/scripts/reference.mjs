// Copies the language definition and the starter creatures into this package, so that they ship
// with it: tools in other repositories (such as the agent) read them through @genocode/core.

import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const out = new URL("../reference/", import.meta.url);

rmSync(out, { recursive: true, force: true });
mkdirSync(new URL("creatures/", out), { recursive: true });
cpSync(new URL("docs/LANGUAGE.md", root), new URL("LANGUAGE.md", out));
for (const f of readdirSync(new URL("creatures/", root)).filter((f) => f.endsWith(".genie"))) {
  cpSync(new URL(`creatures/${f}`, root), new URL(`creatures/${f}`, out));
}
