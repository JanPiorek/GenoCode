// Colours and gradients (docs/LANGUAGE.md section 13). Colours are hue, saturation, value and
// alpha, with hue on a circle.

import { ValueError, type Colour, type Gradient, type GradientStopValue } from "./values.js";

export function wrapHue(h: number): number {
  const w = h % 360;
  return w < 0 ? w + 360 : w === 0 ? 0 : w;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function hsv(h: number, s: number, v: number, a = 1): Colour {
  return { type: "colour", h: wrapHue(h), s: clamp01(s), v: clamp01(v), a: clamp01(a) };
}

export function rgb(r: number, g: number, b: number, a = 1): Colour {
  r = clamp01(r);
  g = clamp01(g);
  b = clamp01(b);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return hsv(h, max === 0 ? 0 : d / max, max, a);
}

/** `#rrggbb` or `#rrggbbaa`. */
export function hexColour(text: string): Colour {
  const digits = text.slice(1);
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(digits)) {
    throw new ValueError(`\`${text}\` isn't a hex colour.`);
  }
  const byte = (i: number): number => parseInt(digits.slice(i, i + 2), 16) / 255;
  return rgb(byte(0), byte(2), byte(4), digits.length === 8 ? byte(6) : 1);
}

/** Red, green and blue, each 0–1, for drawing. */
export function toRgb(c: Colour): [number, number, number] {
  const h = c.h / 60;
  const x = c.v * c.s;
  const m = c.v - x;
  const k = (n: number): number => {
    const t = (n + h) % 6;
    return m + x * Math.max(0, Math.min(1, Math.abs(t - 3) - 1));
  };
  return [k(0), k(4), k(2)];
}

export const NAMED_COLOURS: ReadonlyMap<string, Colour> = new Map([
  ["red", hsv(0, 1, 1)],
  ["orange", hsv(30, 1, 1)],
  ["yellow", hsv(60, 1, 1)],
  ["green", hsv(120, 1, 1)],
  ["cyan", hsv(180, 1, 1)],
  ["blue", hsv(240, 1, 1)],
  ["purple", hsv(270, 1, 0.8)],
  ["magenta", hsv(300, 1, 1)],
  ["pink", hsv(330, 0.4, 1)],
  ["brown", hsv(30, 0.75, 0.45)],
  ["white", hsv(0, 0, 1)],
  ["grey", hsv(0, 0, 0.5)],
  ["gray", hsv(0, 0, 0.5)],
  ["black", hsv(0, 0, 0)],
  ["transparent", hsv(0, 0, 1, 0)],
]);

/** The signed distance from hue `a` to hue `b` the short way round; exactly opposite goes up. */
export function hueDelta(a: number, b: number): number {
  const d = wrapHue(b - a);
  return d > 180 ? d - 360 : d;
}

export function mixHue(a: number, b: number, t: number): number {
  return wrapHue(a + hueDelta(a, b) * t);
}

/** Blends two colours, hue the short way round. `t` is clamped to 0–1. */
export function mixColour(a: Colour, b: Colour, t: number): Colour {
  t = clamp01(t);
  return {
    type: "colour",
    h: mixHue(a.h, b.h, t),
    s: a.s + (b.s - a.s) * t,
    v: a.v + (b.v - a.v) * t,
    a: a.a + (b.a - a.a) * t,
  };
}

/** Builds a gradient, filling in missing positions (section 13.3). */
export function makeGradient(
  stops: { colour: Colour; at: number | undefined }[],
  straight = false,
): Gradient {
  if (stops.length < 2) throw new ValueError("A gradient needs at least two colours.");
  const pos: (number | undefined)[] = stops.map((s) => s.at);
  if (pos[0] === undefined) pos[0] = 0;
  if (pos[pos.length - 1] === undefined) pos[pos.length - 1] = 1;
  let i = 0;
  while (i < pos.length) {
    if (pos[i] !== undefined) {
      i++;
      continue;
    }
    const before = i - 1;
    let after = i;
    while (pos[after] === undefined) after++;
    const a = pos[before]!;
    const b = pos[after]!;
    for (let k = before + 1; k < after; k++)
      pos[k] = a + ((b - a) * (k - before)) / (after - before);
    i = after;
  }
  const result: GradientStopValue[] = stops.map((s, k) => ({ pos: pos[k]!, colour: s.colour }));
  for (let k = 1; k < result.length; k++) {
    if (result[k]!.pos < result[k - 1]!.pos) {
      throw new ValueError("A gradient's positions must not go down.");
    }
  }
  return { type: "gradient", stops: result, straight };
}

export function sampleGradient(g: Gradient, t: number): Colour {
  t = clamp01(t);
  const stops = g.stops;
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  if (t < first.pos) return first.colour;
  if (t >= last.pos) return last.colour;
  for (let k = 0; k < stops.length - 1; k++) {
    const a = stops[k]!;
    const b = stops[k + 1]!;
    if (t >= a.pos && t < b.pos) {
      const u = (t - a.pos) / (b.pos - a.pos);
      const c = mixColour(a.colour, b.colour, u);
      // A spectrum's hue goes straight from one to the other, never across 0°.
      return g.straight ? { ...c, h: a.colour.h + (b.colour.h - a.colour.h) * u } : c;
    }
  }
  return last.colour;
}
