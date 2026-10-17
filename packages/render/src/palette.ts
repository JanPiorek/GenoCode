// The colours of a texture (docs/LANGUAGE.md section 14): a colour scheme built round the
// pattern's hue, and a finish. It follows the palettes of Fantastic Avian Creatures (see
// CREDITS.md). Colours are worked out in OKLCh (lightness, chroma, hue), where equal steps look
// equal and blends stay clean. The result is a table from a pattern's grey value (0 to 1) to a
// colour.

import { mulberry32, toRgb, type FinishName, type SchemeName } from "@genocode/core";

/** How many colours a table holds. */
export const TABLE_SIZE = 256;

/** A colour along a scheme: where (0 to 1), lightness 0..1, chroma 0..~0.3, hue in degrees. */
type Stop = [at: number, l: number, c: number, h: number];

/** Each scheme, dark to light, with its hues placed round the base hue `h`. */
const SCHEMES: Record<SchemeName, (h: number) => Stop[]> = {
  jewel: (h) => [
    [0, 0.18, 0.08, h],
    [0.35, 0.42, 0.17, h + 20],
    [0.7, 0.64, 0.16, h + 55],
    [1, 0.84, 0.1, h + 80],
  ],
  duotone: (h) => [
    [0, 0.2, 0.11, h],
    [0.5, 0.56, 0.04, h + 75],
    [1, 0.88, 0.13, h + 155],
  ],
  split: (h) => [
    [0, 0.22, 0.1, h],
    [0.45, 0.56, 0.16, h + 150],
    [1, 0.86, 0.12, h + 210],
  ],
  analogous: (h) => [
    [0, 0.2, 0.09, h - 30],
    [0.4, 0.5, 0.15, h],
    [0.75, 0.73, 0.15, h + 30],
    [1, 0.93, 0.07, h + 55],
  ],
  pastel: (h) => [
    [0, 0.58, 0.08, h],
    [0.5, 0.74, 0.1, h + 60],
    [1, 0.86, 0.07, h + 120],
  ],
  dusk: (h) => [
    [0, 0.15, 0.07, h + 200],
    [0.45, 0.45, 0.13, h + 260],
    [0.8, 0.72, 0.15, h],
    [1, 0.91, 0.1, h + 30],
  ],
  electric: (h) => [
    [0, 0.08, 0.02, h],
    [0.4, 0.47, 0.22, h],
    [0.72, 0.76, 0.19, h + 45],
    [1, 0.97, 0.03, h + 60],
  ],
};

/** How much a finish adds a white sheen at a shape's edges, 0 to 1. */
export const SHEEN: Record<FinishName, number> = {
  matte: 0,
  metallic: 1,
  iridescent: 0.5,
  pearl: 0.7,
  satin: 0.5,
};

/**
 * A palette's colours: TABLE_SIZE entries of r, g, b (sRGB, 0 to 1). `hue` is in degrees as in
 * `hsv`; the seed gives each recipe a little variety of its own.
 */
export function paletteTable(
  hue: number,
  scheme: SchemeName,
  finish: FinishName,
  seed: number,
): Float32Array {
  const rng = mulberry32(seed * 104729 + 3);
  const stops = SCHEMES[scheme](oklchHue(hue));
  const jitter = (rng() - 0.5) * 16;
  const bands = 1.5 + rng() * 2.5;
  const phase = rng() * Math.PI * 2;
  const turns = 0.25 + rng() * 0.3; // iridescent: a shimmer, not a rainbow

  const table = new Float32Array(TABLE_SIZE * 3);
  for (let i = 0; i < TABLE_SIZE; i++) {
    const v = i / (TABLE_SIZE - 1);
    const [l0, a, b] = along(stops, v);
    const c0 = Math.hypot(a, b);
    const h0 = (Math.atan2(b, a) * 180) / Math.PI + jitter;
    const [l, c, h] = finishing(finish, v, l0, c0, h0, bands, phase, turns);
    table.set(oklchToRgb(l, c, h), i * 3);
  }
  return table;
}

/** The hue in OKLCh of the fully bright colour with this `hsv` hue, so hues mean what they say. */
function oklchHue(hsvHue: number): number {
  const [r, g, b] = toRgb({ type: "colour", h: ((hsvHue % 360) + 360) % 360, s: 1, v: 1, a: 1 });
  const [, a, bb] = linearToOklab(linear(r), linear(g), linear(b));
  return (Math.atan2(bb, a) * 180) / Math.PI;
}

/** The scheme's colour at v, blended between stops in OKLab, easing in and out of each. */
function along(stops: Stop[], v: number): [number, number, number] {
  let k = 1;
  while (k < stops.length - 1 && stops[k]![0] < v) k++;
  const [pAt, pl, pc, ph] = stops[k - 1]!;
  const [qAt, ql, qc, qh] = stops[k]!;
  let t = qAt > pAt ? Math.min(1, Math.max(0, (v - pAt) / (qAt - pAt))) : 0;
  t = t * t * (3 - 2 * t);
  const pa = pc * cos(ph);
  const pb = pc * sin(ph);
  const qa = qc * cos(qh);
  const qb = qc * sin(qh);
  return [pl + (ql - pl) * t, pa + (qa - pa) * t, pb + (qb - pb) * t];
}

function finishing(
  finish: FinishName,
  v: number,
  l: number,
  c: number,
  h: number,
  bands: number,
  phase: number,
  turns: number,
): [number, number, number] {
  const tau = Math.PI * 2;
  switch (finish) {
    case "metallic": {
      // Reflections: light and dark bands with near-white highlights, tinted by the scheme.
      const shine = 0.5 + 0.5 * Math.cos(v * tau * bands + phase);
      const metal = 0.12 + 0.85 * Math.pow(shine, 1.6);
      const lm = l * 0.3 + metal * 0.7;
      const highlight = smoothStep(0.72, 0.97, lm);
      return [lm, c * 0.75 * (1 - highlight), h];
    }
    case "iridescent": {
      const lm = l * 0.5 + (0.62 + 0.22 * Math.sin(v * tau * 2 + phase)) * 0.5;
      return [lm, Math.max(c, 0.1), h + v * 360 * turns];
    }
    case "pearl": {
      // Kept off white: the sheen adds plenty on top.
      const lm = 0.66 + 0.18 * (0.5 + 0.5 * Math.cos(v * tau * bands * 0.6 + phase));
      const play = 0.04 + 0.05 * (0.5 + 0.5 * Math.sin(v * tau * 1.3));
      return [lm, play * 0.7 + c * 0.3, h + 120 * Math.sin(v * tau + phase)];
    }
    case "satin": {
      const band = Math.min(
        1,
        Math.exp(-(((v - 0.78) / 0.08) ** 2)) + 0.4 * Math.exp(-(((v - 0.4) / 0.06) ** 2)),
      );
      return [l + (0.9 - l) * band * 0.75, c * (1 - 0.6 * band), h];
    }
    case "matte":
      return [l, c, h];
  }
}

/**
 * OKLCh to sRGB (0 to 1). Colours a screen can't show lose chroma until they fit, which keeps
 * their lightness and hue.
 */
function oklchToRgb(l: number, c: number, h: number): [number, number, number] {
  l = Math.min(1, Math.max(0, l));
  let low = 0;
  let high = Math.max(c, 0);
  let rgb = oklabToLinear(l, high * cos(h), high * sin(h));
  if (!inGamut(rgb)) {
    for (let step = 0; step < 12; step++) {
      const mid = (low + high) / 2;
      if (inGamut(oklabToLinear(l, mid * cos(h), mid * sin(h)))) low = mid;
      else high = mid;
    }
    rgb = oklabToLinear(l, low * cos(h), low * sin(h));
  }
  return [gamma(rgb[0]), gamma(rgb[1]), gamma(rgb[2])];
}

function oklabToLinear(l: number, a: number, b: number): [number, number, number] {
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

function linearToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const inGamut = ([r, g, b]: [number, number, number]) =>
  r >= -0.001 && r <= 1.001 && g >= -0.001 && g <= 1.001 && b >= -0.001 && b <= 1.001;

function gamma(x: number): number {
  x = Math.min(1, Math.max(0, x));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function linear(x: number): number {
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

const cos = (degrees: number) => Math.cos((degrees * Math.PI) / 180);
const sin = (degrees: number) => Math.sin((degrees * Math.PI) / 180);

function smoothStep(from: number, to: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
}
