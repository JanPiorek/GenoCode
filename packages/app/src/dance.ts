// Dancing: music moves the creature as a whole, by a dance style (docs/LANGUAGE.md section 17). Each
// frame the style's dance block runs with the music of the moment, the dancer works out the morph,
// zoom and turn from it, and the creature is built with the same music, so live creatures move to
// it as well.

import { buildDance, type CheckResult, type DanceStyle, type MusicInputs } from "@genocode/core";
import { Dancer } from "@genocode/dance";
import type { MusicPlayer } from "@genocode/music";
import type { CreatureView } from "@genocode/render";
import { buildCreature, type Creature } from "./creature.js";
import { morphAt, type MorphFrame } from "./morph.js";

export interface DanceFrame extends MorphFrame {
  music: MusicInputs;
  beat: number;
  /** Whether the style worked out; a style with errors at this moment dances as if it were silent. */
  styleOk: boolean;
}

/** The longest step a frame may take, so the dance doesn't leap after the tab was hidden. */
const LONGEST_STEP = 0.1;

export class DanceFloor {
  private members: Creature[] = [];
  private style: CheckResult | undefined;
  private dancer = new Dancer();
  private frame = 0;
  private started = 0;
  private last = 0;

  constructor(
    private readonly view: CreatureView,
    private readonly player: MusicPlayer,
    private readonly onFrame: (f: DanceFrame) => void,
  ) {}

  /** Starts dancing through these creatures (its morph loop) with a style. */
  start(members: Creature[], style: CheckResult | undefined): void {
    this.members = members;
    this.style = style;
    this.dancer = new Dancer();
    this.started = performance.now();
    this.last = this.started;
    this.stop();
    this.draw(true);
  }

  /** Changes style while dancing; the dance carries on from where it is. */
  setStyle(style: CheckResult | undefined): void {
    this.style = style;
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.view.setPose([0, 0, 0, 1], 0);
  }

  get count(): number {
    return this.members.length;
  }

  member(i: number): Creature {
    return this.members[i]!;
  }

  private draw(first: boolean): void {
    if (this.members.length === 0) return;
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, LONGEST_STEP);
    this.last = now;
    const { beat, music } = this.player.inputs();
    const inputs = { time: (now - this.started) / 1000, beat, music };

    let style: DanceStyle = {};
    let styleOk = true;
    if (this.style !== undefined) {
      const r = buildDance(this.style, { inputs });
      if (r.style !== undefined) style = r.style;
      else styleOk = this.style.dance === undefined;
    }
    this.dancer.step(style, dt);

    // The dancer counts in creatures; the loop runs from 0 to 1.
    const f = morphAt(this.members, this.dancer.morph / this.members.length);
    const { built, background } = buildCreature(f.creature, inputs);
    f.problems = built.diagnostics;
    this.view.setCreature(built.shapes, !first);
    this.view.setBackground(background);
    this.view.setPose(this.dancer.orientation, this.dancer.nearness);
    this.onFrame({ ...f, music, beat, styleOk });
    this.frame = requestAnimationFrame(() => this.draw(false));
  }
}
