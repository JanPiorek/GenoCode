// The GenoCode app. View: write a creature's code and see it beside the code, rebuilt as you type,
// with a control for each gene and sliders for time and music. Breed: a grid of variations to
// mutate and breed. Morph: a loop blending creatures into one another. Dance: music moves the
// creature along that loop, turns it and brings it nearer, by a dance style. Patterns: design
// texture and background recipes. Library: the starter creatures and dance styles, and everything
// kept in this browser, as pictures to open. Creatures come from the
// examples, from files (watched for changes where the browser allows it), or from those saved in
// this browser.

import {
  check,
  format,
  geneEdits,
  MUSIC_FIELDS,
  patternsOf,
  type CheckResult,
  type Diagnostic,
  type Pattern,
  type Value,
} from "@genocode/core";
import { hooks } from "@genocode/blocks";
import { InputControls, type GeneEditing } from "@genocode/controls";
import { MusicPlayer } from "@genocode/music";
import { CreatureView, type Side } from "@genocode/render";
import { BlocksView } from "./blocksview.js";
import { Breeder } from "./breed.js";
import {
  breedable,
  buildCreature,
  checkText,
  familyOf,
  fromProgram,
  type Creature,
} from "./creature.js";
import { DanceFloor, type DanceFrame } from "./dance.js";
import { CodeEditor } from "./editor.js";
import { drawFieldsInWorkers } from "./fields.js";
import { kindOf, LibraryView, type LibraryEntry } from "./libraryview.js";
import { deleteCreature, saveCreature, savedNames, savedText } from "./library.js";
import { Morpher } from "./morph.js";
import {
  definitionLines,
  PatternDesigner,
  type OwnPattern,
  saveBlob,
  withBackground,
  withDefinition,
} from "./patterns.js";
import { showGenes, showInfo, showProblems, showStatus } from "./panel.js";

// The starter creatures in the repository's creatures/ folder.
const examples = import.meta.glob("../../../creatures/*.genie", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// GenoCode's own pattern kinds written in GenoCode, in the repository's patterns/ folder.
const patternFiles = import.meta.glob("../../../patterns/*.genie", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// The dance styles in the repository's dances/ folder.
const danceFiles = import.meta.glob("../../../dances/*.genie", {
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
drawFieldsInWorkers();
const view = new CreatureView(canvas);
const creatureSelect = $<HTMLSelectElement>("creatures");
const danceCreatureSelect = $<HTMLSelectElement>("dance-creature");
const fileInput = $<HTMLInputElement>("file-input");
const watching = $("watching");

type Mode = "view" | "breed" | "morph" | "dance" | "patterns" | "library";
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
const blocksSection = $("blocks");
const blocks = new BlocksView(blocksSection, (text) => {
  // Built with blocks: the code is written for them.
  stopWatching();
  editor.setText(text);
  show(text, true);
});

// The background and dance blocks' export buttons save each as its own file (section 15).
hooks.exportDefinition = (kind) => {
  const file = checkText(editor.text).file;
  const item = file.items.find((i) => i.kind === (kind === "background" ? "Background" : "Dance"));
  if (!item || (item.kind !== "Background" && item.kind !== "Dance")) return;
  const name = `${file.name}_${kind === "background" ? "Background" : "Dance"}`;
  const nowhere = { start: 0, end: 0 };
  const description = {
    text: `// The ${kind} of ${file.name}.`,
    span: nowhere,
    line: 0,
    endLine: 0,
    ownLine: true,
    blankBefore: false,
  };
  const text = format({
    kind,
    name,
    nameSpan: nowhere,
    headerComments: [],
    description: [description],
    // Set off from the header by a blank line, as files are.
    items: item.body.items.map((s, k) =>
      k > 0
        ? s
        : s.leading.length > 0
          ? { ...s, leading: [{ ...s.leading[0]!, blankBefore: true }, ...s.leading.slice(1)] }
          : { ...s, blankBefore: true },
    ),
    endComments: [],
    span: nowhere,
  });
  const blob = new Blob([text], { type: "text/plain" });
  void saveBlob(blob, `${name}.genie`, `GenoCode ${kind}s`, ".genie");
};
const inputs = new InputControls($("inputs-section"), () => {
  if (mode === "view" && !inputs.running) showCurrent(true, false);
});

// ---------- view ----------

/** Shows new text. Keeps showing the last good version while the text has errors. */
function show(text: string, keepView: boolean, carried?: ReadonlyMap<string, Value>): void {
  blocks.show(text);
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
  // A new creature while dancing keeps the style it's danced to.
  if (mode === "dance" && current) startDance(true);
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
    blocks.setBackground(background);
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
  const shapes =
    current?.program.file.kind === "background"
      ? "A background"
      : `${shapeCount} shape${shapeCount === 1 ? "" : "s"}`;
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
  danceCreatureSelect.value = creatureSelect.value;
  if (danceCreatureSelect.selectedIndex < 0) danceCreatureSelect.value = "";
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
  // The dance's own menu, so the creature can be changed in full screen: creatures only.
  const myCreatures = mine.filter((n) => kindOf(savedText(n)!) === "creature");
  const none = other.cloneNode(true);
  danceCreatureSelect.replaceChildren(
    none,
    ...(myCreatures.length > 0 ? [group("Mine", "mine", myCreatures)] : []),
    group(
      "Examples",
      "example",
      exampleNames.filter((n) => kindOf(exampleText(n)!) === "creature"),
    ),
  );
}

function openListed(kind: "example" | "mine", name: string): boolean {
  const text = kind === "example" ? exampleText(name) : savedText(name);
  if (text === undefined) return false;
  load(text, { kind, name });
  return true;
}

/** Opens a creature picked from a menu (`kind:name`), unless that would lose changes. */
function openPicked(value: string): void {
  const [kind, ...rest] = value.split(":");
  if (!mayDiscard()) {
    showSource();
    return;
  }
  openListed(kind as "example" | "mine", rest.join(":"));
}

creatureSelect.addEventListener("change", () => openPicked(creatureSelect.value));
danceCreatureSelect.addEventListener("change", () => openPicked(danceCreatureSelect.value));

/** Dances the next (or previous) creature in the dance's menu. */
function stepCreature(by: number): void {
  const options = [...danceCreatureSelect.options].filter((o) => o.value !== "");
  if (options.length === 0) return;
  const at = options.findIndex((o) => o.value === danceCreatureSelect.value);
  const next = options[(at + by + options.length) % options.length]!;
  openPicked(next.value);
}

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

const showBlocks = () => {
  try {
    return localStorage.getItem("genocode.blocks") === "shown";
  } catch {
    return false;
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
  $("dance-tools").hidden = mode !== "dance";
  codeSection.hidden = mode !== "view" || !showCode();
  document.body.classList.toggle("with-code", !codeSection.hidden);
  blocksSection.hidden = mode !== "view" || !showBlocks();
  document.body.classList.toggle("with-blocks", !blocksSection.hidden);
  if (!blocksSection.hidden) blocks.revealed();
  const pictureless = mode === "breed" || mode === "patterns" || mode === "library";
  canvas.hidden = pictureless;
  grid.hidden = mode !== "breed";
  patternsSection.hidden = mode !== "patterns";
  librarySection.hidden = mode !== "library";
  $("views").hidden = pictureless;
  cancelAnimationFrame(liveFrame);
  morpher.stop();
  floor.stop();
  inputs.show(false);
  if (mode === "view") showCurrent(false);
  if (mode === "breed" && current) {
    if (!breeder.holds(current)) breeder.start(familyOf(current), strength());
    else breeder.render();
    showGenes(current.program.genes, current.values);
  }
  if (mode === "morph") startMorph();
  if (mode === "dance") startDance();
  if (mode === "patterns") {
    const own = current ? patternsOf(current.program, current.values) : [];
    designer.show(creaturePattern(), own, libraryPatterns());
  }
  if (mode === "library") library.show(libraryEntries());
  enableTools();
}

/**
 * The creatures to morph through: those chosen in the grid, or else the creature's family (itself
 * and its variants), or else the whole grid, or else variations of the creature. The grid only
 * counts while it holds the current creature: one opened since breeding starts afresh.
 */
function loopMembers(current: Creature): Creature[] {
  const ours = breeder.holds(current);
  let members = ours ? breeder.selection : [];
  if (members.length < 2) members = familyOf(current);
  if (members.length < 2 && ours) members = [...breeder.creatures];
  if (members.length < 2) {
    breeder.start([current], 0.5);
    members = breeder.creatures.slice(0, 6);
  }
  return members;
}

function startMorph(): void {
  if (current) morpher.start(loopMembers(current));
}

function strength(): number {
  return Number($<HTMLInputElement>("strength").value);
}

function enableTools(): void {
  const ok = current !== undefined;
  for (const b of document.querySelectorAll<HTMLButtonElement>(
    "[data-mode=breed], [data-mode=morph], [data-mode=dance]",
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

$("blocks-toggle").addEventListener("click", () => {
  const on = !showBlocks();
  try {
    localStorage.setItem("genocode.blocks", on ? "shown" : "hidden");
  } catch {
    // Not remembered, then.
  }
  $("blocks-toggle").setAttribute("aria-pressed", String(on));
  setMode(mode);
});
$("blocks-toggle").setAttribute("aria-pressed", String(showBlocks()));

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

// ---------- patterns ----------

const patternsSection = $("patterns");
const designer = new PatternDesigner(patternsSection, {
  useAsBackground(lines, patterns) {
    // The library's patterns the recipe uses go in first, so the background can name them.
    let text: string | undefined = editor.text;
    for (const p of patterns) {
      const body = definitionLines(p.source.text);
      text = body && text !== undefined ? withDefinition(text, "pattern", body, p.name) : undefined;
    }
    text = text === undefined ? undefined : withBackground(text, lines);
    if (text === undefined) return;
    editor.setText(text);
    show(text, true);
    setMode("view");
  },
});

/** The pattern files kept in this browser's library, for the designer to offer as kinds. */
function libraryPatterns(): OwnPattern[] {
  return savedNames().flatMap((name) => {
    const text = savedText(name);
    if (text === undefined || kindOf(text) !== "pattern") return [];
    const program = checkText(text);
    return program.ok ? patternsOf(program) : [];
  });
}

/** The creature's background, when it's a pattern, to start designing from. */
function creaturePattern(): Pattern | undefined {
  if (!current) return undefined;
  const { background } = buildCreature(current);
  return typeof background === "object" && background.type === "pattern" ? background : undefined;
}

// ---------- the library ----------

const librarySection = $("library");
const library = new LibraryView(librarySection, {
  open(entry) {
    if (!mayDiscard()) return;
    const from: Source = entry.yours
      ? { kind: "mine", name: entry.name }
      : entry.kind === "creature"
        ? { kind: "example", name: entry.name }
        : { kind: "other" };
    load(entry.text, from);
    setMode("view");
  },
  dance(entry) {
    const key = entry.yours ? `mine:${entry.name}` : entry.name;
    if (entry.yours) yourStyles.set(key, check(entry.text));
    // A style needs a creature to dance: the one on show, or else Geno.
    if (current?.program.file.kind !== "creature") {
      if (!mayDiscard()) return;
      openListed("example", "Geno");
    }
    wantedStyle = key;
    setMode("dance");
  },
  putIn(entry) {
    if (putIn(entry.text)) setMode(entry.kind === "dance" ? "dance" : "view");
  },
  remove(entry) {
    if (!confirm(`Delete ${entry.name} from this browser?`)) return;
    deleteCreature(entry.name);
    if (source.kind === "mine" && source.name === entry.name) {
      source = { kind: "other" };
      savedAs = "";
    }
    showSource();
    library.show(libraryEntries());
  },
  creature() {
    const file = current?.program.file;
    return file?.kind === "creature" ? file.name : undefined;
  },
});

/** Everything the library shows: what's kept in this browser, then what comes with GenoCode. */
function libraryEntries(): LibraryEntry[] {
  const yours = savedNames().map((name) => {
    const text = savedText(name)!;
    return { kind: kindOf(text), name, text, yours: true };
  });
  const starters = exampleNames.map((name) => {
    const text = exampleText(name)!;
    return { kind: kindOf(text), name, text, yours: false };
  });
  const styles = Object.entries(danceFiles)
    .map(([path, text]) => ({
      kind: "dance" as const,
      name: path
        .split("/")
        .pop()!
        .replace(/\.genie$/, ""),
      text,
      yours: false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const patterns = Object.values(patternFiles)
    .map((text) => ({
      kind: "pattern" as const,
      name: checkText(text).file.name,
      text,
      yours: false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...yours, ...starters, ...patterns, ...styles];
}

// ---------- dancing ----------

const player = new MusicPlayer();
const styleSelect = $<HTMLSelectElement>("dance-style");
const OWN_STYLE = "own";

const styleNames = Object.keys(danceFiles)
  .map((path) =>
    path
      .split("/")
      .pop()!
      .replace(/\.genie$/, ""),
  )
  .sort();
const styles = new Map<string, CheckResult>();
/** Dance styles kept in this browser, added to the menu when danced to from the library. */
const yourStyles = new Map<string, CheckResult>();
/** The style to dance to next, picked in the library. */
let wantedStyle: string | undefined;

/** A style from the dances/ folder (checked once), or one of yours (`mine:Name`). */
function libraryStyle(name: string): CheckResult | undefined {
  if (name.startsWith("mine:")) return yourStyles.get(name);
  if (!styles.has(name)) {
    const path = Object.keys(danceFiles).find((p) => p.endsWith(`/${name}.genie`));
    if (path === undefined) return undefined;
    styles.set(name, check(danceFiles[path]!));
  }
  return styles.get(name);
}

const rememberedStyle = (): string => {
  try {
    return localStorage.getItem("genocode.style") ?? "";
  } catch {
    return "";
  }
};

/**
 * Lists the styles: the creature's own first (when it has a dance block), then the library's and
 * yours. With `keep`, a style from the library that's chosen stays chosen, as when the creature
 * changes while dancing.
 */
function fillStyleMenu(keep = false): void {
  const before = keep && styleSelect.value !== OWN_STYLE ? styleSelect.value : undefined;
  const own = current?.program.dance !== undefined;
  const options = [
    ...(own ? [[OWN_STYLE, `Its own (${current!.program.file.name})`]] : []),
    ...styleNames.map((n) => [n, n.replace(/_/g, " ")]),
    ...[...yourStyles.keys()].map((k) => [k, `${k.slice(5).replace(/_/g, " ")} (yours)`]),
  ].map(([value, label]) => {
    const o = document.createElement("option");
    o.value = value!;
    o.textContent = label!;
    return o;
  });
  styleSelect.replaceChildren(...options);
  const remembered = rememberedStyle();
  const wanted = wantedStyle ?? before;
  wantedStyle = undefined;
  styleSelect.value = wanted
    ? wanted
    : own
      ? OWN_STYLE
      : styleNames.includes(remembered)
        ? remembered
        : (styleNames.find((n) => n === "Groove") ?? styleNames[0] ?? "");
}

function chosenStyle(): CheckResult | undefined {
  return styleSelect.value === OWN_STYLE ? current?.program : libraryStyle(styleSelect.value);
}

function startDance(keepStyle = false): void {
  if (!current) return;
  fillStyleMenu(keepStyle);
  floor.start(loopMembers(current), chosenStyle());
}

styleSelect.addEventListener("change", () => {
  if (styleSelect.value !== OWN_STYLE) {
    try {
      localStorage.setItem("genocode.style", styleSelect.value);
    } catch {
      // Not remembered, then.
    }
  }
  floor.setStyle(chosenStyle());
});

// A small bar for each music input, and the beat.
const meterNames = [...MUSIC_FIELDS, "beat"] as const;
const meterBars = meterNames.map((name) => {
  const meter = document.createElement("div");
  meter.className = `meter${name.endsWith("hit") ? " hit" : ""}`;
  meter.title = name === "beat" ? "beat" : `music.${name}`;
  const bar = document.createElement("div");
  meter.append(bar);
  $("meters").append(meter);
  return bar;
});

let lastDancePanel = 0;
const floor = new DanceFloor(view, player, (f: DanceFrame) => {
  meterNames.forEach((name, i) => {
    const v = name === "beat" ? f.beat : f.music[name];
    meterBars[i]!.style.height = `${Math.round(v * 100)}%`;
  });
  if (performance.now() - lastDancePanel < 200) return;
  lastDancePanel = performance.now();
  showGenes(f.creature.program.genes, f.creature.values);
  showProblems(f.creature.program, f.problems);
  showDanceHint(f.styleOk);
});

/** A time in seconds as minutes and seconds: 3:07. */
function minutes(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function showDanceHint(styleOk = true): void {
  const tempo = player.tempo;
  const at = player.position;
  const music = player.active
    ? [
        `${player.name}${player.paused ? " (paused)" : ""}`,
        ...(at ? [`${minutes(at.at)} of ${minutes(at.length)}`] : []),
        ...(tempo ? [`${Math.round(tempo)} beats a minute`] : []),
      ].join(" · ")
    : "Pick some music to dance to";
  $("dance-hint").textContent = styleOk ? music : `${music} · the style has a problem`;
  const play = $<HTMLButtonElement>("music-play");
  play.disabled = !player.active || player.live;
  play.textContent = player.live ? "Listening" : player.paused ? "Play" : "Pause";
}

/** Starts some music, reporting what went wrong if it can't. */
async function playMusic(start: () => Promise<void>): Promise<void> {
  try {
    await start();
  } catch (e) {
    alert(`That music can't be played: ${e instanceof Error ? e.message : String(e)}`);
  }
  showDanceHint();
}

const musicInput = $<HTMLInputElement>("music-input");
$("music-file").addEventListener("click", () => musicInput.click());
musicInput.addEventListener("change", () => {
  const file = musicInput.files?.[0];
  if (file) void playMusic(() => player.playFile(file));
  musicInput.value = "";
});
$("music-url").addEventListener("click", () => {
  const url = prompt("The web address of some music (the site must allow it to be played here):");
  if (url) void playMusic(() => player.playUrl(url));
});
$("music-mic").addEventListener("click", () => void playMusic(() => player.listen()));
$("music-tab").addEventListener(
  "click",
  () =>
    void playMusic(async () => {
      try {
        await player.listenToTab();
      } catch (e) {
        // Closing the browser's tab picker isn't a problem worth an alert.
        if (!(e instanceof DOMException && e.name === "NotAllowedError")) throw e;
      }
    }),
);
player.onEnd = () => showDanceHint();
$("music-play").addEventListener("click", () => void playMusic(() => player.togglePause()));

const isMusic = (f: File) =>
  f.type.startsWith("audio/") || /\.(mp3|wav|ogg|oga|opus|flac|m4a|aac|webm)$/i.test(f.name);

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
  let file = await handle.getFile();
  const text = await file.text();
  if (offerDefinition(text) || !mayDiscard()) return;
  load(text, { kind: "other" });
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
  const text = await file.text();
  if (offerDefinition(text) || !mayDiscard()) return;
  load(text, { kind: "other" });
}

/**
 * Offers to put a background or dance file into the creature on show, replacing its background or
 * dance block (docs/LANGUAGE.md sections 15 and 17). Says whether it did; if not, the file is
 * opened on its own.
 */
function offerDefinition(text: string): boolean {
  const file = checkText(text).file;
  const creature = current?.program.file;
  if (file.kind === "creature" || creature?.kind !== "creature") return false;
  const ask =
    file.kind === "background"
      ? `Put the background ${file.name} behind ${creature.name}?`
      : file.kind === "pattern"
        ? `Give ${creature.name} the pattern ${file.name}, to use in its textures?`
        : `Give ${creature.name} the dance ${file.name}?`;
  if (!confirm(`${ask}\n\nCancel opens the ${file.kind} on its own.`)) return false;
  return putIn(text);
}

/** Puts a background or dance file into the creature on show. Says whether it could. */
function putIn(text: string): boolean {
  const { kind, name } = checkText(text).file;
  const lines = definitionLines(text);
  if (kind === "creature" || !lines) return false;
  const out = withDefinition(editor.text, kind, lines, name);
  if (out === undefined) return false;
  editor.setText(out);
  show(out, true);
  return true;
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
  if (file && isMusic(file)) {
    if (current && mode !== "dance") setMode("dance");
    await playMusic(() => player.playFile(file));
  } else if (file) await openFile(file);
});

$("reset").addEventListener("click", () => view.resetView());

$("picture").addEventListener("click", async () => {
  const blob = await view.picture(2);
  if (blob) await saveBlob(blob, `${creatureName()}.png`, "PNG pictures", ".png");
});

// ---------- looking from each side, and full screen ----------

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-side]")) {
  b.addEventListener("click", () => view.viewFrom(b.dataset["side"] as Side));
}

/** The view fills the screen, as a video does; Esc or F brings the page back. */
function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void stage.requestFullscreen?.();
}

const stage = canvas.parentElement!;

// In full screen the tools only show while the mouse moves (not while it drags the creature
// round), and fade a moment after it stops, unless it's resting on them.
const TOOLS_SHOW_MS = 2000;
let toolsTimer = 0;
function showTools(): void {
  stage.classList.add("awake");
  clearTimeout(toolsTimer);
  toolsTimer = window.setTimeout(() => {
    if (stage.querySelector(".tools:hover, .views:hover")) showTools();
    else stage.classList.remove("awake");
  }, TOOLS_SHOW_MS);
}
stage.addEventListener("pointermove", (e) => {
  if (document.fullscreenElement === stage && e.buttons === 0) showTools();
});

$("fullscreen").addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", () => {
  const full = document.fullscreenElement === stage;
  $("fullscreen").setAttribute("aria-pressed", String(full));
  if (full) showTools();
  else {
    clearTimeout(toolsTimer);
    stage.classList.remove("awake");
  }
});
window.addEventListener("keydown", (e) => {
  const typing =
    e.target instanceof HTMLElement &&
    (e.target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName));
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if ((e.key === "f" || e.key === "F") && mode !== "breed" && mode !== "patterns") {
    e.preventDefault();
    toggleFullscreen();
  }
  // [ and ] switch creatures while dancing, so it can be done in full screen.
  if (mode === "dance" && (e.key === "[" || e.key === "]")) stepCreature(e.key === "]" ? 1 : -1);
  // Number keys switch styles while dancing, as the original's function keys did.
  const n = Number(e.key);
  if (mode === "dance" && Number.isInteger(n) && n >= 1 && n <= styleSelect.options.length) {
    styleSelect.selectedIndex = n - 1;
    styleSelect.dispatchEvent(new Event("change"));
  }
});

// ---------- start ----------

const params = new URL(location.href).searchParams;
const mine = params.get("mine");
const example = params.get("example");
// Without one asked for in the address, the app opens with Geno, the logo come to life.
if (!(mine && openListed("mine", mine)) && !(example && openListed("example", example))) {
  if (!openListed("example", "Geno")) openListed("example", exampleNames[0] ?? "");
}
setMode("view");
