// The agent: Claude, with tools to check, draw, list the genes of and save a creature, designs one
// from a description. The SDK's tool runner drives the loop.

import type Anthropic from "@anthropic-ai/sdk";
import type { BetaToolResultContentBlockParam } from "@anthropic-ai/sdk/resources/beta";
import { z } from "zod";
import { systemPrompt } from "./prompt.js";
import {
  checkCreature,
  finishCreature,
  listGenes,
  MAX_RENDER_TIMES,
  renderCreature,
  type Finished,
  type ToolOutput,
} from "./tools.js";

export const DEFAULT_MODEL = "claude-opus-5-5";

/** What the agent is doing, for showing progress. */
export type Progress =
  { kind: "text"; text: string } | { kind: "tool"; name: string; detail: string };

export interface DesignOptions {
  /** What the user wants. */
  description: string;
  /** The Claude model. */
  model?: string;
  /** How many requests the loop may make before it stops. */
  maxIterations?: number;
  onProgress?: (p: Progress) => void;
  /** A client to use instead of one made from the environment's credentials. */
  client?: Anthropic;
}

export interface DesignResult {
  /** The last creature saved, if any. */
  creature: Finished | undefined;
  /** Claude's closing message. */
  summary: string;
  /** Why the last request stopped: `end_turn` when the agent finished. */
  stopReason: string | null;
}

/** Tool output as tool result content blocks. */
export function toContent(outputs: readonly ToolOutput[]): BetaToolResultContentBlockParam[] {
  return outputs.map((o) =>
    o.kind === "text"
      ? { type: "text", text: o.text }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: Buffer.from(o.data).toString("base64"),
          },
        },
  );
}

/** Designs a creature from a description. Needs credentials for the Claude API. */
export async function designCreature(options: DesignOptions): Promise<DesignResult> {
  // Loaded here, so the command line only pays for the SDK when it's used.
  const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
  const { betaZodTool } = await import("@anthropic-ai/sdk/helpers/beta/zod");
  const client = options.client ?? new AnthropicClient();
  const progress = options.onProgress ?? (() => {});
  let creature: Finished | undefined;

  const source = z.string().describe("The whole .genie file, starting with `creature <Name>`.");

  const tools = [
    betaZodTool({
      name: "check_creature",
      description:
        "Check a creature for errors and warnings. Returns each problem with its line and column.",
      inputSchema: z.object({ source }),
      run: ({ source }) => {
        const result = checkCreature(source);
        progress({ kind: "tool", name: "check", detail: result.split("\n")[0]! });
        return result;
      },
    }),
    betaZodTool({
      name: "render_creature",
      description:
        "Draw a creature as the viewer sees it, at one or more moments, and return the pictures. " +
        "Time 0 is the rest pose; creatures that read `time` move between moments.",
      inputSchema: z.object({
        source,
        times: z
          .array(z.number().min(0))
          .max(MAX_RENDER_TIMES)
          .describe(`Values of \`time\` in seconds, at most ${MAX_RENDER_TIMES}. Default [0].`),
      }),
      run: ({ source, times }) => {
        progress({ kind: "tool", name: "render", detail: `time ${times.join(", ") || "0"}` });
        return toContent(renderCreature(source, times));
      },
    }),
    betaZodTool({
      name: "list_genes",
      description: "List a creature's genes: the values the user can change, with their ranges.",
      inputSchema: z.object({ source }),
      run: ({ source }) => {
        progress({ kind: "tool", name: "genes", detail: "" });
        return listGenes(source);
      },
    }),
    betaZodTool({
      name: "save_creature",
      description:
        "Save the finished creature. It's checked and put in the standard layout first; a " +
        "creature with errors isn't saved. Saving again replaces the earlier version.",
      inputSchema: z.object({ source }),
      run: ({ source }) => {
        const result = finishCreature(source);
        if ("problem" in result) {
          progress({ kind: "tool", name: "save", detail: "refused: it has errors" });
          return result.problem;
        }
        creature = result.finished;
        progress({ kind: "tool", name: "save", detail: creature.name });
        const warnings = creature.warnings;
        return warnings.length > 0
          ? `Saved ${creature.name}, with warnings:\n${warnings.join("\n")}`
          : `Saved ${creature.name}.`;
      },
    }),
  ];

  const prompt = systemPrompt();
  const runner = client.beta.messages.toolRunner({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: 16000,
    max_iterations: options.maxIterations ?? 40,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    // A declined request is retried on the model Anthropic recommends for its category.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // Caches the system prompt and, as the conversation grows, everything up to the last turn.
    cache_control: { type: "ephemeral" },
    system: [
      { type: "text", text: prompt.instructions },
      { type: "text", text: prompt.reference },
    ],
    tools,
    messages: [{ role: "user", content: options.description }],
  });

  for await (const message of runner) {
    for (const block of message.content) {
      if (block.type === "text" && block.text.trim() !== "") {
        progress({ kind: "text", text: block.text });
      }
    }
  }
  const last = await runner.done();

  if (last.stop_reason === "refusal") {
    const why = last.stop_details?.explanation;
    throw new Error(`Claude declined to design this creature${why ? `: ${why}` : "."}`);
  }
  const summary = last.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  return { creature, summary, stopReason: last.stop_reason };
}
