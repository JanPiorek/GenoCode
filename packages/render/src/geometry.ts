// The six shapes, exactly as docs/LANGUAGE.md section 12 defines them: each fits a 1×1×1 box
// centred on the turtle, with its length along the heading (+z).

import type { LaidShape, ShapeName } from "@genocode/core";
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
} from "three";

export type Detail = "high" | "low";

function make(shape: ShapeName, detail: Detail): BufferGeometry {
  const high = detail === "high";
  switch (shape) {
    case "cube":
      return new BoxGeometry(1, 1, 1);
    case "ball":
      return new SphereGeometry(0.5, high ? 32 : 16, high ? 20 : 10);
    case "tube":
      // three's cylinders run along y; turning them about x points them along +z.
      return new CylinderGeometry(0.5, 0.5, 1, high ? 32 : 16, 1).rotateX(Math.PI / 2);
    case "cone":
      return new CylinderGeometry(0, 0.5, 1, high ? 32 : 16, 1).rotateX(Math.PI / 2);
    case "ring":
      return new TorusGeometry(0.4, 0.1, high ? 12 : 8, high ? 48 : 24);
    case "donut":
      return new TorusGeometry(1 / 3, 1 / 6, high ? 16 : 10, high ? 48 : 24);
  }
}

/** The same geometry with each triangle's corners in the opposite order, for mirrored shapes. */
function flipWinding(g: BufferGeometry): BufferGeometry {
  const flipped = g.clone();
  const index = flipped.getIndex();
  if (index) {
    const a = index.array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1]!;
      a[i + 1] = a[i + 2]!;
      a[i + 2] = t;
    }
    index.needsUpdate = true;
  }
  return flipped;
}

const cache = new Map<string, BufferGeometry>();

/**
 * The geometry for a shape. Mirrored shapes need their triangles wound the other way, so that
 * their outsides still face outwards after the mirroring in their placement.
 */
export function shapeGeometry(
  shape: ShapeName,
  mirrored: boolean,
  detail: Detail = "high",
): BufferGeometry {
  const key = `${shape}/${mirrored}/${detail}`;
  let g = cache.get(key);
  if (!g) {
    g = mirrored ? flipWinding(shapeGeometry(shape, false, detail)) : make(shape, detail);
    cache.set(key, g);
  }
  return g;
}

export interface Bounds {
  centre: [number, number, number];
  radius: number;
}

/** A sphere around all the shapes, from the corners of each shape's 1×1×1 box. */
export function creatureBounds(shapes: readonly LaidShape[]): Bounds {
  if (shapes.length === 0) return { centre: [0, 0, 0], radius: 1 };
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const s of shapes) {
    const m = s.matrix;
    for (const x of [-0.5, 0.5]) {
      for (const y of [-0.5, 0.5]) {
        for (const z of [-0.5, 0.5]) {
          for (let i = 0; i < 3; i++) {
            const v = m[i]! * x + m[4 + i]! * y + m[8 + i]! * z + m[12 + i]!;
            lo[i] = Math.min(lo[i]!, v);
            hi[i] = Math.max(hi[i]!, v);
          }
        }
      }
    }
  }
  const centre: [number, number, number] = [
    (lo[0]! + hi[0]!) / 2,
    (lo[1]! + hi[1]!) / 2,
    (lo[2]! + hi[2]!) / 2,
  ];
  const radius = Math.max(1e-3, Math.hypot(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) / 2);
  return { centre, radius };
}
