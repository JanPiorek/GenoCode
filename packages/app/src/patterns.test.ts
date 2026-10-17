import {
  buildBackground,
  check,
  formatText,
  formatValue,
  NO_PATTERN,
  type Pattern,
} from "@genocode/core";
import { describe, expect, it } from "vitest";
import {
  backgroundFile,
  backgroundLines,
  cross,
  definitionLines,
  patternInFile,
  vary,
  withBackground,
  withDefinition,
} from "./patterns.js";

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

describe("patterns from files", () => {
  it("reads the pattern of a background file or a creature's background", () => {
    expect(patternInFile(backgroundFile(mixed)).pattern).toEqual(mixed);
    const creature = withBackground(CREATURE, backgroundLines(recipe))!;
    expect(formatValue(patternInFile(creature).pattern!)).toBe(formatValue(recipe));
  });

  it("says why when there's no pattern", () => {
    expect(patternInFile(CREATURE).problem).toContain("has no background");
    expect(patternInFile("background Plain\n\nfill red\n").problem).toContain("not a pattern");
    expect(
      patternInFile("dance Calm\n\nmorph follows music.level  speed 1  settle 2\n").problem,
    ).toContain("dance style");
  });
});

describe("dances into creatures", () => {
  const dance = "dance Calm\n// slow\n\nmorph follows music.level  speed 0.5  settle 3\n";

  it("puts a dance file into a creature, before its variants, replacing any it had", () => {
    const creature = `${CREATURE}\nvariant Big { }\n`;
    const once = withDefinition(creature, "dance", definitionLines(dance)!)!;
    expect(check(once).diagnostics).toEqual([]);
    expect(once.indexOf("dance {")).toBeLessThan(once.indexOf("variant Big"));
    const twice = withDefinition(once, "dance", [
      "spin follows music.bass  from 10 to 90  smooth 1",
    ])!;
    expect(twice.match(/dance \{/g)).toHaveLength(1);
    expect(twice).toContain("spin follows music.bass");
    expect(twice).not.toContain("morph");
  });

  it("puts a background before the dance", () => {
    const withDance = withDefinition(CREATURE, "dance", definitionLines(dance)!)!;
    const both = withBackground(withDance, backgroundLines(recipe))!;
    expect(both.indexOf("background {")).toBeLessThan(both.indexOf("dance {"));
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
