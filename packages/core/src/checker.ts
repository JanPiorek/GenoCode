// Checks a parsed file against the rules of docs/LANGUAGE.md: names, genes, where each statement
// may appear, what functions may do, and types wherever they're known without running the program.

import type {
  Block,
  Comment,
  Expr,
  FunctionDecl,
  GeneDecl,
  Param,
  PartDecl,
  SourceFile,
  Stmt,
} from "./ast.js";
import { BUILTIN_CONSTANTS, BUILTIN_FUNCTIONS, isBuiltinName } from "./builtins.js";
import { hexColour } from "./colour.js";
import { hueArc, inHueArc, seedGene, type GeneInfo, type GeneSection } from "./genes.js";
import { parse } from "./parser.js";
import type { Diagnostic, LineMap, Span } from "./source.js";
import {
  binaryOp,
  isColour,
  isVec,
  member,
  negate,
  not,
  typeLabel,
  typeOf,
  ValueError,
  valuesEqual,
  type TypeName,
  type Value,
} from "./values.js";

export interface CheckResult {
  text: string;
  file: SourceFile;
  lines: LineMap;
  diagnostics: Diagnostic[];
  /** No errors (warnings are allowed). */
  ok: boolean;
  /** Every gene, in the order they're declared, plus `seed` if the creature uses `random`. */
  genes: GeneInfo[];
  parts: Map<string, PartDecl>;
  functions: Map<string, FunctionDecl>;
  /** The background's statements: a creature's background block, or a background file's items. */
  background: Stmt[] | undefined;
  /** The dance style's statements. */
  dance: Stmt[] | undefined;
  /** The creature reads `time`, `beat` or `music` outside its background and dance (section 16). */
  live: boolean;
  /** The background reads `time`, `beat` or `music`, so it changes while it's shown. */
  backgroundLive: boolean;
  usesRandom: boolean;
}

/** Parses and checks a GenoCode file. */
export function check(text: string): CheckResult {
  const parsed = parse(text);
  const checker = new Checker(parsed.file, parsed.diagnostics);
  checker.run();
  const diagnostics = parsed.diagnostics.sort((a, b) => a.span.start - b.span.start);
  return {
    text,
    file: parsed.file,
    lines: parsed.lines,
    diagnostics,
    ok: !diagnostics.some((d) => d.severity === "error"),
    genes: checker.genes,
    parts: checker.parts,
    functions: checker.functions,
    background: checker.background,
    dance: checker.dance,
    live: checker.live,
    backgroundLive: checker.backgroundLive,
    usesRandom: checker.usesRandom,
  };
}

type StaticType = TypeName | "unknown";

type SymbolKind =
  "gene" | "global" | "local" | "param" | "readonly" | "part" | "function" | "partGene";

interface Sym {
  kind: SymbolKind;
  type: StaticType;
  /** Parts, functions and part genes. */
  paramCount?: number;
}

class Scope {
  readonly symbols = new Map<string, Sym>();
  constructor(readonly parent: Scope | undefined) {}

  lookup(name: string): Sym | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) {
      const sym = s.symbols.get(name);
      if (sym) return sym;
    }
    return undefined;
  }
}

interface Ctx {
  scope: Scope;
  section: GeneSection;
  /** The kind of body being checked, in a creature. */
  where: "top" | "part" | "function";
  owner: string | undefined;
  /** Inside `reshape { }` or `lay { }`. */
  inShape: boolean;
  /** Inside `symmetric`. */
  inSymmetric: boolean;
  /** Set when a function returns a value. */
  returns: { value: boolean };
}

class ConstError extends Error {
  constructor(
    readonly span: Span,
    message: string,
  ) {
    super(message);
  }
}

const TURTLE_FIELDS: ReadonlyMap<string, TypeName> = new Map<string, TypeName>([
  ["position", "vector"],
  ["heading", "vector"],
  ["up", "vector"],
  ["side", "vector"],
  ["size", "vector"],
  ["mirrored", "bool"],
  ["shape", "shape"],
  ["colour", "colour"],
  ["color", "colour"],
  ["shine", "number"],
  ["sharpness", "number"],
  ["texture", "pattern"],
]);

const MUSIC_FIELDS = new Set(["bass", "mid", "high", "level", "hit"]);
const VECTOR_FIELDS = new Set(["x", "y", "z"]);
const COLOUR_FIELDS = new Set(["hue", "sat", "val", "alpha"]);
const SHAPE_STATEMENTS = new Set(["Command", "Rotate", "Mirror", "Let", "Assign", "If"]);
const TURTLE_STATEMENTS = new Set([
  "Branch",
  "Symmetric",
  "Lay",
  "Reshape",
  "Command",
  "Rotate",
  "Mirror",
  "Material",
]);

function describeSym(kind: SymbolKind): string {
  switch (kind) {
    case "gene":
      return "a gene";
    case "global":
    case "local":
    case "param":
    case "readonly":
      return "a variable";
    case "part":
      return "a part";
    case "function":
      return "a function";
    case "partGene":
      return "a part gene";
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function commentText(c: Comment | undefined): string | undefined {
  if (c === undefined) return undefined;
  const text = c.text.startsWith("//") ? c.text.slice(2) : c.text.slice(2, -2);
  const trimmed = text.trim();
  return trimmed === "" ? undefined : trimmed;
}

class Checker {
  genes: GeneInfo[] = [];
  parts = new Map<string, PartDecl>();
  functions = new Map<string, FunctionDecl>();
  background: Stmt[] | undefined;
  dance: Stmt[] | undefined;
  live = false;
  backgroundLive = false;
  usesRandom = false;
  private randomSpan: Span | undefined;
  private readonly fullNames = new Set<string>();

  constructor(
    private readonly file: SourceFile,
    private readonly diagnostics: Diagnostic[],
  ) {}

  private error(span: Span, message: string): void {
    this.diagnostics.push({ severity: "error", message, span });
  }

  private warn(span: Span, message: string): void {
    this.diagnostics.push({ severity: "warning", message, span });
  }

  run(): void {
    const file = this.file;
    if (file.kind === "background") {
      this.background = file.items;
      this.checkSection(file.items, "background");
    } else if (file.kind === "dance") {
      this.dance = file.items;
      this.checkSection(file.items, "dance");
    } else {
      this.checkCreature(file.items);
    }
    if (this.usesRandom) {
      if (this.fullNames.has("seed")) {
        const g = this.genes.find((x) => x.fullName === "seed");
        if (g)
          this.error(
            g.span,
            "The gene name `seed` is kept for `random`'s seed; choose another name.",
          );
      } else {
        this.genes.push(seedGene(this.randomSpan ?? { start: 0, end: 0 }));
      }
    }
  }

  // ---------- creatures ----------

  private checkCreature(items: Stmt[]): void {
    const module = new Scope(undefined);

    // Parts and functions first, so genes and code can refer to them in any order.
    for (const item of items) {
      if (item.kind !== "Part" && item.kind !== "Function") continue;
      if (
        !this.checkNewName(
          item.name,
          item.nameSpan,
          module,
          item.kind === "Part" ? "part" : "function",
        )
      )
        continue;
      module.symbols.set(item.name, {
        kind: item.kind === "Part" ? "part" : "function",
        type: "unknown",
        paramCount: item.params.length,
      });
      if (item.kind === "Part") this.parts.set(item.name, item);
      else this.functions.set(item.name, item);
    }

    for (const item of items) {
      if (item.kind === "Gene") this.declareGene(item, module, "creature", undefined);
    }

    // Globals: every top-level let, visible from parts and functions whatever the order.
    const all = new Scope(module);
    for (const item of items) {
      if (item.kind !== "Let") continue;
      if (all.symbols.has(item.name)) continue;
      const existing = module.lookup(item.name);
      if (existing || isBuiltinName(item.name)) continue; // reported when the let is checked
      all.symbols.set(item.name, { kind: "global", type: "unknown" });
    }

    const top = new Scope(module);
    const ctx: Ctx = {
      scope: top,
      section: "creature",
      where: "top",
      owner: undefined,
      inShape: false,
      inSymmetric: false,
      returns: { value: false },
    };
    for (const item of items) this.checkStmt(item, ctx, true);

    for (const item of items) {
      if (item.kind === "Part" || item.kind === "Function") {
        if (
          module.lookup(item.name) &&
          (this.parts.get(item.name) === item || this.functions.get(item.name) === item)
        ) {
          this.checkDefinition(item, all);
        }
      } else if (item.kind === "Background") {
        if (this.background !== undefined)
          this.error(item.span, "A creature can only have one background block.");
        else {
          this.background = item.body.items;
          this.checkSection(item.body.items, "background");
        }
      } else if (item.kind === "Dance") {
        if (this.dance !== undefined)
          this.error(item.span, "A creature can only have one dance block.");
        else {
          this.dance = item.body.items;
          this.checkSection(item.body.items, "dance");
        }
      }
    }
  }

  private checkDefinition(def: PartDecl | FunctionDecl, all: Scope): void {
    const scope = new Scope(all);
    for (const p of def.params) this.declareVariable(p, scope, "param", "unknown");
    for (const item of def.body.items) {
      if (item.kind === "Gene") this.declareGene(item, scope, "creature", def.name);
    }
    const ctx: Ctx = {
      scope,
      section: "creature",
      where: def.kind === "Part" ? "part" : "function",
      owner: def.name,
      inShape: false,
      inSymmetric: false,
      returns: { value: false },
    };
    for (const item of def.body.items) this.checkStmt(item, ctx, true);
    if (def.kind === "Function" && !ctx.returns.value) {
      this.error(
        def.nameSpan,
        `The function \`${def.name}\` never returns a value. End it with \`return <value>\`.`,
      );
    }
  }

  // ---------- backgrounds and dance styles ----------

  private checkSection(items: Stmt[], section: "background" | "dance"): void {
    const scope = new Scope(undefined);
    for (const item of items) {
      if (item.kind === "Gene") this.declareGene(item, scope, section, undefined);
    }
    const ctx: Ctx = {
      scope: new Scope(scope),
      section,
      where: "top",
      owner: undefined,
      inShape: false,
      inSymmetric: false,
      returns: { value: false },
    };
    for (const item of items) this.checkStmt(item, ctx, true);

    if (section === "background") {
      const fills = items.filter((i) => i.kind === "Fill");
      const last = items[items.length - 1];
      if (fills.length === 0) {
        const where = items.length > 0 ? items[0]!.span : this.file.nameSpan;
        this.error(where, "A background needs a `fill` statement at the end.");
      } else if (fills.length > 1) {
        for (const f of fills.slice(1))
          this.error(f.span, "A background can only have one `fill`.");
      } else if (last !== fills[0]) {
        this.error(fills[0]!.span, "`fill` must be the last statement in the background.");
      }
    }
  }

  // ---------- names ----------

  /** Checks a name that's about to be defined. Returns false if it can't be used. */
  private checkNewName(name: string, span: Span, scope: Scope, what: string): boolean {
    if (isBuiltinName(name)) {
      this.error(span, `\`${name}\` is built in, so it can't be used as the name of a ${what}.`);
      return false;
    }
    const here = scope.symbols.get(name);
    if (here) {
      this.error(span, `\`${name}\` is already ${describeSym(here.kind)} here.`);
      return false;
    }
    const outer = scope.lookup(name);
    if (
      outer &&
      (outer.kind === "gene" ||
        outer.kind === "part" ||
        outer.kind === "function" ||
        outer.kind === "partGene")
    ) {
      this.error(span, `\`${name}\` is already ${describeSym(outer.kind)}.`);
      return false;
    }
    return true;
  }

  private declareVariable(p: Param, scope: Scope, kind: SymbolKind, type: StaticType): void {
    if (this.checkNewName(p.name, p.span, scope, "variable"))
      scope.symbols.set(p.name, { kind, type });
  }

  // ---------- genes ----------

  private declareGene(
    decl: GeneDecl,
    scope: Scope,
    section: GeneSection,
    owner: string | undefined,
  ): void {
    const fullName =
      section === "background"
        ? `background.${decl.name}`
        : section === "dance"
          ? `dance.${decl.name}`
          : owner !== undefined
            ? `${owner}.${decl.name}`
            : decl.name;
    if (!this.checkNewName(decl.name, decl.nameSpan, scope, "gene")) return;
    if (this.fullNames.has(fullName)) {
      this.error(decl.nameSpan, `There's already a gene called \`${fullName}\`.`);
      return;
    }
    this.fullNames.add(fullName);
    const info = this.geneInfo(decl, fullName, section, owner, scope);
    if (info === undefined) {
      scope.symbols.set(decl.name, { kind: "gene", type: "unknown" });
      return;
    }
    this.genes.push(info);
    if (info.kind === "part") {
      const first = info.options?.[0];
      const part =
        first && typeof first === "object" && first.type === "part"
          ? this.parts.get(first.name)
          : undefined;
      scope.symbols.set(decl.name, {
        kind: "partGene",
        type: "unknown",
        paramCount: part?.params.length ?? 0,
      });
    } else {
      scope.symbols.set(decl.name, { kind: "gene", type: typeOf(info.value) });
    }
  }

  private geneInfo(
    decl: GeneDecl,
    fullName: string,
    section: GeneSection,
    owner: string | undefined,
    scope: Scope,
  ): GeneInfo | undefined {
    const base = {
      fullName,
      name: decl.name,
      owner,
      section,
      min: undefined,
      max: undefined,
      step: undefined,
      log: false,
      hue: undefined,
      options: undefined,
      description: commentText(decl.trailing),
      span: decl.nameSpan,
      decl,
    };
    try {
      // Part choice genes name parts.
      if (
        decl.value.kind === "Name" &&
        this.parts.has(decl.value.name) &&
        scope.lookup(decl.value.name)?.kind === "part"
      ) {
        return { ...base, ...this.partGene(decl) };
      }

      const value = this.constant(decl.value);
      const type = typeOf(value);
      const range = decl.range;

      if (type === "bool") {
        if (range)
          throw new ConstError(
            decl.value.span,
            "A bool gene has no range: write `gene name = true` or `= false`.",
          );
        return { ...base, kind: "bool", value };
      }
      if (
        type !== "number" &&
        type !== "vector" &&
        type !== "colour" &&
        type !== "shape" &&
        type !== "patternKind"
      ) {
        throw new ConstError(decl.value.span, `${typeLabel(type)} can't be a gene.`);
      }
      if (range === undefined) {
        throw new ConstError(
          decl.nameSpan,
          type === "shape" || type === "patternKind"
            ? `This gene needs its options: \`from [a, b, …]\`.`
            : "This gene needs a range: `in <lowest>..<highest>`.",
        );
      }

      if (range.kind === "Choice") {
        const options = range.options.map((o) => this.constant(o));
        if (options.length < 2)
          throw new ConstError(decl.nameSpan, "A choice gene needs at least two options.");
        range.options.forEach((o, i) => {
          if (typeOf(options[i]!) !== type) {
            throw new ConstError(
              o.span,
              `Every option must be ${typeLabel(type)}, like the gene's value.`,
            );
          }
        });
        if (!options.some((o) => valuesEqual(o, value))) {
          throw new ConstError(decl.value.span, "The gene's value must be one of its options.");
        }
        return { ...base, kind: "choice", value, options };
      }

      if (type === "shape" || type === "patternKind") {
        throw new ConstError(
          decl.nameSpan,
          `${typeLabel(type)} gene needs options, \`from [a, b, …]\`, not a range.`,
        );
      }
      const min = this.constant(range.min);
      const max = this.constant(range.max);
      if (typeOf(min) !== type)
        throw new ConstError(
          range.min.span,
          `The lowest value must be ${typeLabel(type)}, like the gene's value.`,
        );
      if (typeOf(max) !== type)
        throw new ConstError(
          range.max.span,
          `The highest value must be ${typeLabel(type)}, like the gene's value.`,
        );
      if (range.step && range.log)
        throw new ConstError(range.step.span, "A gene can't have both `step` and `log`.");

      if (typeof value === "number" && typeof min === "number" && typeof max === "number") {
        if (!(min < max))
          throw new ConstError(range.min.span, "The lowest value must be less than the highest.");
        if (value < min || value > max)
          throw new ConstError(decl.value.span, `The value must be between ${min} and ${max}.`);
        if (range.log && !(min > 0))
          throw new ConstError(range.min.span, "A `log` gene's range must be above zero.");
        let step: number | undefined;
        if (range.step) {
          const s = this.constant(range.step);
          if (typeof s !== "number" || !(s > 0))
            throw new ConstError(range.step.span, "`step` must be a number above zero.");
          step = s;
          const k = (value - min) / s;
          if (Math.abs(k - Math.round(k)) > 1e-9) {
            this.warn(
              decl.value.span,
              `The value isn't a whole number of steps of ${s} above ${min}.`,
            );
          }
        }
        return { ...base, kind: "number", value, min, max, step, log: range.log };
      }

      if (range.step) throw new ConstError(range.step.span, "Only number genes can have a `step`.");

      if (isVec(value) && isVec(min) && isVec(max)) {
        for (const axis of ["x", "y", "z"] as const) {
          if (min[axis] > max[axis]) {
            throw new ConstError(
              range.min.span,
              `On the ${axis} axis, the lowest value is more than the highest.`,
            );
          }
          if (value[axis] < min[axis] || value[axis] > max[axis]) {
            throw new ConstError(decl.value.span, `The value's ${axis} is outside the range.`);
          }
          if (range.log && !(min[axis] > 0))
            throw new ConstError(
              range.min.span,
              "A `log` gene's range must be above zero on every axis.",
            );
        }
        return { ...base, kind: "vector", value, min, max, log: range.log };
      }

      if (isColour(value) && isColour(min) && isColour(max)) {
        if (range.log) throw new ConstError(decl.nameSpan, "Colour genes can't be `log`.");
        const channels = [
          ["s", "saturation"],
          ["v", "value"],
          ["a", "alpha"],
        ] as const;
        for (const [key, label] of channels) {
          if (min[key] > max[key])
            throw new ConstError(range.min.span, `The lowest ${label} is more than the highest.`);
          if (value[key] < min[key] || value[key] > max[key]) {
            throw new ConstError(decl.value.span, `The colour's ${label} is outside the range.`);
          }
        }
        const hue = hueArc(this.rawHue(range.min, min.h), this.rawHue(range.max, max.h));
        if (!inHueArc(value.h, hue))
          throw new ConstError(decl.value.span, "The colour's hue is outside the range.");
        return { ...base, kind: "colour", value, min, max, hue };
      }
      throw new ConstError(decl.value.span, "This gene's value and range don't fit together.");
    } catch (e) {
      if (!(e instanceof ConstError)) throw e;
      this.error(e.span, e.message);
      return undefined;
    }
  }

  private partGene(decl: GeneDecl): Pick<GeneInfo, "kind" | "value" | "options"> {
    const range = decl.range;
    if (range?.kind !== "Choice") {
      throw new ConstError(decl.nameSpan, "A part gene lists its parts: `from [leg, fin, wing]`.");
    }
    const options: Value[] = [];
    let count: number | undefined;
    for (const o of range.options) {
      if (o.kind !== "Name" || !this.parts.has(o.name))
        throw new ConstError(o.span, "Every option of a part gene must be a part.");
      const n = this.parts.get(o.name)!.params.length;
      if (count !== undefined && n !== count) {
        throw new ConstError(
          o.span,
          "Every part in a part gene must take the same number of parameters.",
        );
      }
      count = n;
      options.push({ type: "part", name: o.name });
    }
    if (options.length < 2)
      throw new ConstError(decl.nameSpan, "A part gene needs at least two parts.");
    const name = (decl.value as { name: string }).name;
    if (!options.some((o) => typeof o === "object" && o.type === "part" && o.name === name)) {
      throw new ConstError(decl.value.span, "The gene's value must be one of its parts.");
    }
    return { kind: "part", value: { type: "part", name }, options };
  }

  /** A hue bound as written, before wrapping (section 6.4). */
  private rawHue(expr: Expr, wrapped: number): number {
    if (
      expr.kind === "Call" &&
      expr.callee.kind === "Name" &&
      expr.callee.name === "hsv" &&
      expr.args.length >= 3
    ) {
      const h = this.constant(expr.args[0]!);
      if (typeof h === "number") return h;
    }
    return wrapped;
  }

  /** Evaluates a constant expression (section 6.1). */
  private constant(expr: Expr): Value {
    const fail = (message: string): never => {
      throw new ConstError(expr.span, message);
    };
    const guard = <T>(f: () => T): T => {
      try {
        return f();
      } catch (e) {
        if (e instanceof ValueError) return fail(e.message);
        throw e;
      }
    };
    switch (expr.kind) {
      case "Number":
        return expr.value;
      case "Bool":
        return expr.value;
      case "Hex":
        return guard(() => hexColour(expr.raw));
      case "Name": {
        const v = BUILTIN_CONSTANTS.get(expr.name);
        if (v === undefined) {
          return fail(`Gene values must be constant: \`${expr.name}\` isn't a built-in constant.`);
        }
        return v;
      }
      case "Vector": {
        const parts = [this.constant(expr.x), this.constant(expr.y), this.constant(expr.z)];
        if (!parts.every((p) => typeof p === "number"))
          return fail("A vector is made of three numbers.");
        return {
          type: "vector",
          x: parts[0] as number,
          y: parts[1] as number,
          z: parts[2] as number,
        };
      }
      case "Unary": {
        const v = this.constant(expr.operand);
        return guard(() => (expr.op === "-" ? negate(v) : not(v)));
      }
      case "Binary": {
        const a = this.constant(expr.left);
        const b = this.constant(expr.right);
        return guard(() => binaryOp(expr.op, a, b));
      }
      case "Member": {
        const v = this.constant(expr.object);
        return guard(() => member(v, expr.name));
      }
      case "Call": {
        const callee = expr.callee;
        const f = callee.kind === "Name" ? BUILTIN_FUNCTIONS.get(callee.name) : undefined;
        if (f === undefined || !f.constant) {
          return fail("Gene values must be constant: only built-in maths can be used here.");
        }
        if (expr.args.length < f.minArgs || expr.args.length > f.maxArgs)
          return fail(this.arityMessage(f.name, f.minArgs, f.maxArgs));
        const args = expr.args.map((a) => this.constant(a));
        return guard(() =>
          f.call(args, {
            random: () => {
              throw new ValueError("`random` can't be used in a gene's value.");
            },
          }),
        );
      }
      default:
        return fail("Gene values must be constant: numbers, built-in constants and arithmetic.");
    }
  }

  private arityMessage(name: string, min: number, max: number): string {
    const n = min === max ? `${min}` : `${min} or ${max}`;
    return `\`${name}\` takes ${n} argument${max === 1 ? "" : "s"}.`;
  }

  // ---------- statements ----------

  private checkBlock(block: Block, ctx: Ctx, extra?: (scope: Scope) => void): void {
    const inner: Ctx = { ...ctx, scope: new Scope(ctx.scope) };
    extra?.(inner.scope);
    for (const item of block.items) this.checkStmt(item, inner, false);
  }

  private checkStmt(stmt: Stmt, ctx: Ctx, bodyLevel: boolean): void {
    const creatureTop = ctx.section === "creature" && ctx.where === "top" && bodyLevel;

    // Where each statement may appear.
    if (
      ctx.section === "background" &&
      !["Gene", "Let", "Assign", "If", "Fill", "ErrorStmt"].includes(stmt.kind)
    ) {
      this.error(
        stmt.span,
        "A background can only hold genes, `let`, assignments, `if` and `fill`.",
      );
      return;
    }
    if (ctx.section === "dance" && !["Gene", "Let", "Effect", "ErrorStmt"].includes(stmt.kind)) {
      this.error(stmt.span, "A dance block can only hold genes, `let` and effect lines.");
      return;
    }
    if (ctx.inShape && !SHAPE_STATEMENTS.has(stmt.kind) && stmt.kind !== "ErrorStmt") {
      this.error(
        stmt.span,
        "Inside `reshape` and `lay` blocks, only moving, turning, growing, mirroring, `let`, assignments and `if` are allowed.",
      );
      return;
    }
    if (
      ctx.where === "function" &&
      ctx.section === "creature" &&
      TURTLE_STATEMENTS.has(stmt.kind)
    ) {
      this.error(
        stmt.span,
        "A function can't change the turtle or lay shapes; use a part for that.",
      );
      return;
    }

    switch (stmt.kind) {
      case "Gene":
        if (!bodyLevel) {
          this.error(
            stmt.span,
            "Genes can only be declared at the top level of a file, part, function, background or dance block.",
          );
        }
        return;
      case "Part":
      case "Function":
        if (!creatureTop)
          this.error(
            stmt.span,
            `A ${stmt.kind === "Part" ? "part" : "function"} can only be defined at the top level of a creature.`,
          );
        return;
      case "Background":
      case "Dance":
        if (!creatureTop)
          this.error(
            stmt.span,
            `A ${stmt.kind === "Background" ? "background" : "dance"} block can only be at the top level of a creature.`,
          );
        return;
      case "Let": {
        this.checkExpr(stmt.value, ctx);
        const kind: SymbolKind = creatureTop ? "global" : "local";
        this.declareVariable({ name: stmt.name, span: stmt.nameSpan }, ctx.scope, kind, "unknown");
        return;
      }
      case "Assign": {
        this.checkExpr(stmt.value, ctx);
        const sym = ctx.scope.lookup(stmt.name);
        if (sym === undefined) {
          if (BUILTIN_CONSTANTS.has(stmt.name) || BUILTIN_FUNCTIONS.has(stmt.name)) {
            this.error(stmt.nameSpan, `\`${stmt.name}\` is built in and can't be changed.`);
          } else {
            this.error(
              stmt.nameSpan,
              `There's no variable called \`${stmt.name}\`. Create it first with \`let ${stmt.name} = …\`.`,
            );
          }
          return;
        }
        if (sym.kind === "gene")
          this.error(stmt.nameSpan, `\`${stmt.name}\` is a gene, and genes can't be changed.`);
        else if (sym.kind === "readonly")
          this.error(stmt.nameSpan, `\`${stmt.name}\` can't be changed.`);
        else if (sym.kind === "part" || sym.kind === "function" || sym.kind === "partGene") {
          this.error(
            stmt.nameSpan,
            `\`${stmt.name}\` is ${describeSym(sym.kind)}, not a variable.`,
          );
        } else if (sym.kind === "global" && ctx.where === "function") {
          this.error(stmt.nameSpan, `A function can't change the global \`${stmt.name}\`.`);
        }
        return;
      }
      case "PartCall": {
        for (const a of stmt.args) this.checkExpr(a, ctx);
        const sym = ctx.scope.lookup(stmt.name);
        if (sym?.kind === "part" || sym?.kind === "partGene") {
          if (ctx.where === "function") {
            this.error(stmt.span, "A function can't call parts.");
          } else if (sym.paramCount !== stmt.args.length) {
            this.error(
              stmt.nameSpan,
              `\`${stmt.name}\` takes ${sym.paramCount} argument${sym.paramCount === 1 ? "" : "s"}, not ${stmt.args.length}.`,
            );
          }
        } else if (sym?.kind === "function" || BUILTIN_FUNCTIONS.has(stmt.name)) {
          this.error(
            stmt.nameSpan,
            `\`${stmt.name}\` is a function, which gives a value. Use it in an expression, such as \`let x = ${stmt.name}(…)\`.`,
          );
        } else if (sym !== undefined || BUILTIN_CONSTANTS.has(stmt.name)) {
          this.error(stmt.nameSpan, `\`${stmt.name}\` isn't a part, so it can't be called.`);
        } else {
          this.error(stmt.nameSpan, `There's no part called \`${stmt.name}\`.`);
        }
        return;
      }
      case "Return":
        if (ctx.where === "top" || ctx.section !== "creature") {
          this.error(stmt.span, "`return` can only be used in a part or a function.");
        } else if (ctx.where === "part" && stmt.value) {
          this.error(
            stmt.value.span,
            "A part doesn't return a value. Use a function to calculate one.",
          );
        } else if (ctx.where === "function" && !stmt.value) {
          this.error(stmt.span, "A function must return a value: `return <value>`.");
          ctx.returns.value = true; // already reported; don't also say it never returns
        }
        if (stmt.value) {
          this.checkExpr(stmt.value, ctx);
          ctx.returns.value = true;
        }
        return;
      case "Print":
        for (const a of stmt.args) {
          if (a.kind !== "String") this.checkExpr(a, ctx);
        }
        return;
      case "If":
        for (const b of stmt.branches) {
          this.expect(
            this.checkExpr(b.condition, ctx),
            ["bool"],
            b.condition.span,
            "A condition must be a bool",
          );
          this.checkBlock(b.block, ctx);
        }
        if (stmt.elseBlock) this.checkBlock(stmt.elseBlock, ctx);
        return;
      case "Repeat":
        this.expect(
          this.checkExpr(stmt.count, ctx),
          ["number"],
          stmt.count.span,
          "`repeat` needs a number",
        );
        this.checkBlock(stmt.block, ctx, (scope) => {
          if (stmt.as) this.declareVariable(stmt.as, scope, "readonly", "number");
        });
        return;
      case "For":
        this.expect(
          this.checkExpr(stmt.from, ctx),
          ["number"],
          stmt.from.span,
          "`for` needs numbers",
        );
        this.expect(this.checkExpr(stmt.to, ctx), ["number"], stmt.to.span, "`for` needs numbers");
        if (stmt.by) {
          this.expect(
            this.checkExpr(stmt.by, ctx),
            ["number"],
            stmt.by.span,
            "`for` needs numbers",
          );
          if (stmt.by.kind === "Number" && stmt.by.value === 0)
            this.error(stmt.by.span, "`by 0` would never finish.");
        }
        this.checkBlock(stmt.block, ctx, (scope) =>
          this.declareVariable(stmt.variable, scope, "readonly", "number"),
        );
        return;
      case "While":
        this.expect(
          this.checkExpr(stmt.condition, ctx),
          ["bool"],
          stmt.condition.span,
          "A condition must be a bool",
        );
        this.checkBlock(stmt.block, ctx);
        return;
      case "Branch":
        this.checkBlock(stmt.block, ctx);
        return;
      case "Symmetric":
        this.checkBlock(stmt.block, { ...ctx, inSymmetric: true }, (scope) => {
          scope.symbols.set("side", { kind: "readonly", type: "number" });
        });
        return;
      case "Lay":
        if (stmt.block) this.checkBlock(stmt.block, { ...ctx, inShape: true });
        return;
      case "Reshape":
        this.checkBlock(stmt.block, { ...ctx, inShape: true });
        return;
      case "Command": {
        const t = this.checkExpr(stmt.value, ctx);
        const wanted: TypeName[] =
          stmt.command === "move"
            ? ["vector"]
            : stmt.command === "grow"
              ? ["number", "vector"]
              : ["number"];
        this.expect(
          t,
          wanted,
          stmt.value.span,
          `\`${stmt.command}\` needs ${wanted.map(typeLabel).join(" or ")}`,
        );
        return;
      }
      case "Rotate":
        this.expect(
          this.checkExpr(stmt.angle, ctx),
          ["number"],
          stmt.angle.span,
          "`rotate` needs an angle (a number)",
        );
        this.expect(
          this.checkExpr(stmt.axis, ctx),
          ["vector"],
          stmt.axis.span,
          "`around` needs a vector",
        );
        return;
      case "Mirror":
        return;
      case "Material": {
        const t = this.checkExpr(stmt.value, ctx);
        const wanted: Record<string, TypeName[]> = {
          shape: ["shape", "number"],
          colour: ["colour"],
          shine: ["number"],
          sharpness: ["number"],
          texture: ["pattern"],
        };
        const w = wanted[stmt.property]!;
        if (stmt.property === "colour" && t === "gradient") {
          this.error(
            stmt.value.span,
            "To colour with a gradient, pick a point on it, such as `colour skin(0.5)`.",
          );
          return;
        }
        this.expect(
          t,
          w,
          stmt.value.span,
          `\`${stmt.keyword}\` needs ${w.map(typeLabel).join(" or ")}`,
        );
        return;
      }
      case "Fill": {
        if (ctx.section !== "background") {
          this.error(stmt.span, "`fill` can only be used in a background.");
          return;
        }
        if (!bodyLevel)
          this.error(
            stmt.span,
            "`fill` must be the last statement of the background, not inside a block.",
          );
        this.expect(
          this.checkExpr(stmt.value, ctx),
          ["pattern", "colour", "gradient"],
          stmt.value.span,
          "`fill` needs a pattern, a colour or a gradient",
        );
        return;
      }
      case "Effect":
        for (const a of stmt.args) {
          if (a.kind === "Value") this.checkExpr(a.expr, ctx);
        }
        return;
      case "ErrorStmt":
        return;
    }
  }

  private expect(got: StaticType, wanted: TypeName[], span: Span, what: string): void {
    if (got === "unknown" || wanted.includes(got)) return;
    this.error(span, `${what}, not ${typeLabel(got)}.`);
  }

  // ---------- expressions ----------

  private checkExpr(expr: Expr, ctx: Ctx): StaticType {
    switch (expr.kind) {
      case "Number":
        return "number";
      case "Bool":
        return "bool";
      case "String":
        this.error(expr.span, "Strings can only be used in `print`.");
        return "string";
      case "Hex":
        try {
          hexColour(expr.raw);
        } catch {
          // the lexer has already reported it
        }
        return "colour";
      case "Name":
        return this.checkName(expr.name, expr.span, ctx);
      case "Turtle": {
        const t = TURTLE_FIELDS.get(expr.field);
        if (ctx.section !== "creature") {
          this.error(
            expr.span,
            `A ${ctx.section === "background" ? "background" : "dance block"} can't read the turtle.`,
          );
        }
        if (t === undefined) {
          this.error(
            expr.fieldSpan,
            `The turtle has no \`${expr.field}\`. It has ${[...TURTLE_FIELDS.keys()]
              .filter((k) => k !== "color")
              .map((k) => `\`${k}\``)
              .join(", ")}.`,
          );
          return "unknown";
        }
        return t;
      }
      case "Time":
      case "Beat":
        this.markLive(ctx);
        return "number";
      case "Music":
        if (!MUSIC_FIELDS.has(expr.field)) {
          this.error(
            expr.fieldSpan,
            `\`music\` has no \`${expr.field}\`. It has \`bass\`, \`mid\`, \`high\`, \`level\` and \`hit\`.`,
          );
        }
        this.markLive(ctx);
        return "number";
      case "Vector":
        for (const e of [expr.x, expr.y, expr.z]) {
          this.expect(this.checkExpr(e, ctx), ["number"], e.span, "A vector is made of numbers");
        }
        return "vector";
      case "Unary": {
        const t = this.checkExpr(expr.operand, ctx);
        if (expr.op === "not") {
          this.expect(t, ["bool"], expr.operand.span, "`not` needs a bool");
          return "bool";
        }
        this.expect(t, ["number", "vector"], expr.operand.span, "`-` needs a number or a vector");
        return t === "vector" ? "vector" : t === "number" ? "number" : "unknown";
      }
      case "Binary":
        return this.checkBinary(expr, ctx);
      case "Member": {
        const t = this.checkExpr(expr.object, ctx);
        const ok =
          t === "vector"
            ? VECTOR_FIELDS.has(expr.name)
            : t === "colour"
              ? COLOUR_FIELDS.has(expr.name)
              : t === "unknown"
                ? VECTOR_FIELDS.has(expr.name) || COLOUR_FIELDS.has(expr.name)
                : false;
        if (!ok) {
          const owner = t === "unknown" ? "No value" : capitalise(typeLabel(t));
          this.error(expr.nameSpan, `${owner} has no part called \`${expr.name}\`.`);
        }
        return "number";
      }
      case "Call":
        return this.checkCall(expr, ctx);
      case "Gradient":
        if (expr.stops.length < 2) this.error(expr.span, "A gradient needs at least two colours.");
        for (const s of expr.stops) {
          this.expect(
            this.checkExpr(s.colour, ctx),
            ["colour"],
            s.colour.span,
            "A gradient is made of colours",
          );
          if (s.at)
            this.expect(
              this.checkExpr(s.at, ctx),
              ["number"],
              s.at.span,
              "A position must be a number",
            );
        }
        return "gradient";
      case "ErrorExpr":
        return "unknown";
    }
  }

  private markLive(ctx: Ctx): void {
    if (ctx.section === "creature") this.live = true;
    else if (ctx.section === "background") this.backgroundLive = true;
  }

  private checkName(name: string, span: Span, ctx: Ctx): StaticType {
    const sym = ctx.scope.lookup(name);
    if (sym) {
      if (sym.kind === "part" || sym.kind === "partGene") {
        this.error(
          span,
          `\`${name}\` is ${describeSym(sym.kind)}. Call it as a statement on its own line.`,
        );
        return "unknown";
      }
      if (sym.kind === "function") {
        this.error(span, `\`${name}\` is a function. Call it with brackets: \`${name}(…)\`.`);
        return "unknown";
      }
      return sym.type;
    }
    const constant = BUILTIN_CONSTANTS.get(name);
    if (constant !== undefined) return typeOf(constant);
    if (BUILTIN_FUNCTIONS.has(name)) {
      this.error(span, `\`${name}\` is a function. Call it with brackets: \`${name}(…)\`.`);
      return "unknown";
    }
    if (name === "gradient") {
      this.error(span, "Write a gradient as `gradient(colour, colour, …)`.");
      return "unknown";
    }
    if (name === "side" && !ctx.inSymmetric) {
      this.error(span, "`side` only exists inside a `symmetric` block.");
    } else if (ctx.section !== "creature" && this.fullNames.has(name)) {
      this.error(
        span,
        `A ${ctx.section === "background" ? "background" : "dance block"} can't use the creature's \`${name}\`; it must be self-contained.`,
      );
    } else {
      this.error(span, `There's nothing called \`${name}\`.`);
    }
    return "unknown";
  }

  private checkCall(expr: Extract<Expr, { kind: "Call" }>, ctx: Ctx): StaticType {
    const argTypes = expr.args.map((a) => this.checkExpr(a, ctx));
    const callee = expr.callee;
    if (callee.kind === "Name") {
      const sym = ctx.scope.lookup(callee.name);
      if (sym === undefined) {
        const f = BUILTIN_FUNCTIONS.get(callee.name);
        if (f) {
          if (expr.args.length < f.minArgs || expr.args.length > f.maxArgs) {
            this.error(callee.span, this.arityMessage(f.name, f.minArgs, f.maxArgs));
          }
          if (f.name === "random") {
            this.usesRandom = true;
            this.randomSpan ??= expr.span;
          }
          if (f.returns) return f.returns;
          return argTypes[0] ?? "unknown";
        }
      }
      if (sym?.kind === "function") {
        if (sym.paramCount !== expr.args.length) {
          this.error(
            callee.span,
            `\`${callee.name}\` takes ${sym.paramCount} argument${sym.paramCount === 1 ? "" : "s"}, not ${expr.args.length}.`,
          );
        }
        return "unknown";
      }
      if (sym?.kind === "part" || sym?.kind === "partGene") {
        this.error(
          callee.span,
          `\`${callee.name}\` is ${describeSym(sym.kind)}, which draws. Call it as a statement on its own line.`,
        );
        return "unknown";
      }
    }
    // Anything else is a gradient being sampled.
    const t = this.checkExpr(callee, ctx);
    if (t !== "unknown" && t !== "gradient") {
      this.error(
        callee.span,
        `${typeLabel(t)} can't be called. Only functions can be called, and gradients sampled.`,
      );
      return "unknown";
    }
    if (expr.args.length !== 1) {
      this.error(expr.span, "A gradient is sampled at one position, such as `skin(0.5)`.");
    } else {
      this.expect(
        argTypes[0]!,
        ["number"],
        expr.args[0]!.span,
        "A gradient's position must be a number",
      );
    }
    return "colour";
  }

  private checkBinary(expr: Extract<Expr, { kind: "Binary" }>, ctx: Ctx): StaticType {
    const a = this.checkExpr(expr.left, ctx);
    const b = this.checkExpr(expr.right, ctx);
    const op = expr.op;
    const bad = (): StaticType => {
      this.error(
        expr.opSpan,
        `\`${op}\` can't be used on ${typeLabel(a as TypeName)} and ${typeLabel(b as TypeName)}.`,
      );
      return "unknown";
    };
    switch (op) {
      case "and":
      case "or":
        this.expect(a, ["bool"], expr.left.span, `\`${op}\` needs bools`);
        this.expect(b, ["bool"], expr.right.span, `\`${op}\` needs bools`);
        return "bool";
      case "==":
      case "!=":
        if (a !== "unknown" && b !== "unknown" && a !== b) {
          this.error(
            expr.opSpan,
            `\`${op}\` compares two values of the same type, not ${typeLabel(a)} and ${typeLabel(b)}.`,
          );
        } else if (a === "gradient" || b === "gradient") {
          this.error(expr.opSpan, "Gradients can't be compared.");
        }
        return "bool";
      case "<":
      case "<=":
      case ">":
      case ">=":
        this.expect(a, ["number"], expr.left.span, `\`${op}\` compares numbers`);
        this.expect(b, ["number"], expr.right.span, `\`${op}\` compares numbers`);
        return "bool";
      case "^":
        this.expect(a, ["number"], expr.left.span, "`^` needs numbers");
        this.expect(b, ["number"], expr.right.span, "`^` needs numbers");
        return "number";
    }
    if (a === "unknown" || b === "unknown") {
      const known = a === "unknown" ? b : a;
      if (known !== "unknown" && known !== "number" && known !== "vector") return bad();
      if (known === "vector") return "vector";
      return "unknown";
    }
    if (a === "number" && b === "number") return "number";
    if (op === "+" || op === "-") return a === "vector" && b === "vector" ? "vector" : bad();
    if (op === "%") return bad();
    if (a === "vector" && (b === "vector" || b === "number")) return "vector";
    if (op === "*" && a === "number" && b === "vector") return "vector";
    return bad();
  }
}
