// The library (docs/LANGUAGE.md section 18): built-in functions and constants.

import { hsv, mixColour, NAMED_COLOURS, rgb } from "./colour.js";
import { fbm3, noise3 } from "./noise.js";
import {
  isColour,
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
  type TypeName,
  type Value,
  type Vec,
} from "./values.js";

/** What a built-in function can ask of the running build. */
export interface BuiltinContext {
  random(): number;
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
  return fn(name, 1, "number", (a) => f(num(a, 0, name)));
}

const FUNCTIONS: BuiltinFunction[] = [
  math1("abs", Math.abs),
  math1("sign", (x) => (x > 0 ? 1 : x < 0 ? -1 : 0)),
  math1("floor", Math.floor),
  math1("ceil", Math.ceil),
  math1("round", roundHalfUp),
  math1("frac", (x) => x - Math.trunc(x)),
  fn("min", 2, "number", (a) => Math.min(num(a, 0, "min"), num(a, 1, "min"))),
  fn("max", 2, "number", (a) => Math.max(num(a, 0, "max"), num(a, 1, "max"))),
  fn("clamp", 3, "number", (a) => {
    const x = num(a, 0, "clamp");
    const lo = num(a, 1, "clamp");
    const hi = num(a, 2, "clamp");
    return Math.min(hi, Math.max(lo, x));
  }),
  fn("wrap", 3, "number", (a) => {
    const x = num(a, 0, "wrap");
    const lo = num(a, 1, "wrap");
    const hi = num(a, 2, "wrap");
    return hi === lo ? lo : lo + mod(x - lo, hi - lo);
  }),
  fn("bounce", 3, "number", (a) => {
    const x = num(a, 0, "bounce");
    const lo = num(a, 1, "bounce");
    const hi = num(a, 2, "bounce");
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
  fn("atan2", 2, "number", (a) => Math.atan2(num(a, 0, "atan2"), num(a, 1, "atan2")) / DEG),
  math1("degrees", (r) => r / DEG),
  math1("radians", (d) => d * DEG),
  math1("wave", (t) => Math.sin(t * 360 * DEG)),
  math1("bump", (t) => Math.sin(t * 180 * DEG)),
  fn("mix", 3, undefined, (a) => mix(a[0]!, a[1]!, num(a, 2, "mix"), "mix")),
  fn("smoothmix", 3, undefined, (a) => {
    const t = Math.min(1, Math.max(0, num(a, 2, "smoothmix")));
    return mix(a[0]!, a[1]!, (1 - Math.cos(180 * t * DEG)) / 2, "smoothmix");
  }),
  fn("mandel", 2, "number", (a) => mandel(num(a, 0, "mandel"), num(a, 1, "mandel"))),
  fn("vec", 3, "vector", (a) => vec(num(a, 0, "vec"), num(a, 1, "vec"), num(a, 2, "vec"))),
  fn("length", 1, "number", (a) => {
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
  fn("noise", 1, "number", (a) => noise3(...noiseInput(a, "noise")), false),
  fn("fbm", 1, "number", (a) => fbm3(...noiseInput(a, "fbm")), false),
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
