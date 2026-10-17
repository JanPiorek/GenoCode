import { build, buildBackground, check, SHAPES, type LaidShape } from "@genocode/core";
import { Box3 } from "three";
import { describe, expect, it } from "vitest";
import { creatureBounds, shapeGeometry } from "./geometry.js";
import { backgroundRamp, DEFAULT_BACKGROUND, frameCamera } from "./look.js";
import { rasterize } from "./software.js";

function shapes(body: string): LaidShape[] {
  const r = check(`creature T\n${body}\n`);
  expect(r.diagnostics).toEqual([]);
  return build(r).shapes;
}

describe("shape geometry", () => {
  it("fits every shape in a 1×1×1 box centred on the turtle", () => {
    for (const shape of SHAPES) {
      const box = new Box3().setFromBufferAttribute(
        shapeGeometry(shape, false).getAttribute("position") as never,
      );
      for (const v of [box.min, box.max]) {
        for (const c of [v.x, v.y, v.z]) expect(Math.abs(c)).toBeLessThanOrEqual(0.5 + 1e-6);
      }
    }
  });

  it("runs tubes and cones along the heading, with the cone's tip at the front", () => {
    for (const shape of ["tube", "cone"] as const) {
      const box = new Box3().setFromBufferAttribute(
        shapeGeometry(shape, false).getAttribute("position") as never,
      );
      expect(box.max.z - box.min.z).toBeCloseTo(1);
    }
    const pos = shapeGeometry("cone", false).getAttribute("position");
    let tipZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (Math.hypot(pos.getX(i), pos.getY(i)) < 1e-6) tipZ = Math.max(tipZ, pos.getZ(i));
    }
    expect(tipZ).toBeCloseTo(0.5);
  });

  it("lays rings and donuts around the heading, 1 across", () => {
    for (const shape of ["ring", "donut"] as const) {
      const box = new Box3().setFromBufferAttribute(
        shapeGeometry(shape, false).getAttribute("position") as never,
      );
      expect(box.max.x - box.min.x).toBeCloseTo(1);
      expect(box.max.z - box.min.z).toBeLessThan(0.5);
    }
  });

  it("winds mirrored shapes the other way", () => {
    const plain = shapeGeometry("cube", false).getIndex()!.array;
    const mirrored = shapeGeometry("cube", true).getIndex()!.array;
    expect([mirrored[0], mirrored[1], mirrored[2]]).toEqual([plain[0], plain[2], plain[1]]);
    expect(shapeGeometry("cube", false).getIndex()!.array[1]).toBe(plain[1]); // the original is untouched
  });
});

describe("framing", () => {
  it("puts a sphere round every shape", () => {
    const b = creatureBounds(shapes("lay\nforward 4\nlay"));
    expect(b.centre).toEqual([0, 0, 2]);
    expect(b.radius).toBeCloseTo(Math.hypot(1, 1, 5) / 2);
    expect(creatureBounds([])).toEqual({ centre: [0, 0, 0], radius: 1 });
  });

  it("places the camera in front of the creature, far enough to see all of it", () => {
    const cam = frameCamera({ centre: [0, 0, 0], radius: 2 }, 1);
    expect(cam.position[2]).toBeGreaterThan(2 / Math.sin((20 * Math.PI) / 180));
    expect(cam.target).toEqual([0, 0, 0]);
    expect(cam.position[1]).toBeCloseTo(0.6);
  });

  it("looks straight at each side of the creature from as far away", () => {
    const front = frameCamera({ centre: [1, 2, 3], radius: 2 }, 1, "front");
    const d = front.position[2] - 3;
    const at = (side: "back" | "left" | "right" | "top" | "bottom") =>
      frameCamera({ centre: [1, 2, 3], radius: 2 }, 1, side).position.map((x) => +x.toFixed(2));
    expect(front.position).toEqual([1, 2, 3 + d]);
    expect(at("back")).toEqual([1, 2, +(3 - d).toFixed(2)]);
    expect(at("left")).toEqual([+(1 - d).toFixed(2), 2, 3]);
    expect(at("right")).toEqual([+(1 + d).toFixed(2), 2, 3]);
    expect(at("top")).toEqual([1, +(2 + d).toFixed(2), 3]);
    expect(at("bottom")).toEqual([1, +(2 - d).toFixed(2), 3]);
  });

  it("ramps backgrounds from the bottom up", () => {
    expect(backgroundRamp(undefined, 2)).toEqual([
      DEFAULT_BACKGROUND.bottom,
      DEFAULT_BACKGROUND.top,
    ]);
    const gradient = check("creature T\nbackground {\n  fill gradient(black, white)\n}\n");
    const ramp = backgroundRamp(buildBackground(gradient).fill, 3);
    expect(ramp.map((c) => Math.round(c[0] * 100) / 100)).toEqual([0, 0.5, 1]);
  });
});

describe("software renderer", () => {
  const pixel = (img: { width: number; data: Uint8ClampedArray }, x: number, y: number) =>
    Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

  it("draws a lit shape over the background", () => {
    const img = rasterize(shapes("colour red\nlay"), { width: 64, height: 64 });
    const [r, g, b, a] = pixel(img, 32, 32);
    expect(a).toBe(255);
    expect(r).toBeGreaterThan(150);
    expect(g).toBeLessThan(40);
    expect(b).toBeLessThan(40);
    const corner = pixel(img, 0, 0);
    expect(corner.slice(0, 3)).toEqual(DEFAULT_BACKGROUND.top.map((c) => Math.round(c * 255)));
  });

  it("draws mirror images for symmetric creatures", () => {
    const img = rasterize(
      shapes("symmetric x {\n  yaw 40\n  forward 2\n  lay { grow (0.4, 0.4, 2) }\n}"),
      {
        width: 80,
        height: 80,
      },
    );
    for (let y = 0; y < 80; y += 7) {
      for (let x = 0; x < 40; x += 3) {
        const left = pixel(img, x, y);
        const right = pixel(img, 79 - x, y);
        // Lighting comes from one side, so only check that both sides have the creature or neither does.
        const isShape = (p: number[]) => p[0]! + p[1]! + p[2]! > 120;
        expect(isShape(left)).toBe(isShape(right));
      }
    }
  });

  it("uses a creature's background colour", () => {
    const r = check("creature T\nlay\nbackground {\n  fill blue\n}\n");
    const img = rasterize(build(r).shapes, {
      width: 16,
      height: 16,
      background: { type: "colour", h: 240, s: 1, v: 1, a: 1 },
    });
    expect(pixel(img, 0, 0)).toEqual([0, 0, 255, 255]);
  });
});

describe("textures in the software renderer", () => {
  it("draws textured shapes and pattern backgrounds", () => {
    const plain = rasterize(shapes("shape ball\nlay"), { width: 40, height: 30 });
    const textured = rasterize(
      shapes("texture pattern(cells, 40, 3, electric, metallic)\nshape ball\nlay"),
      { width: 40, height: 30 },
    );
    expect(textured.data).not.toEqual(plain.data);
    const r = check("creature T\nlay\nbackground {\n  fill pattern(aurora, 160, 12)\n}\n");
    const background = buildBackground(r).fill;
    const patterned = rasterize(build(r).shapes, { width: 40, height: 30, background });
    // A pattern isn't a ramp: its rows aren't each one colour.
    let mixedRows = 0;
    for (let y = 0; y < 30; y++) {
      const row = Array.from({ length: 40 }, (_, x) => patterned.data[(y * 40 + x) * 4]);
      if (new Set(row).size > 1) mixedRows++;
    }
    expect(mixedRows).toBeGreaterThan(5);
  });
});
