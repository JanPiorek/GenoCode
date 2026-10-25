// GenoCode's own pattern kinds are written in GenoCode too, in patterns/ (docs/LANGUAGE.md section
// 14.1), and the GenoCode versions draw the same pictures as the built-in ones here.

import { readFileSync } from "node:fs";
import { PATTERN_KINDS, type PatternMix } from "@genocode/core";
import { describe, expect, it } from "vitest";
import { drawField } from "./patterns.js";

const dir = new URL("../../../patterns/", import.meta.url);
const twin = (kind: string) => {
  const name = kind[0]!.toUpperCase() + kind.slice(1);
  return { name, text: readFileSync(new URL(`${name}.genie`, dir), "utf8") };
};

/** The largest difference between two pictures. */
function difference(a: Float32Array, b: Float32Array): number {
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
  return worst;
}

describe.each(PATTERN_KINDS)("%s, written in GenoCode", (kind) => {
  const { name, text } = twin(kind);
  const source = { text, genes: [] };

  it("draws the built-in kind's pictures", () => {
    for (const seed of [0, 3, 41]) {
      const built = drawField(kind, seed, undefined, 96).v;
      const written = drawField(name, seed, undefined, 96, source).v;
      // The built-in kinds keep some random numbers as 32-bit floats; lists hold them in full.
      expect(difference(built, written), `seed ${seed}`).toBeLessThan(1e-5);
    }
  });

  it("is pushed about by a warp as the built-in kind is", () => {
    const mix: PatternMix = { way: "warp", kind: "vortex", amount: 0.6 };
    const built = drawField(kind, 5, mix, 64).v;
    const written = drawField(name, 5, mix, 64, source).v;
    expect(difference(built, written)).toBeLessThan(1e-5);
  });

  // Lightning's finish isn't a blur around its `value` but a glow drawn from the mixed picture,
  // which pattern code can't hold back; the others are blurred after mixing, as built-in kinds are.
  const mixesAlike = kind !== "lightning";

  it.each(["blend", "mask", "carve"] as const)(
    "is mixed with %s as the built-in kind is",
    (way) => {
      for (const seed of [1, 2, 3]) {
        const built = drawField(kind, seed, { way, kind: "cells", amount: 0.6 }, 64).v;
        const written = drawField(name, seed, { way, kind: "cells", amount: 0.6 }, 64, source).v;
        if (mixesAlike) expect(difference(built, written), `seed ${seed}`).toBeLessThan(1e-5);
        else expect(written.every((v) => v >= 0 && v <= 1)).toBe(true);
      }
    },
  );

  it("can be mixed into a built-in kind", () => {
    const built = drawField("marble", 2, { way: "blend", kind, amount: 0.5 }, 64).v;
    const written = drawField("marble", 2, { way: "blend", kind: name, amount: 0.5, source }, 64).v;
    if (mixesAlike) expect(difference(built, written)).toBeLessThan(1e-5);
    else expect(written.every((v) => v >= 0 && v <= 1)).toBe(true);
  });
});
