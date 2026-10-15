import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { designCreature, DEFAULT_MODEL, toContent, type Progress } from "./agent.js";
import { systemPrompt } from "./prompt.js";

interface FakeTool {
  name: string;
  run(input: unknown): unknown;
}

interface FakeParams {
  model: string;
  betas: string[];
  fallbacks: unknown;
  cache_control: unknown;
  system: { text: string }[];
  tools: FakeTool[];
  messages: { content: string }[];
}

/**
 * A client whose tool runner, instead of calling Claude, runs the given tools itself and then ends
 * with `final`, so the agent's wiring can be tested without the network.
 */
function fakeClient(
  calls: { tool: string; input: unknown }[],
  final: { text: string; stop_reason: string },
): { client: Anthropic; params: () => FakeParams; results: unknown[] } {
  let seen: FakeParams | undefined;
  const results: unknown[] = [];
  const message = {
    content: [{ type: "text", text: final.text }],
    stop_reason: final.stop_reason,
    stop_details: null,
  };
  const client = {
    beta: {
      messages: {
        toolRunner(params: FakeParams) {
          seen = params;
          return {
            async *[Symbol.asyncIterator]() {
              for (const call of calls) {
                const tool = params.tools.find((t) => t.name === call.tool)!;
                results.push(await tool.run(call.input));
              }
              yield message;
            },
            done: () => Promise.resolve(message),
          };
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, params: () => seen!, results };
}

const BLOB = "creature Blob\nlay\n";

describe("designCreature", () => {
  it("asks Claude with the language, the examples, the tools and a fallback", async () => {
    const fake = fakeClient([], { text: "Done.", stop_reason: "end_turn" });
    await designCreature({ description: "a blob", client: fake.client });
    const params = fake.params();
    expect(params.model).toBe(DEFAULT_MODEL);
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.cache_control).toEqual({ type: "ephemeral" });
    expect(params.tools.map((t) => t.name)).toEqual([
      "check_creature",
      "render_creature",
      "list_genes",
      "save_creature",
    ]);
    expect(params.messages).toEqual([{ role: "user", content: "a blob" }]);
    const system = params.system.map((b) => b.text).join("\n");
    expect(system).toContain("# The GenoCode language");
    expect(system).toContain('<example file="Flower.genie">');
  });

  it("returns the creature it saved, and reports its progress", async () => {
    const fake = fakeClient(
      [
        { tool: "check_creature", input: { source: "creature Blob\nforward red\n" } },
        { tool: "render_creature", input: { source: BLOB, times: [0] } },
        { tool: "save_creature", input: { source: "creature Blob\nforward red\n" } },
        { tool: "save_creature", input: { source: "creature Blob\nlay\n\n" } },
      ],
      { text: "A blob.", stop_reason: "end_turn" },
    );
    const progress: Progress[] = [];
    const result = await designCreature({
      description: "a blob",
      client: fake.client,
      onProgress: (p) => progress.push(p),
    });
    expect(result).toEqual({
      creature: { name: "Blob", source: BLOB, warnings: [] },
      summary: "A blob.",
      stopReason: "end_turn",
    });
    expect(fake.results[0]).toContain("1 error");
    expect(fake.results[1]).toEqual([
      { type: "text", text: "time = 0: 1 shape" },
      { type: "image", source: expect.objectContaining({ media_type: "image/png" }) },
    ]);
    expect(fake.results[2]).toContain("Not saved");
    expect(fake.results[3]).toBe("Saved Blob.");
    expect(progress).toContainEqual({ kind: "tool", name: "save", detail: "Blob" });
    expect(progress).toContainEqual({ kind: "text", text: "A blob." });
  });

  it("finishes without a creature if none was saved, and fails when Claude declines", async () => {
    const none = fakeClient([], { text: "Sorry.", stop_reason: "max_tokens" });
    expect(await designCreature({ description: "?", client: none.client })).toEqual({
      creature: undefined,
      summary: "Sorry.",
      stopReason: "max_tokens",
    });
    const refused = fakeClient([], { text: "", stop_reason: "refusal" });
    await expect(designCreature({ description: "?", client: refused.client })).rejects.toThrow(
      "declined",
    );
  });
});

describe("toContent", () => {
  it("turns text and pictures into tool result blocks", () => {
    expect(
      toContent([
        { kind: "text", text: "hi" },
        { kind: "png", data: new Uint8Array([1, 2, 3]) },
      ]),
    ).toEqual([
      { type: "text", text: "hi" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AQID" } },
    ]);
  });
});

describe("systemPrompt", () => {
  it("is the same every time, so it can be cached", () => {
    expect(systemPrompt()).toEqual(systemPrompt());
  });
});
