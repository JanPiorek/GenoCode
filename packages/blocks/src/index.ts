// The block editor (docs/LANGUAGE.md section 21): code as Blockly blocks and back, through the
// syntax tree, with the blocks' definitions and palettes.

export { defineBlocks, hooks, HUES } from "./blocks.js";
export { swatch } from "./fields.js";
export {
  DEFINITIONS,
  fromBlocks,
  MAIN,
  toBlocks,
  type EmptySlot,
  type FromBlocksResult,
} from "./convert.js";
export type {
  BlockState,
  BodyComments,
  ExtraState,
  Meta,
  RawComment,
  WorkspaceState,
} from "./state.js";
export { registerCategories, TOOLBOX } from "./toolbox.js";
