// Draws the grey pictures of textures (see @genocode/render's texture.ts) away from the page, so
// the view keeps moving while a new pattern is drawn.

import type { PatternKindName, PatternMix } from "@genocode/core";
import { drawField } from "@genocode/render/patterns";

export interface FieldRequest {
  id: number;
  kind: PatternKindName;
  seed: number;
  mix: PatternMix | undefined;
  size: number;
}

self.onmessage = (e: MessageEvent<FieldRequest>) => {
  const { id, kind, seed, mix, size } = e.data;
  const { v } = drawField(kind, seed, mix, size);
  postMessage({ id, v }, { transfer: [v.buffer] });
};
