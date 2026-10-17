// The patterns of textures (docs/LANGUAGE.md section 14): each kind draws a grey picture, a field
// of values from 0 to 1, which a palette (palette.ts) then colours. Only the field takes real work,
// so a pattern whose hue, scheme or finish follows the music is recoloured, not redrawn.
//
// It follows the texture generator of Fantastic Avian Creatures (see CREDITS.md). That one blurs
// the coloured picture; this blurs the grey one before it's coloured, which looks much the same.
// Every setting comes from the seed, so one kind has many looks and a recipe always gives the same
// picture.

import { mulberry32, type PatternKindName, type PatternMix } from "@genocode/core";

type Rng = () => number;

/** A grey picture, `size` × `size`, rows from the top. */
export interface Field {
  size: number;
  v: Float32Array;
}

/** How big the original's pictures were: its blur widths are in its pixels. */
const ORIGINAL_SIZE = 512;

const TAU = Math.PI * 2;

const between = (rng: Rng, from: number, to: number) => from + (to - from) * rng();
const betweenWhole = (rng: Rng, from: number, to: number) =>
  from + Math.floor(rng() * (to - from + 1));
const sign = (rng: Rng) => (rng() < 0.5 ? -1 : 1);
const posMod = (x: number, m: number) => x - m * Math.floor(x / m);

/**
 * The coordinates of every pixel: x and y from -1 to 1, with the radius and angle from the
 * middle. A warped canvas has them pushed about, and every pattern drawn on it bends with them.
 */
class Canvas {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly r: Float32Array;
  readonly a: Float32Array;

  constructor(
    readonly size: number,
    from?: Canvas,
    dx?: (i: number) => number,
    dy?: (i: number) => number,
  ) {
    const n = size * size;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.r = new Float32Array(n);
    this.a = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = from ? from.x[i]! + dx!(i) : -1 + (2 * (i % size)) / (size - 1);
      const y = from ? from.y[i]! + dy!(i) : -1 + (2 * Math.floor(i / size)) / (size - 1);
      this.x[i] = x;
      this.y[i] = y;
      this.r[i] = Math.hypot(x, y);
      this.a[i] = Math.atan2(y, x);
    }
  }

  warped(dx: (i: number) => number, dy: (i: number) => number): Canvas {
    return new Canvas(this.size, this, dx, dy);
  }

  /** A noise field looked up where this pixel is, so noise bends with the canvas too. */
  at(field: Float32Array, i: number): number {
    return sample(field, this.size, this.x[i]!, this.y[i]!);
  }
}

interface Layer {
  v: Float32Array;
  /** What's done to the picture once it's drawn, such as a blur. */
  finish: (v: Float32Array, size: number) => Float32Array;
}

type Maker = (c: Canvas, rng: Rng) => Layer;

const plain = (v: Float32Array) => v;

function field(c: Canvas, value: (i: number) => number): Float32Array {
  const v = new Float32Array(c.size * c.size);
  for (let i = 0; i < v.length; i++) v[i] = value(i);
  return v;
}

function sunburst(c: Canvas, rng: Rng): Layer {
  const noiseWeight = between(rng, 0.4, 1);
  const glow = between(rng, 0.3, 0.9);
  const gamma = between(rng, 0.8, 2);
  const zoom = between(rng, 0.3, 0.9);
  const noise = fbm(rng, c.size, betweenWhole(rng, 4, 7), betweenWhole(rng, 3, 6));
  const v = field(c, (i) => c.at(noise, i) * noiseWeight + (1 - c.r[i]!) * glow);
  normalise(v);
  power(v, gamma);
  return { v, finish: (f, size) => zoomBlur(f, size, zoom) };
}

function vortex(c: Canvas, rng: Rng): Layer {
  const twist = between(rng, 2, 9) * sign(rng);
  const falloff = between(rng, 0.8, 3);
  const core = between(rng, 0, 1);
  const blurWidth = between(rng, 0.5, 2);
  const noise = fbm(rng, c.size, betweenWhole(rng, 4, 7), betweenWhole(rng, 3, 6));
  const v = field(c, (i) => {
    const r = c.r[i]!;
    const angle = c.a[i]! + twist * Math.exp(-r * falloff);
    return (
      sample(noise, c.size, r * Math.cos(angle), r * Math.sin(angle)) + core * Math.exp(-r * 3)
    );
  });
  normalise(v);
  return { v, finish: (f, size) => blur(f, size, blurWidth, blurWidth) };
}

function plasma(c: Canvas, rng: Rng): Layer {
  // Waves across, down, slantwise and in rings round two centres, each with its own frequency.
  const f: number[] = [];
  const phase: number[] = [];
  for (let k = 0; k < 5; k++) {
    f.push(between(rng, 3, 16));
    phase.push(between(rng, 0, TAU));
  }
  const cx = between(rng, -0.7, 0.7);
  const cy = between(rng, -0.7, 0.7);
  const angle = between(rng, 0, Math.PI);
  const ax = Math.cos(angle);
  const ay = Math.sin(angle);
  const v = field(c, (i) => {
    const x = c.x[i]!;
    const y = c.y[i]!;
    return (
      Math.sin(x * f[0]! + phase[0]!) +
      Math.sin(y * f[1]! + phase[1]!) +
      Math.sin((x * ax + y * ay) * f[2]! + phase[2]!) +
      Math.sin(c.r[i]! * f[3]! + phase[3]!) +
      Math.sin(Math.hypot(x - cx, y - cy) * f[4]! + phase[4]!)
    );
  });
  normalise(v);
  return { v, finish: plain };
}

/** Voronoi cells with glowing walls: reads like scales or skin. */
function cells(c: Canvas, rng: Rng): Layer {
  const count = betweenWhole(rng, 15, 150);
  const sharpness = between(rng, 10, 50) * Math.sqrt(count / 60);
  const shade = between(rng, 0.1, 0.7);
  const noiseWeight = between(rng, 0.1, 0.4);
  const px = new Float32Array(count);
  const py = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    px[k] = between(rng, -1.1, 1.1);
    py[k] = between(rng, -1.1, 1.1);
  }
  const n = c.size * c.size;
  const nearest = new Float32Array(n);
  const edge = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let d0 = Infinity;
    let d1 = Infinity;
    const x = c.x[i]!;
    const y = c.y[i]!;
    // Squared distances while searching; the square roots only for the two nearest.
    for (let k = 0; k < count; k++) {
      const dx = x - px[k]!;
      const dy = y - py[k]!;
      const d = dx * dx + dy * dy;
      if (d < d0) {
        d1 = d0;
        d0 = d;
      } else if (d < d1) {
        d1 = d;
      }
    }
    nearest[i] = Math.sqrt(d0);
    edge[i] = Math.sqrt(d1) - nearest[i]!;
  }
  normalise(nearest);
  const noise = fbm(rng, c.size);
  const v = field(
    c,
    (i) =>
      Math.exp(-edge[i]! * sharpness) + shade * (1 - nearest[i]!) + noiseWeight * c.at(noise, i),
  );
  normalise(v);
  return { v, finish: plain };
}

function kaleidoscope(c: Canvas, rng: Rng): Layer {
  const folds = betweenWhole(rng, 3, 16);
  const zoom = between(rng, 0.5, 1.2);
  const swirl = between(rng, -2, 2);
  const segment = TAU / folds;
  const noise = fbm(rng, c.size, betweenWhole(rng, 3, 6), betweenWhole(rng, 2, 4));
  const v = field(c, (i) => {
    const r = c.r[i]!;
    const fold = Math.abs(posMod(c.a[i]! + swirl * r, segment) - segment / 2);
    return sample(noise, c.size, r * Math.cos(fold) * zoom, r * Math.sin(fold) * zoom);
  });
  normalise(v);
  return { v, finish: plain };
}

function interference(c: Canvas, rng: Rng): Layer {
  const sources = betweenWhole(rng, 2, 7);
  const frequency = between(rng, 15, 70);
  const gamma = between(rng, 1, 2.5);
  const blurWidth = between(rng, 0.5, 1.5);
  const sx: number[] = [];
  const sy: number[] = [];
  for (let k = 0; k < sources; k++) {
    sx.push(between(rng, -0.8, 0.8));
    sy.push(between(rng, -0.8, 0.8));
  }
  const v = field(c, (i) => {
    let sum = 0;
    for (let k = 0; k < sources; k++) {
      sum += Math.sin(Math.hypot(c.x[i]! - sx[k]!, c.y[i]! - sy[k]!) * frequency);
    }
    return sum;
  });
  normalise(v);
  power(v, gamma);
  return { v, finish: (f, size) => blur(f, size, blurWidth, blurWidth) };
}

function starburst(c: Canvas, rng: Rng): Layer {
  const rays = new Float32Array(betweenWhole(rng, 12, 128) * 4);
  const strength = between(rng, 2, 5);
  const reach = between(rng, 0.6, 2);
  const core = between(rng, 3, 10);
  const blurWidth = between(rng, 1, 3);
  const zoom = between(rng, 0.1, 0.4);
  for (let k = 0; k < rays.length; k++) rays[k] = Math.pow(rng(), strength);
  const noise = fbm(rng, c.size);
  const v = field(c, (i) => {
    const index = Math.floor(((c.a[i]! + Math.PI) / TAU) * rays.length) % rays.length;
    const r = c.r[i]!;
    return rays[index]! * Math.exp(-r * reach) + Math.exp(-r * core) + 0.15 * c.at(noise, i);
  });
  normalise(v);
  return {
    v,
    finish: (f, size) => zoomBlur(blur(f, size, blurWidth, blurWidth), size, zoom),
  };
}

/** Noise pushed about by more noise: liquid, swirly flesh. */
function marble(c: Canvas, rng: Rng): Layer {
  const warp = between(rng, 0.3, 1.6);
  const stripes = between(rng, 5, 20);
  const angle = between(rng, 0, TAU);
  const lean = between(rng, 0, 6);
  const blurWidth = between(rng, 0.5, 1.5);
  const lx = Math.cos(angle) * lean;
  const ly = Math.sin(angle) * lean;
  const n1 = fbm(rng, c.size);
  const n2 = fbm(rng, c.size);
  const n3 = fbm(rng, c.size);
  const v = field(c, (i) => {
    const x = c.x[i]!;
    const y = c.y[i]!;
    const pushed = sample(
      n3,
      c.size,
      x + warp * (c.at(n1, i) - 0.5),
      y + warp * (c.at(n2, i) - 0.5),
    );
    return Math.sin(pushed * stripes + x * lx + y * ly) * 0.5 + 0.5;
  });
  return { v, finish: (f, size) => blur(f, size, blurWidth, blurWidth) };
}

/** Ridged noise: thin bright veins on dark, with a glow round them. */
function lightning(c: Canvas, rng: Rng): Layer {
  const veins = betweenWhole(rng, 2, 4);
  const sharpness = between(rng, 6, 20);
  const glow = between(rng, 2, 7);
  const v = new Float32Array(c.size * c.size);
  for (let k = 0; k < veins; k++) {
    const noise = fbm(rng, c.size, 5, betweenWhole(rng, 2, 4));
    for (let i = 0; i < v.length; i++) {
      v[i]! += Math.pow(1 - Math.abs(c.at(noise, i) - 0.5) * 2, sharpness);
    }
  }
  normalise(v);
  power(v, 0.8);
  return {
    v,
    finish: (f, size) => {
      // The glow is added and clipped, as light adds up.
      const halo = blur(f, size, glow, glow);
      for (let i = 0; i < f.length; i++) f[i] = Math.min(1, f[i]! + halo[i]!);
      return f;
    },
  };
}

function aurora(c: Canvas, rng: Rng): Layer {
  const count = betweenWhole(rng, 2, 5);
  const bands: [number, number, number][] = [];
  for (let k = 0; k < count; k++) {
    bands.push([between(rng, 1, 4), between(rng, 0, TAU), between(rng, 0.3, 0.8)]);
  }
  const thickness = between(rng, 4, 9);
  const wobble = between(rng, 0.1, 0.5);
  const streak = between(rng, 4, 12);
  const noise = fbm(rng, c.size, 4, 2);
  const fine = fbm(rng, c.size);
  const v = field(c, (i) => {
    let sum = 0;
    const n = c.at(noise, i) - 0.5;
    for (const [k, p, height] of bands) {
      const d = (c.y[i]! - height * Math.sin(c.x[i]! * k + p) - wobble * n) * thickness;
      sum += Math.exp(-d * d);
    }
    return sum + 0.1 * c.at(fine, i);
  });
  normalise(v);
  return { v, finish: (f, size) => blur(f, size, 1, streak) };
}

/** Petals: waves round the middle that ripple the rings. */
function bloom(c: Canvas, rng: Rng): Layer {
  const petals = betweenWhole(rng, 3, 13);
  const inner = betweenWhole(rng, 7, 21);
  const depth = between(rng, 0.05, 0.25);
  const rings = between(rng, 10, 40);
  const decay = between(rng, 0.8, 2.5);
  const zoom = between(rng, 0.05, 0.3);
  const noise = fbm(rng, c.size);
  const v = field(c, (i) => {
    const r = c.r[i]!;
    const a = c.a[i]!;
    const shape = Math.cos(a * petals) * depth + Math.cos(a * inner + r * 6) * depth * 0.5;
    return Math.sin((r + shape) * rings) * Math.exp(-r * decay) + (1 - r) + 0.2 * c.at(noise, i);
  });
  normalise(v);
  return { v, finish: (f, size) => zoomBlur(f, size, zoom) };
}

const MAKERS: Record<PatternKindName, Maker> = {
  sunburst,
  vortex,
  plasma,
  cells,
  kaleidoscope,
  interference,
  starburst,
  marble,
  lightning,
  aurora,
  bloom,
};

/**
 * Draws a pattern's grey picture: its kind and seed, with a second pattern mixed in if it has one.
 * The first pattern, the second and the colours each have their own random numbers, so the first
 * keeps its layout whatever is mixed into it.
 */
export function drawField(
  kind: PatternKindName,
  seed: number,
  mix: PatternMix | undefined,
  size: number,
): Field {
  const firstRng = mulberry32(seed);
  const secondRng = mulberry32(seed * 7919 + 17);
  const canvas = new Canvas(size);
  const first = MAKERS[kind];
  let layer: Layer;
  if (mix === undefined || mix.amount <= 0) {
    layer = first(canvas, firstRng);
  } else if (mix.way === "warp") {
    // The second pattern's brightness becomes a direction to push the first pattern in.
    const push = MAKERS[mix.kind](canvas, secondRng).v;
    const turns = 1 + 2 * secondRng();
    const distance = 0.15 + 0.6 * mix.amount;
    layer = first(
      canvas.warped(
        (i) => distance * Math.cos(push[i]! * TAU * turns),
        (i) => distance * Math.sin(push[i]! * TAU * turns),
      ),
      firstRng,
    );
  } else {
    layer = first(canvas, firstRng);
    const a = layer.v;
    const b = MAKERS[mix.kind](canvas, secondRng).v;
    const t = mix.amount;
    const v = new Float32Array(a.length);
    for (let i = 0; i < v.length; i++) {
      v[i] =
        mix.way === "blend"
          ? a[i]! + (b[i]! - a[i]!) * t * 0.7
          : mix.way === "mask"
            ? a[i]! * (1 - t + t * b[i]!)
            : Math.abs(a[i]! - t * b[i]!);
    }
    normalise(v);
    layer = { ...layer, v };
  }
  const v = layer.finish(layer.v, size);
  for (let i = 0; i < v.length; i++) v[i] = Math.min(1, Math.max(0, v[i]!));
  return { size, v };
}

// ---------- building blocks ----------

/** Stretches the values to 0..1. */
function normalise(v: Float32Array): void {
  let min = Infinity;
  let max = -Infinity;
  for (const x of v) {
    if (x < min) min = x;
    if (x > max) max = x;
  }
  const scale = 1 / (max - min + 1e-9);
  for (let i = 0; i < v.length; i++) v[i] = (v[i]! - min) * scale;
}

function power(v: Float32Array, p: number): void {
  for (let i = 0; i < v.length; i++) v[i] = Math.pow(v[i]!, p);
}

/** Fractal noise: random grids of growing size, smoothly enlarged and added up. */
function fbm(rng: Rng, size: number, octaves = 6, baseSize = 4): Float32Array {
  const sum = new Float32Array(size * size);
  let amplitude = 1;
  for (let octave = 0; octave < octaves; octave++) {
    const n = Math.min(baseSize << octave, size);
    const grid = new Float32Array(n * n);
    for (let k = 0; k < grid.length; k++) grid[k] = rng();
    const big = enlarge(grid, n, size);
    for (let i = 0; i < sum.length; i++) sum[i]! += amplitude * big[i]!;
    amplitude *= 0.5;
  }
  normalise(sum);
  return sum;
}

/** An n × n grid enlarged to size × size, a row and then a column at a time. */
function enlarge(grid: Float32Array, n: number, size: number): Float32Array {
  const wide = new Float32Array(n * size);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < size; col++) {
      wide[row * size + col] = cubic((k) => grid[row * n + k]!, n, size, col);
    }
  }
  const big = new Float32Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      big[row * size + col] = cubic((k) => wide[k * size + col]!, n, size, row);
    }
  }
  return big;
}

/** Catmull-Rom between the grid points either side of a pixel, with the ends held. */
function cubic(at: (k: number) => number, n: number, size: number, pixel: number): number {
  const g = ((pixel + 0.5) * n) / size - 0.5;
  const k = Math.floor(g);
  const t = g - k;
  const clampK = (j: number) => Math.min(n - 1, Math.max(0, j));
  const p0 = at(clampK(k - 1));
  const p1 = at(clampK(k));
  const p2 = at(clampK(k + 1));
  const p3 = at(clampK(k + 2));
  return (
    p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
  );
}

/** A field looked up at x and y in -1..1, smoothly between pixels and mirrored outside. */
function sample(f: Float32Array, size: number, x: number, y: number): number {
  const fx = mirror(x, size);
  const fy = mirror(y, size);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, size - 1);
  const y1 = Math.min(y0 + 1, size - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const top = f[y0 * size + x0]! + (f[y0 * size + x1]! - f[y0 * size + x0]!) * tx;
  const bottom = f[y1 * size + x0]! + (f[y1 * size + x1]! - f[y1 * size + x0]!) * tx;
  return top + (bottom - top) * ty;
}

/** -1..1 to a pixel position, folding back at the edges so there are no seams. */
function mirror(c: number, size: number): number {
  let t = posMod((c + 1) / 2, 2);
  if (t > 1) t = 2 - t;
  return t * (size - 1);
}

/** A gaussian blur, across and then down. Widths are in the original's pixels. */
function blur(v: Float32Array, size: number, across: number, down: number): Float32Array {
  const scale = size / ORIGINAL_SIZE;
  return blurPass(blurPass(v, size, across * scale, 1, size), size, down * scale, size, 1);
}

/** `step`: from one pixel to the next along the blur; `lineStep`: from one line to the next. */
function blurPass(
  v: Float32Array,
  size: number,
  sigma: number,
  step: number,
  lineStep: number,
): Float32Array {
  if (sigma < 0.3) return v;
  const radius = Math.ceil(sigma * 3);
  const kernel = new Float32Array(radius * 2 + 1);
  let total = 0;
  for (let k = -radius; k <= radius; k++) {
    kernel[k + radius] = Math.exp((-k * k) / (2 * sigma * sigma));
    total += kernel[k + radius]!;
  }
  for (let k = 0; k < kernel.length; k++) kernel[k]! /= total;
  const out = new Float32Array(v.length);
  for (let line = 0; line < size; line++) {
    for (let along = 0; along < size; along++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const at = Math.min(size - 1, Math.max(0, along + k));
        sum += kernel[k + radius]! * v[line * lineStep + at * step]!;
      }
      out[line * lineStep + along * step] = sum;
    }
  }
  return out;
}

/** The average of the picture enlarged by up to 1 + strength about its middle: rushing streaks. */
function zoomBlur(v: Float32Array, size: number, strength: number, steps = 24): Float32Array {
  const out = new Float32Array(v.length);
  const centre = size / 2;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      let sum = 0;
      for (let s = 0; s < steps; s++) {
        const scale = 1 + (strength * s) / steps;
        const x = (col + 0.5 - centre) / scale + centre - 0.5;
        const y = (row + 0.5 - centre) / scale + centre - 0.5;
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = x - x0;
        const fy = y - y0;
        const xa = Math.min(size - 1, Math.max(0, x0));
        const xb = Math.min(size - 1, Math.max(0, x0 + 1));
        const ya = Math.min(size - 1, Math.max(0, y0));
        const yb = Math.min(size - 1, Math.max(0, y0 + 1));
        const top = v[ya * size + xa]! + (v[ya * size + xb]! - v[ya * size + xa]!) * fx;
        const bottom = v[yb * size + xa]! + (v[yb * size + xb]! - v[yb * size + xa]!) * fx;
        sum += top + (bottom - top) * fy;
      }
      out[row * size + col] = sum / steps;
    }
  }
  return out;
}
