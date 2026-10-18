// What the checker learns about each gene (docs/LANGUAGE.md section 6).

import type { GeneDecl } from "./ast.js";
import { wrapHue } from "./colour.js";
import type { Span } from "./source.js";
import type { Value } from "./values.js";

export type GeneKind = "number" | "vector" | "colour" | "bool" | "choice" | "part";

/** Where a gene is declared. */
export type GeneSection = "creature" | "background" | "dance" | "pattern";

/** A colour gene's hue range: an arc of the hue circle (section 6.4). */
export interface HueArc {
  /** Where the arc starts, 0 up to 360. */
  start: number;
  /** How far it runs upwards, in degrees. */
  length: number;
  whole: boolean;
}

export interface GeneInfo {
  /** The name used to match genes between creatures, such as `whorl.petals`. */
  fullName: string;
  name: string;
  /** The part or function it's declared in, if any. */
  owner: string | undefined;
  section: GeneSection;
  kind: GeneKind;
  /** The value written in the declaration. */
  value: Value;
  /** Numbers and vectors: the range. Colours: the range of saturation, value and alpha (hue is in `hue`). */
  min: Value | undefined;
  max: Value | undefined;
  step: number | undefined;
  log: boolean;
  hue: HueArc | undefined;
  /** Choices and part choices. */
  options: Value[] | undefined;
  /** From a comment at the end of the gene's line. */
  description: string | undefined;
  span: Span;
  /** Undefined for the automatic `seed` gene. */
  decl: GeneDecl | undefined;
}

export function hueArc(from: number, to: number): HueArc {
  if (to - from >= 360) return { start: 0, length: 360, whole: true };
  if (from <= to) return { start: wrapHue(from), length: to - from, whole: false };
  return { start: wrapHue(from), length: wrapHue(to - from), whole: false };
}

export function inHueArc(h: number, arc: HueArc): boolean {
  if (arc.whole) return true;
  return wrapHue(h - arc.start) <= arc.length + 1e-9;
}

/** The automatic gene of creatures that use `random` (section 18.5). */
export function seedGene(span: Span): GeneInfo {
  return {
    fullName: "seed",
    name: "seed",
    owner: undefined,
    section: "creature",
    kind: "number",
    value: 0,
    min: 0,
    max: 4294967295,
    step: 1,
    log: false,
    hue: undefined,
    options: undefined,
    description: "Seeds `random`.",
    span,
    decl: undefined,
  };
}
