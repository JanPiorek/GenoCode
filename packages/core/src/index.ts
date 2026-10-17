// The GenoCode language: lexer, parser, checker, formatter and interpreter
// (docs/LANGUAGE.md), and genetics: mutating, breeding and morphing genes.

/** The file extension for GenoCode files. */
export const FILE_EXTENSION = ".genie";

export type * from "./ast.js";
export { lex, KEYWORDS, type Token, type TokenKind, type LexResult } from "./lexer.js";
export { parse, type ParseResult } from "./parser.js";
export { check, type CheckResult, type Variant } from "./checker.js";
export { format, formatText, type FormatResult } from "./format.js";
export {
  build,
  buildBackground,
  buildDance,
  DEFAULT_LIMITS,
  MUSIC_FIELDS,
  silence,
  type BackgroundResult,
  type DanceResult,
  type DanceStyle,
  type Trigger,
  type TriggerKind,
  type BuildOptions,
  type BuildResult,
  type Inputs,
  type LaidShape,
  type Limits,
  type MusicInputs,
} from "./interpreter.js";
export type { GeneInfo, GeneKind, GeneSection, HueArc } from "./genes.js";
export {
  breed,
  geneEdits,
  geneLiteral,
  morph,
  mutate,
  valuesOf,
  writeGenes,
  type GeneSet,
  type GeneticsOptions,
  type GeneValues,
  type MutateOptions,
} from "./genetics.js";
export {
  completionsAt,
  constantHelp,
  FUNCTION_HELP,
  geneRange,
  helpAt,
  KEYWORD_HELP,
  MEMBER_HELP,
  type Completion,
  type CompletionKind,
  type Help,
} from "./help.js";
export { mulberry32 } from "./noise.js";
export {
  BUILTIN_CONSTANTS,
  BUILTIN_FUNCTIONS,
  isBuiltinName,
  type BuiltinFunction,
} from "./builtins.js";
export { hsv, rgb, hexColour, toRgb, mixColour, sampleGradient, NAMED_COLOURS } from "./colour.js";
export {
  formatValue,
  typeOf,
  SHAPES,
  PATTERN_KINDS,
  SCHEMES,
  FINISHES,
  MIX_WAYS,
  NO_PATTERN,
} from "./values.js";
export type {
  Colour,
  Gradient,
  FinishName,
  MixWayName,
  Pattern,
  PatternKindName,
  PatternMix,
  SchemeName,
  ShapeName,
  TypeName,
  Value,
  Vec,
} from "./values.js";
export {
  formatDiagnostic,
  LineMap,
  type Diagnostic,
  type Position,
  type Severity,
  type Span,
} from "./source.js";
