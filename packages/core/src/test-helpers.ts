// Shared helpers for the tests.

import { check, type CheckResult } from "./checker.js";
import { build, type BuildOptions, type BuildResult, type LaidShape } from "./interpreter.js";

/** Checks a creature, failing the test if it has errors. */
export function checked(source: string): CheckResult {
  const result = check(source);
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) throw new Error(errors.map((d) => d.message).join("\n"));
  return result;
}

/** Checks and builds a creature body (the header is added). */
export function run(body: string, options?: BuildOptions): BuildResult {
  return build(checked(`creature Test\n${body}\n`), options);
}

/** Error messages from checking a creature body. */
export function errors(body: string): string[] {
  return check(`creature Test\n${body}\n`)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.message);
}

/** Where a laid shape's centre ends up. */
export function centre(s: LaidShape): [number, number, number] {
  return [s.matrix[12]!, s.matrix[13]!, s.matrix[14]!];
}

/** Rounds away floating-point noise, for comparing positions. */
export function near(v: number[], digits = 6): number[] {
  return v.map((x) => {
    const r = Number(x.toFixed(digits));
    return r === 0 ? 0 : r;
  });
}
