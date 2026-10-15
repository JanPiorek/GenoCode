// Builds the GenoCode logo from one description of the mark: the SVGs, the Windows icon for .genie
// files, PNGs at the usual icon sizes and the web app's favicon. Run: node branding/build.mjs
//
// The mark is a G laid down the way a GenoCode turtle builds a creature: a chain of balls along a
// path, each a little smaller and a little further round the colour wheel. It's built from simple
// primitives (balls, capsules and a rounded tile), so the SVG and the icon's pixels come from
// exactly the same geometry. Below 48 pixels the balls would blur together, so the small sizes
// draw the same path as one thick stroke.

import { mkdirSync, writeFileSync } from "node:fs";
import { encodePng } from "./png.mjs";

const here = new URL("./", import.meta.url);
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const PNG_SIZES = [16, 32, 48, 64, 128, 256, 512];

// ---------- colour ----------

function hsv(h, s, v, a = 1) {
  h = ((h % 360) + 360) % 360;
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1), a];
}
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const lighten = (c) => [...mix(c.slice(0, 3), [1, 1, 1], 0.45), c[3]];
const hex = (c) =>
  "#" +
  c
    .slice(0, 3)
    .map((x) =>
      Math.round(Math.max(0, Math.min(1, x)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

/** The brand gradient, from the start of the G (t = 0) to the end of its bar (t = 1). */
const brand = (t) => hsv(195 + 140 * t, 0.75, 1);

// ---------- the mark (a 256 × 256 canvas, y down) ----------

const C = 128;
const R = 78;
const ARC_START = -45; // degrees, the top right of the G
const ARC_SWEEP = 315; // round over the top, down the left and along the bottom to the right
const BAR = 54; // the bar's length, from the right of the G towards the middle
const ARC = (R * ARC_SWEEP * Math.PI) / 180;
const LENGTH = ARC + BAR;

/** The point at distance `s` along the G's path. */
function along(s) {
  if (s <= ARC) {
    const a = ((ARC_START - (s / ARC) * ARC_SWEEP) * Math.PI) / 180;
    return [C + R * Math.cos(a), C + R * Math.sin(a)];
  }
  return [C + R - (s - ARC), C];
}

const tile = () => ({
  type: "tile",
  r: 56,
  top: hsv(250, 0.55, 0.18),
  bottom: hsv(290, 0.45, 0.36),
});
const ball = (x, y, r, colour) => ({ type: "ball", x, y, r, colour });
const capsule = (x1, y1, x2, y2, r, from, to) => ({ type: "capsule", x1, y1, x2, y2, r, from, to });

/** The balls of the full-size mark, spaced so neighbours just overlap. */
function chain() {
  const big = 27;
  const small = 11;
  const out = [];
  for (let s = 0; s <= LENGTH;) {
    const t = s / LENGTH;
    const r = big + (small - big) * t;
    const [x, y] = along(s);
    out.push(ball(x, y, r, brand(t)));
    s += 1.55 * r;
  }
  return out;
}

/** The same path as a thick stroke, for sizes where balls would blur together. */
function stroke() {
  const out = [];
  const steps = 60;
  for (let i = 0; i < steps; i++) {
    const t1 = i / steps;
    const t2 = (i + 1) / steps;
    const [x1, y1] = along(t1 * LENGTH);
    const [x2, y2] = along(t2 * LENGTH);
    out.push(capsule(x1, y1, x2, y2, 21, brand(t1), brand(t2)));
  }
  return out;
}

const mark = ({ small = false, withTile = true } = {}) => [
  ...(withTile ? [tile()] : []),
  ...(small ? stroke() : chain()),
];

// ---------- SVG ----------

function svgShapes(prims) {
  const defs = [];
  const body = [];
  const n = (v) => Number(v.toFixed(2));
  prims.forEach((p, i) => {
    const id = `p${i}`;
    if (p.type === "tile") {
      defs.push(
        `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hex(p.top)}"/><stop offset="1" stop-color="${hex(p.bottom)}"/></linearGradient>`,
      );
      body.push(`<rect width="256" height="256" rx="${p.r}" fill="url(#${id})"/>`);
    } else if (p.type === "ball") {
      defs.push(
        `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(p.x - 0.35 * p.r)}" cy="${n(p.y - 0.4 * p.r)}" r="${n(1.25 * p.r)}"><stop offset="0" stop-color="${hex(lighten(p.colour))}"/><stop offset="1" stop-color="${hex(p.colour)}"/></radialGradient>`,
      );
      body.push(`<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(p.r)}" fill="url(#${id})"/>`);
    } else {
      defs.push(
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}"><stop offset="0" stop-color="${hex(p.from)}"/><stop offset="1" stop-color="${hex(p.to)}"/></linearGradient>`,
      );
      body.push(
        `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="url(#${id})" stroke-width="${n(2 * p.r)}" stroke-linecap="round"/>`,
      );
    }
  });
  return { defs: defs.join("\n    "), body: body.join("\n  ") };
}

function markSvg(prims) {
  const { defs, body } = svgShapes(prims);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="GenoCode">
  <title>GenoCode</title>
  <defs>
    ${defs}
  </defs>
  ${body}
</svg>
`;
}

function lockupSvg(prims) {
  const { defs, body } = svgShapes(prims);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 256" width="780" height="256" role="img" aria-label="GenoCode">
  <title>GenoCode</title>
  <defs>
    ${defs}
    <linearGradient id="word" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${hex(brand(0))}"/><stop offset="1" stop-color="${hex(brand(1))}"/></linearGradient>
  </defs>
  ${body}
  <text x="292" y="158" font-family="'Segoe UI', Inter, 'Helvetica Neue', Arial, sans-serif" font-size="96" fill="url(#word)"><tspan font-weight="700">Geno</tspan><tspan font-weight="300">Code</tspan></text>
</svg>
`;
}

// ---------- pixels ----------

function cover(p, x, y) {
  if (p.type === "tile") {
    const qx = Math.abs(x - 128) - (128 - p.r);
    const qy = Math.abs(y - 128) - (128 - p.r);
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - p.r;
    return d <= 0 ? mix(p.top, p.bottom, y / 256) : undefined;
  }
  if (p.type === "ball") {
    if (Math.hypot(x - p.x, y - p.y) > p.r) return undefined;
    const d = Math.hypot(x - (p.x - 0.35 * p.r), y - (p.y - 0.4 * p.r));
    return mix(lighten(p.colour), p.colour, Math.min(1, d / (1.25 * p.r)));
  }
  const vx = p.x2 - p.x1;
  const vy = p.y2 - p.y1;
  const t = Math.max(0, Math.min(1, ((x - p.x1) * vx + (y - p.y1) * vy) / (vx * vx + vy * vy)));
  if (Math.hypot(x - (p.x1 + t * vx), y - (p.y1 + t * vy)) > p.r) return undefined;
  return mix(p.from, p.to, t);
}

function raster(prims, size) {
  const SS = 4;
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) * 256) / size;
          const y = ((py + (sy + 0.5) / SS) * 256) / size;
          let hit;
          for (const p of prims) hit = cover(p, x, y) ?? hit;
          if (!hit) continue;
          r += hit[0];
          g += hit[1];
          b += hit[2];
          a += 1;
        }
      }
      if (a === 0) continue;
      const i = (py * size + px) * 4;
      rgba[i] = (r / a) * 255;
      rgba[i + 1] = (g / a) * 255;
      rgba[i + 2] = (b / a) * 255;
      rgba[i + 3] = (a / (SS * SS)) * 255;
    }
  }
  return encodePng(size, size, rgba);
}

/** A .ico holding PNG images, which Windows Vista and later read at every size. */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => Buffer.from(p.data))]);
}

// ---------- build ----------

const write = (path, data) => {
  const url = new URL(path, here);
  mkdirSync(new URL("./", url), { recursive: true });
  writeFileSync(url, data);
};

write("logo.svg", markSvg(mark()));
write("logo-mark.svg", markSvg(mark({ withTile: false })));
write("logo-small.svg", markSvg(mark({ small: true })));
write("logo-lockup.svg", lockupSvg(mark()));
const pngs = new Map(
  [...new Set([...ICO_SIZES, ...PNG_SIZES])].map((size) => [
    size,
    raster(mark({ small: size < 48 }), size),
  ]),
);
for (const size of PNG_SIZES) write(`png/logo-${size}.png`, pngs.get(size));
write("genie.ico", ico(ICO_SIZES.map((size) => ({ size, data: pngs.get(size) }))));
write("../packages/app/public/favicon.svg", markSvg(mark({ small: true })));
console.log("Built the GenoCode logo");
