// Mutating, breeding and morphing genes (docs/LANGUAGE.md section 19), and writing a creature's
// gene values back into its program, which is how a bred creature is saved.

import type { CheckResult } from "./checker.js";
import { hueDelta, mixHue, wrapHue } from "./colour.js";
import { formatText } from "./format.js";
import { inHueArc, type GeneInfo, type HueArc } from "./genes.js";
import {
  formatValue,
  isColour,
  isVec,
  valuesEqual,
  type Colour,
  type Value,
  type Vec,
} from "./values.js";

/** Gene values by full name. A gene that isn't listed has the value written in the program. */
export type GeneValues = ReadonlyMap<string, Value>;

/** A creature for breeding and morphing: its genes, and the values they have. */
export interface GeneSet {
  genes: readonly GeneInfo[];
  values?: GeneValues;
}

export interface GeneticsOptions {
  /** A random number from 0 up to 1, such as `Math.random` or `mulberry32(seed)`. */
  random: () => number;
  /** Full names of genes to keep as they are. */
  locked?: ReadonlySet<string>;
}

export interface MutateOptions extends GeneticsOptions {
  /** How far genes move, from 0 to 1. */
  strength: number;
  /** The chance that each gene is changed. ½ unless the app lets the user choose. */
  rate?: number;
}

/** Every gene's value: the one given, or the one written in the program. */
export function valuesOf(genes: readonly GeneInfo[], values?: GeneValues): Map<string, Value> {
  return new Map(genes.map((g) => [g.fullName, values?.get(g.fullName) ?? g.value]));
}

// ---------- mutation (section 19.1) ----------

/** A mutated copy of the gene values. */
export function mutate(
  genes: readonly GeneInfo[],
  values: GeneValues | undefined,
  options: MutateOptions,
): Map<string, Value> {
  const { random, strength } = options;
  const rate = options.rate ?? 0.5;
  const out = valuesOf(genes, values);
  for (const g of genes) {
    if (options.locked?.has(g.fullName)) continue;
    if (random() >= rate) continue;
    out.set(g.fullName, mutateGene(g, out.get(g.fullName)!, strength, random));
  }
  return out;
}

function mutateGene(g: GeneInfo, v: Value, strength: number, random: () => number): Value {
  if (isSeed(g)) return random() < strength ? Math.floor(random() * 2 ** 32) : v;
  switch (g.kind) {
    case "bool":
      return random() < strength ? !v : v;
    case "choice":
    case "part": {
      if (random() >= strength) return v;
      const others = g.options!.filter((o) => !valuesEqual(o, v));
      return others.length > 0 ? others[Math.floor(random() * others.length)]! : v;
    }
    case "number":
      return mutateNumber(v as number, g.min as number, g.max as number, g, strength, random);
    case "vector": {
      const [a, lo, hi] = [v as Vec, g.min as Vec, g.max as Vec];
      const axis = (k: "x" | "y" | "z") => mutateNumber(a[k], lo[k], hi[k], g, strength, random);
      return { type: "vector", x: axis("x"), y: axis("y"), z: axis("z") };
    }
    case "colour": {
      const [c, lo, hi] = [v as Colour, g.min as Colour, g.max as Colour];
      const channel = (k: "s" | "v" | "a") => mutateNumber(c[k], lo[k], hi[k], g, strength, random);
      return {
        type: "colour",
        h: mutateHue(c.h, g.hue!, strength, random),
        s: channel("s"),
        v: channel("v"),
        a: channel("a"),
      };
    }
  }
}

/** A uniformly random point in `v ± strength × (max − min)`, kept within min..max. */
function mutateNumber(
  v: number,
  min: number,
  max: number,
  g: GeneInfo,
  strength: number,
  random: () => number,
): number {
  if (min === max) return v;
  if (g.log) {
    const r = strength * (Math.log(max) - Math.log(min));
    const l = Math.log(v);
    const lo = Math.max(Math.log(min), l - r);
    const hi = Math.min(Math.log(max), l + r);
    return clamp(Math.exp(lo + random() * (hi - lo)), min, max);
  }
  const r = strength * (max - min);
  const lo = Math.max(min, v - r);
  const hi = Math.min(max, v + r);
  return snap(lo + random() * (hi - lo), min, max, g.step);
}

/** Hue: the window `h ± strength × arc` taken round the circle, limited to the arc unless it's whole. */
function mutateHue(h: number, arc: HueArc, strength: number, random: () => number): number {
  const r = strength * arc.length;
  if (arc.whole) return wrapHue(h + (random() * 2 - 1) * r);
  const at = wrapHue(h - arc.start);
  const lo = Math.max(0, at - r);
  const hi = Math.min(arc.length, at + r);
  return wrapHue(arc.start + lo + random() * (hi - lo));
}

// ---------- breeding (section 19.2) ----------

/** The gene values of a child of A and B. The child has A's program. */
export function breed(a: GeneSet, b: GeneSet, options: GeneticsOptions): Map<string, Value> {
  const { random } = options;
  const av = valuesOf(a.genes, a.values);
  const bv = valuesOf(b.genes, b.values);
  const bGenes = new Map(b.genes.map((g) => [g.fullName, g]));
  const out = new Map(av);
  for (const g of a.genes) {
    const match = bGenes.get(g.fullName);
    if (options.locked?.has(g.fullName) || match === undefined || match.kind !== g.kind) continue;
    out.set(g.fullName, breedGene(g, av.get(g.fullName)!, bv.get(g.fullName)!, random));
  }
  return out;
}

function breedGene(g: GeneInfo, x: Value, y: Value, random: () => number): Value {
  if (isSeed(g) || g.kind === "bool") return random() < 0.5 ? x : y;
  if (g.kind === "choice" || g.kind === "part") {
    const pick = random() < 0.5 ? x : y;
    // B's choice only counts if it's one of A's options.
    return g.options!.some((o) => valuesEqual(o, pick)) ? pick : x;
  }
  if (g.kind === "number") {
    return breedNumber(x as number, y as number, g.min as number, g.max as number, g, random);
  }
  if (g.kind === "vector" && isVec(x) && isVec(y)) {
    const [lo, hi] = [g.min as Vec, g.max as Vec];
    const axis = (k: "x" | "y" | "z") => breedNumber(x[k], y[k], lo[k], hi[k], g, random);
    return { type: "vector", x: axis("x"), y: axis("y"), z: axis("z") };
  }
  if (g.kind === "colour" && isColour(x) && isColour(y)) {
    const [lo, hi] = [g.min as Colour, g.max as Colour];
    const channel = (k: "s" | "v" | "a") => breedNumber(x[k], y[k], lo[k], hi[k], g, random);
    return {
      type: "colour",
      h: breedHue(x.h, y.h, g.hue!, random),
      s: channel("s"),
      v: channel("v"),
      a: channel("a"),
    };
  }
  return x;
}

/** Half the time a random point between the two, otherwise one or the other; kept within A's range. */
function breedNumber(
  x: number,
  y: number,
  min: number,
  max: number,
  g: GeneInfo,
  random: () => number,
): number {
  let v: number;
  if (random() < 0.5) {
    const t = random();
    v =
      g.log && x > 0 && y > 0
        ? Math.exp(Math.log(x) + t * (Math.log(y) - Math.log(x)))
        : x + t * (y - x);
  } else {
    v = random() < 0.5 ? x : y;
  }
  return snap(v, min, max, g.step);
}

function breedHue(x: number, y: number, arc: HueArc, random: () => number): number {
  const h = random() < 0.5 ? mixHue(x, y, random()) : random() < 0.5 ? x : y;
  return clampHue(h, arc);
}

// ---------- morphing (section 19.3) ----------

/**
 * The creature at `t` (0 to 1) between A and B: which program it has (A's before the halfway
 * point, B's from it on) and its gene values. Values aren't limited to either range.
 */
export function morph(
  a: GeneSet,
  b: GeneSet,
  t: number,
): { from: "a" | "b"; values: Map<string, Value> } {
  const from = t < 0.5 ? "a" : "b";
  const own = from === "a" ? a : b;
  const other = from === "a" ? b : a;
  const av = valuesOf(a.genes, a.values);
  const bv = valuesOf(b.genes, b.values);
  const otherGenes = new Map(other.genes.map((g) => [g.fullName, g]));
  const out = valuesOf(own.genes, own.values);
  for (const g of own.genes) {
    const match = otherGenes.get(g.fullName);
    if (match === undefined || match.kind !== g.kind) continue;
    const x = av.get(g.fullName)!;
    const y = bv.get(g.fullName)!;
    out.set(g.fullName, morphGene(g, x, y, t));
  }
  return { from, values: out };
}

function morphGene(g: GeneInfo, x: Value, y: Value, t: number): Value {
  const num = (p: number, q: number) =>
    g.log && p > 0 && q > 0 ? p * (q / p) ** t : p + (q - p) * t;
  if (typeof x === "number" && typeof y === "number" && !isSeed(g)) return num(x, y);
  if (isVec(x) && isVec(y))
    return { type: "vector", x: num(x.x, y.x), y: num(x.y, y.y), z: num(x.z, y.z) };
  if (isColour(x) && isColour(y)) {
    return {
      type: "colour",
      h: mixHue(x.h, y.h, t),
      s: x.s + (y.s - x.s) * t,
      v: x.v + (y.v - x.v) * t,
      a: x.a + (y.a - x.a) * t,
    };
  }
  return t < 0.5 ? x : y;
}

// ---------- writing genes into the program ----------

/**
 * The program's text with each gene's value written in, laid out by the formatter. Genes whose
 * value hasn't changed keep the text they were written with. The automatic `seed` gene has no
 * line to write into, so it isn't saved.
 */
export function writeGenes(program: CheckResult, values: GeneValues): string {
  const edits = geneEdits(program, values);
  if (edits.length === 0) return program.text;
  let text = program.text;
  for (const e of [...edits].reverse()) {
    text = text.slice(0, e.start) + e.text + text.slice(e.end);
  }
  return formatText(text).text ?? text;
}

/**
 * The edits that write each changed gene's value into the program's text, in order, without
 * laying anything else out. Editors apply them so the rest of the text and the cursor stay put.
 */
export function geneEdits(
  program: CheckResult,
  values: GeneValues,
): { start: number; end: number; text: string }[] {
  const edits: { start: number; end: number; text: string }[] = [];
  for (const g of program.genes) {
    const v = values.get(g.fullName);
    if (g.decl === undefined || v === undefined || valuesEqual(v, g.value)) continue;
    const span = g.decl.value.span;
    edits.push({ start: span.start, end: span.end, text: geneLiteral(g, v) });
  }
  return edits.sort((p, q) => p.start - q.start);
}

/** A gene value written readably, and still within the gene's range. */
export function geneLiteral(g: GeneInfo, v: Value): string {
  if (g.kind === "number" && typeof v === "number") {
    return numberLiteral(v, g.min as number, g.max as number, g.step);
  }
  if (g.kind === "vector" && isVec(v)) {
    const [lo, hi] = [g.min as Vec, g.max as Vec];
    const axis = (k: "x" | "y" | "z") => numberLiteral(v[k], lo[k], hi[k], undefined);
    return `(${axis("x")}, ${axis("y")}, ${axis("z")})`;
  }
  if (g.kind === "colour" && isColour(v)) {
    const [lo, hi] = [g.min as Colour, g.max as Colour];
    let h = Number(clampHue(v.h, g.hue!).toFixed(1));
    if (!inHueArc(h, g.hue!)) h = clampHue(v.h, g.hue!);
    const ch = (k: "s" | "v" | "a") => short(clamp(Number(v[k].toFixed(2)), lo[k], hi[k]));
    const alpha = ch("a");
    return `hsv(${short(h)}, ${ch("s")}, ${ch("v")}${alpha === "1" ? "" : `, ${alpha}`})`;
  }
  return formatValue(v);
}

function numberLiteral(v: number, min: number, max: number, step: number | undefined): string {
  if (step !== undefined) return short(snap(v, min, max, step));
  return short(clamp(Number(v.toPrecision(4)), min, max));
}

/** A number without floating-point noise, such as `0.3` rather than `0.30000000000000004`. */
function short(n: number): string {
  const s = String(Number(n.toPrecision(12)));
  return s === "-0" ? "0" : s;
}

// ---------- helpers ----------

function isSeed(g: GeneInfo): boolean {
  return g.fullName === "seed" && g.decl === undefined;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Clamps into min..max, and onto the nearest whole step within it if the gene has one. */
function snap(v: number, min: number, max: number, step: number | undefined): number {
  v = clamp(v, min, max);
  if (step === undefined) return v;
  let k = Math.round((v - min) / step);
  if (min + k * step > max + 1e-9) k--;
  return min + k * step;
}

/** The hue itself if it's on the arc, otherwise the nearer end of the arc. */
function clampHue(h: number, arc: HueArc): number {
  h = wrapHue(h);
  if (inHueArc(h, arc)) return h;
  const end = wrapHue(arc.start + arc.length);
  return Math.abs(hueDelta(h, arc.start)) <= Math.abs(hueDelta(h, end)) ? arc.start : end;
}
