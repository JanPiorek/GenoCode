// Dancing: music moves the creature as a whole, by a dance style (docs/LANGUAGE.md section 17). Each
// frame the style's dance block runs with the music of the moment, the dancer works out the morph,
// zoom and turn from it, and the creature is built with the same music, so live creatures move to
// it as well.

import {
  buildDance,
  morph,
  type CheckResult,
  type DanceStyle,
  type MusicInputs,
} from "@genocode/core";
import { Dancer } from "@genocode/dance";
import type { MusicPlayer } from "@genocode/music";
import type { CreatureView } from "@genocode/render";
import { buildCreature, type Creature } from "./creature.js";
import { morphAt, type MorphFrame } from "./morph.js";
import { songLook } from "./songlook.js";

export interface DanceFrame extends MorphFrame {
  music: MusicInputs;
  beat: number;
  /** Whether the style worked out; a style with errors at this moment dances as if it were silent. */
  styleOk: boolean;
}

/** The longest step a frame may take, so the dance doesn't leap after the tab was hidden. */
const LONGEST_STEP = 0.1;
/** Seconds the creature takes to morph into a new song's look. */
const CHANGE_SECONDS = 2;

export class DanceFloor {
  /** The creature's family as it is, and as it looks for the song playing. */
  private family: Creature[] = [];
  private members: Creature[] = [];
  /** The look it's morphing out of, after the song changed, and since when. */
  private leaving: Creature[] | undefined;
  private changed = 0;
  private song: string | undefined;
  private locked: ReadonlySet<string> = new Set();
  /** Whether each song gets a look of its own (songlook.ts). */
  songLooks = true;
  private style: CheckResult | undefined;
  private dancer = new Dancer();
  private frame = 0;
  private started = 0;
  private last = 0;
  private faceOn = false;
  private dancing = false;

  constructor(
    private readonly view: CreatureView,
    private readonly player: MusicPlayer,
    private readonly onFrame: (f: DanceFrame) => void,
  ) {}

  /**
   * Starts dancing through these creatures (its morph loop) with a style, in the look for the
   * song playing, if any. Locked genes keep their values whatever the song.
   */
  start(
    members: Creature[],
    style: CheckResult | undefined,
    song: string | undefined,
    locked: ReadonlySet<string>,
  ): void {
    this.family = members;
    this.song = song;
    this.locked = locked;
    this.members = this.look();
    this.leaving = undefined;
    this.style = style;
    this.dancer = new Dancer();
    this.dancer.faceOn = this.faceOn;
    this.started = performance.now();
    this.last = this.started;
    this.stop();
    this.dancing = true;
    this.draw(true);
  }

  /**
   * Keeps the creature face-on, seen from straight in front with the camera locked, as the
   * original's dances were: it only spins flat. Otherwise it tumbles in 3D and the viewer can look
   * round.
   */
  setFaceOn(on: boolean): void {
    this.faceOn = on;
    this.dancer.faceOn = on;
    if (!this.dancing) return;
    this.view.lockCamera(on);
    if (on) this.view.viewFrom("front");
    else this.view.resetView();
  }

  /**
   * A new song (or none, for live music): the creature morphs into the song's look. Turning song
   * looks on or off does the same.
   */
  setSong(song: string | undefined): void {
    if (song === this.song) return;
    this.song = song;
    this.relook();
  }

  setSongLooks(on: boolean): void {
    this.songLooks = on;
    this.relook();
  }

  private look(): Creature[] {
    return this.songLooks && this.song !== undefined
      ? songLook(this.family, this.song, this.locked)
      : this.family;
  }

  private relook(): void {
    if (!this.dancing) return;
    this.leaving = this.members;
    this.changed = performance.now();
    this.members = this.look();
  }

  /** Changes style while dancing; the dance carries on from where it is. */
  setStyle(style: CheckResult | undefined): void {
    this.style = style;
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.dancing = false;
    this.view.setPose([0, 0, 0, 1], 0);
    this.view.lockCamera(false);
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
    const at = this.dancer.morph / this.members.length;
    const f = morphAt(this.members, at);
    if (this.leaving !== undefined) {
      const t = (now - this.changed) / 1000 / CHANGE_SECONDS;
      if (t >= 1) {
        this.leaving = undefined;
      } else {
        const from = morphAt(this.leaving, at).creature;
        const m = morph(
          { genes: from.program.genes, values: from.values },
          { genes: f.creature.program.genes, values: f.creature.values },
          (1 - Math.cos(Math.PI * t)) / 2,
        );
        f.creature = {
          program: m.from === "a" ? from.program : f.creature.program,
          values: m.values,
        };
      }
    }
    const { built, background } = buildCreature(f.creature, inputs);
    f.problems = built.diagnostics;
    this.view.setCreature(built.shapes, !first, built.focus);
    if (first && this.faceOn) {
      this.view.lockCamera(true);
      this.view.viewFrom("front");
    }
    this.view.setBackground(background);
    this.view.setPose(this.dancer.orientation, this.dancer.nearness);
    this.onFrame({ ...f, music, beat, styleOk });
    this.frame = requestAnimationFrame(() => this.draw(false));
  }
}
