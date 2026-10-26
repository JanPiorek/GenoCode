import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { check } from "./checker.js";
import { wrapHue } from "./colour.js";
import {
  breed,
  familySpread,
  geneDistance,
  morph,
  mutate,
  valuesOf,
  writeGenes,
} from "./genetics.js";
import { inHueArc } from "./genes.js";
import { mulberry32 } from "./noise.js";
import { checked } from "./test-helpers.js";
import type { Colour, Value, Vec } from "./values.js";

const genesOf = (body: string) => checked(`creature T\n${body}\nlay\n`).genes;

/** Calls `f` with many different random sequences. */
function trials(f: (random: () => number) => void, n = 300): void {
  for (let seed = 1; seed <= n; seed++) f(mulberry32(seed));
}

describe("mutate", () => {
  it("keeps numbers within the window and the range", () => {
    const genes = genesOf("gene n = 5 in 0..10");
    trials((random) => {
      const v = mutate(genes, undefined, { strength: 0.2, rate: 1, random }).get("n") as number;
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    });
    trials((random) => {
      const v = mutate(genes, new Map([["n", 9.5]]), { strength: 0.5, rate: 1, random });
      expect(v.get("n")).toBeLessThanOrEqual(10);
    });
  });

  it("changes each gene with probability equal to the rate", () => {
    const genes = genesOf("gene n = 5 in 0..10");
    let changed = 0;
    trials((random) => {
      if (mutate(genes, undefined, { strength: 0.5, random }).get("n") !== 5) changed++;
    }, 1000);
    expect(changed).toBeGreaterThan(420);
    expect(changed).toBeLessThan(580);
    trials((random) => {
      expect(mutate(genes, undefined, { strength: 0.5, rate: 0, random }).get("n")).toBe(5);
    });
  });

  it("never changes locked genes", () => {
    const genes = genesOf("gene n = 5 in 0..10\ngene m = 5 in 0..10");
    const locked = new Set(["n"]);
    trials((random) => {
      expect(mutate(genes, undefined, { strength: 1, rate: 1, random, locked }).get("n")).toBe(5);
    });
  });

  it("rounds stepped genes to whole steps within the range", () => {
    const genes = genesOf("gene n = 4 in 1..9 step 0.5");
    trials((random) => {
      const v = mutate(genes, undefined, { strength: 1, rate: 1, random }).get("n") as number;
      expect(Number.isInteger((v - 1) / 0.5)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(9);
    });
  });

  it("mutates log genes by ratios", () => {
    const genes = genesOf("gene size = 1 in 0.01..100 log");
    trials((random) => {
      const v = mutate(genes, undefined, { strength: 0.25, rate: 1, random }).get("size") as number;
      // A quarter of the range on the log scale is a factor of 10 each way.
      expect(v).toBeGreaterThanOrEqual(0.1 - 1e-12);
      expect(v).toBeLessThanOrEqual(10 + 1e-9);
    });
  });

  it("mutates each axis of a vector in its own range, and keeps fixed axes", () => {
    const genes = genesOf("gene s = (1, 1, 0.5) in (1, 0, 0)..(1, 2, 1)");
    trials((random) => {
      const v = mutate(genes, undefined, { strength: 1, rate: 1, random }).get("s") as Vec;
      expect(v.x).toBe(1);
      expect(v.y).toBeLessThanOrEqual(2);
      expect(v.z).toBeLessThanOrEqual(1);
    });
  });

  it("keeps hues on the range's arc, wrapping through 360", () => {
    const genes = genesOf("gene c = hsv(350, 0.5, 0.5) in hsv(300, 0, 0)..hsv(40, 1, 1)");
    const arc = genes[0]!.hue!;
    trials((random) => {
      const c = mutate(genes, undefined, { strength: 1, rate: 1, random }).get("c") as Colour;
      expect(inHueArc(c.h, arc)).toBe(true);
    });
  });

  it("wraps hues round a whole circle", () => {
    const genes = genesOf("gene c = hsv(355, 0.5, 0.5) in hsv(0, 0, 0)..hsv(360, 1, 1)");
    let crossed = false;
    trials((random) => {
      const c = mutate(genes, undefined, { strength: 0.1, rate: 1, random }).get("c") as Colour;
      expect(Math.abs(wrapHue(c.h - 355 + 180) - 180)).toBeLessThanOrEqual(36 + 1e-9);
      if (c.h < 30) crossed = true;
    });
    expect(crossed).toBe(true);
  });

  it("flips bools and swaps choices with probability equal to the strength", () => {
    const genes = genesOf("gene on = true\ngene body = cone from [ball, cone, tube]");
    let flips = 0;
    let swaps = 0;
    trials((random) => {
      const v = mutate(genes, undefined, { strength: 0.3, rate: 1, random });
      if (v.get("on") === false) flips++;
      const body = v.get("body") as { name: string };
      if (body.name !== "cone") swaps++;
      expect(["ball", "cone", "tube"]).toContain(body.name);
    }, 1000);
    expect(flips).toBeGreaterThan(240);
    expect(flips).toBeLessThan(360);
    expect(swaps).toBeGreaterThan(240);
    expect(swaps).toBeLessThan(360);
  });

  it("changes about four genes at a time unless a rate is given", () => {
    const genes = genesOf(
      Array.from({ length: 40 }, (_, i) => `gene g${i} = 5 in 0..10`).join("\n"),
    );
    let changed = 0;
    trials((random) => {
      const v = mutate(genes, undefined, { strength: 0.5, random });
      changed += [...v.values()].filter((x) => x !== 5).length;
    }, 500);
    expect(changed / 500).toBeGreaterThan(3.5);
    expect(changed / 500).toBeLessThan(4.5);
  });

  it("takes small steps more often than big ones", () => {
    const genes = genesOf("gene n = 5 in 0..10");
    let small = 0;
    trials((random) => {
      const v = mutate(genes, undefined, { strength: 0.5, rate: 1, random }).get("n") as number;
      if (Math.abs(v - 5) < 2.5) small++;
    }, 1000);
    // Three quarters for a triangular step, half for a uniform one.
    expect(small).toBeGreaterThan(700);
  });

  it("steps by the family's spread when it's given", () => {
    const genes = genesOf(
      "gene n = 5 in 0..100\ngene same = 50 in 0..100\ngene c = hsv(10, 0.5, 0.5) in hsv(0, 0, 0)..hsv(360, 1, 1)",
    );
    const family = [
      new Map<string, Value>([["n", 0]]),
      new Map<string, Value>([
        ["n", 20],
        ["c", { type: "colour", h: 350, s: 0.5, v: 0.5, a: 1 }],
      ]),
    ];
    const spread = familySpread(genes, family);
    expect(spread.get("n")).toEqual([0.2]);
    expect(spread.get("same")).toEqual([0]);
    expect(spread.get("c")![0]).toBeCloseTo(20 / 360);
    trials((random) => {
      const v = mutate(genes, undefined, { strength: 1, rate: 1, random, spread });
      expect(Math.abs((v.get("n") as number) - 5)).toBeLessThanOrEqual(40);
      // Genes the family agrees on still move a little.
      expect(Math.abs((v.get("same") as number) - 50)).toBeLessThanOrEqual(10);
    });
  });

  it("gives the seed gene a new whole number", () => {
    const genes = check("creature T\nforward random(0, 1)\nlay\n").genes;
    trials((random) => {
      const seed = mutate(genes, undefined, { strength: 1, rate: 1, random }).get("seed") as number;
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    });
  });
});

describe("breed", () => {
  const a = { genes: genesOf("gene n = 2 in 0..10\ngene only_a = 1 in 0..5\ngene on = true") };
  const b = {
    genes: genesOf(
      "gene n = 8 in 0..20\ngene only_a = red in hsv(0, 0, 0)..hsv(360, 1, 1)\ngene on = false",
    ),
  };

  it("takes A's or B's value or a point between, about ¼, ¼ and ½ of the time", () => {
    let fromA = 0;
    let fromB = 0;
    let between = 0;
    trials((random) => {
      const n = breed(a, b, { random }).get("n") as number;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(8);
      if (n === 2) fromA++;
      else if (n === 8) fromB++;
      else between++;
    }, 2000);
    expect(fromA / 2000).toBeCloseTo(0.25, 1);
    expect(fromB / 2000).toBeCloseTo(0.25, 1);
    expect(between / 2000).toBeCloseTo(0.5, 1);
  });

  it("keeps A's value for genes B doesn't have of the same kind, and for locked genes", () => {
    trials((random) => {
      expect(breed(a, b, { random }).get("only_a")).toBe(1);
      expect(breed(a, b, { random, locked: new Set(["n"]) }).get("n")).toBe(2);
    });
  });

  it("keeps the child within A's range", () => {
    const wide = { genes: a.genes, values: new Map<string, Value>([["n", 10]]) };
    const far = { genes: b.genes, values: new Map<string, Value>([["n", 20]]) };
    trials((random) => {
      expect(breed(wide, far, { random }).get("n")).toBeLessThanOrEqual(10);
    });
  });

  it("takes bools from one parent or the other", () => {
    const seen = new Set<Value>();
    trials((random) => seen.add(breed(a, b, { random }).get("on")!));
    expect([...seen].sort()).toEqual([false, true]);
  });

  it("takes a vector or colour whole, every channel the same way", () => {
    const g = genesOf(
      "gene c = hsv(0, 0, 0) in hsv(0, 0, 0)..hsv(360, 1, 1)\ngene v = (0, 0, 0) in (0, 0, 0)..(1, 1, 1)",
    );
    const q = {
      genes: g,
      values: new Map<string, Value>([
        ["c", { type: "colour", h: 100, s: 1, v: 1, a: 1 }],
        ["v", { type: "vector", x: 1, y: 1, z: 1 }],
      ]),
    };
    trials((random) => {
      const child = breed({ genes: g }, q, { random });
      const c = child.get("c") as Colour;
      const v = child.get("v") as Vec;
      expect(c.s).toBeCloseTo(c.v);
      expect(c.h / 100).toBeCloseTo(c.s);
      expect(v.x).toBe(v.y);
      expect(v.y).toBe(v.z);
    });
  });

  it("blends hues the short way round", () => {
    const g = genesOf("gene c = hsv(350, 1, 1) in hsv(0, 0, 0)..hsv(360, 1, 1)");
    const p = { genes: g };
    const q = {
      genes: g,
      values: new Map<string, Value>([["c", { type: "colour", h: 10, s: 1, v: 1, a: 1 }]]),
    };
    trials((random) => {
      const h = (breed(p, q, { random }).get("c") as Colour).h;
      expect(h >= 350 || h <= 10).toBe(true);
    });
  });
});

describe("geneDistance", () => {
  it("is 0 for the same values and grows with the difference", () => {
    const genes = genesOf("gene n = 0 in 0..10\ngene on = true");
    expect(geneDistance(genes, undefined, undefined)).toBe(0);
    expect(geneDistance(genes, undefined, new Map([["n", 5]]))).toBeCloseTo(0.25);
    expect(geneDistance(genes, undefined, new Map<string, Value>([["on", false]]))).toBe(0.5);
  });
});

describe("morph", () => {
  const a = {
    genes: genesOf("gene n = 0 in 0..10\ngene size = 1 in 0.1..100 log\ngene on = true"),
  };
  const b = {
    genes: a.genes,
    values: new Map<string, Value>([
      ["n", 10],
      ["size", 100],
      ["on", false],
    ]),
  };

  it("blends numbers in a straight line, and log genes by ratios", () => {
    expect(morph(a, b, 0.25).values.get("n")).toBeCloseTo(2.5);
    expect(morph(a, b, 0.5).values.get("size")).toBeCloseTo(10);
  });

  it("switches program and discrete genes at the halfway point", () => {
    expect(morph(a, b, 0.49).from).toBe("a");
    expect(morph(a, b, 0.49).values.get("on")).toBe(true);
    expect(morph(a, b, 0.5).from).toBe("b");
    expect(morph(a, b, 0.5).values.get("on")).toBe(false);
  });

  it("doesn't round stepped genes", () => {
    const g = genesOf("gene k = 1 in 1..5 step 1");
    const q = { genes: g, values: new Map<string, Value>([["k", 2]]) };
    expect(morph({ genes: g }, q, 0.3).values.get("k")).toBeCloseTo(1.3);
  });

  it("moves hue along the gene's arc, never across 0° unless the arc does", () => {
    const hueAt = (decl: string, from: number, to: number, t: number) => {
      const g = genesOf(decl);
      const at = (h: number) => ({
        genes: g,
        values: new Map<string, Value>([["c", { type: "colour", h, s: 1, v: 1, a: 1 }]]),
      });
      return (morph(at(from), at(to), t).values.get("c") as { h: number }).h;
    };
    const whole = "gene c = red in hsv(0, 0, 0)..hsv(360, 1, 1)";
    expect(hueAt(whole, 350, 10, 0.5)).toBeCloseTo(180);
    expect(hueAt(whole, 10, 350, 0.25)).toBeCloseTo(95);
    const reds = "gene c = red in hsv(330, 0, 0)..hsv(30, 1, 1)";
    expect(hueAt(reds, 340, 20, 0.5)).toBeCloseTo(0);
    expect(hueAt(reds, 340, 20, 0.25)).toBeCloseTo(350);
  });
});

describe("writeGenes", () => {
  const dir = new URL("../../../creatures/", import.meta.url);
  const creatures = readdirSync(dir).filter((f) => f.endsWith(".genie"));

  it.each(creatures)("leaves %s unchanged when its genes are unchanged", (file) => {
    const program = checked(readFileSync(new URL(file, dir), "utf8"));
    expect(writeGenes(program, valuesOf(program.genes))).toBe(program.text);
  });

  it.each(creatures)("writes mutated genes of %s so they read back the same", (file) => {
    const program = checked(readFileSync(new URL(file, dir), "utf8"));
    const values = mutate(program.genes, undefined, {
      strength: 0.5,
      rate: 1,
      random: mulberry32(7),
    });
    const saved = checked(writeGenes(program, values));
    expect(saved.diagnostics).toEqual([]);
    for (const g of saved.genes) {
      const want = values.get(g.fullName)!;
      const got = g.value;
      if (typeof want === "number") expect(got as number).toBeCloseTo(want, 1);
      else if (typeof want === "object" && want.type === "colour") {
        const c = got as Colour;
        expect(Math.abs(wrapHue(c.h - want.h + 180) - 180)).toBeLessThan(0.1);
        expect(c.s).toBeCloseTo(want.s, 1);
        expect(c.v).toBeCloseTo(want.v, 1);
      } else if (typeof want === "object" && want.type === "vector") {
        const v = got as Vec;
        for (const axis of ["x", "y", "z"] as const) expect(v[axis]).toBeCloseTo(want[axis], 1);
      } else expect(got).toEqual(want);
    }
  });

  it("writes values readably and keeps them in range", () => {
    const program = checked(
      "creature T\ngene n = 1 in 0..1\ngene k = 2 in 0..10 step 2\ngene c = red in hsv(0, 0, 0)..hsv(360, 1, 1)\nlay\n",
    );
    const text = writeGenes(
      program,
      new Map<string, Value>([
        ["n", 0.99999],
        ["k", 4.0000000001],
        ["c", { type: "colour", h: 123.456, s: 0.5, v: 0.25, a: 1 }],
      ]),
    );
    expect(text).toContain("gene n = 1 in 0..1");
    expect(text).toContain("gene k = 4 in 0..10 step 2");
    expect(text).toContain("gene c = hsv(123.5, 0.5, 0.25) in hsv(0, 0, 0)..hsv(360, 1, 1)");
  });

  it("keeps a hue just under 360° from rounding round to 0°", () => {
    const program = checked("creature T\ngene c = red in hsv(0, 0, 0)..hsv(360, 1, 1)\nlay\n");
    const text = writeGenes(
      program,
      new Map<string, Value>([["c", { type: "colour", h: 359.98, s: 1, v: 1, a: 1 }]]),
    );
    expect(text).toContain("gene c = hsv(359.9, 1, 1)");
  });
});
