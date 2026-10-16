// The GenoCode app. View: open a .genie file and see the creature; files opened from disk are
// watched where the browser allows it (Chromium-based browsers), so saving in another editor
// updates the view. Breed: a grid of variations to mutate and breed. Morph: a loop blending
// creatures into one another. Save writes the creature with its gene values filled in.

import { check, writeGenes, type CheckResult, type Diagnostic } from "@genocode/core";
import { CreatureView } from "@genocode/render";
import { Breeder } from "./breed.js";
import { breedable, buildCreature, fromProgram, type Creature } from "./creature.js";
import { Morpher } from "./morph.js";
import { showGenes, showInfo, showProblems, showStatus } from "./panel.js";

// The starter creatures in the repository's creatures/ folder.
const examples = import.meta.glob("../../../creatures/*.genie", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("view");
const grid = $("grid");
const view = new CreatureView(canvas);
const exampleSelect = $<HTMLSelectElement>("examples");
const fileInput = $<HTMLInputElement>("file-input");
const watching = $("watching");

type Mode = "view" | "breed" | "morph";
let mode: Mode = "view";

/** The latest text, as checked, whether or not it has errors. */
let program: CheckResult | undefined;
/** The creature in the full view: the last version without errors, with its gene values. */
let current: Creature | undefined;
let started = performance.now();
let liveFrame = 0;
let watchTimer = 0;

// ---------- view ----------

/** Shows new text. Keeps showing the last good version while the text has errors. */
function show(text: string, keepView: boolean): void {
  program = check(text);
  // While a watched file is being edited, keep showing its last version without errors.
  if (breedable(program)) current = fromProgram(program);
  else if (!keepView) current = undefined;
  showInfo(program);
  started = performance.now();
  enableTools();
  if (mode === "breed" && current) breeder.start(current, strength());
  if (mode === "morph" && current) startMorph();
  if (mode === "view") showCurrent(keepView);
}

/** Shows the current creature in the full view. Creatures that read time are rebuilt every frame. */
function showCurrent(keepView: boolean): void {
  cancelAnimationFrame(liveFrame);
  if (!current) {
    view.setCreature([]);
    view.setBackground(undefined);
    showProblems(program!, program!.diagnostics);
    showGenes(program?.genes ?? [], new Map());
    showStatus("");
    return;
  }
  showGenes(current.program.genes, current.values);
  const c = current;
  const frame = (keep: boolean) => {
    const live = c.program.live || c.program.backgroundLive;
    const { built, background } = buildCreature(c, (performance.now() - started) / 1000);
    view.setCreature(built.shapes, keep);
    view.setBackground(background);
    report(built.diagnostics, built.shapes.length, live);
    if (live) liveFrame = requestAnimationFrame(() => frame(true));
  };
  frame(keepView);
}

/** Lists problems and says what's on show. */
function report(buildProblems: Diagnostic[], shapeCount: number, live: boolean): void {
  const latest = program!;
  const fresh = current?.program === latest;
  showProblems(latest, [...latest.diagnostics, ...(fresh ? buildProblems : [])]);
  const stale = current && !fresh ? " · showing the last version without errors" : "";
  const shapes = `${shapeCount} shape${shapeCount === 1 ? "" : "s"}`;
  showStatus(`${shapes} · ${live ? "moves with time" : "still"}${stale}`);
}

// ---------- modes ----------

const breeder = new Breeder(grid, {
  inspect(c) {
    showGenes(c.program.genes, c.values);
    enableTools();
  },
  open(c) {
    current = c;
    setMode("view");
  },
});

let lastPanel = 0;
const morpher = new Morpher(view, (f) => {
  if (performance.now() - lastPanel < 200) return;
  lastPanel = performance.now();
  showGenes(f.creature.program.genes, f.creature.values);
  $("morph-hint").textContent =
    `Creature ${f.index + 1} → ${((f.index + 1) % morpher.count) + 1} of ${morpher.count}`;
  showProblems(f.creature.program, f.problems);
});

function setMode(next: Mode): void {
  mode = next;
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    b.setAttribute("aria-pressed", String(b.dataset["mode"] === mode));
  }
  $("view-tools").hidden = mode !== "view";
  $("breed-tools").hidden = mode !== "breed";
  $("morph-tools").hidden = mode !== "morph";
  canvas.hidden = mode === "breed";
  grid.hidden = mode !== "breed";
  cancelAnimationFrame(liveFrame);
  morpher.stop();
  if (mode === "view") showCurrent(false);
  if (mode === "breed" && current) {
    if (!breeder.holds(current)) breeder.start(current, strength());
    else breeder.render();
    showGenes(current.program.genes, current.values);
  }
  if (mode === "morph") startMorph();
  enableTools();
}

/**
 * Morphs through the creatures chosen in the grid, or the whole grid, or variations of the current
 * one. The grid only counts while it holds the current creature: one opened since breeding starts
 * afresh.
 */
function startMorph(): void {
  if (!current) return;
  const ours = breeder.holds(current);
  let members = ours ? breeder.selection : [];
  if (members.length < 2 && ours) members = [...breeder.creatures];
  if (members.length < 2) {
    breeder.start(current, 0.5);
    members = breeder.creatures.slice(0, 6);
  }
  morpher.start(members);
}

function strength(): number {
  return Number($<HTMLInputElement>("strength").value);
}

function enableTools(): void {
  const ok = current !== undefined;
  for (const b of document.querySelectorAll<HTMLButtonElement>(
    "[data-mode=breed], [data-mode=morph]",
  )) {
    b.disabled = !ok;
  }
  $<HTMLButtonElement>("save").disabled = !ok;
  const chosen = breeder.selection.length;
  $<HTMLButtonElement>("mutate").disabled = chosen < 1;
  $<HTMLButtonElement>("breed").disabled = chosen < 2;
  $<HTMLButtonElement>("back").disabled = !breeder.canGoBack;
  $("breed-hint").textContent =
    chosen === 0
      ? "Click creatures to choose parents · double-click to open one"
      : `${chosen} parent${chosen === 1 ? "" : "s"} chosen`;
}

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
  b.addEventListener("click", () => setMode(b.dataset["mode"] as Mode));
}

$("mutate").addEventListener("click", () => {
  breeder.mutateSelection(strength(), keepParents());
  enableTools();
});
$("breed").addEventListener("click", () => {
  breeder.breedSelection(keepParents());
  enableTools();
});
$("back").addEventListener("click", () => {
  breeder.back();
  enableTools();
});
const keepParents = () => $<HTMLInputElement>("keep").checked;

$("play").addEventListener("click", () => {
  morpher.playing = !morpher.playing;
  $("play").textContent = morpher.playing ? "Pause" : "Play";
});
$<HTMLInputElement>("speed").addEventListener("input", (e) => {
  morpher.secondsEach = Number((e.target as HTMLInputElement).value);
});

// ---------- saving ----------

type SaveWindow = Window & {
  showSaveFilePicker?: (options: object) => Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  }>;
};

$("save").addEventListener("click", async () => {
  if (!current) return;
  const text = writeGenes(current.program, current.values);
  const name = `${current.program.file.name || "Creature"}.genie`;
  const picker = (window as SaveWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: name,
        types: [{ description: "GenoCode creatures", accept: { "text/plain": [".genie"] } }],
      });
      const out = await handle.createWritable();
      await out.write(text);
      await out.close();
    } catch {
      // The picker was closed.
    }
    return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
});

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
