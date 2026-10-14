import { describe, expect, it } from "vitest";
import { formatText } from "./format.js";

function fmt(text: string): string {
  const r = formatText(text);
  if (r.text === undefined) throw new Error(r.diagnostics.map((d) => d.message).join("\n"));
  return r.text;
}

describe("formatter", () => {
  it("lays out statements, blocks and spacing", () => {
    const input =
      "creature T\nlet  a=1+2*3\nif a>1{\nforward a;lay\n}else if a<0 {\nback 1\n}else{\nyaw 2\n}\n";
    expect(fmt(input)).toBe(
      "creature T\nlet a = 1 + 2 * 3\nif a > 1 {\n  forward a\n  lay\n} else if a < 0 {\n  back 1\n} else {\n  yaw 2\n}\n",
    );
  });

  it("uses brackets only where they're needed", () => {
    const cases: [string, string][] = [
      ["(1 + 2) * 3", "(1 + 2) * 3"],
      ["1 + (2 * 3)", "1 + 2 * 3"],
      ["a - (b - c)", "a - (b - c)"],
      ["(a - b) - c", "a - b - c"],
      ["(2 ^ 3) ^ 2", "(2 ^ 3) ^ 2"],
      ["2 ^ (3 ^ 2)", "2 ^ 3 ^ 2"],
      ["(-2) ^ 2", "(-2) ^ 2"],
      ["-(2 ^ 2)", "-2 ^ 2"],
      ["not (a and b)", "not (a and b)"],
      ["(a + b).x", "(a + b).x"],
      ["(1 < 2) == true", "(1 < 2) == true"],
      ["- (-a)", "-(-a)"],
    ];
    for (const [input, output] of cases) {
      expect(fmt(`creature T\nlet v = ${input}\n`)).toBe(`creature T\nlet v = ${output}\n`);
    }
  });

  it("lines up runs of genes and their comments", () => {
    const input =
      "creature T\ngene a = 1 in 0..2 // one\ngene long_name = 0.25 in 0..1\ngene c = hsv(1, 1, 1) in hsv(0, 0, 0)..hsv(360, 1, 1) // three\n";
    expect(fmt(input)).toBe(
      [
        "creature T",
        "gene a         = 1    in 0..2                                  // one",
        "gene long_name = 0.25 in 0..1",
        "gene c         = hsv(1, 1, 1) in hsv(0, 0, 0)..hsv(360, 1, 1)  // three",
        "",
      ].join("\n"),
    );
  });

  it("keeps comments and single blank lines", () => {
    const input =
      "creature T\n// about\n\n\n// above\nlay   // after\nbranch { // open\n\n  lay\n  // end\n} // close\n// last\n";
    expect(fmt(input)).toBe(
      "creature T\n// about\n\n// above\nlay  // after\nbranch {  // open\n  lay\n  // end\n}  // close\n// last\n",
    );
  });

  it("puts short lay and reshape blocks on one line", () => {
    expect(fmt("creature T\nlay {\n  grow 2\n}\nreshape {\n  yaw 1\n  roll 2\n}\n")).toBe(
      "creature T\nlay { grow 2 }\nreshape { yaw 1; roll 2 }\n",
    );
  });

  it("separates definitions with blank lines and drops brackets from empty calls", () => {
    expect(fmt("creature T\nleg()\npart leg() {\nlay\n}\nfunction f() {\nreturn 1\n}\n")).toBe(
      "creature T\nleg\n\npart leg {\n  lay\n}\n\nfunction f() {\n  return 1\n}\n",
    );
  });

  it("keeps what's written: colour spelling, degrees and number text", () => {
    expect(fmt("creature T\ncolor red\nyaw 90°\nforward 0.50\n")).toBe(
      "creature T\ncolor red\nyaw 90°\nforward 0.50\n",
    );
  });

  it("is stable: formatting twice changes nothing", () => {
    const input =
      "creature T\ngene a=1 in 0..2\nrepeat a as i{forward i}\nsymmetric x{\n// c\nyaw 1}\n";
    const once = fmt(input);
    expect(fmt(once)).toBe(once);
  });

  it("refuses text with syntax errors", () => {
    expect(formatText("creature T\nforward (\n").text).toBeUndefined();
  });
});
