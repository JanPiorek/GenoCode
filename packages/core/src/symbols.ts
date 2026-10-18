// Names and where they're declared, for editors: go to definition, find references and rename.
// The checker ties every name it can to its declaration (CheckResult.references).

import type { PatternDecl } from "./ast.js";
import { isBuiltinName } from "./builtins.js";
import { check, type CheckResult } from "./checker.js";
import { KEYWORDS } from "./lexer.js";
import type { Span } from "./source.js";

/** A name and every place it's used, the declaration first. */
export interface SymbolUses {
  name: string;
  declaration: Span;
  /** Every place the name appears, the declaration included, in the order of the text. */
  spans: Span[];
}

const on = (s: Span, offset: number) => s.start <= offset && offset <= s.end;
const same = (a: Span, b: Span) => a.start === b.start && a.end === b.end;

/** The declared name at `offset` (a gene, part, function or variable) and everywhere it's used. */
export function symbolAt(program: CheckResult, offset: number): SymbolUses | undefined {
  const here = program.references.find((r) => on(r.span, offset));
  if (!here) return undefined;
  const { declaration } = here;
  const spans = program.references
    .filter((r) => same(r.declaration, declaration))
    .map((r) => r.span)
    .sort((a, b) => a.start - b.start)
    .filter((s, i, all) => i === 0 || !same(s, all[i - 1]!));
  return { name: program.text.slice(declaration.start, declaration.end), declaration, spans };
}

/** One change to the text: `span` replaced by `text`. */
export interface TextEdit {
  span: Span;
  text: string;
}

export type RenameResult =
  | {
      edits: TextEdit[];
      /** Set when the rename changes genes' full names, which other creatures match by. */
      warning: string | undefined;
    }
  | { error: string };

const NAME = /^[\p{L}_][\p{L}\p{N}_]*$/u;

/** Renames the name at `offset` everywhere it's used, if `newName` can take its place. */
export function rename(program: CheckResult, offset: number, newName: string): RenameResult {
  const uses = symbolAt(program, offset);
  if (!uses) return { error: "Only genes, parts, functions and variables can be renamed." };
  if (!NAME.test(newName)) {
    return {
      error: `\`${newName}\` isn't a name: use letters, digits and _, not starting with a digit.`,
    };
  }
  if (KEYWORDS.has(newName)) return { error: `\`${newName}\` is a keyword.` };
  if (isBuiltinName(newName)) return { error: `\`${newName}\` is built in.` };
  const edits = uses.spans.map((span) => ({ span, text: newName }));
  if (newName === uses.name) return { edits: [], warning: undefined };

  // The renamed text must check as well as before: a new name that clashes or is hidden by
  // another shows up as a new error.
  const renamed = check(applyEdits(program.text, edits));
  const errors = (p: CheckResult) => p.diagnostics.filter((d) => d.severity === "error");
  if (errors(renamed).length > errors(program).length) {
    const before = new Set(errors(program).map((d) => d.message));
    const fresh = errors(renamed).find((d) => !before.has(d.message));
    return { error: `Can't rename to \`${newName}\`: ${fresh?.message ?? "it clashes."}` };
  }
  // Every name must still mean what it meant: a new name can hide an outer one without an error.
  if (!sameMeanings(program, renamed, uses.spans, newName.length - uses.name.length)) {
    return {
      error: `Can't rename to \`${newName}\`: another \`${newName}\` is used where the new name would be seen, so it would change meaning.`,
    };
  }
  return { edits, warning: fullNameWarning(program, uses) };
}

/** Whether `after` (the text with `edited` spans grown by `delta`) ties names as `before` does. */
function sameMeanings(
  before: CheckResult,
  after: CheckResult,
  edited: readonly Span[],
  delta: number,
): boolean {
  const move = (offset: number) => offset + delta * edited.filter((s) => s.start < offset).length;
  const key = (s: Span) => `${s.start}:${s.end}`;
  const moved = (s: Span) => {
    const start = move(s.start);
    const grows = edited.some((e) => same(e, s));
    return { start, end: grows ? start + (s.end - s.start) + delta : move(s.end) };
  };
  const pairs = (refs: CheckResult["references"]) =>
    new Set(refs.map((r) => `${key(r.span)}>${key(r.declaration)}`));
  const expected = new Set(
    before.references.map((r) => `${key(moved(r.span))}>${key(moved(r.declaration))}`),
  );
  const got = pairs(after.references);
  return expected.size === got.size && [...expected].every((p) => got.has(p));
}

/** Genes match other creatures' genes by full name, so renaming a gene or its part, function or
 * pattern breaks that. */
function fullNameWarning(program: CheckResult, uses: SymbolUses): string | undefined {
  const gene = program.genes.find((g) => g.decl && same(g.span, uses.declaration));
  if (gene) {
    return (
      `Renaming the gene \`${gene.fullName}\` gives it a new full name, so it no longer matches ` +
      `\`${gene.fullName}\` in other creatures when breeding and morphing.`
    );
  }
  const owned = program.genes.filter((g) => g.decl && g.owner === uses.name);
  const owner =
    program.parts.get(uses.name) ??
    program.functions.get(uses.name) ??
    program.file.items.find((i): i is PatternDecl => i.kind === "Pattern" && i.name === uses.name);
  if (owner && same(owner.nameSpan, uses.declaration) && owned.length > 0) {
    const names = owned.map((g) => `\`${g.fullName}\``).join(", ");
    return (
      `Renaming \`${uses.name}\` gives its genes (${names}) new full names, so they no longer ` +
      `match other creatures' genes when breeding and morphing.`
    );
  }
  return undefined;
}

/** The text with the edits made. The edits mustn't overlap. */
export function applyEdits(text: string, edits: readonly TextEdit[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.span.start - a.span.start)) {
    out = out.slice(0, e.span.start) + e.text + out.slice(e.span.end);
  }
  return out;
}
