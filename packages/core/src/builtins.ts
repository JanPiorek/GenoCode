// The library (docs/LANGUAGE.md section 18): built-in functions and constants.

import { hsv, mixColour, NAMED_COLOURS, rgb } from "./colour.js";
import { fbm3, noise3 } from "./noise.js";
import * as pictures from "./picture.js";
import {
  isColour,
  isList,
  isPicture,
  isVec,
  FINISHES,
  MIX_WAYS,
  NO_PATTERN,
  PATTERN_KINDS,
  roundHalfUp,
  SCHEMES,
  SHAPES,
  typeLabel,
  typeOf,
  ValueError,
  vec,
  type Picture,
  type TypeName,
  type Value,
  type Vec,
} from "./values.js";

/** What a built-in function can ask of the running build. */
export interface BuiltinContext {
  random(): number;
  /** In pattern code: the size of the pictures being drawn (section 14.1). */
  pictureSize?: number;
}

export interface BuiltinFunction {
  name: string;
  minArgs: number;
  maxArgs: number;
  /** The result's type, or undefined when it depends on the arguments. */
  returns: TypeName | undefined;
  /** Allowed in constant expressions (section 6.1). */
  constant: boolean;
  call(args: Value[], ctx: BuiltinContext): Value;
  /**
   * The same function for arguments that are all numbers, for code that knows they are, such as
   * the per-pixel code of pictures (section 14.1). It gives exactly what `call` gives.
   */
  numeric?: (...args: number[]) => number;
}

const DEG = Math.PI / 180;

function num(args: Value[], i: number, fn: string): number {
  const v = args[i]!;
  if (typeof v !== "number") {
    throw new ValueError(
      `\`${fn}\` needs a number for argument ${i + 1}, not ${typeLabel(typeOf(v))}.`,
    );
  }
  return v;
}

type Word = Extract<Value, { type: "patternKind" | "scheme" | "finish" | "mixWay" }>;

/** An argument that must be one of a set of words, such as a pattern kind or a colour scheme. */
function word<T extends Word["type"]>(
  args: Value[],
  i: number,
  fn: string,
  type: T,
  example: string,
): Extract<Word, { type: T }> {
  const v = args[i]!;
  if (typeof v !== "object" || v.type !== type) {
    throw new ValueError(
      `\`${fn}\` needs ${typeLabel(type)} for argument ${i + 1}, such as \`${example}\`, not ${typeLabel(typeOf(v))}.`,
    );
  }
  return v as Extract<Word, { type: T }>;
}

function vecArg(args: Value[], i: number, fn: string): Vec {
  const v = args[i]!;
  if (!isVec(v)) {
    throw new ValueError(
      `\`${fn}\` needs a vector for argument ${i + 1}, not ${typeLabel(typeOf(v))}.`,
    );
  }
  return v;
}

function mod(a: number, n: number): number {
  const m = a % n;
  return m < 0 ? m + n : m;
}

function mix(a: Value, b: Value, t: number, fn: string): Value {
  if (typeof a === "number" && typeof b === "number") return (1 - t) * a + t * b;
  if (isVec(a) && isVec(b))
    return vec((1 - t) * a.x + t * b.x, (1 - t) * a.y + t * b.y, (1 - t) * a.z + t * b.z);
  if (isColour(a) && isColour(b)) return mixColour(a, b, t);
  throw new ValueError(
    `\`${fn}\` blends two numbers, two vectors or two colours, not ${typeLabel(typeOf(a))} and ${typeLabel(typeOf(b))}.`,
  );
}

function mandel(cx: number, cy: number): number {
  let x = 0;
  let y = 0;
  for (let i = 0; i < 64; i++) {
    const nx = x * x - y * y + cx;
    y = 2 * x * y + cy;
    x = nx;
    if (x * x + y * y > 4) return i / 64;
  }
  return 1;
}

function noiseInput(args: Value[], fn: string): [number, number, number] {
  const v = args[0]!;
  if (typeof v === "number") return [v, 0, 0];
  if (isVec(v)) return [v.x, v.y, v.z];
  throw new ValueError(`\`${fn}\` needs a number or a vector, not ${typeLabel(typeOf(v))}.`);
}

type Impl = (args: Value[], ctx: BuiltinContext) => Value;

function fn(
  name: string,
  arity: number | [number, number],
  returns: TypeName | undefined,
  call: Impl,
  constant = true,
): BuiltinFunction {
  const [minArgs, maxArgs] = typeof arity === "number" ? [arity, arity] : arity;
  return { name, minArgs, maxArgs, returns, constant, call };
}

function math1(name: string, f: (x: number) => number): BuiltinFunction {
  return { ...fn(name, 1, "number", (a) => f(num(a, 0, name))), numeric: f };
}

/** A function of numbers only, with its numeric form. */
function mathN(name: string, f: (...x: number[]) => number): BuiltinFunction {
  const n = f.length;
  return {
    ...fn(name, n, "number", (a) => {
      const xs: number[] = [];
      for (let i = 0; i < n; i++) xs.push(num(a, i, name));
      return f(...xs);
    }),
    numeric: f,
  };
}

/** Gives a function that also takes other values a numeric form, for when all its arguments are numbers. */
function withNumeric(b: BuiltinFunction, numeric: (...x: number[]) => number): BuiltinFunction {
  return { ...b, numeric };
}

const mixNumbers = (a: number, b: number, t: number) => (1 - t) * a + t * b;

const FUNCTIONS: BuiltinFunction[] = [
  math1("abs", Math.abs),
  math1("sign", (x) => (x > 0 ? 1 : x < 0 ? -1 : 0)),
  math1("floor", Math.floor),
  math1("ceil", Math.ceil),
  math1("round", roundHalfUp),
  math1("frac", (x) => x - Math.trunc(x)),
  mathN("min", (p: number, q: number) => Math.min(p, q)),
  mathN("max", (p: number, q: number) => Math.max(p, q)),
  mathN("clamp", (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))),
  mathN("wrap", (x: number, lo: number, hi: number) =>
    hi === lo ? lo : lo + mod(x - lo, hi - lo),
  ),
  mathN("bounce", (x: number, lo: number, hi: number) => {
    const w = hi - lo;
    if (w === 0) return lo;
    const m = mod(x - lo, 2 * w);
    return lo + (m <= w ? m : 2 * w - m);
  }),
  math1("sqrt", Math.sqrt),
  math1("exp", Math.exp),
  math1("ln", Math.log),
  math1("log10", Math.log10),
  math1("sin", (d) => Math.sin(d * DEG)),
  math1("cos", (d) => Math.cos(d * DEG)),
  math1("tan", (d) => Math.tan(d * DEG)),
  math1("asin", (x) => Math.asin(x) / DEG),
  math1("acos", (x) => Math.acos(x) / DEG),
  math1("atan", (x) => Math.atan(x) / DEG),
  mathN("atan2", (y: number, x: number) => Math.atan2(y, x) / DEG),
  math1("degrees", (r) => r / DEG),
  math1("radians", (d) => d * DEG),
  math1("wave", (t) => Math.sin(t * 360 * DEG)),
  math1("bump", (t) => Math.sin(t * 180 * DEG)),
  withNumeric(
    fn("mix", 3, undefined, (a) => mix(a[0]!, a[1]!, num(a, 2, "mix"), "mix")),
    mixNumbers,
  ),
  withNumeric(
    fn("smoothmix", 3, undefined, (a) => {
      const t = Math.min(1, Math.max(0, num(a, 2, "smoothmix")));
      return mix(a[0]!, a[1]!, (1 - Math.cos(180 * t * DEG)) / 2, "smoothmix");
    }),
    (a, b, t) => mixNumbers(a, b, (1 - Math.cos(180 * Math.min(1, Math.max(0, t)) * DEG)) / 2),
  ),
  mathN("mandel", mandel),
  fn("vec", 3, "vector", (a) => vec(num(a, 0, "vec"), num(a, 1, "vec"), num(a, 2, "vec"))),
  fn("length", 1, "number", (a) => {
    // A list's length is how many items it has (section 8.3).
    const l = a[0]!;
    if (isList(l)) return l.items.length;
    const v = vecArg(a, 0, "length");
    return Math.hypot(v.x, v.y, v.z);
  }),
  fn("normalize", 1, "vector", (a) => {
    const v = vecArg(a, 0, "normalize");
    const l = Math.hypot(v.x, v.y, v.z);
    return l === 0 ? vec(0, 0, 0) : vec(v.x / l, v.y / l, v.z / l);
  }),
  fn("dot", 2, "number", (a) => {
    const p = vecArg(a, 0, "dot");
    const q = vecArg(a, 1, "dot");
    return p.x * q.x + p.y * q.y + p.z * q.z;
  }),
  fn("cross", 2, "vector", (a) => {
    const p = vecArg(a, 0, "cross");
    const q = vecArg(a, 1, "cross");
    return vec(p.y * q.z - p.z * q.y, p.z * q.x - p.x * q.z, p.x * q.y - p.y * q.x);
  }),
  fn("hsv", [3, 4], "colour", (a) =>
    hsv(num(a, 0, "hsv"), num(a, 1, "hsv"), num(a, 2, "hsv"), a.length > 3 ? num(a, 3, "hsv") : 1),
  ),
  fn("rgb", [3, 4], "colour", (a) =>
    rgb(num(a, 0, "rgb"), num(a, 1, "rgb"), num(a, 2, "rgb"), a.length > 3 ? num(a, 3, "rgb") : 1),
  ),
  withNumeric(
    fn("noise", 1, "number", (a) => noise3(...noiseInput(a, "noise")), false),
    (x) => noise3(x, 0, 0),
  ),
  withNumeric(
    fn("fbm", 1, "number", (a) => fbm3(...noiseInput(a, "fbm")), false),
    (x) => fbm3(x, 0, 0),
  ),
  fn(
    "random",
    2,
    "number",
    (a, ctx) => {
      const lo = num(a, 0, "random");
      const hi = num(a, 1, "random");
      return lo + (hi - lo) * ctx.random();
    },
    false,
  ),
  fn(
    "pattern",
    [3, 5],
    "pattern",
    (a) => ({
      type: "pattern",
      kind: word(a, 0, "pattern", "patternKind", "marble").name,
      hue: num(a, 1, "pattern"),
      seed: roundHalfUp(num(a, 2, "pattern")),
      scheme: a.length > 3 ? word(a, 3, "pattern", "scheme", "dusk").name : "jewel",
      finish: a.length > 4 ? word(a, 4, "pattern", "finish", "pearl").name : "matte",
    }),
    false,
  ),
  fn(
    "mixed",
    4,
    "pattern",
    (a) => {
      const p = a[0]!;
      if (typeof p !== "object" || p.type !== "pattern") {
        throw new ValueError(
          `\`mixed\` needs a pattern first, such as \`pattern(marble, 200, 7)\`, not ${typeLabel(typeOf(p))}.`,
        );
      }
      const way = word(a, 1, "mixed", "mixWay", "warp").name;
      const kind = word(a, 2, "mixed", "patternKind", "vortex").name;
      const amount = Math.min(1, Math.max(0, num(a, 3, "mixed")));
      // Nothing mixed with something is still nothing; mixing again replaces the second pattern.
      return p.kind === null ? p : { ...p, mix: { way, kind, amount } };
    },
    false,
  ),
];

/**
 * The picture functions (section 18.7). They're built in only in pattern code, so creatures can
 * still use their names, such as `stretch`, for their own variables.
 */
export const PICTURE_FUNCTIONS: ReadonlyMap<string, BuiltinFunction> = new Map(
  [
    fn(
      "clouds",
      [0, 2],
      "picture",
      (a, ctx) => {
        const size = ctx.pictureSize;
        if (size === undefined) throw new ValueError("`clouds` can only be used in a pattern.");
        const octaves = a.length > 0 ? roundHalfUp(num(a, 0, "clouds")) : 6;
        const base = a.length > 1 ? roundHalfUp(num(a, 1, "clouds")) : 4;
        if (octaves < 1 || octaves > 12) throw new ValueError("`clouds` takes 1 to 12 layers.");
        if (base < 1) throw new ValueError("`clouds` needs a grid of at least 1 × 1.");
        return { type: "picture", size, v: pictures.fbm(ctx.random, size, octaves, base) };
      },
      false,
    ),
    fn(
      "blur",
      [2, 3],
      "picture",
      (a) => {
        const p = picture(a, 0, "blur");
        const across = num(a, 1, "blur");
        const down = a.length > 2 ? num(a, 2, "blur") : across;
        return { type: "picture", size: p.size, v: pictures.blur(p.v, p.size, across, down) };
      },
      false,
    ),
    fn(
      "zoom_blur",
      2,
      "picture",
      (a) => {
        const p = picture(a, 0, "zoom_blur");
        return {
          type: "picture",
          size: p.size,
          v: pictures.zoomBlur(p.v, p.size, num(a, 1, "zoom_blur")),
        };
      },
      false,
    ),
    fn(
      "stretch",
      1,
      "picture",
      (a) => {
        const p = picture(a, 0, "stretch");
        const v = p.v.slice();
        pictures.normalise(v);
        return { type: "picture", size: p.size, v };
      },
      false,
    ),
    fn(
      "power",
      2,
      "picture",
      (a) => {
        const p = picture(a, 0, "power");
        const v = p.v.slice();
        pictures.power(v, num(a, 1, "power"));
        return { type: "picture", size: p.size, v };
      },
      false,
    ),
  ].map((f) => [f.name, f]),
);

function picture(args: Value[], i: number, fn: string): Picture {
  const v = args[i]!;
  if (!isPicture(v)) {
    throw new ValueError(
      `\`${fn}\` needs a picture for argument ${i + 1}, not ${typeLabel(typeOf(v))}.`,
    );
  }
  return v;
}

export const BUILTIN_FUNCTIONS: ReadonlyMap<string, BuiltinFunction> = new Map(
  FUNCTIONS.map((f) => [f.name, f]),
);

function buildConstants(): Map<string, Value> {
  const c = new Map<string, Value>([
    ["pi", Math.PI],
    ["tau", 2 * Math.PI],
    ["golden", (1 + Math.sqrt(5)) / 2],
    ["sqrt2", Math.SQRT2],
    ["sqrt3", Math.sqrt(3)],
    ["ln2", Math.LN2],
    ["x_axis", vec(1, 0, 0)],
    ["y_axis", vec(0, 1, 0)],
    ["z_axis", vec(0, 0, 1)],
    ["none", NO_PATTERN],
  ]);
  for (const [name, colour] of NAMED_COLOURS) c.set(name, colour);
  for (const name of SHAPES) c.set(name, { type: "shape", name });
  for (const name of PATTERN_KINDS) c.set(name, { type: "patternKind", name });
  for (const name of SCHEMES) c.set(name, { type: "scheme", name });
  for (const name of FINISHES) c.set(name, { type: "finish", name });
  for (const name of MIX_WAYS) c.set(name, { type: "mixWay", name });
  return c;
}

export const BUILTIN_CONSTANTS: ReadonlyMap<string, Value> = buildConstants();

/** Names nobody may define: every built-in, plus `gradient` and `spectrum`, which are syntax. */
export function isBuiltinName(name: string): boolean {
  return (
    BUILTIN_FUNCTIONS.has(name) ||
    BUILTIN_CONSTANTS.has(name) ||
    name === "gradient" ||
    name === "spectrum"
  );
}
