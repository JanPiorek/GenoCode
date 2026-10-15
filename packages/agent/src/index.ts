// An agent that designs GenoCode creatures from a description, with Claude, and the tools it uses:
// checking, drawing (to PNG, at any time), listing genes and saving.

export {
  designCreature,
  DEFAULT_MODEL,
  toContent,
  type DesignOptions,
  type DesignResult,
  type Progress,
} from "./agent.js";
export {
  checkCreature,
  describeDiagnostics,
  describeGenes,
  finishCreature,
  listGenes,
  MAX_RENDER_TIMES,
  renderCreature,
  renderPng,
  type Finished,
  type RenderOptions,
  type ToolOutput,
} from "./tools.js";
export { systemPrompt } from "./prompt.js";
export { encodePng } from "./png.js";
