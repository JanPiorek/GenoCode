// Runtime values (docs/LANGUAGE.md section 5) and the operators on them (section 8).

import type { BinaryOp } from "./ast.js";

export interface Vec {
  type: "vector";
  x: number;
  y: number;
  z: number;
}

/** Hue in degrees, 0 up to 360; saturation, value and alpha 0–1. */
export interface Colour {
  type: "colour";
  h: number;
  s: number;
  v: number;
  a: number;
}

export interface GradientStopValue {
  pos: number;
  colour: Colour;
}

export interface Gradient {
  type: "gradient";
  stops: GradientStopValue[];
  /** A spectrum: hue blends in a straight line, rather than the short way round. */
  straight: boolean;
}

export const SHAPES = ["tube", "cube", "cone", "ball", "ring", "donut"] as const;
export type ShapeName = (typeof SHAPES)[number];

export interface ShapeValue {
  type: "shape";
  name: ShapeName;
}

export const PATTERN_KINDS = [
  "sunburst",
  "vortex",
  "plasma",
  "cells",
  "kaleidoscope",
  "interference",
  "starburst",
  "marble",
  "lightning",
  "aurora",
  "bloom",
] as const;
export type PatternKindName = (typeof PATTERN_KINDS)[number];

export interface PatternKindValue {
  type: "patternKind";
  name: PatternKindName;
}

/** A texture recipe. `kind` is null for `none`. */
export interface Pattern {
  type: "pattern";
  kind: PatternKindName | null;
  hue: number;
  seed: number;
}

/** The value of a part choice gene. Not a value the program can store or pass around. */
export interface PartRef {
  type: "part";
  name: string;
}

export type Value =
  | number
  | boolean
  | string
  | Vec
  | Colour
  | Gradient
  | ShapeValue
  | PatternKindValue
  | Pattern
  | PartRef;

export type TypeName =
  | "number"
  | "bool"
  | "string"
  | "vector"
  | "colour"
  | "gradient"
  | "shape"
  | "patternKind"
  | "pattern"
  | "part";

/** A problem with values; the interpreter adds where it happened. */
export class ValueError extends Error {}

export function typeOf(v: Value): TypeName {
  switch (typeof v) {
    case "number":
      return "number";
    case "boolean":
      return "bool";
    case "string":
      return "string";
    default:
      return v.type;
  }
}

const LABELS: Record<TypeName, string> = {
  number: "a number",
  bool: "a bool",
  string: "a string",
  vector: "a vector",
  colour: "a colour",
  gradient: "a gradient",
  shape: "a shape",
  patternKind: "a pattern kind",
  pattern: "a pattern",
  part: "a part",
};

export function typeLabel(t: TypeName): string {
  return LABELS[t];
}

export function vec(x: number, y: number, z: number): Vec {
  return { type: "vector", x, y, z };
}

export function isVec(v: Value): v is Vec {
  return typeof v === "object" && v.type === "vector";
}

export function isColour(v: Value): v is Colour {
  return typeof v === "object" && v.type === "colour";
}

export function valuesEqual(a: Value, b: Value): boolean {
  if (typeof a !== "object" || typeof b !== "object") return a === b;
  switch (a.type) {
    case "vector":
      return b.type === "vector" && a.x === b.x && a.y === b.y && a.z === b.z;
    case "colour":
      return b.type === "colour" && a.h === b.h && a.s === b.s && a.v === b.v && a.a === b.a;
    case "shape":
    case "patternKind":
    case "part":
      return b.type === a.type && a.name === b.name;
    case "pattern":
      return b.type === "pattern" && a.kind === b.kind && a.hue === b.hue && a.seed === b.seed;
    case "gradient":
      return false;
  }
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(6)));
}

/** How `print` shows a value. */
export function formatValue(v: Value): string {
  if (typeof v === "number") return formatNumber(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return v;
  switch (v.type) {
    case "vector":
      return `(${formatNumber(v.x)}, ${formatNumber(v.y)}, ${formatNumber(v.z)})`;
    case "colour":
      return `hsv(${formatNumber(v.h)}, ${formatNumber(v.s)}, ${formatNumber(v.v)}, ${formatNumber(v.a)})`;
    case "gradient":
      return `${v.straight ? "spectrum" : "gradient"}(${v.stops.map((s) => `${formatValue(s.colour)} at ${formatNumber(s.pos)}`).join(", ")})`;
    case "shape":
    case "patternKind":
    case "part":
      return v.name;
    case "pattern":
      return v.kind === null ? "none" : `pattern(${v.kind}, ${formatNumber(v.hue)}, ${v.seed})`;
  }
}

// ---------- operators ----------

function mismatch(op: string, a: Value, b: Value): ValueError {
  return new ValueError(
    `\`${op}\` can't be used on ${typeLabel(typeOf(a))} and ${typeLabel(typeOf(b))}.`,
  );
}

function perAxis(a: Vec, b: Vec, f: (p: number, q: number) => number): Vec {
  return vec(f(a.x, b.x), f(a.y, b.y), f(a.z, b.z));
}

function scaled(v: Vec, f: (p: number) => number): Vec {
  return vec(f(v.x), f(v.y), f(v.z));
}

export function binaryOp(op: BinaryOp, a: Value, b: Value): Value {
  switch (op) {
    case "==":
    case "!=": {
      if (typeOf(a) !== typeOf(b)) {
        throw new ValueError(
          `\`${op}\` compares two values of the same type, not ${typeLabel(typeOf(a))} and ${typeLabel(typeOf(b))}.`,
        );
      }
      if (typeOf(a) === "gradient" || typeOf(a) === "string") {
        throw new ValueError(`${typeLabel(typeOf(a))} can't be compared.`);
      }
      return op === "==" ? valuesEqual(a, b) : !valuesEqual(a, b);
    }
    case "<":
    case "<=":
    case ">":
    case ">=": {
      if (typeof a !== "number" || typeof b !== "number") throw mismatch(op, a, b);
      if (op === "<") return a < b;
      if (op === "<=") return a <= b;
      if (op === ">") return a > b;
      return a >= b;
    }
    case "and":
    case "or":
      if (typeof a !== "boolean" || typeof b !== "boolean") throw mismatch(op, a, b);
      return op === "and" ? a && b : a || b;
    case "^":
      if (typeof a !== "number" || typeof b !== "number") throw mismatch(op, a, b);
      return Math.pow(a, b);
    case "+":
    case "-": {
      const f = op === "+" ? (p: number, q: number) => p + q : (p: number, q: number) => p - q;
      if (typeof a === "number" && typeof b === "number") return f(a, b);
      if (isVec(a) && isVec(b)) return perAxis(a, b, f);
      throw mismatch(op, a, b);
    }
    case "*":
    case "/":
    case "%": {
      const f =
        op === "*"
          ? (p: number, q: number) => p * q
          : op === "/"
            ? (p: number, q: number) => p / q
            : (p: number, q: number) => p % q;
      if (typeof a === "number" && typeof b === "number") return f(a, b);
      if (op !== "%") {
        if (isVec(a) && isVec(b)) return perAxis(a, b, f);
        if (isVec(a) && typeof b === "number") return scaled(a, (p) => f(p, b));
        if (op === "*" && typeof a === "number" && isVec(b)) return scaled(b, (q) => a * q);
      }
      throw mismatch(op, a, b);
    }
  }
}

export function negate(v: Value): Value {
  if (typeof v === "number") return -v;
  if (isVec(v)) return vec(-v.x, -v.y, -v.z);
  throw new ValueError(`\`-\` can't be used on ${typeLabel(typeOf(v))}.`);
}

export function not(v: Value): Value {
  if (typeof v !== "boolean")
    throw new ValueError(`\`not\` needs a bool, not ${typeLabel(typeOf(v))}.`);
  return !v;
}

/** Rounds to a whole number with halves rounded up (section 5). */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

export function member(v: Value, name: string): Value {
  if (isVec(v)) {
    if (name === "x") return v.x;
    if (name === "y") return v.y;
    if (name === "z") return v.z;
  } else if (isColour(v)) {
    if (name === "hue") return v.h;
    if (name === "sat") return v.s;
    if (name === "val") return v.v;
    if (name === "alpha") return v.a;
  }
  throw new ValueError(`${typeLabel(typeOf(v))} has no part called \`${name}\`.`);
}
