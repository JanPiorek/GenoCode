// The standard formatter (docs/LANGUAGE.md section 21). It decides spacing, line breaks and
// brackets, and keeps names, values, structure and comments. The block editor prints code with it.

import {
  TRIGGER_KINDS,
  type Block,
  type Comment,
  type Effect,
  type EffectArg,
  type Expr,
  type GeneDecl,
  type GeneSetting,
  type SourceFile,
  type Stmt,
} from "./ast.js";
import { parse } from "./parser.js";
import type { Diagnostic } from "./source.js";

const INDENT = "  ";
const MAX_ONE_LINE = 100;
/** Gene values longer than this don't take part in lining up the `in` column. */
const MAX_ALIGNED_VALUE = 8;

export interface FormatResult {
  /** The formatted text, or undefined if the text has syntax errors. */
  text: string | undefined;
  diagnostics: Diagnostic[];
}

/** Formats GenoCode text. Text with syntax errors isn't formatted. */
export function formatText(text: string): FormatResult {
  const parsed = parse(text);
  if (parsed.diagnostics.some((d) => d.severity === "error")) {
    return { text: undefined, diagnostics: parsed.diagnostics };
  }
  return { text: format(parsed.file), diagnostics: parsed.diagnostics };
}

/** Prints a syntax tree as standard GenoCode text. */
export function format(file: SourceFile): string {
  const out: string[] = [];
  printComments(out, file.headerComments, 0, true);
  out.push(`${file.kind} ${file.name}`);
  for (const c of file.description) out.push(c.text);
  printItems(out, file.items, 0, true);
  printComments(out, file.endComments, 0, file.items.length === 0 && file.description.length === 0);
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.map((l) => l.replace(/\s+$/, "")).join("\n") + "\n";
}

// ---------- statements ----------

function isDefinition(s: Stmt): boolean {
  return (
    s.kind === "Part" ||
    s.kind === "Function" ||
    s.kind === "Background" ||
    s.kind === "Dance" ||
    s.kind === "Pattern" ||
    s.kind === "Variant"
  );
}

function pad(level: number): string {
  return INDENT.repeat(level);
}

function printComments(out: string[], comments: Comment[], level: number, atStart: boolean): void {
  comments.forEach((c, i) => {
    if (c.blankBefore && !(atStart && i === 0)) out.push("");
    const [first, ...rest] = c.text.split("\n");
    out.push(pad(level) + first);
    out.push(...rest);
  });
}

function printItems(out: string[], items: Stmt[], level: number, top: boolean): void {
  let i = 0;
  while (i < items.length) {
    const item = items[i]!;
    const first = i === 0;
    const forced = top && !first && (isDefinition(item) || isDefinition(items[i - 1]!));
    const blankGroup = item.leading.length > 0 ? item.leading[0]!.blankBefore : item.blankBefore;
    if ((blankGroup || forced) && !(first && !top)) out.push("");
    if (item.leading.length > 0) {
      const [head, ...tail] = item.leading;
      out.push(pad(level) + head!.text);
      printComments(out, tail, level, false);
      if (item.blankBefore) out.push("");
    }

    if (item.kind === "Gene") {
      // Consecutive genes, with nothing between them, are lined up.
      let j = i + 1;
      while (
        j < items.length &&
        items[j]!.kind === "Gene" &&
        items[j]!.leading.length === 0 &&
        !items[j]!.blankBefore
      )
        j++;
      printGenes(out, items.slice(i, j) as GeneDecl[], level);
      i = j;
      continue;
    }

    if (item.kind === "GeneSetting") {
      // A variant's settings are lined up too.
      let j = i + 1;
      while (
        j < items.length &&
        items[j]!.kind === "GeneSetting" &&
        items[j]!.leading.length === 0 &&
        !items[j]!.blankBefore
      )
        j++;
      printSettings(out, items.slice(i, j) as GeneSetting[], level);
      i = j;
      continue;
    }

    if (item.kind === "Effect") {
      // A dance's effect lines are lined up after their names.
      let j = i + 1;
      while (
        j < items.length &&
        items[j]!.kind === "Effect" &&
        items[j]!.leading.length === 0 &&
        !items[j]!.blankBefore
      )
        j++;
      const effects = items.slice(i, j) as Effect[];
      const nameWidth = Math.max(...effects.map((e) => e.name.length));
      for (const e of effects) {
        const line = `${e.name.padEnd(nameWidth)} ${effectSettings(e)}`;
        out.push(pad(level) + line + (e.trailing ? `  ${e.trailing.text}` : ""));
      }
      i = j;
      continue;
    }

    printStmt(out, item, level);
    i++;
  }
}

/** Settings that stay with the one before them: `from 45 to 170`, `on 4 off 4`. */
const PAIRED: ReadonlyMap<string, string> = new Map([
  ["to", "from "],
  ["off", "on "],
]);

/**
 * An effect line's settings: two spaces between settings, one inside each. A trigger word stays
 * with the input before it: `on music.bass drops  by 1  on 4 off 4`.
 */
function effectSettings(e: Effect): string {
  const groups: string[] = [];
  for (const a of e.args) {
    const text = effectArg(a);
    const last = groups[groups.length - 1];
    const joins =
      a.kind === "Value" ||
      TRIGGER_KINDS.has(text) ||
      (groups.length > 1 && last!.startsWith(PAIRED.get(text) ?? "\0"));
    if (joins && last !== undefined) groups[groups.length - 1] = `${last} ${text}`;
    else groups.push(text);
  }
  return groups.join("  ");
}

function printSettings(out: string[], settings: GeneSetting[], level: number): void {
  const nameWidth = Math.max(...settings.map((s) => s.gene.length));
  const code = settings.map((s) => `${s.gene.padEnd(nameWidth)} = ${expr(s.value)}`);
  const commented = code.filter((_, k) => settings[k]!.trailing !== undefined);
  const commentColumn = commented.length > 0 ? Math.max(...commented.map((c) => c.length)) + 2 : 0;
  settings.forEach((s, k) => {
    const line = s.trailing ? code[k]!.padEnd(commentColumn) + s.trailing.text : code[k]!;
    out.push(pad(level) + line);
  });
}

function geneValueText(g: GeneDecl): string {
  return expr(g.value);
}

function geneRangeText(g: GeneDecl): string {
  const r = g.range;
  if (r === undefined) return "";
  if (r.kind === "Choice") return `from [${r.options.map(expr).join(", ")}]`;
  let text = `in ${expr(r.min)}..${expr(r.max)}`;
  if (r.step) text += ` step ${expr(r.step)}`;
  if (r.log) text += " log";
  return text;
}

function printGenes(out: string[], genes: GeneDecl[], level: number): void {
  const nameWidth = Math.max(...genes.map((g) => g.name.length));
  const values = genes.map(geneValueText);
  const short = values.filter(
    (v, k) => v.length <= MAX_ALIGNED_VALUE && genes[k]!.range !== undefined,
  );
  const valueWidth = short.length > 0 ? Math.max(...short.map((v) => v.length)) : 0;
  const code = genes.map((g, k) => {
    const value = values[k]!;
    const range = geneRangeText(g);
    let line = `gene ${g.name.padEnd(nameWidth)} = `;
    if (range === "") return line + value;
    line += value.length <= MAX_ALIGNED_VALUE ? value.padEnd(valueWidth) : value;
    return `${line} ${range}`;
  });
  const commented = code.filter((_, k) => genes[k]!.trailing !== undefined);
  const commentColumn = commented.length > 0 ? Math.max(...commented.map((c) => c.length)) + 2 : 0;
  genes.forEach((g, k) => {
    const line = g.trailing ? code[k]!.padEnd(commentColumn) + g.trailing.text : code[k]!;
    out.push(pad(level) + line);
  });
}

function simpleText(s: Stmt): string | undefined {
  switch (s.kind) {
    case "Let":
      return `let ${s.name} = ${expr(s.value)}`;
    case "Assign":
      return `${s.name} ${s.op} ${expr(s.value)}`;
    case "PartCall":
      return s.args.length > 0 ? `${s.name}(${s.args.map(expr).join(", ")})` : s.name;
    case "Return":
      return s.value ? `return ${expr(s.value)}` : "return";
    case "Breed":
      return `breed ${s.on ? "on" : "off"}`;
    case "Print":
      return `print(${s.args.map(expr).join(", ")})`;
    case "Lay":
      return s.block ? undefined : "lay";
    case "Command":
      return `${s.command} ${expr(s.value)}`;
    case "Rotate":
      return `rotate ${expr(s.angle)} around ${expr(s.axis)}`;
    case "Mirror":
      return `mirror ${s.axis}`;
    case "Material":
      return `${s.keyword} ${expr(s.value)}`;
    case "Fill":
      return `fill ${expr(s.value)}`;
    case "Value":
      return `value ${expr(s.value)}`;
    case "Effect":
      return `${s.name} ${effectSettings(s)}`;
    case "Gene":
      return `gene ${s.name} = ${geneValueText(s)}${s.range ? ` ${geneRangeText(s)}` : ""}`;
    case "GeneSetting":
      return `${s.gene} = ${expr(s.value)}`;
    default:
      return undefined;
  }
}

function effectArg(a: EffectArg): string {
  return a.kind === "Word" ? a.text : expr(a.expr);
}

function printStmt(out: string[], s: Stmt, level: number): void {
  const simple = simpleText(s);
  if (simple !== undefined) {
    // A `picture { }` in the statement spans lines, indented from the statement's own.
    const text = simple.replace(/\n/g, "\n" + pad(level));
    out.push(pad(level) + text + (s.trailing ? `  ${s.trailing.text}` : ""));
    return;
  }
  switch (s.kind) {
    case "Part":
      printBlock(
        out,
        s.params.length > 0
          ? `part ${s.name}(${s.params.map((p) => p.name).join(", ")})`
          : `part ${s.name}`,
        s.body,
        level,
      );
      return;
    case "Function":
      printBlock(
        out,
        `function ${s.name}(${s.params.map((p) => p.name).join(", ")})`,
        s.body,
        level,
      );
      return;
    case "Background":
      printBlock(out, "background", s.body, level);
      return;
    case "Dance":
      printBlock(out, "dance", s.body, level);
      return;
    case "Pattern":
      printBlock(out, `pattern ${s.name}`, s.body, level);
      return;
    case "Variant": {
      const header = `variant ${s.name}`;
      if (!tryOneLine(out, header, s.body, level)) printBlock(out, header, s.body, level);
      return;
    }
    case "If":
      s.branches.forEach((b, k) => {
        const header = `${k === 0 ? "if" : "} else if"} ${expr(b.condition)}`;
        const isLast = k === s.branches.length - 1 && s.elseBlock === undefined;
        printBlock(out, header, b.block, level, !isLast);
      });
      if (s.elseBlock) printBlock(out, "} else", s.elseBlock, level);
      return;
    case "Repeat":
      printBlock(out, `repeat ${expr(s.count)}${s.as ? ` as ${s.as.name}` : ""}`, s.block, level);
      return;
    case "For":
      printBlock(
        out,
        `for ${s.variable.name} from ${expr(s.from)} to ${expr(s.to)}${s.by ? ` by ${expr(s.by)}` : ""}`,
        s.block,
        level,
      );
      return;
    case "While":
      printBlock(out, `while ${expr(s.condition)}`, s.block, level);
      return;
    case "Branch":
      printBlock(out, "branch", s.block, level);
      return;
    case "Symmetric":
      printBlock(out, `symmetric ${s.axis}`, s.block, level);
      return;
    case "Lay":
      if (!tryOneLine(out, "lay", s.block!, level)) printBlock(out, "lay", s.block!, level);
      return;
    case "Reshape":
      if (!tryOneLine(out, "reshape", s.block, level)) printBlock(out, "reshape", s.block, level);
      return;
    case "ErrorStmt":
      throw new Error("Can't format a file with syntax errors.");
    default:
      return;
  }
}

function hasComments(b: Block): boolean {
  return (
    b.open !== undefined ||
    b.close !== undefined ||
    b.endComments.length > 0 ||
    b.items.some((s) => s.leading.length > 0 || s.trailing !== undefined)
  );
}

/** Short `lay { … }` and `reshape { … }` blocks go on one line. */
function tryOneLine(out: string[], header: string, b: Block, level: number): boolean {
  if (b.items.length === 0 || hasComments(b)) return false;
  const parts: string[] = [];
  for (const s of b.items) {
    if (!["Command", "Rotate", "Mirror", "Let", "Assign", "GeneSetting"].includes(s.kind))
      return false;
    parts.push(simpleText(s)!);
  }
  const line = `${pad(level)}${header} { ${parts.join("; ")} }`;
  if (line.length > MAX_ONE_LINE) return false;
  out.push(line);
  return true;
}

/**
 * Prints `header {`, the block, and `}`. With `chained`, the closing brace is left for the next
 * part of an if/else chain, whose header starts with `}`.
 */
function printBlock(out: string[], header: string, b: Block, level: number, chained = false): void {
  const empty = b.items.length === 0 && !hasComments(b);
  if (empty && !chained) {
    out.push(`${pad(level)}${header} {}`);
    return;
  }
  out.push(`${pad(level)}${header} {${b.open ? `  ${b.open.text}` : ""}`);
  printItems(out, b.items, level + 1, false);
  printComments(out, b.endComments, level + 1, b.items.length === 0);
  if (chained) {
    // A comment after `}` can't stay on the `} else {` line, so it moves inside the block.
    if (b.close) out.push(pad(level + 1) + b.close.text);
    return;
  }
  out.push(`${pad(level)}}${b.close ? `  ${b.close.text}` : ""}`);
}

// ---------- expressions ----------

const BINARY_PRECEDENCE: Record<string, number> = {
  or: 1,
  and: 2,
  "==": 4,
  "!=": 4,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
  "^": 8,
};

/** Binding strength, matching the parser: higher binds tighter. */
function precedence(e: Expr): number {
  if (e.kind === "Binary") return BINARY_PRECEDENCE[e.op]!;
  if (e.kind === "Unary") return e.op === "not" ? 3 : 7;
  if (e.kind === "Member" || e.kind === "Call" || e.kind === "Index") return 9;
  return 10;
}

function wrap(e: Expr, needed: boolean): string {
  return needed ? `(${expr(e)})` : expr(e);
}

function quote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

export function expr(e: Expr): string {
  switch (e.kind) {
    case "Number":
      return e.raw + (e.degree ? "°" : "");
    case "Bool":
      return e.value ? "true" : "false";
    case "String":
      return quote(e.value);
    case "Hex":
      return e.raw;
    case "Name":
      return e.name;
    case "Turtle":
      return `turtle.${e.field}`;
    case "Time":
      return "time";
    case "Beat":
      return "beat";
    case "Music":
      return `music.${e.field}`;
    case "Vector":
      return `(${expr(e.x)}, ${expr(e.y)}, ${expr(e.z)})`;
    case "Unary": {
      const p = precedence(e);
      const inner =
        precedence(e.operand) < p ||
        (e.op === "-" && e.operand.kind === "Unary" && e.operand.op === "-");
      return e.op === "not" ? `not ${wrap(e.operand, inner)}` : `-${wrap(e.operand, inner)}`;
    }
    case "Binary": {
      const p = precedence(e);
      const lp = precedence(e.left);
      const rp = precedence(e.right);
      let left = lp < p;
      let right = rp < p;
      if (lp === p) left = p === 4 || e.op === "^";
      if (rp === p) right = e.op !== "^";
      return `${wrap(e.left, left)} ${e.op} ${wrap(e.right, right)}`;
    }
    case "Member":
      return `${wrap(e.object, precedence(e.object) < 9 || e.object.kind === "Number")}.${e.name}`;
    case "Call":
      return `${wrap(e.callee, precedence(e.callee) < 9 || e.callee.kind === "Number")}(${e.args.map(expr).join(", ")})`;
    case "Gradient":
      return `${e.straight ? "spectrum" : "gradient"}(${e.stops.map((s) => (s.at ? `${expr(s.colour)} at ${expr(s.at)}` : expr(s.colour))).join(", ")})`;
    case "List":
      return `[${e.items.map(expr).join(", ")}]`;
    case "Index":
      return `${wrap(e.object, precedence(e.object) < 9 || e.object.kind === "Number")}[${expr(e.index)}]`;
    case "Picture": {
      const lines: string[] = [];
      printBlock(lines, "picture", e.body, 0);
      return lines.join("\n");
    }
    case "ErrorExpr":
      throw new Error("Can't format a file with syntax errors.");
  }
}
