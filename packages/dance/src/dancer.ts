// The dance: moves a creature as a whole to music (docs/LANGUAGE.md section 17). Each moment it
// takes the dance style (the dance block run with the music of that moment) and works out how far
// along its morph the creature is, how near it has come, and how it's turned.
//
// It follows DancerDNA's dance (see CREDITS.md): envelopes that rise fast and fall slowly push the
// morph and the zoom, a trigger that fires when an input moves far enough turns the spin and
// reverses the morph, and counted bursts of triggers switch the flat, face-on spin on and off. Unlike
// the original, a dance starts tumbling in 3D rather than flat.
// The original counted in timer ticks; this counts in seconds, so any frame rate dances the same.

import type { DanceStyle, Trigger } from "@genocode/core";

/** A rotation as a quaternion: x, y, z, w. */
export type Quaternion = [number, number, number, number];
export type Vector = [number, number, number];

/** How much faster the morph speeds up than it settles, and the zoom comes in than it drifts back. */
const MORPH_ATTACK = 10;
const ZOOM_ATTACK = 50;
/** The axis the spin starts about, and the flat spin's: the line of sight. */
const VIEW_AXIS: Vector = [0, 0, 1];

/** Fires when an input has moved far enough since it last moved that far. */
class Switch {
  private last = 0;

  fires(t: Trigger, flatOn = false): boolean {
    const moved = t.input - this.last;
    if (Math.abs(moved) < t.by) return false;
    this.last = t.input;
    // While the creature is flat, turns only count drops (as in the original).
    const when = flatOn ? "drops" : t.when;
    return when === "changes" || (when === "drops" ? moved < 0 : moved > 0);
  }
}

/** Counts triggers into bursts: working for `on` of them, then resting for `off`, and so on. */
class Bursts {
  private count = 0;

  constructor(public working = true) {}

  /** Counts a trigger and says whether the effect is working after it. */
  trigger(bursts: Trigger["bursts"]): boolean {
    if (bursts === undefined) return (this.working = true);
    this.count++;
    const limit = this.working ? bursts.on : bursts.off;
    if (this.count > limit) {
      this.count -= limit;
      this.working = !this.working;
    }
    return this.working;
  }
}

export class Dancer {
  /** How far along its morph the creature is, in creatures (the app wraps it round the loop). */
  morph = 0;
  /** How fast the morph moves, in creatures a second (always 0 or more). */
  private morphSpeed = 0;
  /** Whether the morph runs backwards. */
  reversed = false;
  /** How near the zoom has brought the creature, from 0 (its usual place) to 1 (all the way in). */
  private closeness = 0;
  private zoomAmount = 0;
  /** How the creature is turned. */
  orientation: Quaternion = [0, 0, 0, 1];
  /** Whether it's in a flat, face-on spin. */
  flat = false;

  // The spin swings from the old axis and speed (degrees a second) to the new over `smooth` seconds.
  private fromAxis: Vector = VIEW_AXIS;
  private toAxis: Vector = VIEW_AXIS;
  private fromSpeed: number | undefined;
  private toSpeed = 0;
  private swing = 1;
  private flatSign = 1;

  private readonly turnSwitch = new Switch();
  private readonly reverseSwitch = new Switch();
  private readonly flatSwitch = new Switch();
  private readonly reverseBursts = new Bursts();
  // Flat starts resting, so a dance opens tumbling in 3D and shows the creature's shape.
  private readonly flatBursts = new Bursts(false);

  constructor(private readonly random: () => number = Math.random) {}

  /** How near the creature has come: 0 is its usual place, 1 as near as it can. */
  get nearness(): number {
    return this.closeness * this.zoomAmount;
  }

  /** The axis and speed (degrees a second) the creature is spinning at now. */
  get spin(): { axis: Vector; speed: number } {
    const t = this.swing;
    return {
      axis: normalise(mixVectors(this.fromAxis, this.toAxis, t)),
      speed: (this.fromSpeed ?? this.toSpeed) * (1 - t) + this.toSpeed * t,
    };
  }

  /** Moves the dance on by `dt` seconds, with the style of this moment. */
  step(style: DanceStyle, dt: number): void {
    if (dt <= 0) return;
    this.stepFlat(style);
    this.stepSpin(style, dt);
    this.stepZoom(style, dt);
    this.stepMorph(style, dt);
  }

  private stepFlat(style: DanceStyle): void {
    const f = style.flat;
    if (f === undefined) {
      if (this.flat) this.flat = false;
      return;
    }
    if (this.flatSwitch.fires(f)) this.flatBursts.trigger(f.bursts);
    const flat = this.flatBursts.working;
    if (flat === this.flat) return;
    this.flat = flat;
    if (flat) {
      // Snap face-on, and spin flat about the line of sight.
      this.orientation = [0, 0, 0, 1];
      this.newAxis(style, VIEW_AXIS);
    }
  }

  private stepSpin(style: DanceStyle, dt: number): void {
    const s = style.spin;
    if (s === undefined) {
      this.toSpeed = 0;
      this.fromSpeed = 0;
      return;
    }
    if (this.fromSpeed === undefined) this.toSpeed = s.from;
    if (style.turn === undefined) {
      // With nothing to turn the axis, the speed follows the input all the time.
      this.toSpeed = spinSpeed(style);
    } else if (this.turnSwitch.fires(style.turn, this.flat)) {
      if (this.flat) {
        this.flatSign = -this.flatSign;
        this.newAxis(style, [0, 0, this.flatSign]);
      } else {
        const r = () => this.random() * 2 - 1;
        this.newAxis(style, [r(), r(), r()]);
      }
    }
    this.swing = s.smooth > 0 ? Math.min(1, this.swing + dt / s.smooth) : 1;
    const { axis, speed } = this.spin;
    this.orientation = multiply(axisAngle(axis, (speed * dt * Math.PI) / 180), this.orientation);
  }

  /** Starts swinging from where the spin is now to a new axis, at the speed the input asks for. */
  private newAxis(style: DanceStyle, axis: Vector): void {
    const now = this.spin;
    this.fromAxis = now.axis;
    this.fromSpeed = now.speed;
    this.toAxis = axis;
    this.toSpeed = spinSpeed(style);
    this.swing = 0;
  }

  private stepZoom(style: DanceStyle, dt: number): void {
    const z = style.zoom;
    if (z === undefined) {
      this.closeness = 0;
      return;
    }
    this.zoomAmount = z.amount;
    const fall = dt / Math.max(z.settle, 1e-3);
    this.closeness = approach(this.closeness, z.input, ZOOM_ATTACK * fall, fall);
  }

  private stepMorph(style: DanceStyle, dt: number): void {
    const m = style.morph;
    if (style.reverse !== undefined && this.reverseSwitch.fires(style.reverse)) {
      if (this.reverseBursts.trigger(style.reverse.bursts)) this.reversed = !this.reversed;
    }
    if (m === undefined) {
      this.morphSpeed = 0;
      return;
    }
    const fall = (m.speed * dt) / Math.max(m.settle, 1e-3);
    this.morphSpeed = approach(this.morphSpeed, m.input * m.speed, MORPH_ATTACK * fall, fall);
    this.morph += (this.reversed ? -1 : 1) * this.morphSpeed * dt;
  }
}

function spinSpeed(style: DanceStyle): number {
  const s = style.spin!;
  return s.from + (s.to - s.from) * s.input;
}

/** Moves `current` towards `target`, rising by at most `up` and falling by at most `down`. */
function approach(current: number, target: number, up: number, down: number): number {
  return target > current ? Math.min(current + up, target) : Math.max(current - down, target);
}

function mixVectors(a: Vector, b: Vector, t: number): Vector {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function normalise(v: Vector): Vector {
  const l = Math.hypot(...v);
  return l === 0 ? VIEW_AXIS : [v[0] / l, v[1] / l, v[2] / l];
}

function axisAngle([x, y, z]: Vector, angle: number): Quaternion {
  const s = Math.sin(angle / 2);
  return [x * s, y * s, z * s, Math.cos(angle / 2)];
}

function multiply(a: Quaternion, b: Quaternion): Quaternion {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  const q: Quaternion = [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
  const n = Math.hypot(...q);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}
