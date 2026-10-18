// Patterns written in GenoCode, for tools: a pattern file shown as a creature (a ball wearing the
// pattern, as the app, the command line and the editors show it), and the patterns a file defines.

import { check, type CheckResult } from "./checker.js";
import { patternFileText } from "./interpreter.js";
import type { PatternSource, Value } from "./values.js";

/** A creature that's a ball wearing the pattern of a pattern file. Its genes have the pattern
 * file's full names (`Ripples.rings`), so values and edits for one fit the other. */
export function patternOnBall(program: CheckResult): CheckResult {
  const { name, items } = program.file;
  const first = items[0];
  const body = first ? program.text.slice(first.span.start).trimEnd() : "";
  const block = body
    .split("\n")
    .map((l) => (l ? `  ${l}` : ""))
    .join("\n");
  return check(
    `creature ${name}\n\npattern ${name} {\n${block}\n}\n\nshine 0.3\ntexture pattern(${name}, 200, 1)\nlay\n`,
  );
}

/** The patterns a file defines, in order: a pattern file's own, or a creature's pattern blocks.
 * Each comes with the source a recipe carries (section 14.1), its genes at the values in `genes`
 * or else as written. */
export function patternsOf(
  program: CheckResult,
  genes?: ReadonlyMap<string, Value>,
): { name: string; source: PatternSource }[] {
  const names =
    program.file.kind === "pattern"
      ? [program.file.name]
      : program.file.items.flatMap((i) => (i.kind === "Pattern" ? [i.name] : []));
  return names.flatMap((name) => {
    const text = patternFileText(program, name);
    if (text === undefined) return [];
    const own = program.genes.filter((g) => g.section === "pattern" && g.owner === name);
    const values = own.map(
      (g) => [g.fullName, genes?.get(g.fullName) ?? g.value] as [string, Value],
    );
    return [{ name, source: { text, genes: values } }];
  });
}
