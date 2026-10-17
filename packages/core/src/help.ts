// Help for editors: what a name means when you point at it, and which names can be typed where.
// The text follows docs/LANGUAGE.md, and help.test.ts keeps every built-in covered.

import type { Block, Param, Stmt } from "./ast.js";
import { BUILTIN_CONSTANTS } from "./builtins.js";
import type { CheckResult } from "./checker.js";
import { NAMED_COLOURS } from "./colour.js";
import type { GeneInfo } from "./genes.js";
import { KEYWORDS, lex, type Token } from "./lexer.js";
import type { Span } from "./source.js";
import { FINISHES, formatValue, MIX_WAYS, PATTERN_KINDS, SCHEMES, SHAPES } from "./values.js";

export interface Help {
  /** How it's written, such as `clamp(x, lo, hi)`. */
  title: string;
  /** What it does, in a sentence or two. */
  text: string;
  /** The section of docs/LANGUAGE.md that explains it, such as `18.1`. */
  section: string;
}

export type CompletionKind =
  "keyword" | "function" | "constant" | "input" | "gene" | "part" | "variable" | "member";

export interface Completion {
  label: string;
  kind: CompletionKind;
  /** A short note shown beside the label. */
  detail: string;
}

const h = (title: string, text: string, section: string): Help => ({ title, text, section });

/** The built-in functions. */
export const FUNCTION_HELP: ReadonlyMap<string, Help> = new Map([
  ["abs", h("abs(x)", "The absolute value of `x`.", "18.1")],
  ["sign", h("sign(x)", "−1, 0 or 1, depending on the sign of `x`.", "18.1")],
  ["floor", h("floor(x)", "`x` rounded down.", "18.1")],
  ["ceil", h("ceil(x)", "`x` rounded up.", "18.1")],
  ["round", h("round(x)", "The nearest whole number, halves rounded up.", "18.1")],
  [
    "frac",
    h("frac(x)", "`x` minus its whole part, keeping the sign: `frac(-1.25)` is `-0.25`.", "18.1"),
  ],
  ["min", h("min(a, b)", "The smaller of `a` and `b`.", "18.1")],
  ["max", h("max(a, b)", "The larger of `a` and `b`.", "18.1")],
  ["clamp", h("clamp(x, lo, hi)", "`x` limited to lo..hi.", "18.1")],
  ["wrap", h("wrap(x, lo, hi)", "`x` wrapped round into lo..hi, so that hi wraps to lo.", "18.1")],
  ["bounce", h("bounce(x, lo, hi)", "`x` folded back and forth between lo and hi.", "18.1")],
  ["sqrt", h("sqrt(x)", "The square root of `x`.", "18.1")],
  ["exp", h("exp(x)", "e to the power `x`.", "18.1")],
  ["ln", h("ln(x)", "The natural logarithm of `x`.", "18.1")],
  ["log10", h("log10(x)", "The base-10 logarithm of `x`.", "18.1")],
  ["sin", h("sin(a)", "The sine of `a`, in degrees.", "18.1")],
  ["cos", h("cos(a)", "The cosine of `a`, in degrees.", "18.1")],
  ["tan", h("tan(a)", "The tangent of `a`, in degrees.", "18.1")],
  ["asin", h("asin(x)", "The angle whose sine is `x`, in degrees.", "18.1")],
  ["acos", h("acos(x)", "The angle whose cosine is `x`, in degrees.", "18.1")],
  ["atan", h("atan(x)", "The angle whose tangent is `x`, in degrees.", "18.1")],
  ["atan2", h("atan2(y, x)", "The angle of the point (x, y) from the x axis, in degrees.", "18.1")],
  ["degrees", h("degrees(r)", "Converts radians to degrees.", "18.1")],
  ["radians", h("radians(d)", "Converts degrees to radians.", "18.1")],
  [
    "wave",
    h("wave(t)", "`sin(t × 360)`: one full wave (0, 1, 0, −1, 0) as `t` goes from 0 to 1.", "18.1"),
  ],
  [
    "bump",
    h(
      "bump(t)",
      "`sin(t × 180)`: rises from 0 to 1 and back to 0 as `t` goes from 0 to 1.",
      "18.1",
    ),
  ],
  [
    "mix",
    h(
      "mix(a, b, t)",
      "`(1 − t)·a + t·b`, for numbers, vectors and colours. Colours blend hue the short way round.",
      "18.1",
    ),
  ],
  [
    "smoothmix",
    h("smoothmix(a, b, t)", "Like `mix`, but eases in and out. `t` is clamped to 0–1.", "18.1"),
  ],
  [
    "mandel",
    h(
      "mandel(x, y)",
      "How quickly the point x + iy escapes the Mandelbrot set, from 0 to 1. 1 means never.",
      "18.1",
    ),
  ],
  ["vec", h("vec(x, y, z)", "The vector `(x, y, z)`.", "18.2")],
  ["length", h("length(v)", "The length of the vector `v`.", "18.2")],
  ["normalize", h("normalize(v)", "`v` scaled to length 1. The zero vector stays zero.", "18.2")],
  ["dot", h("dot(a, b)", "The dot product of two vectors.", "18.2")],
  ["cross", h("cross(a, b)", "The cross product of two vectors.", "18.2")],
  [
    "hsv",
    h(
      "hsv(h, s, v)",
      "A colour from hue (degrees), saturation and value, 0–1. A fourth argument is alpha.",
      "13.1",
    ),
  ],
  [
    "rgb",
    h(
      "rgb(r, g, b)",
      "A colour from red, green and blue, 0–1. A fourth argument is alpha.",
      "13.1",
    ),
  ],
  [
    "noise",
    h(
      "noise(x)",
      "Smooth noise from −1 to 1 that changes gently with `x` (a number or vector).",
      "18.5",
    ),
  ],
  ["fbm", h("fbm(x)", "Fractal noise: five layers of `noise`, from −1 to 1.", "18.5")],
  [
    "random",
    h(
      "random(lo, hi)",
      "A random number from `lo` up to `hi`. The creature's `seed` gene decides the sequence.",
      "18.5",
    ),
  ],
  [
    "pattern",
    h(
      "pattern(kind, hue, seed, scheme, finish)",
      "A texture: a pattern kind such as `marble`, a hue that sets the palette, and a seed; then, if wanted, a colour scheme such as `dusk` and a finish such as `pearl`.",
      "14",
    ),
  ],
  [
    "mixed",
    h(
      "mixed(pattern, way, kind, amount)",
      "A pattern with a second pattern mixed in: `warp`, `blend`, `mask` or `carve`, a pattern kind, and how much from 0 to 1.",
      "14",
    ),
  ],
  [
    "spectrum",
    h(
      "spectrum(c1, c2 at p, …)",
      "Like `gradient`, but hue moves in a straight line between colours, through every hue in between.",
      "13.3",
    ),
  ],
  [
    "gradient",
    h(
      "gradient(c1, c2 at p, …)",
      "Colours blended along 0 to 1. Sample it like a call: `skin(0.5)`.",
      "13.3",
    ),
  ],
]);

const NUMBER_CONSTANTS: ReadonlyMap<string, string> = new Map([
  ["pi", "π, 3.14159…"],
  ["tau", "2π, 6.28318…"],
  ["golden", "The golden ratio, 1.61803…"],
  ["sqrt2", "The square root of 2."],
  ["sqrt3", "The square root of 3."],
  ["ln2", "The natural logarithm of 2."],
  ["x_axis", "The vector `(1, 0, 0)`."],
  ["y_axis", "The vector `(0, 1, 0)`."],
  ["z_axis", "The vector `(0, 0, 1)`."],
  ["none", "No texture: `texture none`."],
]);

const SHAPE_TEXT: Record<string, string> = {
  tube: "A cylinder 1 across and 1 long, along the heading.",
  cube: "A cube with sides of 1.",
  cone: "A cone 1 long along the heading, its tip at the front.",
  ball: "A sphere 1 across.",
  ring: "A thin torus around the heading, 1 across.",
  donut: "A fat torus around the heading, 1 across.",
};

const SCHEME_TEXT: Record<string, string> = {
  jewel: "deep, rich colours beside the hue, from dark to glowing.",
  duotone: "two hues far apart, meeting in a soft neutral.",
  split: "the hue with the two beside its opposite, such as teal with coral and gold.",
  analogous: "close hues flowing into each other.",
  pastel: "light and soft.",
  dusk: "cool shadows and warm lights.",
  electric: "near-black to a blazing colour and white, like neon.",
};

const FINISH_TEXT: Record<string, string> = {
  matte: "plain colours.",
  metallic: "bright bands and white highlights, like polished metal.",
  iridescent: "the hue slides along, like oil on water or a beetle's back.",
  pearl: "pale, with a soft pink-green-blue play of colour.",
  satin: "a soft band of highlight.",
};

const MIX_TEXT: Record<string, string> = {
  warp: "the second pattern pushes the first one around.",
  blend: "the two patterns blended.",
  mask: "the first pattern shows where the second one is bright.",
  carve: "the second pattern is cut out of the first.",
};

/** The built-in constants: numbers, vectors, colours, shapes and pattern kinds. */
export function constantHelp(name: string): Help | undefined {
  const text = NUMBER_CONSTANTS.get(name);
  if (text !== undefined) return h(name, text, name === "none" ? "14" : "18.1");
  const colour = NAMED_COLOURS.get(name);
  if (colour) {
    const alpha = colour.a === 1 ? "" : `, ${colour.a}`;
    return h(name, `The colour hsv(${colour.h}, ${colour.s}, ${colour.v}${alpha}).`, "13.1");
  }
  if ((SHAPES as readonly string[]).includes(name))
    return h(name, `A shape. ${SHAPE_TEXT[name]}`, "12");
  if ((PATTERN_KINDS as readonly string[]).includes(name))
    return h(name, "A pattern kind, for `pattern(kind, hue, seed)`.", "14");
  const scheme = SCHEME_TEXT[name];
  if (scheme !== undefined && (SCHEMES as readonly string[]).includes(name))
    return h(name, `A colour scheme for \`pattern\`: ${scheme}`, "14");
  const finish = FINISH_TEXT[name];
  if (finish !== undefined && (FINISHES as readonly string[]).includes(name))
    return h(name, `A finish for \`pattern\`: ${finish}`, "14");
  const way = MIX_TEXT[name];
  if (way !== undefined && (MIX_WAYS as readonly string[]).includes(name))
    return h(name, `A way of mixing for \`mixed\`: ${way}`, "14");
  return undefined;
}

/** Keywords, and the inputs `time`, `beat`, `music` and `turtle`. */
export const KEYWORD_HELP: ReadonlyMap<string, Help> = new Map([
  ["creature", h("creature Name", "Starts a creature file.", "3")],
  [
    "gene",
    h(
      "gene name = value in min..max",
      "A value the app may change when mutating, breeding and morphing.",
      "6.1",
    ),
  ],
  [
    "part",
    h("part name(a, b) { … }", "A piece of creature: it may move the turtle and lay shapes.", "10"),
  ],
  [
    "function",
    h(
      "function name(a, b) { … }",
      "Calculates a value with `return`. It can't change the turtle or lay shapes.",
      "10",
    ),
  ],
  ["return", h("return value", "Leaves a function with a value, or a part early.", "10")],
  ["let", h("let name = value", "Creates a variable in the current block.", "7")],
  ["if", h("if condition { … } else { … }", "Runs a block when the condition is true.", "9")],
  ["else", h("else { … }", "What `if` runs when its condition is false.", "9")],
  ["repeat", h("repeat n as i { … }", "Runs a block `n` times, with `i` counting from 0.", "9")],
  ["as", h("repeat n as i", "Names the counter of a `repeat` loop.", "9")],
  [
    "for",
    h(
      "for v from a to b by s { … }",
      "Runs a block for `v` from `a` to `b`, in steps of `s` (1 if left out).",
      "9",
    ),
  ],
  [
    "from",
    h("from", "In `for`: where the loop starts. In a gene: the options it chooses from.", "9"),
  ],
  ["to", h("to", "In `for`: where the loop ends.", "9")],
  ["by", h("by", "In `for`: the step.", "9")],
  ["while", h("while condition { … }", "Runs a block for as long as the condition is true.", "9")],
  ["branch", h("branch { … }", "Runs a block, then puts the turtle back as it was.", "11.5")],
  [
    "lay",
    h(
      "lay  /  lay { … }",
      "Lays the current shape, optionally with an extra shape transform.",
      "12",
    ),
  ],
  [
    "reshape",
    h("reshape { … }", "Changes the shape transform for every shape laid afterwards.", "11.7"),
  ],
  [
    "symmetric",
    h(
      "symmetric x { … }",
      "Runs a block twice, the second time mirrored. `side` is 1, then −1.",
      "11.6",
    ),
  ],
  [
    "shape",
    h("shape s", "The shape for later `lay`s: tube, cube, cone, ball, ring or donut.", "12"),
  ],
  ["colour", h("colour c", "The colour for later shapes.", "13.2")],
  ["color", h("color c", "The colour for later shapes.", "13.2")],
  ["shine", h("shine x", "Strength of highlights, 0–1.", "13.2")],
  ["sharpness", h("sharpness x", "How tight the highlights are, 0–1.", "13.2")],
  ["texture", h("texture p", "The texture for later shapes: a `pattern(…)`, or `none`.", "13.2")],
  [
    "wear",
    h(
      "wear x",
      "How much of their texture later shapes wear, 0–1: 0 their plain colour, 1 all texture.",
      "13.2",
    ),
  ],
  [
    "background",
    h("background { … fill p }", "The background the creature is shown against.", "15"),
  ],
  ["fill", h("fill p", "What the background shows: a pattern, a colour or a gradient.", "15")],
  ["dance", h("dance { … }", "The creature's dance style: how music moves it as a whole.", "17")],
  [
    "variant",
    h(
      "variant Name { gene = value }",
      "Another set of gene values for the creature, such as a member of its family.",
      "6.6",
    ),
  ],
  ["forward", h("forward d", "Moves the turtle `d` along its heading.", "11.2")],
  ["back", h("back d", "Moves the turtle `d` backwards.", "11.2")],
  ["move", h("move (x, y, z)", "Moves the turtle along its side, up and heading axes.", "11.2")],
  ["pitch", h("pitch a", "Turns about the side axis: positive tips the nose down.", "11.3")],
  ["yaw", h("yaw a", "Turns about the up axis, towards the side axis.", "11.3")],
  ["roll", h("roll a", "Turns about the heading.", "11.3")],
  [
    "rotate",
    h(
      "rotate a around v",
      "Turns `a` degrees about the axis `v`, in the turtle's own axes.",
      "11.3",
    ),
  ],
  ["around", h("rotate a around v", "The axis that `rotate` turns about.", "11.3")],
  [
    "grow",
    h("grow k  /  grow (x, y, z)", "Multiplies the turtle's size. Negative values mirror.", "11.4"),
  ],
  ["mirror", h("mirror x", "Reverses one of the turtle's axes: x, y or z.", "11.4")],
  ["in", h("gene name = v in min..max", "A gene's range.", "6.1")],
  ["step", h("in min..max step s", "A gene that moves in whole steps of `s`.", "6.1")],
  ["log", h("in min..max log", "A gene that changes by ratios rather than amounts.", "6.1")],
  ["at", h("colour at p", "Where a gradient stop sits, from 0 to 1.", "13.3")],
  ["and", h("a and b", "True if both sides are.", "8.1")],
  ["or", h("a or b", "True if either side is.", "8.1")],
  ["not", h("not a", "The opposite of a bool.", "8.1")],
  ["true", h("true", "A bool.", "5")],
  ["false", h("false", "A bool.", "5")],
  ["print", h("print(a, b, …)", "Writes its arguments to the app's console.", "18.6")],
  [
    "turtle",
    h(
      "turtle.position",
      "Reads the turtle: position, heading, up, side, size, mirrored, shape, colour…",
      "18.4",
    ),
  ],
  ["time", h("time", "Seconds since the creature started being shown.", "16")],
  ["beat", h("beat", "Position within the current beat: 0 on the beat, rising towards 1.", "16")],
  [
    "music",
    h(
      "music.bass",
      "The music: `bass`, `mid`, `high`, `level`, `hit`, `bass_hit`, `mid_hit` and `high_hit`, each 0–1.",
      "16",
    ),
  ],
]);

/** The parts of `music` and `turtle`. */
export const MEMBER_HELP: ReadonlyMap<string, ReadonlyMap<string, Help>> = new Map([
  [
    "music",
    new Map([
      ["bass", h("music.bass", "Level of the low frequencies, 0–1.", "16")],
      ["mid", h("music.mid", "Level of the middle frequencies, 0–1.", "16")],
      ["high", h("music.high", "Level of the high frequencies, 0–1.", "16")],
      ["level", h("music.level", "Overall loudness, 0–1.", "16")],
      ["hit", h("music.hit", "Jumps up on each drum hit or note, then falls back, 0–1.", "16")],
      [
        "bass_hit",
        h(
          "music.bass_hit",
          "Jumps up on each low hit, such as a kick drum, then falls back, 0–1.",
          "16",
        ),
      ],
      [
        "mid_hit",
        h(
          "music.mid_hit",
          "Jumps up on each hit in the middle, such as a snare, then falls back, 0–1.",
          "16",
        ),
      ],
      [
        "high_hit",
        h(
          "music.high_hit",
          "Jumps up on each high hit, such as a hi-hat, then falls back, 0–1.",
          "16",
        ),
      ],
    ]),
  ],
  [
    "turtle",
    new Map([
      [
        "position",
        h("turtle.position", "The turtle's position in world space (a vector).", "18.4"),
      ],
      ["heading", h("turtle.heading", "The heading, as a unit vector in world space.", "18.4")],
      ["up", h("turtle.up", "The up axis, as a unit vector.", "18.4")],
      ["side", h("turtle.side", "The side axis, as a unit vector.", "18.4")],
      ["size", h("turtle.size", "The size per axis (a vector).", "18.4")],
      ["mirrored", h("turtle.mirrored", "Whether the turtle is mirrored (a bool).", "18.4")],
      ["shape", h("turtle.shape", "The current shape.", "18.4")],
      ["colour", h("turtle.colour", "The current colour.", "18.4")],
      ["color", h("turtle.color", "The current colour.", "18.4")],
      ["shine", h("turtle.shine", "The current shine.", "18.4")],
      ["sharpness", h("turtle.sharpness", "The current sharpness.", "18.4")],
      ["texture", h("turtle.texture", "The current texture.", "18.4")],
      ["wear", h("turtle.wear", "How much of its texture the turtle's shapes wear.", "18.4")],
    ]),
  ],
]);

/** A gene's range in words, such as `3 to 16, steps of 1`. */
export function geneRange(g: GeneInfo): string {
  if (g.options) return `one of ${g.options.map(formatValue).join(", ")}`;
  if (g.kind === "bool") return "true or false";
  if (g.kind === "colour")
    return g.hue?.whole ? "any hue" : `hues ${g.hue!.start}° + ${g.hue!.length}°`;
  if (g.min === undefined || g.max === undefined) return "";
  let text = `${formatValue(g.min)} to ${formatValue(g.max)}`;
  if (g.step !== undefined) text += `, steps of ${g.step}`;
  if (g.log) text += ", by ratios";
  return text;
}

// ---------- what's in scope ----------

interface InScope {
  name: string;
  kind: "gene" | "part" | "function" | "variable";
  help: Help;
}

const signature = (name: string, params: Param[]) =>
  params.length === 0 ? name : `${name}(${params.map((p) => p.name).join(", ")})`;

const contains = (s: Span, offset: number) => s.start <= offset && offset <= s.end;

/** The names that can be used at `offset`, innermost last so they win over outer ones. */
function symbolsAt(program: CheckResult, offset: number): InScope[] {
  const out: InScope[] = [];
  const geneOf = (stmt: Stmt) => program.genes.find((g) => g.decl === stmt);
  const geneSymbol = (g: GeneInfo): InScope => ({
    name: g.name,
    kind: "gene",
    help: h(
      `gene ${g.fullName}`,
      [g.description, geneRange(g)].filter(Boolean).join(" · ") || "A gene.",
      "6",
    ),
  });
  const variable = (name: string, text: string, section: string): InScope => ({
    name,
    kind: "variable",
    help: h(name, text, section),
  });

  const items = program.file.items;
  // Inside a variant, every gene can be set, by its full name.
  if (items.some((s) => s.kind === "Variant" && contains(s.body.span, offset))) {
    return program.genes.map((g) => ({ ...geneSymbol(g), name: g.fullName }));
  }

  // Declarations that can be used from anywhere in the creature.
  const selfContained = items.find(
    (s) => (s.kind === "Background" || s.kind === "Dance") && contains(s.span, offset),
  );
  if (!selfContained) {
    for (const s of items) {
      if (s.kind === "Part" || s.kind === "Function") {
        out.push({
          name: s.name,
          kind: s.kind === "Part" ? "part" : "function",
          help: h(
            `${s.kind === "Part" ? "part" : "function"} ${signature(s.name, s.params)}`,
            s.kind === "Part"
              ? "A part defined in this creature."
              : "A function defined in this creature.",
            "10",
          ),
        });
      }
    }
  }

  const visit = (stmts: readonly Stmt[], inBody: boolean): void => {
    for (const s of stmts) {
      if (s.kind === "Gene") {
        const g = geneOf(s);
        if (g) out.push(geneSymbol(g));
      } else if (s.kind === "Let" && s.span.start < offset) {
        out.push(variable(s.name, inBody ? "A variable." : "A global variable.", "7"));
      }
    }
    for (const s of stmts) {
      if (!contains(s.span, offset)) continue;
      const into = (b: Block | undefined) => {
        if (b && contains(b.span, offset)) visit(b.items, inBody);
      };
      switch (s.kind) {
        case "Part":
        case "Function":
          if (!contains(s.body.span, offset)) break;
          for (const p of s.params)
            out.push(variable(p.name, `A parameter of \`${s.name}\`.`, "10"));
          visit(s.body.items, true);
          break;
        case "Background":
        case "Dance":
          into(s.body);
          break;
        case "If":
          for (const b of s.branches) into(b.block);
          into(s.elseBlock);
          break;
        case "Repeat":
          if (s.as && contains(s.block.span, offset))
            out.push(variable(s.as.name, "The loop's counter, from 0.", "9"));
          into(s.block);
          break;
        case "For":
          if (contains(s.block.span, offset))
            out.push(variable(s.variable.name, "The loop's variable.", "9"));
          into(s.block);
          break;
        case "Symmetric":
          if (contains(s.block.span, offset))
            out.push(variable("side", "1 on the first run, −1 on the mirrored one.", "11.6"));
          into(s.block);
          break;
        case "While":
        case "Branch":
        case "Reshape":
        case "Lay":
          into(s.block);
          break;
      }
    }
  };
  visit(selfContained ? [selfContained] : items, false);
  return out;
}

// ---------- hover ----------

/** The word at `offset`, counting a position just after a word, or just before one, as on it. */
function tokenAt(tokens: readonly Token[], offset: number): number {
  const on = (t: Token) => t.span.start <= offset && offset <= t.span.end;
  const word = tokens.findIndex((t) => (t.kind === "name" || t.kind === "keyword") && on(t));
  if (word >= 0) return word;
  return tokens.findIndex((t) => t.kind !== "newline" && t.kind !== "eof" && on(t));
}

/** Help for the word at `offset`, and where that word is. */
export function helpAt(
  program: CheckResult,
  offset: number,
): { span: Span; help: Help } | undefined {
  const { tokens } = lex(program.text);
  const i = tokenAt(tokens, offset);
  const t = tokens[i];
  if (!t || (t.kind !== "name" && t.kind !== "keyword")) return undefined;
  const found = (help: Help | undefined) => (help ? { span: t.span, help } : undefined);

  // A gene set in a variant, such as `whorl.petals`.
  for (const item of program.file.items) {
    if (item.kind !== "Variant") continue;
    for (const g of item.body.items) {
      if (g.kind !== "GeneSetting" || !contains(g.geneSpan, offset)) continue;
      const gene = symbolsAt(program, offset).find((x) => x.name === g.gene);
      return gene ? { span: g.geneSpan, help: gene.help } : undefined;
    }
  }

  // `music.bass`, `turtle.heading`: the word after the dot.
  const dot = tokens[i - 1];
  const owner = tokens[i - 2];
  if (dot?.text === "." && owner && MEMBER_HELP.has(owner.text)) {
    return found(MEMBER_HELP.get(owner.text)!.get(t.text));
  }
  if (t.kind === "name") {
    const symbols = symbolsAt(program, offset).filter((s) => s.name === t.text);
    if (symbols.length > 0) return found(symbols[symbols.length - 1]!.help);
    return found(FUNCTION_HELP.get(t.text) ?? constantHelp(t.text));
  }
  return found(KEYWORD_HELP.get(t.text));
}

// ---------- completion ----------

/** What can be typed at `offset`: everything in scope, built-ins and keywords. */
export function completionsAt(program: CheckResult, offset: number): Completion[] {
  // After `music.` or `turtle.`, only their parts.
  const before = lex(program.text).tokens.filter(
    (t) => t.kind !== "newline" && t.kind !== "eof" && t.span.end <= offset,
  );
  let k = before.length - 1;
  const last = before[k];
  if (last && (last.kind === "name" || last.kind === "keyword") && last.span.end === offset) k--;
  const dot = before[k];
  const owner = before[k - 1];
  if (dot?.text === "." && owner && MEMBER_HELP.has(owner.text)) {
    return [...MEMBER_HELP.get(owner.text)!.entries()].map(([label, help]) => ({
      label,
      kind: "member",
      detail: help.text,
    }));
  }

  const out = new Map<string, Completion>();
  const add = (c: Completion) => out.set(c.label, c);
  for (const k of KEYWORDS) {
    if (k === "time" || k === "beat" || k === "music" || k === "turtle") {
      add({ label: k, kind: "input", detail: KEYWORD_HELP.get(k)!.text });
    } else {
      add({ label: k, kind: "keyword", detail: KEYWORD_HELP.get(k)?.title ?? "" });
    }
  }
  for (const [name, help] of FUNCTION_HELP)
    add({ label: name, kind: "function", detail: help.title });
  for (const name of BUILTIN_CONSTANTS.keys()) {
    add({ label: name, kind: "constant", detail: constantHelp(name)?.text ?? "" });
  }
  for (const s of symbolsAt(program, offset)) {
    add({ label: s.name, kind: s.kind, detail: s.kind === "gene" ? s.help.text : s.help.title });
  }
  return [...out.values()];
}
