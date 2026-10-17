// Blocks as Blockly saves them (its JSON serialisation), and what this package keeps alongside: the
// parts of the code a block doesn't show, such as blank lines and how comments were written, so
// code turned into blocks and back comes out the same.

/** One block, as Blockly's JSON serialisation saves it. */
export interface BlockState {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  fields?: Record<string, string | number | boolean>;
  inputs?: Record<string, { block?: BlockState; shadow?: BlockState }>;
  next?: { block?: BlockState };
  /** What the block keeps besides its fields and inputs: its shape, and the code's details. */
  extraState?: ExtraState;
  icons?: { comment?: { text: string; pinned: boolean; height: number; width: number } };
}

/** A workspace, as Blockly's JSON serialisation saves it. */
export interface WorkspaceState {
  blocks: { languageVersion: 0; blocks: BlockState[] };
}

/** A comment as written, and whether a blank line came before it. */
export interface RawComment {
  text: string;
  blank?: boolean;
}

/** The comments of a `{ … }` block: after `{`, before `}`, and after `}`. */
export interface BodyComments {
  open?: string;
  end?: RawComment[];
  close?: string;
}

/** The details of a statement that its block doesn't show. */
export interface Meta {
  /** Comments on their own lines above it. Its block shows them as a note. */
  leading?: RawComment[];
  /** A blank line comes before it. */
  blank?: boolean;
  /** A comment at the end of its line (a gene's is shown as its description). */
  trailing?: string;
  /** The comments of its `{ … }` blocks, by input name. */
  bodies?: Record<string, BodyComments>;
}

/** Everything a block keeps in Blockly's `extraState`. */
export interface ExtraState {
  meta?: Meta;
  /** How many arguments, options, stops or branches a block has. */
  count?: number;
  /** An if with an else; a gene's kind of range; a number's degree sign. */
  hasElse?: boolean;
  range?: "none" | "range" | "choice";
  /** Whether each gradient stop has an `at` position. */
  at?: boolean[];
  /** A dance effect's line: each a word, or a value (written `null`) taking the next input. */
  words?: (string | null)[];
  /** The main block's file: its kind, and comments before and after everything. */
  file?: {
    kind: "creature" | "background" | "dance";
    header?: RawComment[];
    description?: string[];
    end?: RawComment[];
  };
  /** Where a definition comes among the others, to keep the code's order. */
  order?: number;
}
