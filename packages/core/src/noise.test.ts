import { describe, expect, it } from "vitest";
import { fbm3, mulberry32, noise3, PERLIN_PERMUTATION } from "./noise.js";

describe("noise", () => {
  it("uses a true permutation of 0–255", () => {
    expect(PERLIN_PERMUTATION).toHaveLength(256);
    expect(new Set(PERLIN_PERMUTATION).size).toBe(256);
    expect(Math.min(...PERLIN_PERMUTATION)).toBe(0);
    expect(Math.max(...PERLIN_PERMUTATION)).toBe(255);
  });

  it("is zero on whole-number points and stays within −1..1", () => {
    expect(noise3(3, 4, 5)).toBe(0);
    for (let i = 0; i < 2000; i++) {
      const n = noise3(i * 0.137, i * 0.071, i * 0.293);
      const f = fbm3(i * 0.137, i * 0.071, i * 0.293);
      expect(Math.abs(n)).toBeLessThanOrEqual(1);
      expect(Math.abs(f)).toBeLessThanOrEqual(1);
    }
  });

  it("changes smoothly", () => {
    expect(Math.abs(noise3(1.5, 2.25, 0.75) - noise3(1.501, 2.25, 0.75))).toBeLessThan(0.01);
  });
});

describe("mulberry32", () => {
  // The common reference implementation, written out separately.
  function reference(a: number): () => number {
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("matches the reference implementation", () => {
    for (const seed of [0, 1, 42, 123456789, 4294967295]) {
      const ours = mulberry32(seed);
      const theirs = reference(seed);
      for (let i = 0; i < 20; i++) expect(ours()).toBe(theirs());
    }
  });

  it("gives numbers from 0 up to 1", () => {
    const next = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const x = next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
