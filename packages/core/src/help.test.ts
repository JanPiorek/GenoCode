import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILTIN_CONSTANTS, BUILTIN_FUNCTIONS } from "./builtins.js";
import { check } from "./checker.js";
import { geneEdits, writeGenes } from "./genetics.js";
import {
  completionsAt,
  constantHelp,
  FUNCTION_HELP,
  helpAt,
  KEYWORD_HELP,
  MEMBER_HELP,
} from "./help.js";
import { KEYWORDS } from "./lexer.js";

const spec = readFileSync(new URL("../../../docs/LANGUAGE.md", import.meta.url), "utf8");

/** Help at the first `|` in the text, which is taken out. */
function helpHere(source: string) {
  const at = source.indexOf("|");
  return helpAt(check(source.replace("|", "")), at)?.help;
}

function completionsHere(source: string) {
  const at = source.indexOf("|");
  return completionsAt(check(source.replace("|", "")), at);
}

const labels = (cs: { label: string }[]) => cs.map((c) => c.label);

describe("help", () => {
  it("covers every built-in function, constant and keyword", () => {
    for (const name of BUILTIN_FUNCTIONS.keys()) expect(FUNCTION_HELP.has(name), name).toBe(true);
    for (const name of BUILTIN_CONSTANTS.keys()) expect(constantHelp(name), name).toBeDefined();
    for (const k of KEYWORDS) expect(KEYWORD_HELP.has(k), k).toBe(true);
  });

  it("only documents functions the spec has, under sections it has", () => {
    for (const [name, help] of [...FUNCTION_HELP, ...KEYWORD_HELP]) {
      expect(spec, name).toMatch(new RegExp(`\\b${name}\\b`));
      expect(spec, `${name}: section ${help.section}`).toMatch(
        new RegExp(`^#+ ${help.section.replace(".", "\\.")}[. ]`, "m"),
      );
    }
    for (const [owner, members] of MEMBER_HELP) {
      for (const m of members.keys()) expect(spec).toContain(`\`${owner}.${m}`);
    }
  });

  it("explains built-ins, keywords and inputs", () => {
    expect(helpHere("creature T\nmove (0, wa|ve(time), 0)\n")?.title).toBe("wave(t)");
    expect(helpHere("creature T\nre|peat 3 { lay }\n")?.title).toBe("repeat n as i { … }");
    expect(helpHere("creature T\nyaw 10 * music.ba|ss\n")?.title).toBe("music.bass");
    expect(helpHere("creature T\ncolour mage|nta\n")?.text).toContain("hsv(300, 1, 1)");
    expect(helpHere("creature T\nshape cone|\n")?.text).toContain("A shape");
  });

  it("explains the creature's own genes, parts, functions and variables", () => {
    const source = [
      "creature T",
      "gene petals = 7 in 3..16 step 1  // how many petals",
      "let size = 2",
      "leaf(petals)",
      "part leaf(n) {",
      "  gene curl = 10 in 0..90",
      "  repeat n as i {",
      "    pitch curl + i * size",
      "  }",
      "}",
      "",
    ].join("\n");
    const at = (word: string, nth = 0) => {
      let i = -1;
      for (let k = 0; k <= nth; k++) i = source.indexOf(word, i + 1);
      return helpAt(check(source), i + 1)?.help;
    };
    expect(at("petals", 2)).toMatchObject({
      title: "gene petals",
      text: "how many petals · 3 to 16, steps of 1",
    });
    expect(at("leaf")?.title).toBe("part leaf(n)");
    expect(at("curl", 1)?.title).toBe("gene leaf.curl");
    expect(at("i *")?.text).toContain("counter");
    expect(at("size", 1)?.text).toBe("A global variable.");
  });
});

describe("completions", () => {
  it("offers the parts of music and turtle after a dot", () => {
    expect(labels(completionsHere("creature T\nyaw music.|\n"))).toEqual([
      "bass",
      "mid",
      "high",
      "level",
      "hit",
      "bass_hit",
      "mid_hit",
      "high_hit",
    ]);
    expect(labels(completionsHere("creature T\nmove turtle.he|\n"))).toContain("heading");
  });

  it("offers what's in scope, and nothing from other parts", () => {
    const source = [
      "creature T",
      "gene twist = 5 in 0..90",
      "part a(reach) {",
      "  gene bend = 1 in 0..2",
      "  forward |",
      "}",
      "part b {",
      "  gene other = 1 in 0..2",
      "}",
      "",
    ].join("\n");
    const names = labels(completionsHere(source));
    expect(names).toEqual(
      expect.arrayContaining(["twist", "reach", "bend", "a", "b", "wave", "forward"]),
    );
    expect(names).not.toContain("other");
  });

  it("keeps backgrounds to themselves", () => {
    const source = [
      "creature T",
      "gene twist = 5 in 0..90",
      "background {",
      "  gene hue = 200 in 0..360",
      "  fill hsv(|, 1, 1)",
      "}",
      "",
    ].join("\n");
    const names = labels(completionsHere(source));
    expect(names).toContain("hue");
    expect(names).not.toContain("twist");
  });
});

describe("geneEdits", () => {
  it("edits only the changed values, and writeGenes agrees with them", () => {
    const program = check("creature T\ngene a = 1 in 0..10\ngene b = 2 in 0..10\nlay\n");
    const values = new Map([["b", 7.5]]);
    const edits = geneEdits(program, values);
    const at = program.text.indexOf("2 in");
    expect(edits).toEqual([{ start: at, end: at + 1, text: "7.5" }]);
    expect(writeGenes(program, values)).toContain("gene b = 7.5 in 0..10");
  });
});
