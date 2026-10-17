import { describe, expect, it } from "vitest";
import type { Expr, Stmt } from "./ast.js";
import { parse } from "./parser.js";

function items(body: string): Stmt[] {
  const r = parse(`creature Test\n${body}\n`);
  expect(r.diagnostics).toEqual([]);
  return r.file.items;
}

function exprOf(text: string): Expr {
  const s = items(`let v = ${text}`)[0]!;
  if (s.kind !== "Let") throw new Error("not a let");
  return s.value;
}

/** Writes an expression with every binary operation in brackets. */
function shape(e: Expr): string {
  switch (e.kind) {
    case "Binary":
      return `(${shape(e.left)} ${e.op} ${shape(e.right)})`;
    case "Unary":
      return `(${e.op === "not" ? "not " : "-"}${shape(e.operand)})`;
    case "Number":
      return e.raw;
    case "Name":
      return e.name;
    case "Member":
      return `${shape(e.object)}.${e.name}`;
    case "Call":
      return `${shape(e.callee)}(${e.args.map(shape).join(", ")})`;
    default:
      return e.kind;
  }
}

describe("parser", () => {
  it("reads the file header and description", () => {
    const r = parse("creature Flower\n// one\n// two\n\ngene a = 1 in 0..2\n");
    expect(r.file.kind).toBe("creature");
    expect(r.file.name).toBe("Flower");
    expect(r.file.description.map((c) => c.text)).toEqual(["// one", "// two"]);
    expect(r.file.items[0]!.blankBefore).toBe(true);
  });

  it("follows operator precedence", () => {
    expect(shape(exprOf("1 + 2 * 3"))).toBe("(1 + (2 * 3))");
    expect(shape(exprOf("-2 ^ 2"))).toBe("(-(2 ^ 2))");
    expect(shape(exprOf("2 ^ 3 ^ 2"))).toBe("(2 ^ (3 ^ 2))");
    expect(shape(exprOf("a or b and not c == d"))).toBe("(a or (b and (not (c == d))))");
    expect(shape(exprOf("a - b - c"))).toBe("((a - b) - c)");
    expect(shape(exprOf("f(1).x * 2"))).toBe("(f(1).x * 2)");
  });

  it("reads vectors, gradients and turtle fields", () => {
    expect(exprOf("(1, 2, 3)").kind).toBe("Vector");
    expect(exprOf("(1 + 2)").kind).toBe("Binary");
    const g = exprOf("gradient(red, blue at 0.5, white)");
    expect(g.kind === "Gradient" && g.stops.map((s) => s.at !== undefined)).toEqual([
      false,
      true,
      false,
    ]);
    const t = exprOf("turtle.colour");
    expect(t.kind === "Turtle" && t.field).toBe("colour");
  });

  it("refuses chained comparisons and two-part vectors", () => {
    expect(parse("creature T\nlet a = 1 < 2 < 3\n").diagnostics[0]!.message).toContain("chained");
    expect(parse("creature T\nlet a = (1, 2)\n").diagnostics[0]!.message).toContain(
      "three numbers",
    );
  });

  it("reads genes with ranges, steps, log and choices", () => {
    const [a, b, c] = items(
      "gene a = 7 in 3..16 step 1\ngene b = 1 in 0.1..10 log\ngene c = ball from [ball, cone]",
    );
    expect(a!.kind === "Gene" && a.range?.kind === "Range" && a.range.step !== undefined).toBe(
      true,
    );
    expect(b!.kind === "Gene" && b.range?.kind === "Range" && b.range.log).toBe(true);
    expect(c!.kind === "Gene" && c.range?.kind === "Choice" && c.range.options.length).toBe(2);
  });

  it("reads every kind of statement", () => {
    const kinds = items(`
let a = 1
a += 2
leg
leg(1, 2)
print("hi", a)
if a > 1 {
  lay
} else if a > 0 {
  lay
} else {
  lay
}
repeat 3 as i {
  forward i
}
for i from 1 to 5 by 2 {
  back 1
}
while a < 10 {
  a += 1
}
branch {
  move (1, 0, 0)
}
symmetric x {
  pitch 10
}
lay { grow 2 }
reshape { yaw 1; roll 2 }
rotate 30 around (0, 1, 0)
mirror y
shape ball
color red
shine 0.5
sharpness 0.2
texture none
`).map((s) => s.kind);
    expect(kinds).toEqual([
      "Let",
      "Assign",
      "PartCall",
      "PartCall",
      "Print",
      "If",
      "Repeat",
      "For",
      "While",
      "Branch",
      "Symmetric",
      "Lay",
      "Reshape",
      "Rotate",
      "Mirror",
      "Material",
      "Material",
      "Material",
      "Material",
      "Material",
    ]);
  });

  it("reads definitions, backgrounds and dance blocks", () => {
    const r = items(`
part leg(reach, side) {
  return
}
part tail {
  lay
}
function f() {
  return 1
}
background {
  fill red
}
dance {
  morph follows music.mid speed 2
}`);
    expect(r.map((s) => s.kind)).toEqual(["Part", "Part", "Function", "Background", "Dance"]);
    const dance = r[4]!;
    if (dance.kind !== "Dance") throw new Error();
    const effect = dance.body.items[0]!;
    expect(effect.kind === "Effect" && effect.args.map((a) => a.kind)).toEqual([
      "Word",
      "Value",
      "Word",
      "Value",
    ]);
  });

  it("reads effect lines as words, each with the value after it", () => {
    const r = items("dance {\n  reverse on music.bass drops by drive on 4 off 4\n}");
    const dance = r[0]!;
    if (dance.kind !== "Dance") throw new Error();
    const effect = dance.body.items[0]!;
    if (effect.kind !== "Effect") throw new Error();
    expect(effect.args.map((a) => (a.kind === "Word" ? a.text : "·"))).toEqual([
      "on",
      "·",
      "drops",
      "by",
      "·",
      "on",
      "·",
      "off",
      "·",
    ]);
  });

  it("attaches comments to statements and blocks", () => {
    const [, a, b] = items(
      "lay\n// above\nlay // after\nbranch { // open\n  lay\n  // end\n} // close",
    );
    expect(a!.leading.map((c) => c.text)).toEqual(["// above"]);
    expect(a!.trailing?.text).toBe("// after");
    if (b!.kind !== "Branch") throw new Error();
    expect(b.block.open?.text).toBe("// open");
    expect(b.block.endComments.map((c) => c.text)).toEqual(["// end"]);
    expect(b.block.close?.text).toBe("// close");
  });

  it("keeps going after an error", () => {
    const r = parse("creature T\nforward )\nlay\nyaw 1 2\nroll 3\n");
    expect(r.diagnostics).toHaveLength(2);
    expect(r.file.items.map((s) => s.kind)).toEqual(["ErrorStmt", "Lay", "Command", "Command"]);
  });

  it("keeps an unclosed bracket from swallowing the rest of the file", () => {
    const r = parse("creature T\nbranch {\n  forward (1\n}\nlay\n");
    expect(r.file.items.map((s) => s.kind)).toEqual(["Branch", "Lay"]);
  });

  it("asks for `{` on the same line", () => {
    const r = parse("creature T\nbranch\n{\n  lay\n}\n");
    expect(r.diagnostics[0]!.message).toContain("same line");
  });

  it("reports a missing header", () => {
    expect(parse("lay\n").diagnostics[0]!.message).toContain("starts with `creature");
  });

  it("reads background and dance files", () => {
    expect(parse("background Sky\nfill blue\n").file.kind).toBe("background");
    expect(parse("dance Bop\nspin follows music.bass\n").file.items[0]!.kind).toBe("Effect");
  });
});
