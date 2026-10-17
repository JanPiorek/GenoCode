// Beat tracking: finds the tempo in the onsets of the last few seconds of music, where the beats
// fall, and keeps a steady beat clock that follows them.

/** Tempos the tracker looks for, in beats a minute. */
const SLOWEST = 60;
const FASTEST = 180;
/** The tempo it prefers when several fit, and how strongly (in octaves of tempo). */
const PREFERRED = 120;
const PREFERENCE_WIDTH = 1;
/** Seconds of onsets it looks back over, and how often it looks again. */
const WINDOW = 8;
const EVERY = 0.5;
/** How much of a new estimate's phase and tempo the clock takes on each time. */
const PULL = 0.3;
/** The share of the onsets' energy the tempo must explain to count as a beat. */
const CONFIDENCE = 0.1;

export class BeatTracker {
  private readonly onsets: Float64Array;
  private count = 0;
  private sinceEstimate = 0;
  /** Seconds a beat, or undefined while there's no beat to follow. */
  private period: number | undefined;
  /** A time when a beat fell. */
  private anchor = 0;

  /** `rate`: onset values a second. */
  constructor(private readonly rate: number) {
    this.onsets = new Float64Array(Math.round(WINDOW * rate));
  }

  /** Adds the onset strength at time `time` (seconds). */
  push(onset: number, time: number): void {
    this.onsets[this.count % this.onsets.length] = onset;
    this.count++;
    this.sinceEstimate += 1 / this.rate;
    if (this.sinceEstimate >= EVERY && this.count >= this.onsets.length / 2) {
      this.sinceEstimate = 0;
      this.estimate(time);
    }
  }

  /** The position within the beat at `time`: 0 on the beat, rising towards 1. 0 with no beat. */
  at(time: number): number {
    if (this.period === undefined) return 0;
    const p = (time - this.anchor) / this.period;
    return p - Math.floor(p);
  }

  /** Beats a minute, or undefined while there's no beat. */
  get tempo(): number | undefined {
    return this.period === undefined ? undefined : 60 / this.period;
  }

  reset(): void {
    this.onsets.fill(0);
    this.count = 0;
    this.sinceEstimate = 0;
    this.period = undefined;
  }

  private estimate(time: number): void {
    const n = Math.min(this.count, this.onsets.length);
    const o = new Float64Array(n);
    for (let i = 0; i < n; i++) o[i] = this.onsets[(this.count - n + i) % this.onsets.length]!;
    let mean = 0;
    for (const v of o) mean += v;
    mean /= n;
    for (let i = 0; i < n; i++) o[i]! -= mean;

    const r = (lag: number): number => {
      let s = 0;
      for (let i = lag; i < n; i++) s += o[i]! * o[i - lag]!;
      return s / (n - lag);
    };
    const r0 = r(0);
    if (r0 <= 1e-12) {
      this.period = undefined;
      return;
    }
    const shortest = Math.floor((this.rate * 60) / FASTEST);
    const longest = Math.ceil((this.rate * 60) / SLOWEST);
    let best = 0;
    let bestScore = -Infinity;
    const scores = new Float64Array(longest + 2);
    for (let lag = shortest - 1; lag <= longest + 1; lag++) scores[lag] = r(lag);
    for (let lag = shortest; lag <= longest; lag++) {
      const bpm = (this.rate * 60) / lag;
      const octaves = Math.log2(bpm / PREFERRED) / PREFERENCE_WIDTH;
      const score = scores[lag]! * Math.exp(-0.5 * octaves * octaves);
      if (score > bestScore) {
        bestScore = score;
        best = lag;
      }
    }
    if (scores[best]! / r0 < CONFIDENCE) {
      this.period = undefined;
      return;
    }
    // Between whole lags: the peak of a parabola through the best lag and its neighbours.
    const a = scores[best - 1]!;
    const b = scores[best]!;
    const c = scores[best + 1]!;
    const bend = a - 2 * b + c;
    const lag = best + (bend < 0 ? (0.5 * (a - c)) / bend : 0);
    const period = lag / this.rate;

    // Where the beats fall: the offset whose comb of beats lands on the most onset energy.
    const steps = Math.floor(lag);
    let phase = 0;
    let phaseScore = -Infinity;
    for (let p = 0; p < steps; p++) {
      let s = 0;
      for (let k = 0; ; k++) {
        const i = Math.round(n - 1 - p - k * lag);
        if (i < 0) break;
        s += o[i]! * (1 - k / 32);
      }
      if (s > phaseScore) {
        phaseScore = s;
        phase = p;
      }
    }
    const beatTime = time - phase / this.rate;

    if (this.period === undefined || Math.abs(period / this.period - 1) > 0.1) {
      this.period = period;
      this.anchor = beatTime;
      return;
    }
    this.period += (period - this.period) * PULL;
    let error = (beatTime - this.anchor) / this.period;
    error -= Math.round(error);
    this.anchor += error * this.period * PULL;
  }
}
