// The library: the starter creatures and dance styles, and everything kept in this browser, as
// tiles with small pictures. A tile opens its file; a background or dance can also be put into
// the creature on show; your own can be deleted.

import { onFieldReady, Thumbnails } from "@genocode/render";
import { buildCreature, checkText, fromProgram } from "./creature.js";

export type EntryKind = "creature" | "background" | "dance";

export interface LibraryEntry {
  kind: EntryKind;
  name: string;
  text: string;
  /** Kept in this browser, or one that comes with GenoCode. */
  yours: boolean;
}

export interface LibraryActions {
  open(entry: LibraryEntry): void;
  /** Puts a background or dance into the creature on show. */
  putIn(entry: LibraryEntry): void;
  remove(entry: LibraryEntry): void;
  /** The name of the creature on show, which backgrounds and dances can be put into. */
  creature(): string | undefined;
}

/** The kind of a file, from its header. */
export function kindOf(text: string): EntryKind {
  return checkText(text).file.kind;
}

const TILE = { width: 200, height: 150 };

export class LibraryView {
  private readonly thumbnails = new Thumbnails();
  /** Pictures already drawn, by text, so the library opens quickly the next time. */
  private readonly pictures = new Map<string, string>();
  private drawing = 0;

  private redraw = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly actions: LibraryActions,
  ) {
    // Textures are drawn elsewhere and arrive later: draw the pictures again with them.
    onFieldReady(() => {
      clearTimeout(this.redraw);
      this.redraw = window.setTimeout(() => {
        if (this.root.hidden) return;
        this.pictures.clear();
        this.drawPictures();
      }, 200);
    });
  }

  show(entries: LibraryEntry[]): void {
    const section = (title: string, hint: string, list: LibraryEntry[]) => {
      if (list.length === 0) return [];
      const head = document.createElement("h2");
      head.textContent = title;
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent = hint;
      const grid = document.createElement("div");
      grid.className = "library-grid";
      grid.append(...list.map((e) => this.tile(e)));
      return [head, note, grid];
    };
    const yours = entries.filter((e) => e.yours);
    const starters = entries.filter((e) => !e.yours);
    const creature = this.actions.creature();
    const into = creature ? `, or put it into ${creature}` : "";
    this.root.replaceChildren(
      ...section("Yours", "Kept in this browser. Click one to open it.", yours),
      ...section(
        "Starter creatures",
        "The creatures that come with GenoCode. Click one to open it.",
        starters.filter((e) => e.kind === "creature"),
      ),
      ...section(
        "Starter backgrounds",
        `Click one to open it${into}.`,
        starters.filter((e) => e.kind === "background"),
      ),
      ...section(
        "Dance styles",
        `How music moves a creature. Click one to open it${into}.`,
        starters.filter((e) => e.kind === "dance"),
      ),
    );
    this.drawPictures();
  }

  private tile(entry: LibraryEntry): HTMLElement {
    const tile = document.createElement("div");
    tile.className = `library-tile ${entry.kind}`;
    tile.tabIndex = 0;
    tile.title = `Open ${entry.name}`;
    const program = checkText(entry.text);
    if (entry.kind === "dance") {
      const icon = document.createElement("div");
      icon.className = "library-dance";
      icon.textContent = "♫";
      tile.append(icon);
    } else {
      const canvas = document.createElement("canvas");
      canvas.dataset["text"] = entry.text;
      const src = this.pictures.get(entry.text);
      if (src) canvas.style.backgroundImage = `url(${src})`;
      tile.append(canvas);
    }
    const label = document.createElement("div");
    label.className = "library-name";
    label.textContent = entry.name.replace(/_/g, " ");
    const about = document.createElement("div");
    about.className = "library-about";
    about.textContent = program.file.description
      .map((c) => c.text.replace(/^\/\/\s?/, ""))
      .join(" ");
    tile.append(label, about);

    const buttons = document.createElement("div");
    buttons.className = "library-buttons";
    const button = (text: string, title: string, run: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.title = title;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        run();
      });
      buttons.append(b);
    };
    const creature = this.actions.creature();
    if (entry.kind !== "creature" && creature) {
      button(
        entry.kind === "background" ? "Put behind" : "Give it",
        entry.kind === "background"
          ? `Put this background behind ${creature}`
          : `Give ${creature} this dance`,
        () => this.actions.putIn(entry),
      );
    }
    if (entry.yours) {
      button("Delete", `Delete ${entry.name} from this browser`, () => this.actions.remove(entry));
    }
    if (buttons.childElementCount > 0) tile.append(buttons);

    const open = () => this.actions.open(entry);
    tile.addEventListener("click", open);
    tile.addEventListener("keydown", (e) => {
      if (e.key === "Enter") open();
    });
    return tile;
  }

  /** Draws the tiles' pictures a few at a time, so the page stays responsive. */
  private drawPictures(): void {
    const canvases = [...this.root.querySelectorAll<HTMLCanvasElement>("canvas[data-text]")].filter(
      (c) => !this.pictures.has(c.dataset["text"]!),
    );
    const run = ++this.drawing;
    let k = 0;
    const step = () => {
      if (run !== this.drawing || this.root.hidden) return;
      const started = performance.now();
      while (k < canvases.length && performance.now() - started < 30) {
        const canvas = canvases[k++]!;
        const src = this.picture(canvas.dataset["text"]!);
        if (src) canvas.style.backgroundImage = `url(${src})`;
      }
      if (k < canvases.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** A small picture of a creature or background, in its rest pose. */
  private picture(text: string): string | undefined {
    const program = checkText(text);
    if (!program.ok) return undefined;
    const ratio = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(TILE.width * ratio);
    canvas.height = Math.round(TILE.height * ratio);
    const { built, background } = buildCreature(fromProgram(program));
    this.thumbnails.draw(canvas, built.shapes, background);
    const src = canvas.toDataURL();
    this.pictures.set(text, src);
    return src;
  }
}
