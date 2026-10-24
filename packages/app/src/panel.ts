// The side panel: the creature's name and description, its problems, and its genes, each with a
// lock that keeps it fixed while breeding and, in the full view, a control to try other values.

import {
  formatValue,
  geneRange,
  toRgb,
  type CheckResult,
  type Diagnostic,
  type GeneInfo,
  type Value,
} from "@genocode/core";
import { geneControl, type GeneEditing } from "@genocode/controls";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Padlocks drawn in the button's colour: open and hollow, or shut and solid.
const PADLOCK = (shackle: string, body: string) =>
  `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="${shackle}"/><rect x="3" y="7" width="10" height="7.5" rx="1.5" ${body}/></svg>`;
const UNLOCKED_ICON = PADLOCK("M5 7V4.8a3 3 0 0 1 5.8-1.1", "");
const LOCKED_ICON = PADLOCK("M5 7V5a3 3 0 0 1 6 0v2", 'fill="currentColor"');

/** Full names of the genes the user has locked. */
export const locked = new Set<string>();

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

/** The creature's name, and the variant on show, if one is. */
export function showInfo(p: CheckResult, variant?: string): void {
  const file = p.file;
  const name = $("name");
  name.textContent = file.name || "Untitled";
  if (variant !== undefined) {
    const which = document.createElement("span");
    which.className = "variant-name";
    which.textContent = ` · ${variant}`;
    name.append(which);
  }
  $("description").textContent = file.description
    .map((c) => c.text.replace(/^\/\/\s?/, ""))
    .join(" ");
  // Over the creature too, where the panel isn't shown (on a phone, or with the panel closed).
  $("stage-name").textContent = name.textContent;
}

/** Lists problems: those in the program, and those from building what's on show. */
export function showProblems(p: CheckResult, problems: readonly Diagnostic[]): void {
  $("problems").replaceChildren(...problems.map((d) => problemItem(p, d)));
  $("problems-section").hidden = problems.length === 0;
  const errors = problems.filter((d) => d.severity === "error").length;
  const status = $("dock-status");
  status.textContent =
    problems.length === 0
      ? "No problems"
      : errors > 0
        ? `${errors} error${errors === 1 ? "" : "s"}`
        : `${problems.length} warning${problems.length === 1 ? "" : "s"}`;
  status.className = `dock-status ${errors > 0 ? "error" : problems.length > 0 ? "warning" : "ok"}`;
}

export function showStatus(text: string): void {
  $("status").textContent = text;
}

function swatch(v: Value): HTMLElement | string {
  if (typeof v !== "object" || v.type !== "colour") return "";
  const [r, g, b] = toRgb(v);
  const s = document.createElement("span");
  s.className = "swatch";
  s.style.background = `rgb(${r * 255} ${g * 255} ${b * 255})`;
  return s;
}

/** A value as the panel shows it: short, with colours as swatches. */
function shortValue(v: Value): string {
  if (typeof v === "number") return String(Number(v.toPrecision(4)));
  if (typeof v === "object" && v.type === "colour") return "";
  if (typeof v === "object" && v.type === "vector") {
    const n = (x: number) => String(Number(x.toPrecision(3)));
    return `(${n(v.x)}, ${n(v.y)}, ${n(v.z)})`;
  }
  return formatValue(v);
}

/** Groups whose genes are folded away, by name. */
const folded = new Set<string>();

/** The group a gene is shown under: none for top-level genes, else its part, function or block. */
function groupOf(g: GeneInfo): string | undefined {
  // A pattern's genes are grouped under its name.
  if (g.section === "pattern") return g.owner;
  if (g.section !== "creature") return g.section;
  return g.owner;
}

/** A variant on show in the panel: the genes it sets itself, and a way to unset one. */
export interface VariantGenes {
  sets: ReadonlySet<string>;
  /** Takes the gene's line out of the variant, so it has the gene's own value again. */
  reset(g: GeneInfo): void;
}

function geneRow(
  g: GeneInfo,
  values: ReadonlyMap<string, Value>,
  inGroup: boolean,
  edit: GeneEditing | undefined,
  variant: VariantGenes | undefined,
  valueShowers: Map<string, (v: Value) => void>,
): HTMLElement {
  const row = document.createElement("tr");
  if (inGroup) row.classList.add("in-group");
  // A variant's own genes stand out; the rest are the creature's.
  const own = variant?.sets.has(g.fullName);
  if (variant) row.classList.add(own ? "variant-own" : "variant-inherited");
  const lockCell = document.createElement("td");
  const lock = document.createElement("button");
  lock.type = "button";
  lock.className = "lock";
  const setLock = () => {
    const on = locked.has(g.fullName);
    lock.setAttribute("aria-pressed", String(on));
    lock.innerHTML = on ? LOCKED_ICON : UNLOCKED_ICON;
    row.classList.toggle("locked", on);
    lock.title = on
      ? "Locked: Mutate and Breed leave this gene as it is (you can still change it)"
      : "Lock: Mutate and Breed won't change this gene";
  };
  setLock();
  lock.addEventListener("click", () => {
    if (locked.has(g.fullName)) locked.delete(g.fullName);
    else locked.add(g.fullName);
    setLock();
  });
  lockCell.append(lock);
  const name = document.createElement("td");
  name.className = "gene-name";
  name.textContent = inGroup ? g.name : g.fullName;
  name.title = g.fullName;
  const about = document.createElement("div");
  about.className = "gene-about";
  about.textContent = [g.description, geneRange(g)].filter(Boolean).join(" · ");
  name.append(about);
  const value = document.createElement("td");
  value.className = "gene-value";
  const v = values.get(g.fullName) ?? g.value;
  let shownText: string | undefined;
  const showValue = (x: Value) => {
    // Only touched when the value looks different, so a playing morph doesn't churn the page.
    const text = shortValue(x) || formatValue(x);
    if (text === shownText) return;
    shownText = text;
    value.replaceChildren(swatch(x), shortValue(x));
  };
  showValue(v);
  valueShowers.set(g.fullName, showValue);
  if (own && edit) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "reset";
    reset.textContent = "↺";
    reset.title = "Back to the creature's own value";
    reset.addEventListener("click", () => variant!.reset(g));
    lockCell.append(reset);
  }
  if (edit) {
    const control = geneControl(g, v, {
      input: (gene, x) => {
        showValue(x);
        edit.input(gene, x);
      },
      change: (gene, x) => {
        showValue(x);
        edit.change(gene, x);
      },
    });
    if (control) {
      control.classList.add("gene-control");
      name.append(control);
    }
  }
  row.append(lockCell, name, value);
  return row;
}

/** A heading row for a part's genes, which folds them away when clicked. */
function groupRow(group: string, count: number, rows: HTMLElement[]): HTMLElement {
  const row = document.createElement("tr");
  row.className = "gene-group";
  const cell = document.createElement("td");
  cell.colSpan = 3;
  const toggle = document.createElement("button");
  toggle.type = "button";
  const update = () => {
    const open = !folded.has(group);
    toggle.textContent = `${open ? "▾" : "▸"} ${group}`;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.title = `${count} gene${count === 1 ? "" : "s"}`;
    for (const r of rows) r.hidden = !open;
  };
  toggle.addEventListener("click", () => {
    if (folded.has(group)) folded.delete(group);
    else folded.add(group);
    update();
  });
  update();
  cell.append(toggle);
  row.append(cell);
  return row;
}

/** What the panel last showed, so a call with the same genes only updates the values. */
let lastShown: {
  genes: readonly GeneInfo[];
  edit: GeneEditing | undefined;
  variant: VariantGenes | undefined;
  showers: Map<string, (v: Value) => void>;
} = { genes: [], edit: undefined, variant: undefined, showers: new Map() };

/**
 * Shows the genes with their current values: top-level genes first, then each part's under its
 * name. With `edit`, each gene gets a control for trying other values. With `variant`, the genes
 * the variant sets are marked, and can be put back to the creature's own values.
 */
export function showGenes(
  genes: readonly GeneInfo[],
  values: ReadonlyMap<string, Value>,
  edit?: GeneEditing,
  variant?: VariantGenes,
): void {
  // Values that change while the same genes are on show (a morph or a dance playing) are updated
  // in place: rebuilding the rows each time would reset the hover and focus on every one.
  if (
    !edit &&
    !variant &&
    !lastShown.edit &&
    !lastShown.variant &&
    genes === lastShown.genes &&
    genes.length > 0
  ) {
    for (const g of genes) lastShown.showers.get(g.fullName)?.(values.get(g.fullName) ?? g.value);
    return;
  }
  const showers = new Map<string, (v: Value) => void>();
  lastShown = { genes, edit, variant, showers };
  const groups = new Map<string | undefined, GeneInfo[]>([[undefined, []]]);
  // A pattern file's genes are all its own, so they aren't put in a group.
  const onePattern = genes.every((g) => g.section === "pattern" && g.owner === genes[0]?.owner);
  for (const g of genes) {
    const key = onePattern ? undefined : groupOf(g);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(g);
  }
  const rows: HTMLElement[] = [];
  for (const [group, members] of groups) {
    if (group === undefined) {
      rows.push(...members.map((g) => geneRow(g, values, false, edit, variant, showers)));
      continue;
    }
    const children = members.map((g) => geneRow(g, values, true, edit, variant, showers));
    rows.push(groupRow(group, members.length, children), ...children);
  }
  $("genes").replaceChildren(...rows);
  $("gene-count").textContent = genes.length > 0 ? String(genes.length) : "";
  $("no-genes").hidden = genes.length > 0;
}
