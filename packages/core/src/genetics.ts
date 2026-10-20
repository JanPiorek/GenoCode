// Mutating, breeding and morphing genes (docs/LANGUAGE.md section 19), and writing a creature's
// gene values back into its program, which is how a bred creature is saved.

import type { CheckResult } from "./checker.js";
import type { Stmt } from "./ast.js";
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
  /**
   * The chance that each gene is changed. Unless the app lets the user choose, enough for about
   * four genes to change, and at most ½.
   */
  rate?: number;
  /** How far apart each gene is across the creature's family, from `familySpread`. */
  spread?: GeneSpread | undefined;
}

/** Each gene's spread across a family, per axis or channel, as a part of its range (0 to 1). */
export type GeneSpread = ReadonlyMap<string, readonly number[]>;

/** How far a family's spread reaches: steps can take a gene a little beyond the family. */
const SPREAD_REACH = 2;
/** The smallest part of its range a gene's step can be narrowed to, so genes a whole family agrees on can still move. */
const MIN_SPREAD = 0.1;

/** How many genes a mutation changes, on average, unless the app chooses a rate. */
const CHANGED_GENES = 4;

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
  const { random, strength, spread } = options;
  const free = genes.filter((g) => !options.locked?.has(g.fullName));
  const rate = options.rate ?? Math.min(0.5, CHANGED_GENES / Math.max(1, free.length));
  const out = valuesOf(genes, values);
  for (const g of free) {
    if (random() >= rate) continue;
    const by = spread?.get(g.fullName);
    out.set(g.fullName, mutateGene(g, out.get(g.fullName)!, strength, by, random));
  }
  return out;
}

function mutateGene(
  g: GeneInfo,
  v: Value,
  strength: number,
  spread: readonly number[] | undefined,
  random: () => number,
): Value {
  if (isSeed(g)) return random() < strength ? Math.floor(random() * 2 ** 32) : v;
  // A family's spread narrows each axis or channel's step to the part of the range it uses.
  const by = (i: number) =>
    strength * (spread ? Math.max(MIN_SPREAD, SPREAD_REACH * (spread[i] ?? 1)) : 1);
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
      return mutateNumber(v as number, g.min as number, g.max as number, g, by(0), random);
    case "vector": {
      const [a, lo, hi] = [v as Vec, g.min as Vec, g.max as Vec];
      return {
        type: "vector",
        x: mutateNumber(a.x, lo.x, hi.x, g, by(0), random),
        y: mutateNumber(a.y, lo.y, hi.y, g, by(1), random),
        z: mutateNumber(a.z, lo.z, hi.z, g, by(2), random),
      };
    }
    case "colour": {
      const [c, lo, hi] = [v as Colour, g.min as Colour, g.max as Colour];
      return {
        type: "colour",
        h: mutateHue(c.h, g.hue!, by(0), random),
        s: mutateNumber(c.s, lo.s, hi.s, g, by(1), random),
        v: mutateNumber(c.v, lo.v, hi.v, g, by(2), random),
        a: mutateNumber(c.a, lo.a, hi.a, g, by(3), random),
      };
    }
  }
}

/**
 * A step of up to `r` either way, small steps more likely than big ones (a triangular
 * distribution, peaked at no change).
 */
function step(r: number, random: () => number): number {
  return r * (random() - random());
}

/** `v + d`, or `v − d` if that leaves lo..hi, kept within lo..hi. */
function bounce(v: number, d: number, lo: number, hi: number): number {
  const x = v + d >= lo && v + d <= hi ? v + d : v - d;
  return clamp(x, lo, hi);
}

/** A random point within `v ± strength × (max − min)`, kept within min..max. */
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
    const [lo, hi] = [Math.log(min), Math.log(max)];
    return clamp(
      Math.exp(bounce(Math.log(v), step(strength * (hi - lo), random), lo, hi)),
      min,
      max,
    );
  }
  return snap(bounce(v, step(strength * (max - min), random), min, max), min, max, g.step);
}

/** Hue: a step of up to `strength × arc` round the circle, kept on the arc unless it's whole. */
function mutateHue(h: number, arc: HueArc, strength: number, random: () => number): number {
  const d = step(strength * arc.length, random);
  if (arc.whole) return wrapHue(h + d);
  return wrapHue(arc.start + bounce(wrapHue(h - arc.start), d, 0, arc.length));
}

/**
 * How far apart each gene is across a family (a creature and its variants): for each axis or
 * channel, the width of the values the family uses, as a part of the gene's range. Hue is the
 * widest gap between two members, the short way round, as a part of the range's arc.
 */
export function familySpread(
  genes: readonly GeneInfo[],
  family: readonly GeneValues[],
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const g of genes) {
    const vs = family.map((f) => f.get(g.fullName) ?? g.value);
    const width = (axis: (v: Value) => number, min: number, max: number) => {
      if (min === max) return 0;
      const xs = vs.map((v) => (g.log ? Math.log(axis(v)) : axis(v)));
      const [lo, hi] = g.log ? [Math.log(min), Math.log(max)] : [min, max];
      return (Math.max(...xs) - Math.min(...xs)) / (hi - lo);
    };
    if (g.kind === "number") {
      out.set(g.fullName, [width((v) => v as number, g.min as number, g.max as number)]);
    } else if (g.kind === "vector" && vs.every(isVec)) {
      const [lo, hi] = [g.min as Vec, g.max as Vec];
      out.set(
        g.fullName,
        (["x", "y", "z"] as const).map((k) => width((v) => (v as Vec)[k], lo[k], hi[k])),
      );
    } else if (g.kind === "colour" && vs.every(isColour)) {
      const [lo, hi] = [g.min as Colour, g.max as Colour];
      let hue = 0;
      for (const p of vs) for (const q of vs) hue = Math.max(hue, Math.abs(hueDelta(p.h, q.h)));
      out.set(g.fullName, [
        hue / g.hue!.length,
        ...(["s", "v", "a"] as const).map((k) => width((v) => (v as Colour)[k], lo[k], hi[k])),
      ]);
    }
  }
  return out;
}

/**
 * How different two sets of gene values are, from 0 (the same) to 1: each gene's difference as a
 * part of its range (a different bool, choice or seed counts as 1), averaged over the genes.
 */
export function geneDistance(
  genes: readonly GeneInfo[],
  a: GeneValues | undefined,
  b: GeneValues | undefined,
): number {
  if (genes.length === 0) return 0;
  let total = 0;
  for (const g of genes) {
    const x = a?.get(g.fullName) ?? g.value;
    const y = b?.get(g.fullName) ?? g.value;
    const part = (p: number, q: number, min: number, max: number) => {
      if (min === max) return 0;
      if (g.log && p > 0 && q > 0) return Math.abs(Math.log(p / q)) / Math.log(max / min);
      return Math.abs(p - q) / (max - min);
    };
    if (g.kind === "number" && typeof x === "number" && typeof y === "number") {
      total += part(x, y, g.min as number, g.max as number);
    } else if (g.kind === "vector" && isVec(x) && isVec(y)) {
      const [lo, hi] = [g.min as Vec, g.max as Vec];
      total +=
        (["x", "y", "z"] as const).reduce((t, k) => t + part(x[k], y[k], lo[k], hi[k]), 0) / 3;
    } else if (g.kind === "colour" && isColour(x) && isColour(y)) {
      const [lo, hi] = [g.min as Colour, g.max as Colour];
      const hue = Math.abs(hueDelta(x.h, y.h)) / Math.min(180, g.hue!.length || 180);
      total +=
        (Math.min(1, hue) +
          (["s", "v", "a"] as const).reduce((t, k) => t + part(x[k], y[k], lo[k], hi[k]), 0)) /
        4;
    } else if (!valuesEqual(x, y)) total += 1;
  }
  return total / genes.length;
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
  // Half the time a random point between the two, otherwise one or the other. A vector or colour
  // is taken whole, every axis or channel the same way, so a colour isn't half one and half the
  // other.
  const t = random() < 0.5 ? random() : random() < 0.5 ? 0 : 1;
  const mix = (p: number, q: number, min: number, max: number) => {
    const v =
      t === 0 ? p : t === 1 ? q : g.log && p > 0 && q > 0 ? p * (q / p) ** t : p + t * (q - p);
    return snap(v, min, max, g.step);
  };
  if (g.kind === "number") {
    return mix(x as number, y as number, g.min as number, g.max as number);
  }
  if (g.kind === "vector" && isVec(x) && isVec(y)) {
    const [lo, hi] = [g.min as Vec, g.max as Vec];
    const axis = (k: "x" | "y" | "z") => mix(x[k], y[k], lo[k], hi[k]);
    return { type: "vector", x: axis("x"), y: axis("y"), z: axis("z") };
  }
  if (g.kind === "colour" && isColour(x) && isColour(y)) {
    const [lo, hi] = [g.min as Colour, g.max as Colour];
    const channel = (k: "s" | "v" | "a") => mix(x[k], y[k], lo[k], hi[k]);
    const h = t === 0 ? x.h : t === 1 ? y.h : mixHue(x.h, y.h, t);
    return {
      type: "colour",
      h: clampHue(h, g.hue!),
      s: channel("s"),
      v: channel("v"),
      a: channel("a"),
    };
  }
  return x;
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

/**
 * The edits that write gene values into a variant (section 6.6), in order, without laying anything
 * else out. A gene the variant already sets gets its new value; one it doesn't gets a line of its
 * own, unless the value is the gene's own. Each gene in `unset` loses its line, so the variant
 * goes back to the gene's own value.
 */
export function variantEdits(
  program: CheckResult,
  variant: string,
  values: GeneValues,
  unset: readonly string[] = [],
): { start: number; end: number; text: string }[] {
  const found = program.variants.find((v) => v.name === variant);
  if (!found) return [];
  const text = program.text;
  const body = found.decl.body;
  const settings = body.items.flatMap((s) => (s.kind === "GeneSetting" ? [s] : []));
  const edits: { start: number; end: number; text: string }[] = [];
  const added: [name: string, value: string][] = [];
  for (const g of program.genes) {
    const v = values.get(g.fullName);
    if (v === undefined || unset.includes(g.fullName)) continue;
    const setting = settings.find((s) => s.gene === g.fullName);
    if (setting) {
      const old = found.values.get(g.fullName);
      if (old === undefined || !valuesEqual(v, old)) {
        edits.push({
          start: setting.value.span.start,
          end: setting.value.span.end,
          text: geneLiteral(g, v),
        });
      }
    } else if (!valuesEqual(v, g.value)) added.push([g.fullName, geneLiteral(g, v)]);
  }
  const removed = new Set<Stmt>(settings.filter((s) => unset.includes(s.gene)));
  const kept = body.items.filter((s) => !removed.has(s));
  const inside = text.slice(body.span.start + 1, body.span.end - 1);
  const close = body.span.end - 1;
  const lineStart = (at: number) => text.lastIndexOf("\n", at - 1) + 1;
  const ownLine = (s: { span: { start: number; end: number } }) => {
    const after = text.indexOf("\n", s.span.end);
    const rest = text.slice(s.span.end, after < 0 ? text.length : after);
    return (
      text.slice(lineStart(s.span.start), s.span.start).trim() === "" && /^\s*(\/\/.*)?$/.test(rest)
    );
  };
  if (inside.includes("\n") && text.slice(lineStart(close), close).trim() === "") {
    // Laid out one setting to a line: lines are removed and added whole.
    for (const s of settings.filter((s) => removed.has(s))) {
      if (!ownLine(s)) continue;
      const after = text.indexOf("\n", s.span.end);
      edits.push({
        start: lineStart(s.span.start),
        end: after < 0 ? text.length : after + 1,
        text: "",
      });
    }
    if (added.length > 0) {
      const first = settings[0];
      const indent = first
        ? text.slice(lineStart(first.span.start), first.span.start)
        : `${text.slice(lineStart(found.decl.span.start), found.decl.span.start)}  `;
      // Lined up with the settings already there, as the formatter does.
      const width = first ? text.indexOf("=", first.geneSpan.end) - first.span.start : 0;
      const line = ([name, value]: [string, string]) =>
        `${indent}${name.padEnd(width - 1)} = ${value}\n`;
      const at = lineStart(close);
      edits.push({ start: at, end: at, text: added.map(line).join("") });
    }
  } else if (kept.length === 0) {
    // On one line, and nothing left of it but what's added.
    if (removed.size > 0 || added.length > 0) {
      const all = added.map(([name, value]) => `${name} = ${value}`).join("; ");
      edits.push({ start: body.span.start, end: body.span.end, text: all ? `{ ${all} }` : "{}" });
    }
  } else {
    // On one line, separated by `;`: each removed setting goes with the `;` before it, or with the
    // one after it while nothing before it is kept.
    const firstKept = body.items.indexOf(kept[0]!);
    body.items.forEach((s, i) => {
      if (!removed.has(s)) return;
      if (i > firstKept)
        edits.push({ start: body.items[i - 1]!.span.end, end: s.span.end, text: "" });
      else edits.push({ start: s.span.start, end: body.items[i + 1]!.span.start, text: "" });
    });
    const last = kept[kept.length - 1]!;
    if (added.length > 0) {
      edits.push({
        start: last.span.end,
        end: last.span.end,
        text: added.map(([name, value]) => `; ${name} = ${value}`).join(""),
      });
    }
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
    // A hue just under 360° mustn't round up to 360°, which reads back as 0°: the other end of
    // a spectrum (section 13.3).
    let h = Math.min(Number(clampHue(v.h, g.hue!).toFixed(1)), 359.9);
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
