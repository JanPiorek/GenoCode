import { describe, expect, it } from "vitest";
import { check } from "./checker.js";
import { formatText } from "./format.js";
import { completionsAt, helpAt } from "./help.js";
import { addVariant, variantEdits } from "./genetics.js";
import { build } from "./interpreter.js";
import { checked } from "./test-helpers.js";
import { hsv } from "./colour.js";
import type { Value } from "./values.js";

const CREATURE = `creature T

gene size = 1 in 0.5..2
gene n = 3 in 1..6 step 1
gene skin = hsv(120, 0.5, 0.8) in hsv(60, 0.3, 0.5)..hsv(180, 1, 1)
gene plump = true
gene body = ball from [ball, cube]
gene limb = leg from [leg, fin]

repeat n { limb }

part leg { gene reach = 2 in 1..3; lay }
part fin { lay }

background {
  gene hue = 200 in 0..360
  fill hsv(hue, 1, 1)
}
`;

const errorsOf = (variants: string) =>
  check(CREATURE + variants)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.message);

describe("variants", () => {
  it("collects each variant's values by full name", () => {
    const p = checked(
      CREATURE +
        "\nvariant Big { size = 2; n = 6 }\n\nvariant Odd {\n  skin = hsv(70, 1, 1)\n  plump = false\n  body = cube\n  limb = fin\n  leg.reach = 3\n  background.hue = 10\n}\n",
    );
    expect(p.variants.map((v) => v.name)).toEqual(["Big", "Odd"]);
    expect(Object.fromEntries(p.variants[0]!.values)).toEqual({ size: 2, n: 6 });
    const odd = p.variants[1]!.values;
    expect(odd.get("skin")).toEqual(hsv(70, 1, 1));
    expect(odd.get("plump")).toBe(false);
    expect(odd.get("body")).toEqual({ type: "shape", name: "cube" });
    expect(odd.get("limb")).toEqual({ type: "part", name: "fin" });
    expect(odd.get("leg.reach")).toBe(3);
    expect(odd.get("background.hue")).toBe(10);
  });

  it("only accepts values the gene itself could have", () => {
    expect(errorsOf("variant A { size = 3 }\n")).toEqual(["This is outside `size`'s range."]);
    expect(errorsOf("variant A { skin = hsv(300, 1, 1) }\n")).toEqual([
      "This is outside `skin`'s range.",
    ]);
    expect(errorsOf("variant A { size = red }\n")).toEqual(["`size` is a number, not a colour."]);
    expect(errorsOf("variant A { body = cone }\n")).toEqual(["`body` must be one of its options."]);
    expect(errorsOf("variant A { limb = leg2 }\n")).toEqual(["`limb` must be one of its parts."]);
    expect(errorsOf("variant A { size = 1 + time }\n")).toHaveLength(1);
    expect(check(CREATURE + "variant A { n = 2.5 }\n").diagnostics[0]?.severity).toBe("warning");
  });

  it("reports unknown genes, genes set twice, repeated names and misplaced variants", () => {
    expect(errorsOf("variant A { reach = 1 }\n")).toEqual(["There's no gene called `reach`."]);
    expect(errorsOf("variant A { n = 1; n = 2 }\n")).toEqual([
      "`n` is already set in this variant.",
    ]);
    expect(errorsOf("variant A { n = 1 }\nvariant A { n = 2 }\n")).toEqual([
      "There's already a variant called `A`.",
    ]);
    expect(errorsOf("part p { variant A { n = 1 } }\n")).toContain(
      "A variant can only be at the top level of a creature.",
    );
  });

  it("can set the seed of creatures that use random", () => {
    const p = checked("creature R\nforward random(0, 1)\nlay\nvariant A { seed = 42 }\n");
    expect(p.variants[0]!.values.get("seed")).toBe(42);
  });

  it("doesn't change what the creature builds", () => {
    const plain = build(checked(CREATURE));
    const withVariant = build(checked(CREATURE + "\nvariant Big { size = 2; n = 6 }\n"));
    expect(withVariant.shapes).toEqual(plain.shapes);
  });

  it("is laid out on one line when it fits, one setting to a line when it doesn't", () => {
    const text =
      CREATURE + "variant  Big {size=2;n=6}\nvariant Odd {\n leg.reach = 3 // longer\n  n = 2\n}\n";
    expect(formatText(text).text).toContain(
      "\nvariant Big { size = 2; n = 6 }\n\nvariant Odd {\n  leg.reach = 3  // longer\n  n = 2\n}\n",
    );
  });

  it("offers and explains genes by their full names inside a variant", () => {
    const text = CREATURE + "variant A {\n  leg.reach = 3\n  \n}\n";
    const p = check(text);
    const names = completionsAt(p, text.lastIndexOf("  \n") + 2).map((c) => c.label);
    expect(names).toEqual(expect.arrayContaining(["leg.reach", "background.hue", "size"]));
    expect(helpAt(p, text.indexOf("reach = 3"))?.help.title).toBe("gene leg.reach");
    expect(helpAt(p, text.indexOf("variant A"))?.help.section).toBe("6.6");
  });
});

describe("variantEdits", () => {
  const edited = (variants: string, values: Record<string, Value>, unset: string[] = []) => {
    const p = checked(CREATURE + variants);
    let text = p.text;
    for (const e of variantEdits(p, "V", new Map(Object.entries(values)), unset).reverse()) {
      text = text.slice(0, e.start) + e.text + text.slice(e.end);
    }
    expect(check(text).diagnostics).toEqual([]);
    return text.slice(CREATURE.length);
  };

  it("changes a value the variant sets", () => {
    expect(edited("\nvariant V { size = 2; n = 6 }\n", { n: 4 })).toBe(
      "\nvariant V { size = 2; n = 4 }\n",
    );
    expect(edited("\nvariant V {\n  size = 2  // big\n}\n", { size: 1.5 })).toBe(
      "\nvariant V {\n  size = 1.5  // big\n}\n",
    );
  });

  it("adds a line for a gene it doesn't set, unless the value is the gene's own", () => {
    expect(edited("\nvariant V { size = 2 }\n", { "leg.reach": 3, n: 3 })).toBe(
      "\nvariant V { size = 2; leg.reach = 3 }\n",
    );
    expect(
      edited("\nvariant V {\n    size = 2\n}\n", {
        skin: hsv(70, 1, 1),
        limb: { type: "part", name: "fin" },
      }),
    ).toBe("\nvariant V {\n    size = 2\n    skin = hsv(70, 1, 1)\n    limb = fin\n}\n");
    expect(edited("\nvariant V {\n  plump  = false\n  n      = 2\n}\n", { size: 2 })).toBe(
      "\nvariant V {\n  plump  = false\n  n      = 2\n  size = 2\n}\n",
    );
    expect(edited("\nvariant V {}\n", { n: 2 })).toBe("\nvariant V { n = 2 }\n");
    expect(edited("\nvariant V {\n}\n", { n: 2 })).toBe("\nvariant V {\n  n = 2\n}\n");
  });

  it("removes the lines of genes to unset", () => {
    expect(edited("\nvariant V {\n  size = 2\n  n = 6  // many\n}\n", {}, ["n"])).toBe(
      "\nvariant V {\n  size = 2\n}\n",
    );
    expect(edited("\nvariant V { size = 2; n = 6; plump = false }\n", {}, ["size", "n"])).toBe(
      "\nvariant V { plump = false }\n",
    );
    expect(edited("\nvariant V { size = 2; n = 6; plump = false }\n", {}, ["n"])).toBe(
      "\nvariant V { size = 2; plump = false }\n",
    );
    expect(edited("\nvariant V { size = 2 }\n", {}, ["size"])).toBe("\nvariant V {}\n");
  });

  it("leaves other variants and unknown names alone", () => {
    const p = checked(CREATURE + "\nvariant A { n = 2 }\n\nvariant V { n = 4 }\n");
    expect(variantEdits(p, "Missing", new Map([["n", 5]]))).toEqual([]);
    const [e] = variantEdits(p, "V", new Map([["n", 5]]));
    expect(p.text.slice(e!.start, e!.end)).toBe("4");
    expect(e!.start).toBeGreaterThan(p.text.indexOf("variant V"));
  });
});

describe("addVariant", () => {
  const added = (variants: string, name: string, values: Record<string, Value>) => {
    const p = checked(CREATURE + variants);
    const result = addVariant(p, name, new Map(Object.entries(values)));
    if ("error" in result) return result.error;
    let text = p.text;
    for (const e of result.edits) text = text.slice(0, e.start) + e.text + text.slice(e.end);
    expect(check(text).diagnostics).toEqual([]);
    return text.slice(CREATURE.length);
  };

  it("adds a variant at the end, its genes one to a line", () => {
    expect(added("", "Big", { size: 2, "leg.reach": 3, plump: false })).toBe(
      "\nvariant Big {\n  size = 2\n  plump = false\n  leg.reach = 3\n}\n",
    );
  });

  it("adds it after the last variant, before anything that follows", () => {
    expect(added("\nvariant A { n = 2 }\n// the end\n", "B", { n: 4 })).toBe(
      "\nvariant A { n = 2 }\n\nvariant B {\n  n = 4\n}\n// the end\n",
    );
  });

  it("adds an empty one, which genes can then be set in", () => {
    const text = added("", "Empty", {}) as string;
    expect(text).toBe("\nvariant Empty {\n}\n");
    const p = checked(CREATURE + text);
    let out = p.text;
    for (const e of variantEdits(p, "Empty", new Map([["n", 5]])).reverse()) {
      out = out.slice(0, e.start) + e.text + out.slice(e.end);
    }
    expect(out.slice(CREATURE.length)).toBe("\nvariant Empty {\n  n = 5\n}\n");
  });

  it("refuses names it can't use", () => {
    expect(added("", "2big", {})).toContain("isn't a name");
    expect(added("", "repeat", {})).toBe("`repeat` is a keyword.");
    expect(added("\nvariant A { n = 2 }\n", "A", {})).toBe("There's already a variant called `A`.");
  });
});
