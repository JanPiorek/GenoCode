// Morphing: a loop through a set of creatures, each blending into the next (docs/LANGUAGE.md
// section 19.3), as the original's genespace did. Creature i sits at position i / n of the loop.

import { morph, type Diagnostic } from "@genocode/core";
import type { CreatureView } from "@genocode/render";
import { buildCreature, type Creature } from "./creature.js";

export interface MorphFrame {
  creature: Creature;
  /** Which creature of the loop it's leaving, and how far it is towards the next. */
  index: number;
  t: number;
  problems: Diagnostic[];
}

export class Morpher {
  private members: Creature[] = [];
  private position = 0;
  private last = 0;
  private frame = 0;
  private started = 0;
  playing = true;
  /** Seconds from one creature to the next. */
  secondsEach = 3;

  constructor(
    private readonly view: CreatureView,
    private readonly onFrame: (f: MorphFrame) => void,
  ) {}

  get count(): number {
    return this.members.length;
  }

  /** Starts morphing through these creatures, from the first. */
  start(members: Creature[]): void {
    this.members = members;
    this.position = 0;
    this.started = performance.now();
    this.last = this.started;
    this.stop();
    this.draw(true);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
  }

  resume(): void {
    this.stop();
    this.last = performance.now();
    this.draw(false);
  }

  /** The creature at a position in the loop, from 0 up to 1. */
  at(position: number): MorphFrame {
    const n = this.members.length;
    const x = (((position % 1) + 1) % 1) * n;
    const index = Math.min(Math.floor(x), n - 1);
    const t = x - index;
    const a = this.members[index]!;
    const b = this.members[(index + 1) % n]!;
    const m = morph(
      { genes: a.program.genes, values: a.values },
      { genes: b.program.genes, values: b.values },
      t,
    );
    const program = m.from === "a" ? a.program : b.program;
    return { creature: { program, values: m.values }, index, t, problems: [] };
  }

  private draw(first: boolean): void {
    if (this.members.length === 0) return;
    const now = performance.now();
    if (this.playing && !first) {
      this.position += (now - this.last) / 1000 / (this.secondsEach * this.members.length);
    }
    this.last = now;
    const f = this.at(this.position);
    const { built, background } = buildCreature(f.creature, (now - this.started) / 1000);
    f.problems = built.diagnostics;
    this.view.setCreature(built.shapes, !first);
    this.view.setBackground(background);
    this.onFrame(f);
    this.frame = requestAnimationFrame(() => this.draw(false));
  }
}
