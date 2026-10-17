// Patterns: a designer for texture and background recipes (docs/LANGUAGE.md section 14). A big
// preview, a control for every part of the recipe, and a row of variations to pick from. A recipe
// can be copied as code, put behind the creature as its background, or exported as a background
// file or a picture.

import {
  FINISHES,
  formatValue,
  MIX_WAYS,
  NO_PATTERN,
  PATTERN_KINDS,
  SCHEMES,
  type MixWayName,
  type Pattern,
  type PatternKindName,
} from "@genocode/core";
import { patternPixels } from "@genocode/render";

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
  return [
    `background ${recipeName(p)}`,
    `// Made in the Patterns designer: ${formatValue(p)}`,
    "",
    ...backgroundLines(p),
    "",
  ].join("\n");
}

function drawInto(target: HTMLCanvasElement, p: Pattern, size: number): void {
  target.width = size;
  target.height = size;
  const ctx = target.getContext("2d")!;
  ctx.putImageData(new ImageData(patternPixels(p, size), size, size), 0, 0);
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
      button("New variations", "Show other variations of this recipe", () => this.showVariations()),
      button("Copy code", "Copy the recipe, for `texture` or `fill`", () => void this.copy()),
      button("Use as background", "Put this recipe behind the creature, with genes", () =>
        this.actions.useAsBackground(backgroundLines(this.recipe)),
      ),
      button("Export .genie", "Save the recipe as a background file", () => void this.exportFile()),
      button("Export PNG", "Save the pattern as a picture", () => void this.exportPicture()),
      this.hint,
    );
    root.append(
      element("div", { className: "pattern-top" }, this.preview, controls),
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
    this.showVariations();
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
    if (settled) this.showVariations();
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
    drawInto(this.preview, this.recipe, size);
    this.code.textContent = formatValue(this.recipe);
    this.hint.textContent = "";
  }

  /** Fills the row of variations; clicking one makes it the recipe. */
  private showVariations(): void {
    const tiles = Array.from({ length: VARIATIONS }, () => {
      const p = vary(this.recipe);
      const tile = element("canvas", { className: "pattern-variation", title: formatValue(p) });
      drawInto(tile, p, VARIATION_SIZE);
      tile.addEventListener("click", () => {
        this.recipe = p;
        this.toControls();
        this.draw(PREVIEW_SIZE);
        this.showVariations();
      });
      return tile;
    });
    this.variations.replaceChildren(...tiles);
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
    // Let the hint show before the work starts.
    await new Promise((r) => setTimeout(r, 20));
    const big = element("canvas");
    drawInto(big, this.recipe, EXPORT_SIZE);
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
async function saveBlob(blob: Blob, name: string, description: string, ext: string) {
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
