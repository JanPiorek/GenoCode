// Every starter creature in creatures/ checks, is in the standard layout, and builds, in each of
// its variants.

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { check } from "./checker.js";
import { formatText } from "./format.js";
import { valuesOf } from "./genetics.js";
import { build } from "./interpreter.js";

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
