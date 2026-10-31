// The pages of the website made from the repository's documents: the getting-started guide, the
// language, the reference and the credits from Markdown, and GenoCode's licence as it is.

import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { Marked } from "marked";
import { shell, type SiteFile } from "./site.js";
import { withTree, type Heading } from "./tree.js";

const repo = new URL("../../", import.meta.url);

/** The pages: where each is published, the Markdown it's made from, and what search results say. */
const PAGES: {
  path: string;
  source: string;
  title: string;
  description: string;
  /** For a long page, the name of the tree of its sections at its side. */
  tree?: string;
}[] = [
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
    tree: "Reference",
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

/**
 * Markdown made into HTML for the page at `path`: links to the other documents go to their pages.
 * The headings come too, for the tree of a long page.
 */
function render(
  markdown: string,
  from: (typeof PAGES)[number],
): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const marked = new Marked({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        headings.push({ depth, text, id: slug(text) });
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
  return { html: marked.parse(markdown) as string, headings };
}

/** A page's body, with the tree at its side in place of the document's own list of contents. */
function page(p: (typeof PAGES)[number]): { head?: string; body: string } {
  const markdown = readFileSync(new URL(p.source, repo), "utf8");
  if (!p.tree) return { body: render(markdown, p).html };
  const { html, headings } = render(markdown.replace(/^## Contents\n[\s\S]*?(?=^## )/m, ""), p);
  return withTree(html, headings, p.tree);
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
        ...page(p),
        wide: Boolean(p.tree),
      }),
  }));
  return [...pages, licence];
}
