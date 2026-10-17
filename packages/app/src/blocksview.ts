// The blocks pane (docs/LANGUAGE.md section 21): the code as Blockly blocks, kept in step with the
// text. Text that reads is shown as blocks; while it has a syntax error the blocks stay as they
// were, marked out of date. Changing the blocks writes the code again with the standard formatter.
// Where the blocks sit is remembered for each creature, in this browser.

import * as Blockly from "blockly/core";
import * as En from "blockly/msg/en";
import { format, parse } from "@genocode/core";
import {
  defineBlocks,
  DEFINITIONS,
  fromBlocks,
  MAIN,
  registerCategories,
  toBlocks,
  TOOLBOX,
  type WorkspaceState,
} from "@genocode/blocks";

/** Where Blockly's own pictures and cursors are served from (see vite.config.ts). */
const MEDIA = "./blockly-media/";

const DARK = Blockly.Theme.defineTheme("genocode-dark", {
  name: "genocode-dark",
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: "#0b0e17",
    toolboxBackgroundColour: "#121725",
    toolboxForegroundColour: "#dfe5f2",
    flyoutBackgroundColour: "#1b2133",
    flyoutForegroundColour: "#dfe5f2",
    flyoutOpacity: 0.95,
    scrollbarColour: "#3a4560",
    scrollbarOpacity: 0.6,
    insertionMarkerColour: "#ffffff",
    insertionMarkerOpacity: 0.3,
    cursorColour: "#d0d0d0",
  },
  fontStyle: { family: "system-ui, sans-serif", size: 11 },
});

/** Space between blocks laid out automatically. */
const GAP = 40;

type Layout = Record<string, { x: number; y: number }>;

export class BlocksView {
  private readonly ws: Blockly.WorkspaceSvg;
  /** The code the blocks show, as the formatter writes it. */
  private shown: string | undefined;
  private loading = false;
  private timer = 0;
  private layoutTimer = 0;
  private name = "";
  private readonly stale: HTMLElement;

  /** `onEdit` is given the code, as the formatter writes it, after the blocks change. */
  constructor(
    private readonly parent: HTMLElement,
    private readonly onEdit: (text: string) => void,
  ) {
    Blockly.setLocale(En as unknown as Record<string, string>);
    // Darker, calmer block colours than Blockly's, for the dark page (see style.css too).
    Blockly.utils.colour.setHsvSaturation(0.42);
    Blockly.utils.colour.setHsvValue(0.38);
    defineBlocks();
    const area = document.createElement("div");
    area.className = "blocks-area";
    this.stale = document.createElement("div");
    this.stale.className = "blocks-stale";
    this.stale.textContent =
      "The code has a mistake: these blocks show the last version that read.";
    this.stale.hidden = true;
    parent.append(area, this.stale);
    this.ws = Blockly.inject(area, {
      toolbox: TOOLBOX as Blockly.utils.toolbox.ToolboxDefinition,
      theme: DARK,
      media: MEDIA,
      sounds: false,
      trashcan: false,
      renderer: "geras",
      move: { scrollbars: true, drag: true, wheel: false },
      zoom: { controls: false, wheel: true, startScale: 0.75, maxScale: 2, minScale: 0.3 },
    });
    registerCategories(this.ws);
    this.ws.addChangeListener((e) => this.changed(e));
    new ResizeObserver(() => Blockly.svgResize(this.ws)).observe(parent);
  }

  /** Shows code as blocks: at once if it reads, or marks the blocks out of date if it doesn't. */
  show(text: string): void {
    if (this.parent.hidden) {
      // Hidden blocks are brought up to date when they're shown.
      this.pending = text;
      return;
    }
    this.pending = undefined;
    const parsed = parse(text);
    const broken = parsed.diagnostics.some((d) => d.severity === "error");
    this.stale.hidden = !broken;
    this.parent.classList.toggle("stale", broken);
    if (broken) return;
    const formatted = format(parsed.file);
    if (formatted === this.shown) return;
    const name = `${parsed.file.kind}:${parsed.file.name}`;
    const keep = name === this.name ? this.positions() : this.savedLayout(name);
    this.name = name;
    this.shown = formatted;
    this.loading = true;
    Blockly.Events.disable();
    try {
      this.ws.clear();
      Blockly.serialization.workspaces.load(toBlocks(parsed.file) as never, this.ws);
      this.place(keep);
    } finally {
      Blockly.Events.enable();
      this.loading = false;
    }
  }

  private pending: string | undefined;

  /** Brings the blocks up to date and sizes them, when the pane is shown. */
  revealed(): void {
    Blockly.svgResize(this.ws);
    if (this.pending !== undefined) this.show(this.pending);
  }

  /** The keys top-level blocks are known by, to put them back where they were. */
  private key(b: Blockly.BlockSvg, k: number): string {
    if (b.type === MAIN) return "main";
    const name = b.getField("NAME") ? String(b.getFieldValue("NAME")) : "";
    return `${b.type}:${name || k}`;
  }

  private positions(): Layout {
    const out: Layout = {};
    this.ws.getTopBlocks(false).forEach((b, k) => {
      const at = b.getRelativeToSurfaceXY();
      out[this.key(b, k)] = { x: at.x, y: at.y };
    });
    return out;
  }

  /**
   * Puts the blocks where they were, or else lays them out in the code's order: the main block,
   * then each definition, below one another.
   */
  private place(layout: Layout): void {
    let y = 20;
    this.ws.getTopBlocks(false).forEach((b, k) => {
      const at = layout[this.key(b, k)];
      if (at) {
        b.moveTo(new Blockly.utils.Coordinate(at.x, at.y));
      } else {
        b.moveTo(new Blockly.utils.Coordinate(20, y));
      }
      y = Math.max(y, b.getRelativeToSurfaceXY().y + b.getHeightWidth().height + GAP);
    });
  }

  private changed(e: Blockly.Events.Abstract): void {
    if (this.loading || e.isUiEvent) return;
    if (e.type === Blockly.Events.BLOCK_MOVE) {
      clearTimeout(this.layoutTimer);
      this.layoutTimer = window.setTimeout(() => this.saveLayout(), 500);
    }
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.write(), 250);
  }

  /** Writes the blocks as code, unless a slot is empty, which its block then says. */
  private write(): void {
    const state = Blockly.serialization.workspaces.save(this.ws) as unknown as WorkspaceState;
    const result = fromBlocks(state);
    const empty = new Set(result.empty.map((s) => s.block));
    for (const b of this.ws.getAllBlocks(false)) {
      b.setWarningText(empty.has(b.id) ? "Put a value in each slot." : null);
    }
    // Loose blocks, outside the main block and the definitions, aren't part of the code.
    for (const b of this.ws.getTopBlocks(false)) {
      const loose = b.type !== MAIN && !DEFINITIONS.includes(b.type);
      if (loose) b.setWarningText("Not part of the creature: put it under its main block.");
      else if (!empty.has(b.id)) b.setWarningText(null);
    }
    if (!result.file) return;
    const text = format(result.file);
    if (text === this.shown) return;
    this.shown = text;
    this.onEdit(text);
  }

  private storageKey(name: string): string {
    return `genocode.layout.${name}`;
  }

  private savedLayout(name: string): Layout {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey(name)) ?? "{}") as Layout;
    } catch {
      return {};
    }
  }

  private saveLayout(): void {
    try {
      localStorage.setItem(this.storageKey(this.name), JSON.stringify(this.positions()));
    } catch {
      // Not remembered, then.
    }
  }
}
