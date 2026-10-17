// The documentation pages of the website: the getting-started guide and the language reference,
// made from the Markdown in docs/ when the app is built (and on request while developing).

import { readFileSync } from "node:fs";
import { Marked } from "marked";

const docs = new URL("../../docs/", import.meta.url);

/** The pages: where each is published, and the Markdown it's made from. */
export const PAGES: { file: string; source: string; title: string }[] = [
  { file: "index.html", source: "GETTING_STARTED.md", title: "Getting started" },
  { file: "language.html", source: "LANGUAGE.md", title: "The language" },
];

/** A heading's anchor, as GitHub makes them, so the documents' own links keep working. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

const marked = new Marked({
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      return `<h${depth} id="${slug(text)}">${text}</h${depth}>\n`;
    },
    link({ href, tokens }) {
      const page = PAGES.find((p) => href.split("#")[0] === p.source);
      const to = page ? href.replace(page.source, page.file) : href;
      return `<a href="${to}">${this.parser.parseInline(tokens)}</a>`;
    },
  },
});

const STYLE = `
:root { color-scheme: dark; --bg: #0b0e17; --panel: #121725; --line: #222a3d; --text: #dfe5f2;
  --muted: #8a93a8; --accent: #f06bc0; font: 16px/1.6 system-ui, sans-serif; }
body { margin: 0; background: var(--bg); color: var(--text); }
header { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; padding: 10px 16px;
  border-bottom: 1px solid var(--line); background: var(--panel); }
header a { color: var(--text); text-decoration: none; }
header a[aria-current] { color: var(--accent); }
.brand { display: flex; gap: 8px; align-items: center; font-weight: 700; margin-right: 8px; }
main { max-width: 820px; margin: 0 auto; padding: 8px 16px 64px; }
a { color: #6bc8f2; }
code { font-family: ui-monospace, monospace; font-size: 0.92em; color: #f2a66b; }
pre { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px;
  overflow-x: auto; }
pre code { color: var(--text); }
table { border-collapse: collapse; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; vertical-align: top; }
h1, h2, h3 { line-height: 1.25; }
h2 { border-bottom: 1px solid var(--line); padding-bottom: 4px; margin-top: 2em; }
`;

/** A documentation page, in the app's colours, with links to the others and to the app. */
export function page(file: string): string | undefined {
  const p = PAGES.find((x) => x.file === file);
  if (!p) return undefined;
  const body = marked.parse(readFileSync(new URL(p.source, docs), "utf8")) as string;
  const nav = PAGES.map(
    (x) => `<a href="${x.file}"${x === p ? ' aria-current="page"' : ""}>${x.title}</a>`,
  ).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.title} · GenoCode</title>
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<style>${STYLE}</style>
</head>
<body>
<header>
<a class="brand" href="../"><img src="../favicon.svg" alt="" width="24" height="24">GenoCode</a>
${nav}
<a href="../">Open the app</a>
</header>
<main>
${body}
</main>
</body>
</html>
`;
}
