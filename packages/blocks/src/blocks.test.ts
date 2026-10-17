import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as Blockly from "blockly/core";
import { format, formatText, parse } from "@genocode/core";
import { describe, expect, it } from "vitest";
import { defineBlocks } from "./blocks.js";
import { fromBlocks, toBlocks } from "./convert.js";
import { TOOLBOX } from "./toolbox.js";
import type { WorkspaceState } from "./state.js";

const repo = join(import.meta.dirname, "../../..");

defineBlocks();

/** Code loaded into a Blockly workspace as blocks, saved by Blockly, and printed as code again. */
function throughBlockly(text: string): string {
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(toBlocks(parse(text).file) as never, ws);
    const saved = Blockly.serialization.workspaces.save(ws) as unknown as WorkspaceState;
    const back = fromBlocks(saved);
    expect(back.empty).toEqual([]);
    return format(back.file!);
  } finally {
    ws.dispose();
  }
}

describe("blocks in Blockly", () => {
  for (const dir of ["creatures", "dances"]) {
    for (const name of readdirSync(join(repo, dir)).filter((f) => f.endsWith(".genie"))) {
      it(`loads and saves ${dir}/${name} without changing it`, () => {
        const text = readFileSync(join(repo, dir, name), "utf8");
        expect(throughBlockly(text)).toBe(formatText(text).text);
      });
    }
  }
});

describe("the palettes", () => {
  it("hold only blocks Blockly can make", () => {
    const ws = new Blockly.Workspace();
    try {
      const items = TOOLBOX.contents.flatMap((c) => ("contents" in c ? c.contents : []));
      for (const item of items as { kind: string }[]) {
        if (item.kind !== "block") continue;
        const { kind: _, ...state } = item as { kind: string } & Record<string, unknown>;
        expect(() => Blockly.serialization.blocks.append(state as never, ws)).not.toThrow();
      }
      expect(ws.getTopBlocks(false).length).toBeGreaterThan(50);
    } finally {
      ws.dispose();
    }
  });
});
