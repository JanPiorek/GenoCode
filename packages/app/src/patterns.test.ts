import {
  buildBackground,
  check,
  formatText,
  formatValue,
  NO_PATTERN,
  type Pattern,
} from "@genocode/core";
import { describe, expect, it } from "vitest";
import { backgroundFile, backgroundLines, cross, vary, withBackground } from "./patterns.js";

const recipe: Pattern = { ...NO_PATTERN, kind: "aurora", hue: 160, seed: 12, scheme: "dusk" };
const mixed: Pattern = {
  ...recipe,
  finish: "pearl",
  mix: { way: "warp", kind: "vortex", amount: 0.5 },
};

const CREATURE = "creature Blob\n\nshape ball\nlay\n";

describe("recipes as code", () => {
  it("writes a background file that gives the recipe back, with its parts as genes", () => {
    for (const p of [recipe, mixed]) {
      const r = check(backgroundFile(p));
      expect(r.diagnostics).toEqual([]);
      expect(formatValue(buildBackground(r).fill!)).toBe(formatValue(p));
      expect(r.genes.map((g) => g.fullName)).toContain("background.hue");
      // In the standard layout, as the formatter writes it.
      expect(formatText(backgroundFile(p)).text).toBe(backgroundFile(p));
    }
  });

  it("puts a background into a creature, replacing any it had", () => {
    const once = withBackground(CREATURE, backgroundLines(recipe))!;
    expect(check(once).diagnostics).toEqual([]);
    expect(formatValue(buildBackground(check(once)).fill!)).toBe(formatValue(recipe));
    const twice = withBackground(once, backgroundLines(mixed))!;
    expect(twice.match(/background \{/g)).toHaveLength(1);
    expect(formatValue(buildBackground(check(twice)).fill!)).toBe(formatValue(mixed));
  });

  it("puts it before the creature's variants", () => {
    const text = withBackground(`${CREATURE}\nvariant Big { }\n`, backgroundLines(recipe))!;
    expect(text.indexOf("background {")).toBeLessThan(text.indexOf("variant Big"));
  });
});

describe("variations", () => {
  it("mutates and breeds recipes from their parents' parts", () => {
    const other: Pattern = { ...NO_PATTERN, kind: "cells", hue: 300, seed: 3, scheme: "electric" };
    for (let i = 0; i < 50; i++) {
      const child = cross(recipe, other);
      expect(["aurora", "cells"]).toContain(child.kind);
      expect([12, 3]).toContain(child.seed);
      expect(["dusk", "electric"]).toContain(child.scheme);
      // The hue goes the short way round, between 160 and 300.
      expect(child.hue).toBeGreaterThanOrEqual(160);
      expect(child.hue).toBeLessThanOrEqual(300);
      const v = vary(mixed);
      expect(v.hue).toBeGreaterThanOrEqual(0);
      expect(v.hue).toBeLessThan(360);
    }
  });
});
