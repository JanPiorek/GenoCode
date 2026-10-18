// Keeps the examples in docs/LANGUAGE.md valid: complete files must check (and the Flower must build),
// and fragments must at least parse.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { check } from "./checker.js";
import { formatText } from "./format.js";
import { build } from "./interpreter.js";
import { parse } from "./parser.js";

const spec = readFileSync(new URL("../../../docs/LANGUAGE.md", import.meta.url), "utf8");
const blocks = [...spec.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]!);
const guide = readFileSync(new URL("../../../docs/GETTING_STARTED.md", import.meta.url), "utf8");

const isFile = (b: string) => /^(creature|background|dance|pattern) \w+\n/.test(b);
const isWrappedBlock = (b: string) => /^(background|dance) \{\n/.test(b);
const isCode = (b: string) =>
  !b.includes("…") &&
  !b.includes("next():") &&
  !b.includes("file          =") &&
  !b.startsWith("creature  gene");

describe("docs/LANGUAGE.md examples", () => {
  it("has the examples this test expects", () => {
    expect(blocks.filter(isFile).length).toBeGreaterThanOrEqual(2);
  });

  for (const [i, b] of blocks.entries()) {
    if (isFile(b)) {
      it(`example ${i} (${b.split("\n")[0]}) checks and is in the standard layout`, () => {
        const r = check(b);
        expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
        expect(formatText(b).text).toBe(b);
      });
    } else if (isWrappedBlock(b)) {
      it(`example ${i} (${b.split("\n")[0]}) checks inside a creature`, () => {
        const r = check(`creature Example\n${b}`);
        expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      });
    } else if (isCode(b)) {
      it(`example ${i} (${b.split("\n")[0]}) parses`, () => {
        expect(parse(`creature Example\n${b}`).diagnostics).toEqual([]);
      });
    }
  }

  it("the Flower builds 22 shapes", () => {
    const flower = blocks.find((b) => b.startsWith("creature Flower"))!;
    expect(build(check(flower)).shapes).toHaveLength(22);
  });
});

describe("docs/GETTING_STARTED.md examples", () => {
  const files = [...guide.matchAll(/```\n([\s\S]*?)```/g)]
    .map((m) => m[1]!)
    .filter((b) => b.startsWith("creature "));

  it("has its creatures", () => expect(files.length).toBeGreaterThanOrEqual(4));

  for (const [i, b] of files.entries()) {
    it(`creature ${i} builds and is in the standard layout`, () => {
      const r = check(b);
      expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(formatText(b).text).toBe(b);
      expect(build(r).shapes.length).toBeGreaterThan(0);
    });
  }
});
