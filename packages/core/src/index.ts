// The GenoCode language: lexer, parser, checker, formatter and interpreter
// (docs/LANGUAGE.md). Genetics is added in roadmap phase 3.

/** The file extension for GenoCode files. */
export const FILE_EXTENSION = ".genie";

export type * from "./ast.js";
export { lex, KEYWORDS, type Token, type TokenKind, type LexResult } from "./lexer.js";
export { parse, type ParseResult } from "./parser.js";
export { check, type CheckResult } from "./checker.js";
export { format, formatText, type FormatResult } from "./format.js";
export {
  build,
  buildBackground,
  DEFAULT_LIMITS,
  type BackgroundResult,
  type BuildOptions,
  type BuildResult,
  type Inputs,
  type LaidShape,
  type Limits,
  type MusicInputs,
} from "./interpreter.js";
export type { GeneInfo, GeneKind, GeneSection, HueArc } from "./genes.js";
export {
  BUILTIN_CONSTANTS,
  BUILTIN_FUNCTIONS,
  isBuiltinName,
  type BuiltinFunction,
} from "./builtins.js";
export { hsv, rgb, hexColour, toRgb, mixColour, NAMED_COLOURS } from "./colour.js";
export { formatValue, typeOf, SHAPES, PATTERN_KINDS } from "./values.js";
export type {
  Colour,
  Gradient,
  Pattern,
  PatternKindName,
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
