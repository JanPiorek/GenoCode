// The GenoCode app. View: write a creature's code and see it beside the code, rebuilt as you type,
// with a control for each gene and sliders for time and music. Breed: a grid of variations to
// mutate and breed. Morph: a loop blending creatures into one another. Creatures come from the
// examples, from files (watched for changes where the browser allows it), or from those saved in
// this browser.

import { geneEdits, type CheckResult, type Diagnostic, type Value } from "@genocode/core";
import { CreatureView } from "@genocode/render";
import { Breeder } from "./breed.js";
import type { GeneEditing } from "./controls.js";
import {
  breedable,
  buildCreature,
  checkText,
  familyOf,
  fromProgram,
  type Creature,
} from "./creature.js";
import { CodeEditor } from "./editor.js";
import { InputControls } from "./inputs.js";
import { deleteCreature, saveCreature, savedNames, savedText } from "./library.js";
import { Morpher } from "./morph.js";
import { showGenes, showInfo, showProblems, showStatus } from "./panel.js";

// The starter creatures in the repository's creatures/ folder.
const examples = import.meta.glob("../../../creatures/*.genie", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const NEW_CREATURE = `creature New_Creature
// What it is, in a line or two.

gene size = 1 in 0.5..2  // how big it is

shape ball
grow size
lay
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("view");
const grid = $("grid");
const codeSection = $("code");
const view = new CreatureView(canvas);
const creatureSelect = $<HTMLSelectElement>("creatures");
const fileInput = $<HTMLInputElement>("file-input");
const watching = $("watching");

type Mode = "view" | "breed" | "morph";
let mode: Mode = "view";

/** Where the code came from: an example, a creature saved in this browser, or elsewhere. */
type Source = { kind: "example" | "mine"; name: string } | { kind: "other" };
let source: Source = { kind: "other" };
/** The text as last opened or saved, to tell whether there are changes to lose. */
let savedAs = "";

/** The latest text, as checked, whether or not it has errors. */
let program: CheckResult | undefined;
/** The creature in the full view: the last version without errors, with its gene values. */
let current: Creature | undefined;
let liveFrame = 0;
let watchTimer = 0;

const editor = new CodeEditor(codeSection, (text) => {
  // Typed here, so the browser has the latest version now, not the file on disk.
  stopWatching();
  show(text, true);
});
const inputs = new InputControls($("inputs-section"), () => {
  if (mode === "view" && !inputs.running) showCurrent(true, false);
});

// ---------- view ----------

/** Shows new text. Keeps showing the last good version while the text has errors. */
function show(text: string, keepView: boolean, carried?: ReadonlyMap<string, Value>): void {
  program = checkText(text);
  if (breedable(program)) {
    current = fromProgram(program);
    // Genes without a line in the code, such as `seed`, keep the values they came with.
    for (const g of program.genes) {
      const v = carried?.get(g.fullName);
      if (g.decl === undefined && v !== undefined) current.values.set(g.fullName, v);
    }
  } else if (!keepView) current = undefined;
  showInfo(program);
  enableTools();
  if (mode === "breed" && current) breeder.start(familyOf(current), strength());
  if (mode === "morph" && current) startMorph();
  if (mode === "view") showCurrent(keepView);
}

/** Gene controls write into the code, so they're only offered while the code is what's on show. */
const geneEditing: GeneEditing = {
  input(g, v) {
    current?.values.set(g.fullName, v);
    showCurrent(true, false);
  },
  change(g, v) {
    if (!current || current.program.text !== editor.text) return;
    current.values.set(g.fullName, v);
    editor.applyEdits(geneEdits(current.program, new Map([[g.fullName, v]])));
  },
};

/**
 * Shows the current creature in the full view. Creatures that read time are rebuilt every frame.
 * `panel` redraws the gene panel too, which mustn't happen while one of its sliders is dragged.
 */
function showCurrent(keepView: boolean, panel = true): void {
  cancelAnimationFrame(liveFrame);
  if (!current) {
    view.setCreature([]);
    view.setBackground(undefined);
    showProblems(program!, program!.diagnostics);
    showGenes(program?.genes ?? [], new Map());
    inputs.show(false);
    showStatus("");
    return;
  }
  const c = current;
  const live = c.program.live || c.program.backgroundLive;
  if (panel) {
    showGenes(c.program.genes, c.values, c.program === program ? geneEditing : undefined);
    inputs.show(live);
  }
  const frame = (keep: boolean) => {
    const { built, background } = buildCreature(c, inputs.now());
    view.setCreature(built.shapes, keep);
    view.setBackground(background);
    report(built.diagnostics, built.shapes.length, live);
    if (live && inputs.running) liveFrame = requestAnimationFrame(() => frame(true));
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

// ---------- opening ----------

const dirty = () => editor.text !== savedAs;

/** Asks before losing changes. */
function mayDiscard(): boolean {
  return !dirty() || confirm("Your changes to this creature aren't saved. Lose them?");
}

/** Puts new code in the editor and shows it. */
function load(text: string, from: Source): void {
  stopWatching();
  source = from;
  savedAs = text;
  editor.setText(text);
  inputs.restart();
  show(text, false);
  showSource();
}

/** Shows where the code came from in the creature menu and the address. */
function showSource(): void {
  fillCreatureMenu();
  creatureSelect.value = source.kind === "other" ? "" : `${source.kind}:${source.name}`;
  $("delete").hidden = source.kind !== "mine";
  const url = new URL(location.href);
  url.searchParams.delete("example");
  url.searchParams.delete("mine");
  if (source.kind !== "other") url.searchParams.set(source.kind, source.name);
  history.replaceState(null, "", url);
}

const exampleNames = Object.keys(examples)
  .map((path) =>
    path
      .split("/")
      .pop()!
      .replace(/\.genie$/, ""),
  )
  .sort();

function exampleText(name: string): string | undefined {
  const path = Object.keys(examples).find((p) => p.endsWith(`/${name}.genie`));
  return path ? examples[path] : undefined;
}

function fillCreatureMenu(): void {
  const group = (label: string, kind: string, names: string[]) => {
    const g = document.createElement("optgroup");
    g.label = label;
    for (const n of names) {
      const option = document.createElement("option");
      option.value = `${kind}:${n}`;
      option.textContent = n;
      g.append(option);
    }
    return g;
  };
  const other = document.createElement("option");
  other.value = "";
  other.textContent = "—";
  other.hidden = true;
  const mine = savedNames();
  creatureSelect.replaceChildren(
    other,
    ...(mine.length > 0 ? [group("Mine", "mine", mine)] : []),
    group("Examples", "example", exampleNames),
  );
}

function openListed(kind: "example" | "mine", name: string): boolean {
  const text = kind === "example" ? exampleText(name) : savedText(name);
  if (text === undefined) return false;
  load(text, { kind, name });
  return true;
}

creatureSelect.addEventListener("change", () => {
  const [kind, ...rest] = creatureSelect.value.split(":");
  if (!mayDiscard()) {
    showSource();
    return;
  }
  openListed(kind as "example" | "mine", rest.join(":"));
});

$("new").addEventListener("click", () => {
  if (mayDiscard()) load(NEW_CREATURE, { kind: "other" });
});

window.addEventListener("beforeunload", (e) => {
  if (dirty()) e.preventDefault();
});

// ---------- modes ----------

const breeder = new Breeder(grid, {
  inspect(c) {
    showGenes(c.program.genes, c.values);
    enableTools();
  },
  open(c) {
    // Write its genes into the code, so the code is the creature on show.
    let text = c.program.text;
    for (const e of geneEdits(c.program, c.values).reverse()) {
      text = text.slice(0, e.start) + e.text + text.slice(e.end);
    }
    editor.setText(text);
    show(text, false, c.values);
    setMode("view");
  },
});

let lastPanel = 0;
const morpher = new Morpher(view, (f) => {
  if (performance.now() - lastPanel < 200) return;
  lastPanel = performance.now();
  showGenes(f.creature.program.genes, f.creature.values);
  const next = (f.index + 1) % morpher.count;
  const label = (i: number) => {
    const c = morpher.member(i);
    return c.variant ?? (c === current ? (c.program.file.name ?? "") : `Creature ${i + 1}`);
  };
  $("morph-hint").textContent =
    `${label(f.index)} → ${label(next)} · ${f.index + 1} of ${morpher.count}`;
  showProblems(f.creature.program, f.problems);
});

const showCode = () => {
  try {
    return localStorage.getItem("genocode.code") !== "hidden";
  } catch {
    return true;
  }
};

function setMode(next: Mode): void {
  mode = next;
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    b.setAttribute("aria-pressed", String(b.dataset["mode"] === mode));
  }
  $("view-tools").hidden = mode !== "view";
  $("breed-tools").hidden = mode !== "breed";
  $("morph-tools").hidden = mode !== "morph";
  codeSection.hidden = mode !== "view" || !showCode();
  document.body.classList.toggle("with-code", !codeSection.hidden);
  canvas.hidden = mode === "breed";
  grid.hidden = mode !== "breed";
  cancelAnimationFrame(liveFrame);
  morpher.stop();
  inputs.show(false);
  if (mode === "view") showCurrent(false);
  if (mode === "breed" && current) {
    if (!breeder.holds(current)) breeder.start(familyOf(current), strength());
    else breeder.render();
    showGenes(current.program.genes, current.values);
  }
  if (mode === "morph") startMorph();
  enableTools();
}

/**
 * Morphs through the creatures chosen in the grid, or else the creature's family (itself and its
 * variants), or else the whole grid, or else variations of the creature. The grid only counts
 * while it holds the current creature: one opened since breeding starts afresh.
 */
function startMorph(): void {
  if (!current) return;
  const ours = breeder.holds(current);
  let members = ours ? breeder.selection : [];
  if (members.length < 2) members = familyOf(current);
  if (members.length < 2 && ours) members = [...breeder.creatures];
  if (members.length < 2) {
    breeder.start([current], 0.5);
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

$("code-toggle").addEventListener("click", () => {
  const on = !showCode();
  try {
    localStorage.setItem("genocode.code", on ? "shown" : "hidden");
  } catch {
    // Not remembered, then.
  }
  $("code-toggle").setAttribute("aria-pressed", String(on));
  setMode(mode);
});
$("code-toggle").setAttribute("aria-pressed", String(showCode()));

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

/** The name to save under: the one in the code's header. */
const creatureName = () => checkText(editor.text).file.name || "Untitled";

$("save").addEventListener("click", () => {
  const name = creatureName();
  const replacing = source.kind !== "mine" || source.name !== name;
  if (replacing && savedText(name) !== undefined && !confirm(`Replace your saved ${name}?`)) return;
  try {
    saveCreature(name, editor.text);
  } catch {
    alert("This browser won't keep it (its storage is full or turned off). Use Download instead.");
    return;
  }
  source = { kind: "mine", name };
  savedAs = editor.text;
  showSource();
});

$("delete").addEventListener("click", () => {
  if (source.kind !== "mine" || !confirm(`Delete ${source.name} from this browser?`)) return;
  deleteCreature(source.name);
  savedAs = "";
  source = { kind: "other" };
  showSource();
});

type SaveWindow = Window & {
  showSaveFilePicker?: (options: object) => Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  }>;
};

$("download").addEventListener("click", async () => {
  const text = editor.text;
  const name = `${creatureName()}.genie`;
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

/** Shows a file, and keeps checking it for changes until it's edited here or another is opened. */
async function openHandle(handle: FileHandleLike): Promise<void> {
  if (!mayDiscard()) return;
  let file = await handle.getFile();
  load(await file.text(), { kind: "other" });
  let modified = file.lastModified;
  watching.textContent = `Watching ${handle.name} for changes`;
  watching.hidden = false;
  watchTimer = window.setInterval(async () => {
    try {
      file = await handle.getFile();
      if (file.lastModified !== modified) {
        modified = file.lastModified;
        const text = await file.text();
        savedAs = text;
        editor.setText(text);
        show(text, true);
      }
    } catch {
      stopWatching();
    }
  }, 750);
}

async function openFile(file: File): Promise<void> {
  if (!mayDiscard()) return;
  load(await file.text(), { kind: "other" });
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

// ---------- start ----------

const params = new URL(location.href).searchParams;
const mine = params.get("mine");
const example = params.get("example");
if (!(mine && openListed("mine", mine)) && !(example && openListed("example", example))) {
  openListed("example", exampleNames[0] ?? "");
}
setMode("view");
