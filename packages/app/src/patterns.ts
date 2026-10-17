// Patterns: a designer for texture and background recipes (docs/LANGUAGE.md section 14). A big
// preview, a control for every part of the recipe, and a grid of variations to mutate and breed,
// as the Breed mode does for creatures. A recipe
// can be copied as code, put behind the creature as its background, or exported as a background
// file or a picture.

import {
  check,
  FINISHES,
  formatText,
  formatValue,
  MIX_WAYS,
  NO_PATTERN,
  PATTERN_KINDS,
  SCHEMES,
  type MixWayName,
  type Pattern,
  type PatternKindName,
} from "@genocode/core";
import { pixelsWhenReady } from "@genocode/render";

/** How big the preview is drawn: smaller while a control is dragged, so it keeps up. */
const PREVIEW_SIZE = 512;
const DRAGGING_SIZE = 256;
const VARIATION_SIZE = 128;
const VARIATIONS = 12;
/** How big an exported picture is. */
const EXPORT_SIZE = 1024;

export const DEFAULT_RECIPE: Pattern = {
  ...NO_PATTERN,
  kind: "aurora",
  hue: 200,
  seed: 7,
  scheme: "dusk",
};

export interface PatternActions {
  /** Puts this background source (the block's contents, one line each) behind the creature. */
  useAsBackground(lines: string[]): void;
}

const pick = <T>(options: readonly T[]): T => options[Math.floor(Math.random() * options.length)]!;
const wrapHue = (h: number) => Math.round(((h % 360) + 360) % 360);

/** A variation on a recipe: each part may change, the hue only a little. */
export function vary(p: Pattern): Pattern {
  const chance = (c: number) => Math.random() < c;
  let mix = p.mix;
  if (chance(0.25)) {
    mix = chance(0.3)
      ? undefined
      : { way: pick(MIX_WAYS), kind: pick(PATTERN_KINDS), amount: round2(Math.random()) };
  } else if (mix && chance(0.5)) {
    mix = { ...mix, amount: round2(Math.min(1, Math.max(0, mix.amount + Math.random() - 0.5))) };
  }
  return {
    ...p,
    kind: chance(0.25) ? pick(PATTERN_KINDS) : p.kind,
    hue: wrapHue(p.hue + (Math.random() * 2 - 1) * 60),
    seed: chance(0.5) ? Math.floor(Math.random() * 100) : p.seed,
    scheme: chance(0.3) ? pick(SCHEMES) : p.scheme,
    finish: chance(0.3) ? pick(FINISHES) : p.finish,
    mix,
  };
}

/** A child of two recipes: each part from one parent or the other, the hue and amount blended. */
export function cross(a: Pattern, b: Pattern): Pattern {
  const either = <T>(x: T, y: T): T => (Math.random() < 0.5 ? x : y);
  // The hue goes the short way round the circle between the parents.
  const apart = ((((b.hue - a.hue) % 360) + 540) % 360) - 180;
  let mix = either(a.mix, b.mix);
  if (a.mix && b.mix) {
    const t = Math.random();
    mix = {
      way: either(a.mix.way, b.mix.way),
      kind: either(a.mix.kind, b.mix.kind),
      amount: round2(a.mix.amount + (b.mix.amount - a.mix.amount) * t),
    };
  }
  return {
    ...a,
    kind: either(a.kind, b.kind),
    hue: wrapHue(a.hue + apart * Math.random()),
    seed: either(a.seed, b.seed),
    scheme: either(a.scheme, b.scheme),
    finish: either(a.finish, b.finish),
    mix,
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * A background holding a recipe, with each part of it a gene, so it can mutate and breed with
 * the creature: the lines of the block's contents.
 */
export function backgroundLines(p: Pattern): string[] {
  const list = (options: readonly string[]) => `[${options.join(", ")}]`;
  const lines = [
    `gene kind   = ${p.kind} from ${list(PATTERN_KINDS)}`,
    `gene hue    = ${p.hue} in 0..360`,
    `gene layout = ${p.seed} in 0..99 step 1`,
    `gene scheme = ${p.scheme} from ${list(SCHEMES)}`,
    `gene finish = ${p.finish} from ${list(FINISHES)}`,
  ];
  let fill = "pattern(kind, hue, layout, scheme, finish)";
  if (p.mix) {
    lines.push(
      `gene mixing = ${p.mix.way} from ${list(MIX_WAYS)}`,
      `gene other  = ${p.mix.kind} from ${list(PATTERN_KINDS)}`,
      `gene amount = ${p.mix.amount} in 0..1`,
    );
    fill = `mixed(${fill}, mixing, other, amount)`;
  }
  return [...lines, "", `fill ${fill}`];
}

/** A name for a recipe, such as Dusk_Aurora. */
export function recipeName(p: Pattern): string {
  const word = (s: string) => s[0]!.toUpperCase() + s.slice(1);
  return `${word(p.scheme)}_${word(p.kind ?? "pattern")}`;
}

/** A background file holding a recipe. */
export function backgroundFile(p: Pattern): string {
  const text = [
    `background ${recipeName(p)}`,
    `// Made in the Patterns designer: ${formatValue(p)}`,
    "",
    ...backgroundLines(p),
    "",
  ].join("\n");
  return formatText(text).text ?? text;
}

/**
 * The code with its background replaced by one holding these lines: the creature's background
 * block (added before its dance block or variants if it has none), or a background file's
 * contents. Undefined when the code has errors that hide where the background goes.
 */
export function withBackground(text: string, lines: string[]): string | undefined {
  const p = check(text);
  const file = p.file;
  let out: string;
  if (file.kind === "background") {
    const first = file.items[0];
    if (!first) return undefined;
    out = text.slice(0, first.span.start) + lines.join("\n") + "\n";
  } else if (file.kind === "creature") {
    const block = ["background {", ...lines.map((l) => (l ? `  ${l}` : "")), "}"].join("\n");
    const old = file.items.find((i) => i.kind === "Background");
    const before = file.items.find((i) => i.kind === "Dance" || i.kind === "Variant");
    if (old) out = text.slice(0, old.span.start) + block + text.slice(old.span.end);
    else if (before)
      out = `${text.slice(0, before.span.start)}${block}\n\n${text.slice(before.span.start)}`;
    else out = `${text.trimEnd()}\n\n${block}\n`;
  } else {
    return undefined;
  }
  return formatText(out).text ?? out;
}

/** The latest picture asked of each canvas, so one that arrives late isn't drawn over it. */
const latest = new WeakMap<HTMLCanvasElement, Pattern>();

/** Draws a recipe into a canvas once its picture is ready (pictures are drawn in web workers). */
async function drawInto(target: HTMLCanvasElement, p: Pattern, size: number): Promise<void> {
  latest.set(target, p);
  const pixels = await pixelsWhenReady(p, size);
  if (latest.get(target) !== p) return;
  target.width = size;
  target.height = size;
  const ctx = target.getContext("2d")!;
  ctx.putImageData(new ImageData(pixels, size, size), 0, 0);
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

function choice<T extends string>(options: readonly T[], extra?: string): HTMLSelectElement {
  const select = element("select");
  if (extra !== undefined) select.append(element("option", { value: "", textContent: extra }));
  for (const o of options) select.append(element("option", { value: o, textContent: o }));
  return select;
}

function slider(min: number, max: number, step: number): HTMLInputElement {
  return element("input", {
    type: "range",
    min: String(min),
    max: String(max),
    step: String(step),
  });
}

export class PatternDesigner {
  private recipe: Pattern = DEFAULT_RECIPE;
  private readonly preview = element("canvas", { className: "pattern-preview" });
  private readonly variations = element("div", { className: "pattern-variations" });
  /** The recipes in the grid, and which are chosen as parents. */
  private tiles: { p: Pattern; el: HTMLCanvasElement }[] = [];
  private readonly chosen = new Set<number>();
  private readonly mutateButton = element("button", { type: "button", textContent: "Mutate" });
  private readonly breedButton = element("button", { type: "button", textContent: "Breed" });
  private readonly gridHint = element("span", { className: "hint" });
  private readonly code = element("code");
  private readonly hint = element("span", { className: "hint" });

  private readonly kind = choice(PATTERN_KINDS);
  private readonly hue = slider(0, 359, 1);
  private readonly seed = slider(0, 99, 1);
  private readonly scheme = choice(SCHEMES);
  private readonly finish = choice(FINISHES);
  private readonly way = choice(MIX_WAYS, "none");
  private readonly second = choice(PATTERN_KINDS);
  private readonly amount = slider(0, 1, 0.01);
  private readonly mixRows: HTMLElement[] = [];

  constructor(
    root: HTMLElement,
    private readonly actions: PatternActions,
  ) {
    const row = (label: string, control: HTMLElement, title = "") => {
      const r = element(
        "label",
        { className: "field", title },
        element("span", {}, label),
        control,
      );
      return r;
    };
    const withRow = row("with", this.second, "The second pattern");
    const amountRow = row("amount", this.amount, "How much of the second pattern, 0 to 1");
    this.mixRows.push(withRow, amountRow);
    const controls = element(
      "div",
      { className: "pattern-controls" },
      row("kind", this.kind),
      row("hue", this.hue, "The hue the colours are built round"),
      row("layout", this.seed, "The seed: the layout and the pattern's own details"),
      row("scheme", this.scheme, "How the colours are chosen round the hue"),
      row("finish", this.finish, "How the surface looks"),
      row("mix", this.way, "How a second pattern is mixed in"),
      withRow,
      amountRow,
    );
    const button = (label: string, title: string, run: () => void) => {
      const b = element("button", { type: "button", textContent: label, title });
      b.addEventListener("click", run);
      return b;
    };
    const actionsBar = element(
      "div",
      { className: "pattern-actions" },
      button("Copy code", "Copy the recipe, for `texture` or `fill`", () => void this.copy()),
      button("Use as background", "Put this recipe behind the creature, with genes", () =>
        this.actions.useAsBackground(backgroundLines(this.recipe)),
      ),
      button("Export .genie", "Save the recipe as a background file", () => void this.exportFile()),
      button("Export PNG", "Save the pattern as a picture", () => void this.exportPicture()),
      this.hint,
    );
    this.mutateButton.title = "Variations of the chosen recipes, or of the one above";
    this.breedButton.title = "Children of the chosen recipes";
    this.mutateButton.addEventListener("click", () => this.mutate());
    this.breedButton.addEventListener("click", () => this.breed());
    root.append(
      element("div", { className: "pattern-top" }, this.preview, controls),
      element(
        "div",
        { className: "pattern-actions" },
        this.mutateButton,
        this.breedButton,
        this.gridHint,
      ),
      this.variations,
      element("div", { className: "pattern-code" }, this.code),
      actionsBar,
    );

    // Hue and amount only recolour or reblend, but drawing a new picture takes a moment, so the
    // preview is drawn smaller while a slider moves and in full once it's let go.
    for (const s of [this.hue, this.seed, this.amount]) {
      s.addEventListener("input", () => this.fromControls(DRAGGING_SIZE));
      s.addEventListener("change", () => this.fromControls(PREVIEW_SIZE, true));
    }
    for (const s of [this.kind, this.scheme, this.finish, this.way, this.second]) {
      s.addEventListener("change", () => this.fromControls(PREVIEW_SIZE, true));
    }
  }

  get pattern(): Pattern {
    return this.recipe;
  }

  /** Starts designing from a recipe, such as the creature's background. */
  show(start?: Pattern): void {
    if (start && start.kind !== null) this.recipe = start;
    this.toControls();
    this.draw(PREVIEW_SIZE);
    if (this.tiles.length === 0) this.mutate();
  }

  private fromControls(size: number, settled = false): void {
    const way = this.way.value as MixWayName | "";
    this.recipe = {
      ...this.recipe,
      kind: this.kind.value as PatternKindName,
      hue: Number(this.hue.value),
      seed: Number(this.seed.value),
      scheme: this.scheme.value as Pattern["scheme"],
      finish: this.finish.value as Pattern["finish"],
      mix:
        way === ""
          ? undefined
          : {
              way,
              kind: this.second.value as PatternKindName,
              amount: Number(this.amount.value),
            },
    };
    this.showMixRows();
    this.draw(size);
    if (settled) this.hint.textContent = "";
  }

  private toControls(): void {
    const p = this.recipe;
    this.kind.value = p.kind ?? "aurora";
    this.hue.value = String(wrapHue(p.hue));
    this.seed.value = String(p.seed);
    this.scheme.value = p.scheme;
    this.finish.value = p.finish;
    this.way.value = p.mix?.way ?? "";
    this.second.value = p.mix?.kind ?? "vortex";
    this.amount.value = String(p.mix?.amount ?? 0.5);
    this.showMixRows();
  }

  private showMixRows(): void {
    for (const r of this.mixRows) r.hidden = this.recipe.mix === undefined;
  }

  private draw(size: number): void {
    void drawInto(this.preview, this.recipe, size);
    this.code.textContent = formatValue(this.recipe);
    this.hint.textContent = "";
  }

  private parents(): Pattern[] {
    return [...this.chosen].map((i) => this.tiles[i]!.p);
  }

  /** Fills the grid with variations of the chosen recipes, or of the one above. */
  private mutate(): void {
    const parents = this.chosen.size > 0 ? this.parents() : [this.recipe];
    this.fill(() => vary(pick(parents)));
  }

  /** Fills the grid with children of two of the chosen recipes at a time. */
  private breed(): void {
    const parents = this.parents();
    if (parents.length < 2) return;
    this.fill(() => {
      const a = pick(parents);
      const b = pick(parents.filter((p) => p !== a));
      return cross(a, b);
    });
  }

  /**
   * Fills the grid. Clicking a recipe chooses it as a parent (or not); double-clicking one puts it
   * above, to work on.
   */
  private fill(make: () => Pattern): void {
    this.chosen.clear();
    this.tiles = Array.from({ length: VARIATIONS }, (_, i) => {
      const p = make();
      const el = element("canvas", { className: "pattern-variation", title: formatValue(p) });
      void drawInto(el, p, VARIATION_SIZE);
      el.addEventListener("click", () => {
        if (!this.chosen.delete(i)) this.chosen.add(i);
        this.showChosen();
      });
      el.addEventListener("dblclick", () => {
        this.recipe = p;
        this.toControls();
        this.draw(PREVIEW_SIZE);
      });
      return { p, el };
    });
    this.variations.replaceChildren(...this.tiles.map((t) => t.el));
    this.showChosen();
  }

  private showChosen(): void {
    this.tiles.forEach((t, i) => t.el.classList.toggle("selected", this.chosen.has(i)));
    const n = this.chosen.size;
    this.breedButton.disabled = n < 2;
    this.gridHint.textContent =
      n === 0
        ? "Click recipes to choose parents · double-click one to work on it"
        : `${n} parent${n === 1 ? "" : "s"} chosen`;
  }

  private async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(formatValue(this.recipe));
      this.hint.textContent = "Copied";
    } catch {
      this.hint.textContent = "The browser didn't allow copying";
    }
  }

  private async exportFile(): Promise<void> {
    const blob = new Blob([backgroundFile(this.recipe)], { type: "text/plain" });
    await saveBlob(blob, `${recipeName(this.recipe)}.genie`, "GenoCode backgrounds", ".genie");
  }

  private async exportPicture(): Promise<void> {
    this.hint.textContent = "Drawing…";
    const big = element("canvas");
    await drawInto(big, this.recipe, EXPORT_SIZE);
    const blob = await new Promise<Blob | null>((r) => big.toBlob(r, "image/png"));
    this.hint.textContent = "";
    if (blob) await saveBlob(blob, `${recipeName(this.recipe)}.png`, "PNG pictures", ".png");
  }
}

type SaveWindow = Window & {
  showSaveFilePicker?: (options: object) => Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
};

/** Saves a file: with the browser's save dialog where there is one, or else as a download. */
export async function saveBlob(
  blob: Blob,
  name: string,
  description: string,
  ext: string,
): Promise<void> {
  const picker = (window as SaveWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: name,
        types: [{ description, accept: { [blob.type]: [ext] } }],
      });
      const out = await handle.createWritable();
      await out.write(blob);
      await out.close();
    } catch {
      // The dialog was closed.
    }
    return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}
