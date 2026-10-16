// A creature in the app: a checked program and the values of its genes, which may differ from the
// values written in the program after mutating, breeding or morphing.

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
  return { built: build(c.program, options), background: buildBackground(c.program, options).fill };
}

/** Whether a program can be shown and bred: a creature that checked without errors. */
export function breedable(program: CheckResult | undefined): boolean {
  return program !== undefined && program.ok && program.file.kind === "creature";
}
