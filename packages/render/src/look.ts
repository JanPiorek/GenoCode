// What both renderers share, so a creature looks the same in the browser and in `genie render`:
// camera framing, lights, and how backgrounds are drawn.

import { sampleGradient, toRgb, type Colour, type Value } from "@genocode/core";
import type { Bounds } from "./geometry.js";

export const FIELD_OF_VIEW = 40;

export interface CameraPlacement {
  position: [number, number, number];
  target: [number, number, number];
  near: number;
  far: number;
}

/** The sides a creature can be seen from, straight on. */
export type Side = "front" | "back" | "left" | "right" | "top" | "bottom";

/** Which way the camera is from the creature, for each side. Top and bottom lean a hair towards the front, so the view keeps its front at the bottom (or top) of the picture. */
const SIDES: Record<Side, [number, number, number]> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  top: [0, 1, 1e-4],
  bottom: [0, -1, 1e-4],
};

/**
 * Looks at the creature's face (the turtle starts facing +z, towards the viewer), from a little
 * above; or, given a side, straight at that side.
 */
export function frameCamera(bounds: Bounds, aspect: number, side?: Side): CameraPlacement {
  const half = (FIELD_OF_VIEW * Math.PI) / 360;
  // The narrower of the two directions decides how far back the camera goes.
  const fit = Math.min(Math.sin(half), Math.sin(Math.atan(Math.tan(half) * aspect)));
  const distance = (bounds.radius / fit) * 1.1;
  const [x, y, z] = bounds.centre;
  const [dx, dy, dz] = side ? SIDES[side] : [0, 0.3 * (bounds.radius / distance), 1];
  return {
    position: [x + dx * distance, y + dy * distance, z + dz * distance],
    target: [x, y, z],
    near: Math.max(distance - bounds.radius * 2, distance / 1000),
    far: distance + bounds.radius * 4,
  };
}

/** Directions point towards the light, in world space. */
export const LIGHTS = {
  ambient: 0.35,
  key: { direction: normalise([1, 2, 3]), strength: 0.85 },
  fill: { direction: normalise([-2, -0.5, 1]), strength: 0.3 },
};

/** Shininess (the specular exponent) for a shape's sharpness, 0–1. */
export function shininess(sharpness: number): number {
  return 4 + sharpness * 124;
}

function normalise(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
}

export type Rgb = [number, number, number];

/** The background when a creature has none: a dark blue, lighter towards the top. */
export const DEFAULT_BACKGROUND: { bottom: Rgb; top: Rgb } = {
  bottom: [0.03, 0.04, 0.08],
  top: [0.13, 0.16, 0.26],
};

export function colourRgb(c: Colour): Rgb {
  return toRgb(c);
}

/**
 * Turns a background's fill into a vertical ramp of colours, sampled at `rows` points from the
 * bottom (0) to the top (1). The renderers draw patterns themselves; here a pattern stands in as
 * the default background tinted with its hue.
 */
export function backgroundRamp(fill: Value | undefined, rows: number): Rgb[] {
  const out: Rgb[] = [];
  for (let i = 0; i < rows; i++) {
    const t = rows === 1 ? 0 : i / (rows - 1);
    out.push(backgroundAt(fill, t));
  }
  return out;
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function backgroundAt(fill: Value | undefined, t: number): Rgb {
  const fallback = mixRgb(DEFAULT_BACKGROUND.bottom, DEFAULT_BACKGROUND.top, t);
  if (fill === undefined || typeof fill !== "object") return fallback;
  switch (fill.type) {
    case "colour":
      return colourRgb(fill);
    case "gradient":
      // Blended in HSV, the short way round the hue circle, as the language defines.
      return colourRgb(sampleGradient(fill, t));
    case "pattern": {
      if (fill.kind === null) return fallback;
      const tint = toRgb({ type: "colour", h: fill.hue, s: 0.6, v: 0.35, a: 1 });
      return mixRgb(fallback, tint, 0.5 + 0.3 * t);
    }
    default:
      return fallback;
  }
}
