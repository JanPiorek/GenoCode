// The breeding grid: a generation of creatures shown as tiles. Select parents, then mutate or
// breed them into the next generation (docs/LANGUAGE.md section 19).

import { breed, mutate } from "@genocode/core";
import { onFieldReady, Thumbnails } from "@genocode/render";
import { buildCreature, type Creature } from "./creature.js";
import { locked } from "./panel.js";

const GRID_SIZE = 12;
/** Kept parents fill at most half the grid, so every generation has new creatures. */
const MAX_KEPT = GRID_SIZE / 2;
const HISTORY = 30;

export interface BreederEvents {
  /** A tile was clicked: show its genes. */
  inspect(c: Creature): void;
  /** A tile was double-clicked: open it in the full view. */
  open(c: Creature): void;
}

export class Breeder {
  private generation: Creature[] = [];
  /** Which tiles were kept from the last generation as parents. */
  private parents = new Set<number>();
  private readonly selected = new Set<number>();
  private readonly history: { generation: Creature[]; parents: Set<number> }[] = [];
  private readonly thumbnails = new Thumbnails();
  private drawing = 0;
  /** The tiles on show, to draw again when a texture's picture is ready. */
  private shown: { canvas: HTMLCanvasElement; creature: Creature }[] = [];
  private repaint = 0;

  constructor(
    private readonly grid: HTMLElement,
    private readonly events: BreederEvents,
  ) {
    new ResizeObserver(() => this.render()).observe(grid);
    // Pictures drawn elsewhere arrive one by one; the tiles are drawn again once they've settled.
    onFieldReady(() => {
      clearTimeout(this.repaint);
      this.repaint = window.setTimeout(() => {
        if (!this.grid.hidden) this.paint(this.shown);
      }, 100);
    });
  }

  /** The tiles, in grid order. */
  get creatures(): readonly Creature[] {
    return this.generation;
  }

  get selection(): Creature[] {
    return [...this.selected].sort((a, b) => a - b).map((i) => this.generation[i]!);
  }

  /** True when the grid already holds creatures of this program. */
  holds(c: Creature): boolean {
    return this.generation.some((g) => g.program === c.program);
  }

  /**
   * Starts a new grid from a creature's family: the creature and its variants, filled up with
   * mutations of them. A creature without variants starts with mutations of itself.
   */
  start(family: Creature[], strength: number): void {
    this.history.length = 0;
    this.selected.clear();
    this.selected.add(0);
    if (family.length === 1) {
      this.next(family, strength, true);
      return;
    }
    const kept = family.slice(0, GRID_SIZE);
    const children: Creature[] = [];
    while (kept.length + children.length < GRID_SIZE) {
      const p = kept[Math.floor(Math.random() * kept.length)]!;
      const values = mutate(p.program.genes, p.values, { strength, random: Math.random, locked });
      children.push({ program: p.program, values });
    }
    this.show(kept, children);
  }

  /** The next generation: mutations of the selected creatures. */
  mutateSelection(strength: number, keepParents: boolean): void {
    const parents = this.selection;
    if (parents.length === 0) return;
    this.remember();
    this.selected.clear();
    this.next(parents, strength, keepParents);
  }

  /** The next generation: children of random pairs of the selected creatures. */
  breedSelection(keepParents: boolean): void {
    const parents = this.selection;
    if (parents.length < 2) return;
    this.remember();
    this.selected.clear();
    const kept = keepParents ? parents.slice(0, MAX_KEPT) : [];
    const children: Creature[] = [];
    while (kept.length + children.length < GRID_SIZE) {
      const i = Math.floor(Math.random() * parents.length);
      let j = Math.floor(Math.random() * (parents.length - 1));
      if (j >= i) j++;
      const a = parents[i]!;
      const b = parents[j]!;
      const values = breed(
        { genes: a.program.genes, values: a.values },
        { genes: b.program.genes, values: b.values },
        { random: Math.random, locked },
      );
      children.push({ program: a.program, values });
    }
    this.show(kept, children);
  }

  /** Goes back to the previous generation. */
  back(): boolean {
    const last = this.history.pop();
    if (!last) return false;
    this.generation = last.generation;
    this.parents = last.parents;
    this.selected.clear();
    this.render();
    return true;
  }

  get canGoBack(): boolean {
    return this.history.length > 0;
  }

  private next(parents: Creature[], strength: number, keepParents: boolean): void {
    const kept = keepParents ? parents.slice(0, MAX_KEPT) : [];
    const children: Creature[] = [];
    while (kept.length + children.length < GRID_SIZE) {
      const p = parents[Math.floor(Math.random() * parents.length)]!;
      const values = mutate(p.program.genes, p.values, {
        strength,
        random: Math.random,
        locked,
      });
      children.push({ program: p.program, values });
    }
    this.show(kept, children);
  }

  private show(kept: Creature[], children: Creature[]): void {
    this.generation = [...kept, ...children];
    this.parents = new Set(kept.map((_, i) => i));
    this.render();
  }

  private remember(): void {
    this.history.push({ generation: this.generation, parents: this.parents });
    if (this.history.length > HISTORY) this.history.shift();
  }

  /** Lays out the tiles, then draws them a few at a time so the page stays responsive. */
  render(): void {
    if (this.grid.hidden) return;
    const tiles = this.generation.map((c, i) => this.tile(c, i));
    this.grid.replaceChildren(...tiles.map((t) => t.element));
    this.shown = tiles;
    this.paint(tiles);
  }

  /** Draws the tiles a few at a time, so the page stays responsive. */
  private paint(tiles: readonly { canvas: HTMLCanvasElement; creature: Creature }[]): void {
    const run = ++this.drawing;
    const ratio = window.devicePixelRatio || 1;
    let k = 0;
    const step = () => {
      if (run !== this.drawing) return;
      const started = performance.now();
      while (k < tiles.length && performance.now() - started < 30) {
        const { canvas, creature } = tiles[k++]!;
        canvas.width = Math.round(canvas.clientWidth * ratio);
        canvas.height = Math.round(canvas.clientHeight * ratio);
        const { built, background } = buildCreature(creature);
        this.thumbnails.draw(canvas, built.shapes, background);
      }
      if (k < tiles.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private tile(
    c: Creature,
    i: number,
  ): { element: HTMLElement; canvas: HTMLCanvasElement; creature: Creature } {
    const element = document.createElement("div");
    element.className = "tile";
    element.classList.toggle("selected", this.selected.has(i));
    element.classList.toggle("parent", this.parents.has(i));
    element.title = "Click to choose as a parent; double-click to open";
    const canvas = document.createElement("canvas");
    element.append(canvas);
    element.addEventListener("click", () => {
      if (this.selected.has(i)) this.selected.delete(i);
      else this.selected.add(i);
      element.classList.toggle("selected", this.selected.has(i));
      this.events.inspect(c);
    });
    element.addEventListener("dblclick", () => this.events.open(c));
    return { element, canvas, creature: c };
  }
}
