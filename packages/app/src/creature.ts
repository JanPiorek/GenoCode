// A creature in the app: a checked program and the values of its genes, which may differ from the
// values written in the program after mutating, breeding or morphing.

import {
  build,
  buildBackground,
  valuesOf,
  type BuildResult,
  type CheckResult,
  type Value,
} from "@genocode/core";

export interface Creature {
  program: CheckResult;
  values: Map<string, Value>;
}

/** A creature with the gene values written in its program. */
export function fromProgram(program: CheckResult): Creature {
  return { program, values: valuesOf(program.genes) };
}

/** Builds a creature and its background at a moment in time. */
export function buildCreature(
  c: Creature,
  time = 0,
): { built: BuildResult; background: Value | undefined } {
  const options = { genes: c.values, inputs: { time } };
  return { built: build(c.program, options), background: buildBackground(c.program, options).fill };
}

/** Whether a program can be shown and bred: a creature that checked without errors. */
export function breedable(program: CheckResult | undefined): boolean {
  return program !== undefined && program.ok && program.file.kind === "creature";
}
