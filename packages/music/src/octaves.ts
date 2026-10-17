// The octave filter bank that DancerDNA's music analysis (Snd2Vec) used: not an FFT but an integer
// Haar wavelet, which splits a block of samples into the energy of each octave.

/** Samples in one block. */
export const BLOCK = 2048;

/** Octaves in a block, from the lowest. At 44.1 kHz octave j covers 44100 / 2^(12−j) to 44100 / 2^(11−j) Hz. */
export const OCTAVES = 11;

/** The power of a full-scale 16-bit block (2048² · 32768²), so energies come out as fractions of it. */
const FULL_SCALE = 2 ** 52;

/**
 * The energy in each octave of a block of samples, and its total power (without the DC part), as
 * fractions of a full-scale signal's power. `x` holds BLOCK whole numbers (16-bit samples) and is
 * overwritten. Every intermediate value stays below 2^53, so the maths is exact in doubles.
 */
export function octaves(
  x: Float64Array,
  out: Float64Array = new Float64Array(OCTAVES + 1),
): Float64Array {
  // e[L]: the energy at blocks of 2^L samples, scaled by 2^L so the levels are comparable.
  const e = new Float64Array(12);
  let n = BLOCK;
  for (let level = 11; level >= 1; level--) {
    let s = 0;
    for (let i = 0; i < n; i++) s += x[i]! * x[i]!;
    e[level] = s * n;
    n >>= 1;
    for (let i = 0; i < n; i++) x[i] = x[2 * i]! + x[2 * i + 1]!;
  }
  e[0] = x[0]! * x[0]!;
  for (let j = 0; j < OCTAVES; j++) out[j] = Math.max(0, e[j + 1]! - e[j]!) / FULL_SCALE;
  out[OCTAVES] = (e[11]! - e[0]!) / FULL_SCALE;
  return out;
}

/** A sample from −1..1 as a 16-bit whole number. */
export function toInt16(s: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(s * 32768)));
}
