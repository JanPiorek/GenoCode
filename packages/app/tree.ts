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

/** The tree's look: beside the page on a wide screen, above it on a narrow one. */
const STYLE = `<style>
.doc { display: grid; grid-template-columns: 270px minmax(0, 1fr); gap: 32px; align-items: start; }
.doc.closed { grid-template-columns: auto minmax(0, 1fr); }
.doc > article { min-width: 0; }
.tree { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column;
  padding: 16px 0 8px; font-size: 0.95em; }
.doc.closed .tree { display: none; }
.tree-top { display: flex; gap: 6px; align-items: center; padding-right: 8px; }
.tree input { flex: 1; min-width: 0; font: inherit; color: var(--text); background: var(--panel);
  border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; }
.tree input:focus { outline: 2px solid #6bc8f2; outline-offset: -1px; }
.tree button, .tree-show { font: inherit; color: var(--muted); background: none; border: 0;
  border-radius: 6px; padding: 4px 8px; cursor: pointer; }
.tree button:hover, .tree-show:hover { color: var(--text); background: #1b2133; }
.tree-show { display: none; position: sticky; top: 12px; margin-top: 16px; white-space: nowrap;
  border: 1px solid var(--line); }
.doc.closed .tree-show { display: block; }
.tree-list { overflow-y: auto; margin: 10px 0 0; padding: 0 8px 0 0; flex: 1; }
.tree ul { list-style: none; margin: 0; padding: 0; }
.tree ul ul { padding-left: 22px; }
.tree a { display: block; color: var(--text); text-decoration: none; padding: 3px 8px;
  border-radius: 6px; overflow-wrap: anywhere; }
.tree a:hover { background: #1b2133; }
.tree a[aria-current] { color: var(--accent); background: #1b2133; }
.tree ul ul a { color: var(--muted); }
.tree ul ul a:hover, .tree ul ul a[aria-current] { color: var(--accent); }
.tree summary { display: flex; align-items: center; cursor: pointer; list-style: none; }
.tree summary::-webkit-details-marker { display: none; }
.tree summary::before { content: ""; flex: none; width: 6px; height: 6px; margin: 0 8px 0 6px;
  border: solid var(--muted); border-width: 0 1.5px 1.5px 0; transform: rotate(-45deg);
  transition: transform 0.15s; }
.tree details[open] > summary::before { transform: rotate(45deg); }
.tree summary a { flex: 1; }
.tree li.leaf > a { margin-left: 20px; }
.tree-none { color: var(--muted); padding: 4px 8px; }
@media (max-width: 899px) {
  .doc, .doc.closed { display: block; }
  .tree { position: static; height: auto; max-height: 70vh; margin: 12px 0; padding: 12px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
  .doc.closed .tree-show { display: inline-block; position: static; }
}
@media (prefers-reduced-motion: reduce) { .tree summary::before { transition: none; } }
</style>`;

/** What makes the tree work: opening, searching, following the page, hiding and showing. */
const SCRIPT = `<script>
(() => {
  const doc = document.querySelector(".doc");
  const tree = doc.querySelector(".tree");
  const list = tree.querySelector(".tree-list");
  const search = tree.querySelector("input");
  const none = tree.querySelector(".tree-none");
  const narrow = matchMedia("(max-width: 899px)");
  const links = [...list.querySelectorAll("a")];
  const groups = [...list.querySelectorAll("details")];
  const headings = links
    .map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))))
    .filter(Boolean);

  // Open or closed: closed at first on a narrow screen; on a wide one, as the reader left it.
  let hidden = false;
  try { hidden = localStorage.getItem("genocode.tree") === "hidden"; } catch {}
  const show = (open, remember) => {
    doc.classList.toggle("closed", !open);
    if (remember && !narrow.matches) {
      try { localStorage.setItem("genocode.tree", open ? "shown" : "hidden"); } catch {}
    }
  };
  show(!narrow.matches && !hidden, false);
  narrow.addEventListener("change", () => show(!narrow.matches && !hidden, false));
  doc.querySelector(".tree-show").addEventListener("click", () => {
    hidden = false;
    show(true, true);
    if (narrow.matches) search.focus();
  });
  tree.querySelector(".tree-hide").addEventListener("click", () => {
    hidden = true;
    show(false, true);
  });

  // A section's name goes to the section and opens it; the arrow beside it opens and closes it.
  for (const d of groups) {
    d.querySelector("summary a").addEventListener("click", (e) => {
      e.preventDefault();
      d.open = true;
      go(e.currentTarget);
    });
  }
  const go = (a) => {
    location.hash = a.hash;
    if (narrow.matches) show(false, false);
  };
  for (const a of list.querySelectorAll("li > a")) {
    a.addEventListener("click", () => narrow.matches && show(false, false));
  }

  // Search: only the entries whose names have the words in them, with their sections opened.
  const filter = () => {
    const words = search.value.toLowerCase().split(/\\s+/).filter(Boolean);
    const has = (el) => words.every((w) => el.textContent.toLowerCase().includes(w));
    let any = false;
    for (const li of list.children) {
      const d = li.querySelector("details");
      if (!d) {
        li.hidden = words.length > 0 && !has(li);
      } else {
        const whole = words.length > 0 && has(d.querySelector("summary"));
        let found = 0;
        for (const e of d.querySelectorAll("ul li")) {
          e.hidden = words.length > 0 && !whole && !has(e);
          if (!e.hidden) found++;
        }
        li.hidden = words.length > 0 && !whole && found === 0;
        if (words.length) d.open = !li.hidden;
      }
      if (!li.hidden) any = true;
    }
    none.hidden = any;
    if (!words.length) follow(true);
  };
  search.addEventListener("input", filter);
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      search.value = "";
      filter();
    } else if (e.key === "Enter") {
      const first = links.find((a) => a.offsetParent && !a.closest("summary"))
        ?? links.find((a) => a.offsetParent);
      if (first) go(first);
    }
  });

  // Following the page: the heading being read is marked, and its section opened.
  let current = null;
  let opened = null;
  const follow = (force) => {
    let at = headings[0];
    for (const h of headings) {
      if (h.getBoundingClientRect().top > 90) break;
      at = h;
    }
    const a = at && links.find((l) => l.hash.slice(1) === encodeURIComponent(at.id));
    if (!a || (a === current && !force)) return;
    current?.removeAttribute("aria-current");
    a.setAttribute("aria-current", "true");
    current = a;
    if (search.value) return;
    const d = a.closest("details");
    if (d !== opened && opened?.dataset.auto) {
      opened.open = false;
      delete opened.dataset.auto;
    }
    if (d && !d.open) {
      d.open = true;
      d.dataset.auto = "1";
    }
    opened = d;
    const top = a.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + a.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top - list.clientHeight / 3;
    }
  };
  // A section the reader opens or closes stays as they left it.
  for (const d of groups) {
    d.querySelector("summary").addEventListener("click", () => delete d.dataset.auto);
  }
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
    items.push(
      entries.length
        ? `<li><details><summary>${link}</summary><ul>\n${entries.join("\n")}\n</ul></details></li>`
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
${tree}
<button class="tree-show" type="button" title="Show the contents">» Contents</button>
<article>
${body}
</article>
</div>
${SCRIPT}`,
  };
}
