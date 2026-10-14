import { describe, expect, it } from "vitest";
import { lex } from "./lexer.js";

const kinds = (text: string) =>
  lex(text).tokens.map((t) => (t.kind === "newline" ? "NL" : t.text || t.kind));

describe("lexer", () => {
  it("reads numbers, keeping ranges apart", () => {
    expect(kinds("1..6")).toEqual(["1", "..", "6", "NL", "eof"]);
    expect(kinds("0.4..0.95")).toEqual(["0.4", "..", "0.95", "NL", "eof"]);
    const t = lex("12.5e-3 90°").tokens;
    expect(t[0]!.value).toBe(0.0125);
    expect(t[1]!.value).toBe(90);
    expect(t[1]!.degree).toBe(true);
  });

  it("rejects numbers written without a digit on both sides of the point", () => {
    expect(lex(".5").diagnostics[0]!.message).toContain("0.5");
    expect(lex("1.").diagnostics[0]!.message).toContain("digit after");
  });

  it("tells keywords from names", () => {
    const t = lex("gene twist").tokens;
    expect(t[0]!.kind).toBe("keyword");
    expect(t[1]!.kind).toBe("name");
  });

  it("ends statements at line ends and semicolons", () => {
    expect(kinds("lay\nlay; lay")).toEqual(["lay", "NL", "lay", "NL", "lay", "NL", "eof"]);
  });

  it("continues lines inside brackets and after operators", () => {
    expect(kinds("move (1,\n2, 3)")).toEqual([
      "move",
      "(",
      "1",
      ",",
      "2",
      ",",
      "3",
      ")",
      "NL",
      "eof",
    ]);
    expect(kinds("forward 1 +\n2")).toEqual(["forward", "1", "+", "2", "NL", "eof"]);
    expect(kinds("gene a = 1 in 0..\n2")).toEqual([
      "gene",
      "a",
      "=",
      "1",
      "in",
      "0",
      "..",
      "2",
      "NL",
      "eof",
    ]);
    expect(kinds("if a and\nb {")).toEqual(["if", "a", "and", "b", "{", "NL", "eof"]);
  });

  it("collapses blank lines into one line end", () => {
    expect(kinds("lay\n\n\nlay")).toEqual(["lay", "NL", "lay", "NL", "eof"]);
  });

  it("keeps comments aside, noting whether they're on their own line", () => {
    const r = lex("lay // after\n// alone\n/* block\ncomment */ lay");
    expect(r.comments.map((c) => [c.text, c.ownLine])).toEqual([
      ["// after", false],
      ["// alone", true],
      ["/* block\ncomment */", true],
    ]);
    expect(r.diagnostics).toEqual([]);
  });

  it("reads hex colours and strings", () => {
    const t = lex('#ff8000 #ff800080 "a \\"b\\"\\n"').tokens;
    expect(t[0]!.kind).toBe("hex");
    expect(t[1]!.kind).toBe("hex");
    expect(t[2]!.text).toBe('a "b"\n');
    expect(lex("#ff80").diagnostics[0]!.message).toContain("6 or 8");
  });

  it("reports characters it doesn't know", () => {
    expect(lex("lay @").diagnostics[0]!.message).toContain("`@`");
    expect(lex('"open').diagnostics[0]!.message).toContain("never closed");
  });
});
