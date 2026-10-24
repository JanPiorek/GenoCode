// Small pictures of creatures, backgrounds and patterns in their rest pose, for the library and the
// creature menu. Each is drawn once and kept, by its text.

import { onFieldReady, Thumbnails } from "@genocode/render";
import { buildCreature, checkText, fromProgram } from "./creature.js";

const thumbnails = new Thumbnails();
const pictures = new Map<string, string>();
const redrawn = new Set<() => void>();
let redraw = 0;

// Textures are drawn elsewhere and arrive later: the pictures are drawn again with them.
onFieldReady(() => {
  clearTimeout(redraw);
  redraw = window.setTimeout(() => {
    pictures.clear();
    for (const run of redrawn) run();
  }, 200);
});

/** Calls `run` whenever the pictures have to be drawn again, because a texture is ready. */
export function onPicturesStale(run: () => void): void {
  redrawn.add(run);
}

/** A picture of `text` as an image address, `width` by `height`; none when it has errors. */
export function pictureOf(text: string, width = 200, height = 150): string | undefined {
  const known = pictures.get(text);
  if (known) return known;
  const program = checkText(text);
  if (!program.ok) return undefined;
  const ratio = window.devicePixelRatio || 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const { built, background } = buildCreature(fromProgram(program));
  thumbnails.draw(canvas, built.shapes, background);
  const src = canvas.toDataURL();
  pictures.set(text, src);
  return src;
}

/**
 * Draws the pictures of `root`'s elements that carry `data-text`, as their background images, a
 * few at a time so the page stays responsive. Stops when `stillWanted` turns false.
 */
export function drawPicturesIn(root: HTMLElement, stillWanted: () => boolean): void {
  const targets = [...root.querySelectorAll<HTMLElement>("[data-text]")];
  let k = 0;
  const step = () => {
    if (!stillWanted()) return;
    const started = performance.now();
    while (k < targets.length && performance.now() - started < 30) {
      const el = targets[k++]!;
      const src = pictureOf(el.dataset["text"]!);
      if (src) el.style.backgroundImage = `url(${src})`;
    }
    if (k < targets.length) requestAnimationFrame(step);
  };
  // Those already drawn show at once.
  for (const el of targets) {
    const text = el.dataset["text"]!;
    if (pictures.has(text)) el.style.backgroundImage = `url(${pictures.get(text)})`;
  }
  requestAnimationFrame(step);
}
