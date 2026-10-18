// Grey pictures and the maths that makes and changes them: the canvas of pixel positions, fractal
// noise, smooth sampling, blurs and stretching (docs/LANGUAGE.md sections 14.1 and 18.7). The
// built-in pattern kinds (in @genocode/render) and patterns written in GenoCode both use them, so
// they draw alike.

/** How big the original FAC pictures were: blur widths are in their pixels. */
export const ORIGINAL_SIZE = 512;

/** A source of random numbers from 0 up to 1. */
export type Rng = () => number;

export const posMod = (x: number, m: number) => x - m * Math.floor(x / m);

/**
 * The coordinates of every pixel: x and y from -1 to 1, with the radius and angle from the
 * middle. A warped canvas has them pushed about, and every pattern drawn on it bends with them.
 */
export class Canvas {
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

/** Stretches the values to 0..1. */
export function normalise(v: Float32Array): void {
  let min = Infinity;
  let max = -Infinity;
  for (const x of v) {
    if (x < min) min = x;
    if (x > max) max = x;
  }
  const scale = 1 / (max - min + 1e-9);
  for (let i = 0; i < v.length; i++) v[i] = (v[i]! - min) * scale;
}

export function power(v: Float32Array, p: number): void {
  for (let i = 0; i < v.length; i++) v[i] = Math.pow(v[i]!, p);
}

/** Fractal noise: random grids of growing size, smoothly enlarged and added up. */
export function fbm(rng: Rng, size: number, octaves = 6, baseSize = 4): Float32Array {
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
export function enlarge(grid: Float32Array, n: number, size: number): Float32Array {
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
export function cubic(at: (k: number) => number, n: number, size: number, pixel: number): number {
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
export function sample(f: Float32Array, size: number, x: number, y: number): number {
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
export function mirror(c: number, size: number): number {
  let t = posMod((c + 1) / 2, 2);
  if (t > 1) t = 2 - t;
  return t * (size - 1);
}

/** A gaussian blur, across and then down. Widths are in the original's pixels. */
export function blur(v: Float32Array, size: number, across: number, down: number): Float32Array {
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
export function zoomBlur(
  v: Float32Array,
  size: number,
  strength: number,
  steps = 24,
): Float32Array {
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
