import { describe, expect, it } from "vitest";
import { check } from "./checker.js";
import { colourJumps } from "./jumps.js";

// Beads shading from one hue to another `gap` degrees on: blending the colours takes the short way,
// which switches sides as the gap passes 180; blending the hue numbers doesn't.
const beads = (colour: string) => `creature Beads
gene gap = 150 in 0..360
repeat 8 as i {
  colour ${colour}
  shape ball
  lay
  forward 1.5
}

variant Wide {
  gap = 210
}
`;

describe("colourJumps", () => {
  it("finds where a blend's hues pass opposite each other", () => {
    const jumps = colourJumps(check(beads("mix(hsv(0, 1, 1), hsv(gap, 1, 1), i / 7)")));
    expect(jumps.map((j) => [j.from, j.to])).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(jumps[0]!.t).toBeCloseTo(0.5, 3);
    expect(jumps[0]!.degrees).toBeGreaterThan(60);
  });

  it("finds nothing when the hue numbers are blended", () => {
    expect(colourJumps(check(beads("hsv(mix(0, gap, i / 7), 1, 1)")))).toEqual([]);
  });

  it("finds nothing in a creature without variants", () => {
    const text = beads("mix(hsv(0, 1, 1), hsv(gap, 1, 1), i / 7)");
    expect(colourJumps(check(text.slice(0, text.indexOf("variant"))))).toEqual([]);
  });
});
