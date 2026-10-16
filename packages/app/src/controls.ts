// A control for trying a gene's values without editing code: a slider for numbers and vectors, a
// colour picker for colours, a checkbox for bools and a menu for choices.

import {
  formatValue,
  hexColour,
  hsv,
  toRgb,
  type GeneInfo,
  type Value,
  type Vec,
} from "@genocode/core";

export interface GeneEditing {
  /** The value is moving, as while a slider is dragged: show it. */
  input(g: GeneInfo, v: Value): void;
  /** The value is settled: write it into the code. */
  change(g: GeneInfo, v: Value): void;
}

const SLIDER_STEPS = 1000;

/** A slider over min..max, by ratios for `log` genes. */
function slider(
  value: number,
  min: number,
  max: number,
  step: number | undefined,
  log: boolean,
  onInput: (v: number) => void,
  onChange: (v: number) => void,
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "range";
  const toValue = (p: number) => (log ? min * (max / min) ** p : min + (max - min) * p);
  const toPosition = (v: number) =>
    log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min);
  if (step !== undefined) {
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
  } else {
    input.min = "0";
    input.max = String(SLIDER_STEPS);
    input.step = "1";
    input.value = String(Math.round(toPosition(value) * SLIDER_STEPS));
  }
  const read = () =>
    step !== undefined ? Number(input.value) : toValue(Number(input.value) / SLIDER_STEPS);
  input.addEventListener("input", () => onInput(read()));
  input.addEventListener("change", () => onChange(read()));
  return input;
}

const hex = (v: Value): string => {
  if (typeof v !== "object" || v.type !== "colour") return "#ffffff";
  return `#${toRgb(v)
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};

/** The control for a gene, or nothing for genes that can't be set here (the automatic `seed`). */
export function geneControl(g: GeneInfo, value: Value, edit: GeneEditing): HTMLElement | undefined {
  if (g.decl === undefined) return undefined;
  const input = (v: Value) => edit.input(g, v);
  const change = (v: Value) => edit.change(g, v);

  if (g.options) {
    const select = document.createElement("select");
    g.options.forEach((o, i) => {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = formatValue(o);
      option.selected = formatValue(o) === formatValue(value);
      select.append(option);
    });
    select.addEventListener("change", () => change(g.options![Number(select.value)]!));
    return select;
  }
  if (g.kind === "bool") {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = value === true;
    box.addEventListener("change", () => change(box.checked));
    return box;
  }
  if (g.kind === "colour" && typeof value === "object" && value.type === "colour") {
    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = hex(value);
    // The picker has no alpha: keep the gene's.
    const read = () => {
      const c = hexColour(picker.value);
      return hsv(c.h, c.s, c.v, value.a);
    };
    picker.addEventListener("input", () => input(read()));
    picker.addEventListener("change", () => change(read()));
    return picker;
  }
  if (g.kind === "number" && typeof value === "number") {
    return slider(value, g.min as number, g.max as number, g.step, g.log, input, change);
  }
  if (g.kind === "vector" && typeof value === "object" && value.type === "vector") {
    const box = document.createElement("div");
    box.className = "vector-control";
    const [lo, hi] = [g.min as Vec, g.max as Vec];
    let current: Vec = value;
    for (const axis of ["x", "y", "z"] as const) {
      if (lo[axis] === hi[axis]) continue; // a fixed axis
      const set = (n: number): Vec => (current = { ...current, [axis]: n });
      const s = slider(
        value[axis],
        lo[axis],
        hi[axis],
        undefined,
        g.log,
        (n) => input(set(n)),
        (n) => change(set(n)),
      );
      s.title = axis;
      box.append(s);
    }
    return box;
  }
  return undefined;
}
