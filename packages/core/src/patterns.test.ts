// Patterns written in GenoCode (docs/LANGUAGE.md section 14.1), lists (8.3) and pictures (18.7).

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { check } from "./checker.js";
import { formatText } from "./format.js";
import { build, buildBackground, buildPattern, patternFileText } from "./interpreter.js";
import { Canvas } from "./picture.js";
import { applyEdits, rename } from "./symbols.js";
import type { Pattern } from "./values.js";

const errors = (text: string) =>
  check(text)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.message);

const RIPPLES = `pattern Ripples
// Rings that wobble.

gene rings  = 8   in 2..20
gene wobble = 0.3 in 0..1

let turn = random(0, 360)
let lumps = clouds(5, 3)
value picture {
  let ripple = sin(r * rings * 180 + turn + lumps(x, y) * wobble * 360)
  value ripple * 0.5 + 0.5
}
`;

const SHELL = `creature Shell

pattern Ripples {
  gene rings = 8 in 2..20

  value picture {
    value sin(r * rings * 180) * 0.5 + 0.5
  }
}

gene kind = Ripples from [marble, Ripples]

shape ball
texture pattern(kind, 30, 4, dusk, pearl)
lay
texture mixed(pattern(cells, 200, 1), warp, Ripples, 0.5)
lay

background {
  fill pattern(Ripples, 200, 3)
}

variant Many { Ripples.rings = 18 }
`;

const canvas = (size = 32) => new Canvas(size);

describe("pattern files", () => {
  it("check, format and draw", () => {
    const program = check(RIPPLES);
    expect(program.diagnostics).toEqual([]);
    expect(formatText(RIPPLES).text).toBe(RIPPLES);
    expect(program.genes.map((g) => g.fullName)).toEqual(["Ripples.rings", "Ripples.wobble"]);
    const { picture, diagnostics } = buildPattern(program, "Ripples", 4, canvas());
    expect(diagnostics).toEqual([]);
    expect(picture?.size).toBe(32);
    expect(Math.min(...picture!.v)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...picture!.v)).toBeLessThanOrEqual(1);
  });

  it("draw the same picture for the same seed, and another for another", () => {
    const program = check(RIPPLES);
    const draw = (seed: number) => buildPattern(program, "Ripples", seed, canvas()).picture!.v;
    expect(draw(4)).toEqual(draw(4));
    expect(draw(4)).not.toEqual(draw(5));
  });

  it("take their genes' values", () => {
    const program = check(RIPPLES);
    const draw = (rings: number) =>
      buildPattern(program, "Ripples", 4, canvas(), {
        genes: new Map([["Ripples.rings", rings]]),
      }).picture!.v;
    expect(draw(8)).not.toEqual(draw(16));
  });

  it("don't give a creature a seed gene when they use random", () => {
    expect(check(SHELL).genes.map((g) => g.fullName)).not.toContain("seed");
  });
});

describe("pattern blocks in creatures", () => {
  it("make new pattern kinds, for textures, mixes, gene options and backgrounds", () => {
    const program = check(SHELL);
    expect(program.diagnostics).toEqual([]);
    expect(formatText(SHELL).text).toBe(SHELL);
    const { shapes, diagnostics } = build(program);
    expect(diagnostics).toEqual([]);
    const [first, second] = shapes.map((s) => s.texture!) as [Pattern, Pattern];
    expect(first.kind).toBe("Ripples");
    expect(first.source?.text).toBe(patternFileText(program, "Ripples"));
    expect(first.source?.genes).toEqual([["Ripples.rings", 8]]);
    expect(second.kind).toBe("cells");
    expect(second.mix?.kind).toBe("Ripples");
    expect(second.mix?.source?.text).toContain("pattern Ripples");
    const fill = buildBackground(program).fill as Pattern;
    expect(fill.kind).toBe("Ripples");
    expect(fill.source).toBeDefined();
  });

  it("carry the genes of a variant", () => {
    const program = check(SHELL);
    const many = program.variants.find((v) => v.name === "Many")!;
    const { shapes } = build(program, { genes: many.values });
    expect(shapes[0]!.texture!.source?.genes).toEqual([["Ripples.rings", 18]]);
  });

  it("rename with their genes' full names in variants, with a warning", () => {
    const program = check(SHELL);
    const result = rename(program, SHELL.indexOf("Ripples {"), "Waves");
    if ("error" in result) throw new Error(result.error);
    expect(result.warning).toMatch(/Ripples\.rings/);
    const renamed = applyEdits(SHELL, result.edits);
    expect(renamed).toContain("variant Many { Waves.rings = 18 }");
    expect(renamed).not.toContain("Ripples");
    expect(check(renamed).diagnostics).toEqual([]);
  });

  it("convert into pattern files that check and draw the same", () => {
    const program = check(SHELL);
    const file = check(patternFileText(program, "Ripples")!);
    expect(file.diagnostics).toEqual([]);
    expect(buildPattern(file, "Ripples", 3, canvas()).picture!.v).toEqual(
      buildPattern(program, "Ripples", 3, canvas()).picture!.v,
    );
  });

  it("are self-contained", () => {
    expect(
      errors(`creature C
gene size = 1 in 0..2
pattern P {
  value picture {
    value size
  }
}
`),
    ).toContainEqual(expect.stringMatching(/size/));
    expect(errors("creature C\nshape ball\nlay\nlet p = picture {\n  value 1\n}\n")).toContainEqual(
      expect.stringMatching(/only be used in a pattern|There's nothing called `picture`/),
    );
  });

  it("need a name of their own", () => {
    expect(errors("creature C\npattern marble {\n  value clouds()\n}\n")).toContainEqual(
      expect.stringMatching(/built in/),
    );
    expect(
      errors("creature C\npart P {\n  lay\n}\npattern P {\n  value clouds()\n}\nP\n"),
    ).toContainEqual(expect.stringMatching(/already/));
  });
});

describe("rules of pattern code", () => {
  const pattern = (body: string) => errors(`pattern P\n${body}`);

  it("ends with one value, a picture", () => {
    expect(pattern("let n = clouds()\n")).toContainEqual(expect.stringMatching(/needs a `value`/));
    expect(pattern("value 1\n")).toContainEqual(expect.stringMatching(/must be a picture/));
    expect(pattern("value clouds()\nlet n = 1\n")).toContainEqual(
      expect.stringMatching(/must be the last/),
    );
    expect(pattern("value picture {\n  let n = 1\n}\n")).toContainEqual(
      expect.stringMatching(/A picture needs a `value`/),
    );
  });

  it("keeps random and the picture functions out of the per-pixel code", () => {
    expect(pattern("value picture {\n  value random(0, 1)\n}\n")).toContainEqual(
      expect.stringMatching(/`random` can't be used inside/),
    );
    expect(pattern("value picture {\n  value blur(clouds(), 1)(x, y)\n}\n")).toContainEqual(
      expect.stringMatching(/`blur` can't be used inside/),
    );
    expect(
      pattern("value picture {\n  let p = picture {\n    value 1\n  }\n  value 1\n}\n"),
    ).toContainEqual(expect.stringMatching(/can't be made inside/));
  });

  it("can't use the turtle, time or music, or lay shapes", () => {
    expect(pattern("value picture {\n  value time\n}\n")).toContainEqual(
      expect.stringMatching(/can't read `time`/),
    );
    expect(pattern("forward 1\nvalue clouds()\n")).toContainEqual(
      expect.stringMatching(/Pattern code can only hold/),
    );
  });

  it("gives x, y, r and a only inside picture { }", () => {
    expect(pattern("let n = x\nvalue clouds()\n")).toContainEqual(
      expect.stringMatching(/nothing called `x`/),
    );
    expect(pattern("value picture {\n  let r = 1\n  value r\n}\n")).toContainEqual(
      expect.stringMatching(/already/),
    );
  });

  it("leaves the picture words free for creatures to use as names", () => {
    expect(
      errors(
        "creature C\nlet stretch = 2\nlet power = 3\nlet blur = 1\nlet value = 4\nlet picture = 5\nlet clouds = 6\nforward stretch + power + blur + value + picture + clouds\n",
      ),
    ).toEqual([]);
    expect(errors("creature C\nlet n = clouds()\n")).toContainEqual(
      expect.stringMatching(/only patterns can use/),
    );
  });
});

describe("lists", () => {
  const run = (code: string) => build(check(`creature L\n${code}`));

  it("are made, joined, read and counted", () => {
    const { printed, diagnostics } = run(
      "let l = [1, 2]\nl += [3]\nprint(l, l[2], length(l), length((3, 4, 0)), [] + [true])\n",
    );
    expect(diagnostics).toEqual([]);
    expect(printed).toEqual(["[1, 2, 3] 3 3 5 [true]"]);
  });

  it("round positions, and say when there's no such item", () => {
    expect(run("print([5, 6, 7][1.5])\n").printed).toEqual(["7"]);
    expect(run("print([5, 6][2])\n").diagnostics[0]?.message).toMatch(/no item 2.*2 items/);
    expect(errors("creature L\nprint(3[0])\n")).toContainEqual(
      expect.stringMatching(/Only a list/),
    );
  });

  it("compare item by item", () => {
    expect(run("print([1, (1, 2, 3)] == [1, (1, 2, 3)], [1] == [2])\n").printed).toEqual([
      "true false",
    ]);
  });

  it("can't be genes", () => {
    expect(errors("creature L\ngene g = [1] in 0..1\n").length).toBeGreaterThan(0);
  });
});

describe("the two ways of running per-pixel code", () => {
  const dir = new URL("../../../patterns/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".genie"));

  it.each(files)("give the same picture for %s", (file) => {
    const program = check(readFileSync(new URL(file, dir), "utf8"));
    expect(program.diagnostics).toEqual([]);
    const name = program.file.name;
    const draw = (pixels: "javascript" | "closures") =>
      buildPattern(program, name, 7, canvas(48), { pixels });
    const js = draw("javascript");
    expect(js.diagnostics).toEqual([]);
    expect(draw("closures").picture!.v).toEqual(js.picture!.v);
  });

  it("report the same errors", () => {
    const program = check("pattern P\nlet l = [1, 2]\nvalue picture {\n  value l[x * 10]\n}\n");
    const message = (pixels: "javascript" | "closures") =>
      buildPattern(program, "P", 1, canvas(8), { pixels }).diagnostics.map((d) => d.message);
    expect(message("javascript")).toEqual(message("closures"));
    expect(message("javascript")[0]).toMatch(/There's no item/);
  });

  it("stop a loop that never ends", () => {
    const program = check(
      "pattern P\nvalue picture {\n  while true {\n    let n = 1\n  }\n  value 0\n}\n",
    );
    for (const pixels of ["javascript", "closures"] as const) {
      const { diagnostics } = buildPattern(program, "P", 1, canvas(2), { pixels });
      expect(diagnostics[0]?.message).toMatch(/never ends/);
    }
  }, 60_000);
});

describe("the patterns folder", () => {
  const dir = new URL("../../../patterns/", import.meta.url);

  it("has a twin of every built-in kind, checked and in the standard layout", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".genie"));
    expect(files).toHaveLength(11);
    for (const f of files) {
      const text = readFileSync(new URL(f, dir), "utf8");
      expect(check(text).diagnostics, f).toEqual([]);
      expect(formatText(text).text, f).toBe(text);
    }
  });
});
