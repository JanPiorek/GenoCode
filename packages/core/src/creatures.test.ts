// Every starter creature in creatures/ checks, is in the standard layout, and builds, in each of
// its variants; every dance style in dances/ checks and works out.

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { check } from "./checker.js";
import { formatText } from "./format.js";
import { valuesOf } from "./genetics.js";
import { build, buildDance } from "./interpreter.js";

const dir = new URL("../../../creatures/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".genie"));

describe.each(files)("%s", (file) => {
  const text = readFileSync(new URL(file, dir), "utf8");
  const program = check(text);

  it("checks without problems and is in the standard layout", () => {
    expect(program.diagnostics.map((d) => d.message)).toEqual([]);
    expect(formatText(text).text).toBe(text);
  });

  it("builds, in every variant", () => {
    for (const v of [undefined, ...program.variants]) {
      const built = build(program, { genes: valuesOf(program.genes, v?.values) });
      expect(
        built.diagnostics.map((d) => d.message),
        v?.name,
      ).toEqual([]);
      expect(built.shapes.length, v?.name).toBeGreaterThan(0);
    }
  });
});

const danceDir = new URL("../../../dances/", import.meta.url);
const dances = readdirSync(danceDir).filter((f) => f.endsWith(".genie"));

describe.each(dances)("dance style %s", (file) => {
  const text = readFileSync(new URL(file, danceDir), "utf8");
  const program = check(text);

  it("checks without problems, is in the standard layout, and works out", () => {
    expect(program.diagnostics.map((d) => d.message)).toEqual([]);
    expect(formatText(text).text).toBe(text);
    const r = buildDance(program, { inputs: { music: { bass: 1, mid: 1, high: 1, level: 1 } } });
    expect(r.diagnostics.map((d) => d.message)).toEqual([]);
    expect(r.style?.morph).toBeDefined();
  });
});
