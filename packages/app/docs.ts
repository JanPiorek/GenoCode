// The pages of the website made from the repository's documents: the getting-started guide, the
// language, the reference and the credits from Markdown, and GenoCode's licence as it is.

import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { Marked } from "marked";
import { shell, type SiteFile } from "./site.js";

const repo = new URL("../../", import.meta.url);

/** The pages: where each is published, the Markdown it's made from, and what search results say. */
const PAGES: { path: string; source: string; title: string; description: string }[] = [
  {
    path: "docs/index.html",
    source: "docs/GETTING_STARTED.md",
    title: "Getting started",
    description:
      "Build your first GenoCode creature step by step: a snowman made of code, then breed it, morph it and make it dance.",
  },
  {
    path: "docs/language.html",
    source: "docs/LANGUAGE.md",
    title: "The language",
    description:
      "How the GenoCode language works: shapes, the turtle, genes, variants, colours, patterns, backgrounds and dances.",
  },
  {
    path: "docs/reference.html",
    source: "docs/REFERENCE.md",
    title: "Reference",
    description:
      "Every GenoCode statement, function, input and constant: its syntax, parameters, what it returns, and an example.",
  },
  {
    path: "credits.html",
    source: "CREDITS.md",
    title: "Credits",
    description:
      "What GenoCode grew from: DancerDNA (1999), Fantastic Avian Creatures and other work in evolutionary art.",
  },
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

/** Markdown made into HTML for the page at `path`: links to the other documents go to their pages. */
function render(markdown: string, from: (typeof PAGES)[number]): string {
  const marked = new Marked({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        return `<h${depth} id="${slug(text)}">${text}</h${depth}>\n`;
      },
      link({ href, tokens }) {
        const [file, anchor] = href.split("#");
        const target = file && posix.join(posix.dirname(from.source), file);
        const page = PAGES.find((p) => p.source === target);
        const to = page
          ? posix.relative(posix.dirname(from.path), page.path) + (anchor ? `#${anchor}` : "")
          : href;
        return `<a href="${to}">${this.parser.parseInline(tokens)}</a>`;
      },
    },
  });
  return marked.parse(markdown) as string;
}

/** The documentation pages and the credits, in the website's colours, and the licence. */
export function docs(): SiteFile[] {
  const licence: SiteFile = {
    path: "license.txt",
    type: "text/plain; charset=utf-8",
    make: () => readFileSync(new URL("LICENSE", repo), "utf8"),
  };
  const pages = PAGES.map((p) => ({
    path: p.path,
    type: "text/html; charset=utf-8",
    make: () =>
      shell({
        path: p.path,
        title: `${p.title} · GenoCode`,
        description: p.description,
        body: render(readFileSync(new URL(p.source, repo), "utf8"), p),
      }),
  }));
  return [...pages, licence];
}
