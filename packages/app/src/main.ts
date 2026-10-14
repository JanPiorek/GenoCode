// The GenoCode viewer: open a .genie file and see the creature. Files opened from disk are watched
// where the browser allows it (Chromium-based browsers), so saving in another editor updates the view.

import {
  build,
  buildBackground,
  check,
  formatValue,
  toRgb,
  type CheckResult,
  type Diagnostic,
  type GeneInfo,
  type Value,
} from "@genocode/core";
import { CreatureView } from "@genocode/render";

// The starter creatures in the repository's creatures/ folder.
const examples = import.meta.glob("../../../creatures/*.genie", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const view = new CreatureView($<HTMLCanvasElement>("view"));
const exampleSelect = $<HTMLSelectElement>("examples");
const fileInput = $<HTMLInputElement>("file-input");
const watching = $("watching");

let program: CheckResult | undefined;
let lastGood: CheckResult | undefined;
let started = performance.now();
let liveFrame = 0;
let watchTimer = 0;

// ---------- showing a creature ----------

function show(text: string, keepView: boolean): void {
  program = check(text);
  if (program.ok && program.file.kind === "creature") lastGood = program;
  showInfo(program);
  cancelAnimationFrame(liveFrame);
  if (lastGood === undefined) {
    view.setCreature([]);
    view.setBackground(undefined);
    showProblems([], 0, false);
    return;
  }
  started = performance.now();
  draw(lastGood, keepView);
}

/** Builds and shows a creature. Creatures that read time are rebuilt every frame (music stays 0 for now). */
function draw(p: CheckResult, keepView: boolean): void {
  const live = p.live || p.backgroundLive;
  const inputs = live ? { time: (performance.now() - started) / 1000 } : {};
  const built = build(p, { inputs });
  view.setCreature(built.shapes, keepView);
  view.setBackground(buildBackground(p, { inputs }).fill);
  showProblems(built.diagnostics, built.shapes.length, live);
  if (live) liveFrame = requestAnimationFrame(() => draw(p, true));
}

// ---------- the side panel ----------

function lineCol(p: CheckResult, d: Diagnostic): string {
  const at = p.lines.position(d.span.start);
  return `${at.line}:${at.column}`;
}

function problemItem(p: CheckResult, d: Diagnostic): HTMLLIElement {
  const li = document.createElement("li");
  li.className = d.severity;
  const where = document.createElement("span");
  where.className = "where";
  where.textContent = lineCol(p, d);
  li.append(where, d.message);
  return li;
}

function showInfo(p: CheckResult): void {
  const file = p.file;
  $("name").textContent = file.name || "Untitled";
  $("description").textContent = file.description
    .map((c) => c.text.replace(/^\/\/\s?/, ""))
    .join(" ");
  showGenes(p.genes);
}

/** Lists the problems in the latest text, and in building what's on show. */
function showProblems(buildProblems: Diagnostic[], shapeCount: number, live: boolean): void {
  const latest = program!;
  const current = latest === lastGood;
  const all = [...latest.diagnostics, ...(current ? buildProblems : [])];
  $("problems").replaceChildren(...all.map((d) => problemItem(latest, d)));
  $("problems-section").hidden = all.length === 0;
  const stale =
    lastGood !== undefined && !current ? " · showing the last version without errors" : "";
  const shapes = `${shapeCount} shape${shapeCount === 1 ? "" : "s"}`;
  $("status").textContent = `${shapes} · ${live ? "moves with time" : "still"}${stale}`;
}

function swatch(v: Value): HTMLElement | string {
  if (typeof v !== "object" || v.type !== "colour") return "";
  const [r, g, b] = toRgb(v);
  const s = document.createElement("span");
  s.className = "swatch";
  s.style.background = `rgb(${r * 255} ${g * 255} ${b * 255})`;
  return s;
}

function rangeText(g: GeneInfo): string {
  if (g.options) return `one of ${g.options.map(formatValue).join(", ")}`;
  if (g.kind === "bool") return "true or false";
  if (g.kind === "colour")
    return g.hue?.whole ? "any hue" : `hues ${g.hue!.start}° + ${g.hue!.length}°`;
  if (g.min === undefined || g.max === undefined) return "";
  let text = `${formatValue(g.min)} to ${formatValue(g.max)}`;
  if (g.step !== undefined) text += `, steps of ${g.step}`;
  if (g.log) text += ", by ratios";
  return text;
}

function showGenes(genes: GeneInfo[]): void {
  const table = $("genes");
  table.replaceChildren(
    ...genes.map((g) => {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      name.className = "gene-name";
      name.textContent = g.fullName;
      const about = document.createElement("div");
      about.className = "gene-about";
      about.textContent = [g.description, rangeText(g)].filter(Boolean).join(" · ");
      name.append(about);
      const value = document.createElement("td");
      value.className = "gene-value";
      value.append(swatch(g.value), g.kind === "colour" ? "" : formatValue(g.value));
      row.append(name, value);
      return row;
    }),
  );
  $("no-genes").hidden = genes.length > 0;
}

// ---------- opening files ----------

interface FileHandleLike {
  name: string;
  getFile(): Promise<File>;
}

function stopWatching(): void {
  clearInterval(watchTimer);
  watching.hidden = true;
}

/** Shows a file, and keeps checking it for changes while it's open. */
async function openHandle(handle: FileHandleLike): Promise<void> {
  stopWatching();
  let file = await handle.getFile();
  show(await file.text(), false);
  let modified = file.lastModified;
  watching.textContent = `Watching ${handle.name} for changes`;
  watching.hidden = false;
  watchTimer = window.setInterval(async () => {
    try {
      file = await handle.getFile();
      if (file.lastModified !== modified) {
        modified = file.lastModified;
        show(await file.text(), true);
      }
    } catch {
      stopWatching();
    }
  }, 750);
}

async function openFile(file: File): Promise<void> {
  stopWatching();
  show(await file.text(), false);
}

type PickerWindow = Window & {
  showOpenFilePicker?: (options: object) => Promise<FileHandleLike[]>;
};

$("open").addEventListener("click", async () => {
  const picker = (window as PickerWindow).showOpenFilePicker;
  if (picker) {
    try {
      const [handle] = await picker({
        types: [{ description: "GenoCode creatures", accept: { "text/plain": [".genie"] } }],
      });
      if (handle) await openHandle(handle);
    } catch {
      // The picker was closed.
    }
  } else {
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void openFile(file);
  fileInput.value = "";
});

const drop = $("drop");
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.hidden = false;
});
window.addEventListener("dragleave", (e) => {
  if (e.relatedTarget === null) drop.hidden = true;
});
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  drop.hidden = true;
  const item = e.dataTransfer?.items[0] as
    (DataTransferItem & { getAsFileSystemHandle?: () => Promise<unknown> }) | undefined;
  const handle = await item?.getAsFileSystemHandle?.();
  if (handle && (handle as { kind?: string }).kind === "file")
    return openHandle(handle as FileHandleLike);
  const file = e.dataTransfer?.files[0];
  if (file) await openFile(file);
});

$("reset").addEventListener("click", () => view.resetView());

// ---------- examples ----------

const names = Object.keys(examples)
  .map((path) =>
    path
      .split("/")
      .pop()!
      .replace(/\.genie$/, ""),
  )
  .sort();
exampleSelect.replaceChildren(
  ...names.map((n) => {
    const option = document.createElement("option");
    option.value = n;
    option.textContent = n;
    return option;
  }),
);

function showExample(name: string): void {
  const path = Object.keys(examples).find((p) => p.endsWith(`/${name}.genie`));
  if (!path) return;
  stopWatching();
  exampleSelect.value = name;
  show(examples[path]!, false);
  const url = new URL(location.href);
  url.searchParams.set("example", name);
  history.replaceState(null, "", url);
}

exampleSelect.addEventListener("change", () => showExample(exampleSelect.value));

const requested = new URL(location.href).searchParams.get("example");
showExample(requested && names.includes(requested) ? requested : (names[0] ?? ""));
