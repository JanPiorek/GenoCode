// Textures from patterns (docs/LANGUAGE.md section 14): a pattern's grey picture (patterns.ts)
// coloured by its palette (palette.ts). Pictures and palettes are kept for a while, as drawing a
// picture is the slow part and creatures often use the same few again and again.

import type { Pattern } from "@genocode/core";
import { paletteTable, SHEEN, TABLE_SIZE } from "./palette.js";
import { drawField, type Field } from "./patterns.js";

/** How big a shape's texture is, in pixels along each side. */
export const TEXTURE_SIZE = 256;

/** A map that forgets what was used least recently once it holds more than `limit`. */
class Recent<V> {
  private readonly map = new Map<string, V>();

  constructor(private readonly limit: number) {}

  has(key: string): boolean {
    return this.map.has(key);
  }

  get(key: string, make: () => V): V {
    let v = this.map.get(key);
    if (v === undefined) v = make();
    else this.map.delete(key);
    this.map.set(key, v);
    if (this.map.size > this.limit) this.map.delete(this.map.keys().next().value!);
    return v;
  }
}

const fields = new Recent<Field>(48);
const palettes = new Recent<Float32Array>(256);

/** What decides a pattern's grey picture: its kind, seed and second pattern. */
export function fieldKey(p: Pattern, size = TEXTURE_SIZE): string {
  const m = p.mix;
  return `${p.kind}/${p.seed}/${m ? `${m.way}/${m.kind}/${m.amount}` : ""}/${size}`;
}

/** What decides everything about a texture's look. */
export function textureKey(p: Pattern, size = TEXTURE_SIZE): string {
  return `${fieldKey(p, size)}/${p.hue}/${p.scheme}/${p.finish}`;
}

/** A pattern's grey picture. The pattern must have a kind (not be `none`). */
export function patternField(p: Pattern, size = TEXTURE_SIZE): Field {
  return fields.get(fieldKey(p, size), () => drawField(p.kind!, p.seed, p.mix, size));
}

/** Whether a pattern's picture is ready, so colouring it is quick. */
export function hasField(p: Pattern, size = TEXTURE_SIZE): boolean {
  return fields.has(fieldKey(p, size));
}

/** A pattern's palette: TABLE_SIZE colours, r, g, b from 0 to 1. */
export function patternPalette(p: Pattern): Float32Array {
  return palettes.get(`${p.hue}/${p.scheme}/${p.finish}/${p.seed}`, () =>
    paletteTable(p.hue, p.scheme, p.finish, p.seed),
  );
}

/** How much a pattern's finish adds a white sheen at a shape's edges, 0 to 1. */
export function patternSheen(p: Pattern): number {
  return SHEEN[p.finish];
}

/** A pattern as a picture: RGBA, 8 bits per channel, rows from the top. */
export function patternPixels(p: Pattern, size = TEXTURE_SIZE): Uint8ClampedArray<ArrayBuffer> {
  const { v } = patternField(p, size);
  const table = patternPalette(p);
  const out = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < v.length; i++) {
    const k = Math.round(v[i]! * (TABLE_SIZE - 1)) * 3;
    out[i * 4] = table[k]! * 255;
    out[i * 4 + 1] = table[k + 1]! * 255;
    out[i * 4 + 2] = table[k + 2]! * 255;
    out[i * 4 + 3] = 255;
  }
  return out;
}
