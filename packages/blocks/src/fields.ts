// Controls on the blocks for trying values without typing (docs/LANGUAGE.md section 21): a slider
// for a gene's number, set by its range; a colour picker on colours written as numbers or hex; and
// a list of a choice gene's options. They only change the values in the blocks, which then write
// the code as any change does.

import * as Blockly from "blockly/core";
import { hsv, toRgb } from "@genocode/core";

/** The value of a number block, or of minus one; undefined for anything else. */
export function numberOf(b: Blockly.Block | null): number | undefined {
  if (!b) return undefined;
  if (b.type === "g_number") {
    const n = Number(String(b.getFieldValue("NUM")).replace(/°$/, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  if (b.type === "g_unary" && b.getFieldValue("OP") === "-") {
    const n = numberOf(b.getInputTargetBlock("A"));
    return n === undefined ? undefined : -n;
  }
  return undefined;
}

/** The input of `parent` that `child` is plugged into. */
function inputOf(parent: Blockly.Block, child: Blockly.Block): string | undefined {
  return parent.inputList.find((i) => i.connection?.targetBlock() === child)?.name;
}

/**
 * The range a number block's value can slide over, when it's a gene's value (or one of a vector
 * gene's values) and the range is written as numbers.
 */
function sliderRange(
  b: Blockly.Block,
): { min: number; max: number; step: number | undefined; log: boolean } | undefined {
  // Through a minus sign, and into a vector, to the gene.
  let path: string[] = [];
  let at: Blockly.Block = b;
  let parent = at.getParent();
  if (parent?.type === "g_unary") {
    at = parent;
    parent = at.getParent();
  }
  if (parent?.type === "g_vector") {
    path = [inputOf(parent, at) ?? ""];
    at = parent;
    parent = at.getParent();
  }
  if (!parent || parent.type !== "g_gene" || inputOf(parent, at) !== "VALUE") return undefined;
  const end = (name: string) => {
    let target = parent.getInputTargetBlock(name);
    for (const step of path)
      target = target?.type === "g_vector" ? target.getInputTargetBlock(step) : null;
    return numberOf(target);
  };
  const min = end("MIN");
  const max = end("MAX");
  if (min === undefined || max === undefined || !(max > min)) return undefined;
  return {
    min,
    max,
    step: numberOf(parent.getInputTargetBlock("STEP")),
    log: parent.getFieldValue("LOG") === "TRUE" && min > 0,
  };
}

/** A value as short as it can be written for its range: to the step, or to four figures. */
function tidy(v: number, step: number | undefined): string {
  if (step !== undefined && step > 0) {
    const decimals = (String(step).split(".")[1] ?? "").length;
    return String(Number(v.toFixed(decimals)));
  }
  return String(Number(v.toPrecision(4)));
}

function dropDown(field: Blockly.Field, content: HTMLElement): void {
  Blockly.DropDownDiv.clearContent();
  Blockly.DropDownDiv.getContentDiv().append(content);
  Blockly.DropDownDiv.setColour("#1b2133", "#3a4560");
  Blockly.DropDownDiv.showPositionedByField(field);
}

/**
 * A number: as text, or, as a gene's value with a range written in numbers, with a slider too.
 * The block's own value is still the number as written.
 */
export class FieldNumberText extends Blockly.FieldTextInput {
  protected override showEditor_(e?: Event, quietInput?: boolean, focus?: boolean): void {
    const block = this.getSourceBlock();
    const range = block ? sliderRange(block) : undefined;
    if (!range) {
      super.showEditor_(e, quietInput, focus);
      return;
    }
    const { min, max, step, log } = range;
    const toSlider = (v: number) => (log ? Math.log(v) : v);
    const fromSlider = (v: number) => (log ? Math.exp(v) : v);
    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "genocode-slider";
    slider.min = String(toSlider(min));
    slider.max = String(toSlider(max));
    slider.step = step !== undefined && !log ? String(step) : "any";
    // The value as written, which may have a minus sign outside this block.
    const sign = block?.getParent()?.type === "g_unary" ? -1 : 1;
    const now = Number(String(this.getValue()).replace(/°$/, "")) * sign;
    slider.value = String(toSlider(Math.min(max, Math.max(min, now))));
    const text = document.createElement("span");
    text.className = "genocode-slider-value";
    text.textContent = String(this.getValue());
    slider.addEventListener("input", () => {
      const v = tidy(fromSlider(Number(slider.value)), step);
      const written = sign < 0 ? String(-Number(v)) : v;
      this.setValue(written);
      text.textContent = written;
    });
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Type a number";
    edit.addEventListener("click", () => {
      Blockly.DropDownDiv.hideIfOwner(this, true);
      super.showEditor_(e, quietInput, focus);
    });
    const box = document.createElement("div");
    box.className = "genocode-control";
    box.append(slider, text, edit);
    dropDown(this, box);
  }
}

/** A name: as text, or, as a choice gene's value, picked from its options. */
export class FieldNameText extends Blockly.FieldTextInput {
  protected override showEditor_(e?: Event, quietInput?: boolean, focus?: boolean): void {
    const block = this.getSourceBlock();
    const gene = block?.getParent();
    const choices =
      gene?.type === "g_gene" && block && inputOf(gene, block) === "VALUE"
        ? gene.inputList
            .filter((i) => i.name.startsWith("OPT"))
            .map((i) => i.connection?.targetBlock())
            .filter((o): o is Blockly.Block => o?.type === "g_name")
            .map((o) => String(o.getFieldValue("NAME")))
        : [];
    if (choices.length === 0) {
      super.showEditor_(e, quietInput, focus);
      return;
    }
    const list = document.createElement("div");
    list.className = "genocode-control genocode-choices";
    for (const choice of choices) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = choice;
      b.setAttribute("aria-pressed", String(choice === this.getValue()));
      b.addEventListener("click", () => {
        this.setValue(choice);
        Blockly.DropDownDiv.hideIfOwner(this);
      });
      list.append(b);
    }
    dropDown(this, list);
  }
}

// ---------- colours ----------

const toHex = ([r, g, b]: [number, number, number]) =>
  "#" +
  [r, g, b]
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

function fromHex(hex: string): [number, number, number] | undefined {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** An RGB colour (0–1) as hue (degrees), saturation and value (0–1). */
function toHsv([r, g, b]: [number, number, number]): [number, number, number] {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [(h * 60 + 360) % 360, max === 0 ? 0 : d / max, max];
}

/** A small square of a colour, as a picture for a FieldImage. */
export function swatch(rgb: [number, number, number] | undefined): string {
  const fill = rgb ? toHex(rgb) : "none";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">` +
    `<rect x="1" y="1" width="14" height="14" rx="3" fill="${fill}" stroke="#dfe5f2" stroke-opacity="0.5"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** The colour an `hsv(…)`, `rgb(…)` or hex block shows, when it's written as plain numbers. */
export function colourOf(b: Blockly.Block): [number, number, number] | undefined {
  if (b.type === "g_hex") return fromHex(String(b.getFieldValue("HEX")));
  if (b.type !== "g_call") return undefined;
  const fn = String(b.getFieldValue("NAME"));
  if (fn !== "hsv" && fn !== "rgb") return undefined;
  const args = [0, 1, 2].map((k) => numberOf(b.getInputTargetBlock(`ARG${k}`)));
  if (args.some((a) => a === undefined)) return undefined;
  const [x, y, z] = args as number[];
  return fn === "rgb" ? [x!, y!, z!] : toRgb(hsv(x!, y!, z!));
}

/** Sets a colour block to an RGB colour, keeping how it's written (hsv, rgb or hex). */
function setColour(b: Blockly.Block, rgb: [number, number, number]): void {
  if (b.type === "g_hex") {
    b.setFieldValue(toHex(rgb), "HEX");
    return;
  }
  const values =
    b.getFieldValue("NAME") === "rgb"
      ? rgb.map((c) => Number(c.toFixed(3)))
      : toHsv(rgb).map((c, k) => Number(c.toFixed(k === 0 ? 1 : 3)));
  values.forEach((v, k) => {
    const arg = b.getInputTargetBlock(`ARG${k}`);
    if (arg?.type === "g_number") arg.setFieldValue(String(v), "NUM");
  });
}

/** Opens a colour picker for a colour block, from its swatch. */
export function pickColour(field: Blockly.FieldImage): void {
  const block = field.getSourceBlock();
  if (!block) return;
  const rgb = colourOf(block);
  if (!rgb) return;
  const input = document.createElement("input");
  input.type = "color";
  input.value = toHex(rgb);
  input.addEventListener("input", () => {
    const picked = fromHex(input.value);
    if (picked) setColour(block, picked);
  });
  const box = document.createElement("div");
  box.className = "genocode-control";
  box.append(input);
  dropDown(field, box);
  input.click();
}
