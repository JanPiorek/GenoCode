import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hsv, rgb, toRgb } from "./colour.js";
import { colourLiterals, writeColour } from "./swatches.js";

const text = (source: string) =>
  colourLiterals(source).map((c) => [source.slice(c.span.start, c.span.end), c.form, c.alpha]);

describe("colourLiterals", () => {
  it("finds colours written out in full", () => {
    const source = [
      "creature T",
      "gene skin = hsv(120, 0.6, 0.9) in hsv(60, 0.3, 0.5)..hsv(180, 1, 1)",
      "colour rgb(1, 0.5, 0, 0.5)",
      "colour mix(red, #ff8000, 0.5)",
      "fill gradient(black, #00000080 at 0.3, hsv(-30, 1, 1))",
      "",
    ].join("\n");
    expect(text(source)).toEqual([
      ["hsv(120, 0.6, 0.9)", "hsv", false],
      ["hsv(60, 0.3, 0.5)", "hsv", false],
      ["hsv(180, 1, 1)", "hsv", false],
      ["rgb(1, 0.5, 0, 0.5)", "rgb", true],
      ["red", "name", false],
      ["#ff8000", "hex", false],
      ["black", "name", false],
      ["#00000080", "hex", true],
      ["hsv(-30, 1, 1)", "hsv", false],
    ]);
    const [, , , half] = colourLiterals(source);
    expect(half?.colour.a).toBe(0.5);
    expect(colourLiterals(source)[8]?.colour.h).toBe(330);
  });

  it("leaves out colours worked out from other values", () => {
    const source =
      "creature T\nlet h = 3\ncolour hsv(h, 1, 1)\ncolour hsv(1 + 2, 1, 1)\nmove turtle.colour.hue\n";
    expect(text(source)).toEqual([]);
  });
});

describe("writeColour", () => {
  const orange = rgb(1, 0.5, 0);

  it("writes a colour in each form", () => {
    expect(writeColour(orange, "hsv")).toBe("hsv(30, 1, 1)");
    expect(writeColour(orange, "rgb")).toBe("rgb(1, 0.5, 0)");
    expect(writeColour(orange, "hex")).toBe("#ff8000");
    expect(writeColour(hsv(30, 1, 1), "name")).toBe("orange");
    expect(writeColour(orange, "name")).toBe("orange");
    expect(writeColour(rgb(1, 0.4, 0), "name")).toBeUndefined();
  });

  it("keeps the alpha when it's written or needed", () => {
    expect(writeColour(orange, "hsv", true)).toBe("hsv(30, 1, 1, 1)");
    expect(writeColour(rgb(1, 0.5, 0, 0.25), "rgb")).toBe("rgb(1, 0.5, 0, 0.25)");
    expect(writeColour(rgb(0, 0, 0, 0.5), "hex")).toBe("#00000080");
  });

  it("reads back what it writes, in the starter creatures", () => {
    const dir = new URL("../../../creatures/", import.meta.url);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".genie"))) {
      for (const c of colourLiterals(readFileSync(new URL(file, dir), "utf8"))) {
        const again = colourLiterals(
          `creature T\ncolour ${writeColour(c.colour, c.form, c.alpha)}\n`,
        )[0];
        expect(again, file).toBeDefined();
        const close = toRgb(again!.colour).every(
          (x, k) => Math.abs(x - toRgb(c.colour)[k]!) < 0.01,
        );
        expect(close, `${file}: ${writeColour(c.colour, c.form, c.alpha)}`).toBe(true);
      }
    }
  });
});
