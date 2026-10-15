// The work behind the agent's tools, kept free of the Claude SDK so the command line can share it
// and tests can run it without the network: checking, rendering, listing genes and saving.

import {
  build,
  buildBackground,
  check,
  formatDiagnostic,
  formatText,
  formatValue,
  type BuildResult,
  type CheckResult,
  type Diagnostic,
  type GeneInfo,
} from "@genocode/core";
import { rasterize } from "@genocode/render";
import { encodePng } from "./png.js";

/** One line per diagnostic, `file:line:column: severity: message`. */
export function describeDiagnostics(
  program: CheckResult,
  diagnostics: readonly Diagnostic[],
  file = "creature",
): string[] {
  return diagnostics.map((d) => formatDiagnostic(d, program.lines, file));
}

/** One line per gene: its full name, value, range and description. */
export function describeGenes(genes: readonly GeneInfo[]): string[] {
  return genes.map((g) => {
    let range = "";
    if (g.options) range = ` from [${g.options.map(formatValue).join(", ")}]`;
    else if (g.min !== undefined && g.max !== undefined) {
      range = ` in ${formatValue(g.min)}..${formatValue(g.max)}`;
      if (g.hue) range += g.hue.whole ? ", any hue" : `, hue ${g.hue.start}+${g.hue.length}°`;
      if (g.step !== undefined) range += ` step ${g.step}`;
      if (g.log) range += " log";
    }
    return `${g.fullName} = ${formatValue(g.value)}${range}${g.description ? `  // ${g.description}` : ""}`;
  });
}

export interface RenderOptions {
  /** Width and height of the picture in pixels. */
  size?: number;
  /** The value of `time`, in seconds. 0 is the rest pose. */
  time?: number;
}

/** Builds a checked creature at a moment in time and draws it as a PNG. */
export function renderPng(
  program: CheckResult,
  options: RenderOptions = {},
): { png: Uint8Array; built: BuildResult } {
  const size = options.size ?? 512;
  const inputs = { time: options.time ?? 0 };
  const built = build(program, { inputs });
  const image = rasterize(built.shapes, {
    width: size,
    height: size,
    background: buildBackground(program, { inputs }).fill,
  });
  return { png: encodePng(image.width, image.height, image.data), built };
}

/** Text, or a PNG picture, in the order a tool returns them. */
export type ToolOutput = { kind: "text"; text: string } | { kind: "png"; data: Uint8Array };

/** Checking: "No problems." or the errors and warnings, one per line. */
export function checkCreature(source: string): string {
  const program = check(source);
  if (program.diagnostics.length === 0) {
    const formatted = formatText(source).text;
    return formatted === source
      ? "No problems."
      : "No problems. (It isn't in the standard layout, but saving will fix that.)";
  }
  const errors = program.diagnostics.filter((d) => d.severity === "error").length;
  const summary = errors > 0 ? `${errors} error${errors === 1 ? "" : "s"}` : "Warnings only";
  return [`${summary}:`, ...describeDiagnostics(program, program.diagnostics)].join("\n");
}

export const MAX_RENDER_TIMES = 4;

/** Rendering at each time: a caption and a picture per time, or the errors that stop it. */
export function renderCreature(source: string, times: readonly number[], size = 384): ToolOutput[] {
  const program = check(source);
  if (!program.ok) {
    return [
      {
        kind: "text",
        text: [
          "It has errors, so it can't be drawn:",
          ...describeDiagnostics(program, program.diagnostics),
        ].join("\n"),
      },
    ];
  }
  const out: ToolOutput[] = [];
  const wanted = times.length > 0 ? times.slice(0, MAX_RENDER_TIMES) : [0];
  for (const time of wanted) {
    const { png, built } = renderPng(program, { size, time });
    const notes = describeDiagnostics(program, built.diagnostics);
    const caption = `time = ${time}: ${built.shapes.length} shape${built.shapes.length === 1 ? "" : "s"}`;
    out.push({ kind: "text", text: [caption, ...notes, ...built.printed].join("\n") });
    out.push({ kind: "png", data: png });
  }
  if (!program.live && wanted.length > 1) {
    out.push({
      kind: "text",
      text: "The creature doesn't read time, beat or music, so it looks the same at every time.",
    });
  }
  return out;
}

/** The genes the user will be able to change, one per line. */
export function listGenes(source: string): string {
  const program = check(source);
  if (!program.ok) return checkCreature(source);
  const lines = describeGenes(program.genes);
  return lines.length > 0 ? lines.join("\n") : "The creature has no genes.";
}

/** A creature ready to save: checked, without errors, in the standard layout. */
export interface Finished {
  name: string;
  source: string;
  /** Warnings the creature still has. */
  warnings: string[];
}

/** Checks and formats a creature for saving, or explains why it can't be saved. */
export function finishCreature(source: string): { finished: Finished } | { problem: string } {
  const program = check(source);
  if (!program.ok) {
    return { problem: `Not saved. ${checkCreature(source)}` };
  }
  if (program.file.kind !== "creature") {
    return { problem: "Not saved: the file must start with `creature <Name>`." };
  }
  const formatted = formatText(source).text ?? source;
  return {
    finished: {
      name: program.file.name,
      source: formatted,
      warnings: describeDiagnostics(program, program.diagnostics),
    },
  };
}
