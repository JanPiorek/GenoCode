// A creature in the app: a checked program and the values of its genes, which may differ from the
// values written in the program after mutating, breeding or morphing. A background file is shown
// and bred the same way, as a creature with no shapes.

import {
  build,
  buildBackground,
  check,
  valuesOf,
  type BuildOptions,
  type BuildResult,
  type CheckResult,
  type Value,
} from "@genocode/core";

export interface Creature {
  program: CheckResult;
  values: Map<string, Value>;
  /** The variant it is, for creatures from a family. */
  variant?: string;
}

/** A creature with the gene values written in its program. */
export function fromProgram(program: CheckResult): Creature {
  return { program, values: valuesOf(program.genes) };
}

/**
 * The creature's family: the creature itself, then each of its variants (docs/LANGUAGE.md section
 * 6.6). Just the creature when it has none.
 */
export function familyOf(c: Creature): Creature[] {
  const variants = c.program.variants.map((v) => ({
    program: c.program,
    values: valuesOf(c.program.genes, v.values),
    variant: v.name,
  }));
  return [c, ...variants];
}

/** Checks text, reusing the last result when the text hasn't changed: the editor and the view share it. */
export function checkText(text: string): CheckResult {
  if (lastChecked?.text !== text) lastChecked = check(text);
  return lastChecked;
}
let lastChecked: CheckResult | undefined;

/** Builds a creature and its background, by default in the rest pose. */
export function buildCreature(
  c: Creature,
  inputs: BuildOptions["inputs"] = {},
): { built: BuildResult; background: Value | undefined } {
  const options = { genes: c.values, inputs };
  if (c.program.file.kind === "pattern") {
    // A pattern file is shown on a ball that wears it, with the same genes (section 14.1).
    const ball = previewOf(c.program);
    return { built: build(ball, options), background: undefined };
  }
  const built =
    c.program.file.kind === "creature"
      ? build(c.program, options)
      : { shapes: [], diagnostics: [], printed: [], ok: true };
  return { built, background: buildBackground(c.program, options).fill };
}

const previews = new Map<string, CheckResult>();

/** A creature that's a ball wearing a pattern file's pattern, so it can be shown and bred. */
function previewOf(program: CheckResult): CheckResult {
  let ball = previews.get(program.text);
  if (ball === undefined) {
    const { name, items } = program.file;
    const first = items[0];
    const body = first ? program.text.slice(first.span.start).trimEnd() : "";
    const block = body
      .split("\n")
      .map((l) => (l ? `  ${l}` : ""))
      .join("\n");
    ball = check(
      `creature ${name}\n\npattern ${name} {\n${block}\n}\n\nshine 0.3\ntexture pattern(${name}, 200, 1)\nlay\n`,
    );
    if (previews.size > 32) previews.clear();
    previews.set(program.text, ball);
  }
  return ball;
}

/** Whether a program can be shown and bred: a creature or background that checked without errors. */
export function breedable(program: CheckResult | undefined): boolean {
  return program !== undefined && program.ok && program.file.kind !== "dance";
}
