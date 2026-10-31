// The tree of a long document page, at its side: each section, opening onto its entries, with a
// search box to find one. It follows the page as it scrolls, and on a narrow screen it's a list the
// reader opens with a button.

import { escape } from "./site.js";

/** A heading of the document: its level (2 for a section, 3 for an entry), its text as HTML and its anchor. */
export interface Heading {
  depth: number;
  text: string;
  id: string;
}

/** The key under which the browser remembers whether the reader hid the tree on a wide screen. */
const KEY = "genocode.tree";

/**
 * The tree's look: beside the page on a wide screen, above it on a narrow one. The two are kept
 * apart: `closed` is the wide screen's choice (remembered), `open` the narrow screen's (not), so the
 * tree shows as it should before any script has run, and a change on one doesn't upset the other.
 */
const STYLE = `<style>
.doc > article { min-width: 0; }
.tree { display: flex; flex-direction: column; font-size: 0.95em; }
.tree-top { display: flex; gap: 6px; align-items: center; padding-right: 8px; }
.tree input { flex: 1; min-width: 0; font: inherit; color: var(--text); background: var(--panel);
  border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; }
.tree input:focus { outline: 2px solid #6bc8f2; outline-offset: -1px; }
.tree button, .tree-show { font: inherit; color: var(--muted); background: none; border: 0;
  border-radius: 6px; padding: 4px 8px; cursor: pointer; }
.tree button:hover, .tree-show:hover { color: var(--text); background: #1b2133; }
.tree-show { display: none; white-space: nowrap; border: 1px solid var(--line); }
.tree-list { overflow-y: auto; margin: 10px 0 0; padding: 0 8px 0 0; flex: 1; }
.tree ul { list-style: none; margin: 0; padding: 0; }
.tree ul ul { padding-left: 22px; }
.tree-row { display: flex; align-items: center; }
.tree-row a { flex: 1; }
.tree a { display: block; color: var(--text); text-decoration: none; padding: 3px 8px;
  border-radius: 6px; overflow-wrap: anywhere; }
.tree a:hover { background: #1b2133; }
.tree a[aria-current] { color: var(--accent); background: #1b2133; }
.tree ul ul a { color: var(--muted); }
.tree ul ul a:hover, .tree ul ul a[aria-current] { color: var(--accent); }
.tree .tree-toggle { flex: none; width: 20px; height: 26px; padding: 0; display: grid;
  place-items: center; }
.tree-toggle::before { content: ""; width: 6px; height: 6px; border: solid currentColor;
  border-width: 0 1.5px 1.5px 0; transform: rotate(-45deg); transition: transform 0.15s; }
.tree-toggle[aria-expanded="true"]::before, .searching .tree-toggle::before { transform: rotate(45deg); }
/* While searching, every section with a match shows its matches, whether it was open or not. */
.searching ul[hidden] { display: block; }
.tree li.leaf > a { margin-left: 20px; }
.tree-none { color: var(--muted); padding: 4px 8px; }
@media (min-width: 900px) {
  .doc { display: grid; grid-template-columns: 270px minmax(0, 1fr); gap: 32px; align-items: start; }
  .doc.closed { grid-template-columns: auto minmax(0, 1fr); }
  .doc.closed .tree { display: none; }
  .doc.closed .tree-show { display: block; position: sticky; top: calc(var(--bar, 61px) + 12px);
    margin-top: 16px; }
  /* The top bar stays, and the tree and headings sit below it. */
  header { position: sticky; top: 0; z-index: 10; }
  .tree { position: sticky; top: var(--bar, 61px); height: calc(100vh - var(--bar, 61px));
    padding: 16px 0 8px; }
  .doc h1, .doc h2, .doc h3 { scroll-margin-top: calc(var(--bar, 61px) + 12px); }
}
@media (max-width: 899px) {
  .doc:not(.open) .tree { display: none; }
  .doc:not(.open) .tree-show { display: inline-block; margin-top: 12px; }
  .tree { max-height: 70vh; margin: 12px 0; padding: 12px; background: var(--panel);
    border: 1px solid var(--line); border-radius: 8px; }
}
@media (prefers-reduced-motion: reduce) { .tree-toggle::before { transition: none; } }
</style>`;

/** Hides the tree before it's drawn, if the reader hid it last time, so it doesn't show and vanish. */
const EARLY = `<script>try { if (localStorage.getItem("${KEY}") === "hidden") document.currentScript.parentElement.classList.add("closed"); } catch {}</script>`;

/** What makes the tree work: opening, searching, following the page, hiding and showing. */
const SCRIPT = `<script>
(() => {
  const doc = document.querySelector(".doc");
  const tree = doc.querySelector(".tree");
  const list = tree.querySelector(".tree-list");
  const search = tree.querySelector("input");
  const none = tree.querySelector(".tree-none");
  const narrow = matchMedia("(max-width: 899px)");

  // How tall the top bar is, for what sits below it.
  const bar = document.querySelector("header");
  const barHeight = () => (narrow.matches ? 0 : bar.offsetHeight);
  const measure = () => document.documentElement.style.setProperty("--bar", bar.offsetHeight + "px");
  new ResizeObserver(measure).observe(bar);
  measure();

  // Each heading of the page with its link in the tree, in the page's order.
  const marks = [...list.querySelectorAll("a")]
    .map((a) => ({ a, h: document.getElementById(a.getAttribute("href").slice(1)) }))
    .filter((m) => m.h);

  // The sections: each opened and closed with its arrow. One the page opened as the reader got to
  // it is marked "auto", and closes again when they move on; one the reader opened stays open.
  const groups = [...list.querySelectorAll(".tree-group")].map((li) => ({
    li,
    toggle: li.querySelector(".tree-toggle"),
    link: li.querySelector(".tree-row a"),
    entries: li.querySelector("ul"),
    auto: false,
  }));
  const setOpen = (g, open) => {
    g.toggle.setAttribute("aria-expanded", String(open));
    g.entries.hidden = !open;
  };
  const isOpen = (g) => !g.entries.hidden;
  const groupOf = (a) => groups.find((g) => g.li.contains(a));
  for (const g of groups) {
    g.toggle.addEventListener("click", () => {
      g.auto = false;
      setOpen(g, !isOpen(g));
    });
  }

  // Hiding and showing: on a wide screen, remembered; on a narrow one, closed after going somewhere.
  const show = (open) => {
    if (narrow.matches) {
      doc.classList.toggle("open", open);
    } else {
      doc.classList.toggle("closed", !open);
      try { localStorage.setItem("${KEY}", open ? "shown" : "hidden"); } catch {}
    }
  };
  doc.querySelector(".tree-show").addEventListener("click", () => {
    show(true);
    if (narrow.matches) search.focus();
  });
  tree.querySelector(".tree-hide").addEventListener("click", () => show(false));

  // A section's name goes to the section and opens it.
  list.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    const g = groups.find((g) => g.link === a);
    if (g && !isOpen(g)) {
      g.auto = false;
      setOpen(g, true);
    }
    if (narrow.matches) doc.classList.remove("open");
  });
  const go = (a) => {
    if (location.hash === a.hash) document.getElementById(a.getAttribute("href").slice(1)).scrollIntoView();
    else location.hash = a.hash;
    if (narrow.matches) doc.classList.remove("open");
  };

  // Search: only the entries whose names have the words in them, and sections whose names do with
  // all their entries. Opening and closing is left as it was, so clearing the search puts it back.
  let first = null;
  const filter = () => {
    const words = search.value.toLowerCase().split(/\\s+/).filter(Boolean);
    const has = (el) => words.every((w) => el.textContent.toLowerCase().includes(w));
    const searching = words.length > 0;
    list.classList.toggle("searching", searching);
    first = null;
    let any = false;
    for (const li of list.children) {
      const g = groups.find((g) => g.li === li);
      if (!g) {
        li.hidden = searching && !has(li);
        if (searching && !li.hidden) first ??= li.querySelector("a");
      } else {
        const whole = searching && has(g.link);
        if (whole) first ??= g.link;
        let found = 0;
        for (const e of g.entries.children) {
          e.hidden = searching && !whole && !has(e);
          if (searching && !whole && !e.hidden) first ??= e.querySelector("a");
          if (!e.hidden) found++;
        }
        li.hidden = searching && !whole && found === 0;
      }
      if (!li.hidden) any = true;
    }
    none.hidden = any;
    if (!searching) follow(true);
  };
  search.addEventListener("input", filter);
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      search.value = "";
      filter();
    } else if (e.key === "Enter" && first) {
      go(first);
    }
  });

  // Following the page: the heading being read is marked, and its section opened. Headings are in
  // order down the page, so the last one above the reading line is found by halving.
  let current = null;
  let opened = null;
  const follow = (force) => {
    const line = barHeight() + 24;
    let lo = 0;
    let hi = marks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (marks[mid].h.getBoundingClientRect().top <= line) lo = mid;
      else hi = mid - 1;
    }
    const a = marks[lo]?.a;
    if (!a || (a === current && !force)) return;
    current?.removeAttribute("aria-current");
    a.setAttribute("aria-current", "true");
    current = a;
    if (search.value.trim()) return;
    const g = groupOf(a);
    if (g !== opened && opened?.auto) {
      setOpen(opened, false);
      opened.auto = false;
    }
    if (g && !isOpen(g)) {
      setOpen(g, true);
      g.auto = true;
    }
    opened = g;
    const top = a.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + a.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top - list.clientHeight / 3;
    }
  };
  let waiting = false;
  addEventListener("scroll", () => {
    if (waiting) return;
    waiting = true;
    requestAnimationFrame(() => {
      waiting = false;
      follow(false);
    });
  }, { passive: true });
  follow(true);
})();
</script>`;

/** The page's body with the tree of its headings beside it, and what the tree needs in the head. */
export function withTree(
  body: string,
  headings: Heading[],
  label: string,
): {
  head: string;
  body: string;
} {
  const items: string[] = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]!;
    if (h.depth !== 2) continue;
    const link = `<a href="#${h.id}">${h.text}</a>`;
    const entries: string[] = [];
    for (let j = i + 1; j < headings.length && headings[j]!.depth !== 2; j++) {
      const e = headings[j]!;
      if (e.depth === 3) entries.push(`<li><a href="#${e.id}">${e.text}</a></li>`);
    }
    // The arrow is a button of its own beside the link, so neither is inside the other.
    const name = h.text.replace(/<[^>]+>/g, "");
    items.push(
      entries.length
        ? `<li class="tree-group"><div class="tree-row"><button class="tree-toggle" type="button" aria-expanded="false" aria-controls="tree-${h.id}" aria-label="Entries of ${name}"></button>${link}</div><ul id="tree-${h.id}" hidden>\n${entries.join("\n")}\n</ul></li>`
        : `<li class="leaf">${link}</li>`,
    );
  }
  const tree = `<nav class="tree" aria-label="${escape(label)}">
<div class="tree-top"><input type="search" placeholder="Search" aria-label="Search the ${escape(label.toLowerCase())}" autocomplete="off" spellcheck="false"><button class="tree-hide" type="button" title="Hide the contents" aria-label="Hide the contents">«</button></div>
<ul class="tree-list">
${items.join("\n")}
</ul>
<p class="tree-none" hidden>Nothing has that name.</p>
</nav>`;
  return {
    head: STYLE,
    body: `<div class="doc">
${EARLY}
${tree}
<button class="tree-show" type="button" title="Show the contents">» Contents</button>
<article>
${body}
</article>
</div>
${SCRIPT}`,
  };
}
