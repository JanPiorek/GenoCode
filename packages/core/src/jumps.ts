// Colour jumps while morphing: a check that walks a creature's family loop (docs/LANGUAGE.md
// section 19.3) and finds where a shape's colour leaps round the hue circle in an instant, as a
// blend whose hues pass 180 degrees apart does (section 13.1).

import type { CheckResult } from "./checker.js";
import { hueDelta } from "./colour.js";
import { morph, valuesOf } from "./genetics.js";
import { build, type LaidShape } from "./interpreter.js";

export interface ColourJump {
  /** The family members the morph runs between: 0 is the creature itself, then its variants. */
  from: number;
  to: number;
  /** Where between them, 0 to 1. */
  t: number;
  /** How far round the hue circle the colour leaps, in degrees. */
  degrees: number;
}

export interface JumpOptions {
  /** Steps taken through each morph before narrowing a jump down. */
  steps?: number;
  /** The smallest leap, in degrees, that counts. */
  least?: number;
}

/** The narrowest stretch of a morph a jump is narrowed to before it counts. */
const NARROWEST = 1e-5;

/**
 * Where colours jump while the creature morphs through its family loop. A shape that hardly moves
 * while its hue leaps, however finely the morph is cut, is a jump. Washed-out, dark, tiny and
 * textured shapes are left out, as their hue barely shows. A creature without variants has none.
 */
export function colourJumps(program: CheckResult, options: JumpOptions = {}): ColourJump[] {
  const steps = options.steps ?? 60;
  const least = options.least ?? 60;
  const family = [
    valuesOf(program.genes),
    ...program.variants.map((v) => valuesOf(program.genes, v.values)),
  ];
  const n = family.length;
  if (n < 2) return [];
  const jumps: ColourJump[] = [];
  for (let from = 0; from < n; from++) {
    const to = (from + 1) % n;
    const shapesAt = (t: number): LaidShape[] => {
      const m = morph(
        { genes: program.genes, values: family[from]! },
        { genes: program.genes, values: family[to]! },
        t,
      );
      return build(program, { genes: m.values }).shapes;
    };
    let a = 0;
    let before = shapesAt(0);
    for (let k = 1; k <= steps; k++) {
      const b = k / steps;
      const after = shapesAt(b);
      if (leap(before, after) >= least) {
        const found = narrow(shapesAt, a, b, before, after, least);
        if (found) jumps.push({ from, to, ...found });
      }
      a = b;
      before = after;
    }
  }
  return jumps;
}

/** Halves the stretch from `a` to `b` towards the leap until it's too narrow for a shape to move. */
function narrow(
  shapesAt: (t: number) => LaidShape[],
  a: number,
  b: number,
  before: LaidShape[],
  after: LaidShape[],
  least: number,
): { t: number; degrees: number } | undefined {
  while (b - a > NARROWEST) {
    const m = (a + b) / 2;
    const middle = shapesAt(m);
    if (leap(before, middle) >= least) {
      b = m;
      after = middle;
    } else if (leap(middle, after) >= least) {
      a = m;
      before = middle;
    } else {
      // The colour turned over the whole stretch rather than leaping at one point.
      return undefined;
    }
  }
  const degrees = leap(before, after, 1e-3);
  return degrees >= least ? { t: b, degrees } : undefined;
}

/**
 * The biggest hue leap from one build to the next among shapes that show their hue and, when
 * `still` is given, moved less than that.
 */
function leap(before: LaidShape[], after: LaidShape[], still?: number): number {
  if (before.length !== after.length) return 0;
  let most = 0;
  after.forEach((s, i) => {
    const p = before[i]!;
    if (s.shape !== p.shape || s.texture || s.colour.s < 0.15 || s.colour.v < 0.15) return;
    if (Math.hypot(s.matrix[0]!, s.matrix[1]!, s.matrix[2]!) < 0.1) return;
    if (
      still !== undefined &&
      Math.hypot(
        s.matrix[12]! - p.matrix[12]!,
        s.matrix[13]! - p.matrix[13]!,
        s.matrix[14]! - p.matrix[14]!,
      ) > still
    ) {
      return;
    }
    most = Math.max(most, Math.abs(hueDelta(p.colour.h, s.colour.h)));
  });
  return most;
}
