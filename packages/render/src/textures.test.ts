import { FINISHES, NO_PATTERN, PATTERN_KINDS, SCHEMES, type Pattern } from "@genocode/core";
import { describe, expect, it } from "vitest";
import { paletteTable, TABLE_SIZE } from "./palette.js";
import { drawField } from "./patterns.js";
import { patternPixels } from "./texture.js";

const pattern = (p: Partial<Pattern>): Pattern => ({ ...NO_PATTERN, kind: "marble", ...p });

describe("patterns", () => {
  it("draws every kind as a grey picture from 0 to 1, the same every time", () => {
    for (const kind of PATTERN_KINDS) {
      const a = drawField(kind, 5, undefined, 32);
      expect(a.v.length).toBe(32 * 32);
      expect(Math.min(...a.v)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...a.v)).toBeLessThanOrEqual(1);
      expect(drawField(kind, 5, undefined, 32).v).toEqual(a.v);
      expect(drawField(kind, 6, undefined, 32).v).not.toEqual(a.v);
    }
  });

  it("mixes in a second pattern, more with a bigger amount", () => {
    const alone = drawField("cells", 3, undefined, 32).v;
    for (const way of ["warp", "blend", "mask", "carve"] as const) {
      const little = drawField("cells", 3, { way, kind: "vortex", amount: 0.2 }, 32).v;
      const lots = drawField("cells", 3, { way, kind: "vortex", amount: 1 }, 32).v;
      const differs = (v: Float32Array) => v.reduce((s, x, i) => s + Math.abs(x - alone[i]!), 0);
      expect(differs(lots)).toBeGreaterThan(differs(little));
    }
    // Nothing mixed in at an amount of 0.
    expect(drawField("cells", 3, { way: "blend", kind: "vortex", amount: 0 }, 32).v).toEqual(alone);
  });
});

describe("palettes", () => {
  it("gives screen colours for every scheme and finish", () => {
    for (const scheme of SCHEMES) {
      for (const finish of FINISHES) {
        const t = paletteTable(200, scheme, finish, 7);
        expect(t.length).toBe(TABLE_SIZE * 3);
        for (const c of t) {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("builds the scheme round the hue, as hsv means it", () => {
    // A jewel palette round red is reddest in its middle; round blue, bluest.
    const mid = (TABLE_SIZE >> 1) * 3;
    const red = paletteTable(0, "jewel", "matte", 1);
    const blue = paletteTable(230, "jewel", "matte", 1);
    expect(red[mid]!).toBeGreaterThan(red[mid + 2]!);
    expect(blue[mid + 2]!).toBeGreaterThan(blue[mid]!);
  });
});

describe("textures", () => {
  it("colours the picture by the palette, so a new hue keeps the picture", () => {
    const a = patternPixels(pattern({ hue: 30, seed: 2 }), 16);
    const b = patternPixels(pattern({ hue: 210, seed: 2 }), 16);
    expect(a.length).toBe(16 * 16 * 4);
    expect(a).not.toEqual(b);
    // Brighter where the picture is brighter, whatever the hue.
    const light = (px: Uint8ClampedArray, i: number) =>
      px[i * 4]! + px[i * 4 + 1]! + px[i * 4 + 2]!;
    let agree = 0;
    for (let i = 1; i < 256; i++) {
      if (Math.sign(light(a, i) - light(a, 0)) === Math.sign(light(b, i) - light(b, 0))) agree++;
    }
    expect(agree).toBeGreaterThan(200);
  });
});
