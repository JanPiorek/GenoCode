import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { colour, swatches, uses } from "./editor.js";

/** Each coloured word of `text` and its colour. */
function colours(text: string): [string, string][] {
  const out: [string, string][] = [];
  colour(EditorState.create({ doc: text })).between(0, text.length, (from, to, d) => {
    out.push([text.slice(from, to), String(d.spec.class).replace(/^g-/, "")]);
  });
  return out;
}

const colourOf = (text: string, word: string) =>
  colours(text)
    .filter(([w]) => w === word)
    .map(([, c]) => c);

describe("the editor's colours", () => {
  const SHELL =
    "creature Shell\n\npattern Ripples {\n  let lumps = clouds(5, 3)\n  value picture {\n    value lumps(x, y)\n  }\n}\n\ntexture pattern(Ripples, 30, 4)\nlay\n";

  it("colours pattern code's words", () => {
    expect(colourOf(SHELL, "pattern")).toEqual(["keyword", "function"]);
    expect(colourOf(SHELL, "picture")).toEqual(["keyword"]);
    expect(colourOf(SHELL, "value")).toEqual(["keyword", "keyword"]);
    expect(colourOf(SHELL, "clouds")).toEqual(["function"]);
    expect(colourOf(SHELL, "Ripples")).toEqual(["part", "part"]);
    const file = "// Rings.\npattern Rings\n\nvalue picture {\n  value r\n}\n";
    expect(colourOf(file, "pattern")).toEqual(["keyword"]);
    expect(colourOf(file, "value")).toEqual(["keyword", "keyword"]);
  });

  it("leaves those words alone as names in a creature's own code", () => {
    const text =
      "creature C\nlet value = 3\nlet picture = 2\nlet clouds = 1\nvalue += 1\nforward value\nlay\n";
    expect(colourOf(text, "value")).toEqual([]);
    expect(colourOf(text, "picture")).toEqual([]);
    expect(colourOf(text, "clouds")).toEqual([]);
  });
});

describe("the editor's marks", () => {
  const TEXT = "creature C\ngene size = 1 in 0..2\nforward size\nforward size * 2\n";

  /** The marked words and their classes, with the cursor at `at`. */
  function marked(at: number): [string, string][] {
    const state = EditorState.create({ doc: TEXT, selection: EditorSelection.cursor(at) });
    const out: [string, string][] = [];
    uses(state).between(0, TEXT.length, (from, to, d) => {
      out.push([TEXT.slice(from, to), String(d.spec.class)]);
    });
    return out;
  }

  it("marks every use of the name at the cursor, and where it's defined", () => {
    expect(marked(TEXT.lastIndexOf("size") + 1)).toEqual([
      ["size", "g-use g-definition"],
      ["size", "g-use"],
      ["size", "g-use"],
    ]);
    expect(marked(TEXT.indexOf("forward") + 1)).toEqual([]);
    expect(marked(TEXT.indexOf("size") + 1)).toHaveLength(3);
  });

  it("puts a swatch before each colour written out", () => {
    const text = "creature C\ncolour hsv(120, 1, 1)\ncolour #ff0000\ncolour red\n";
    const at: number[] = [];
    swatches(EditorState.create({ doc: text })).between(0, text.length, (from) => {
      at.push(from);
    });
    expect(at).toEqual([text.indexOf("hsv"), text.indexOf("#ff"), text.indexOf("red")]);
  });
});
