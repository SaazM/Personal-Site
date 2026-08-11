// Build favicon.svg from the Talk ASCII neutral frame (miniature face).
// Character cells are ~0.602 em wide (see talk.js); preserve that aspect and
// letterbox into the square favicon so the face isn't stretched.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FRAMES } from "../talk/frames.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ramp = FRAMES.ramp;
const rows = FRAMES.neutral;
const H = rows.length;
const W = rows[0].length;
const OUT = 32;
const CHAR_ASPECT = 0.602; // matches talk.js monospace advance/em
const paper = "#faf7f1";
const ink = "#26221b";

function dens(ch) {
  const i = ramp.indexOf(ch);
  return i < 0 ? 0 : i / (ramp.length - 1);
}

// Portrait crop centered on the eyes, clamped to the frame.
const eyeY = FRAMES.eyes[0].y;
const eyeMid = (FRAMES.eyes[0].x + FRAMES.eyes[1].x + FRAMES.eyes[1].w) / 2;
const srcH = Math.min(H, 72);
const srcW = Math.min(W, Math.round(srcH / CHAR_ASPECT * 0.92)); // slightly tall portrait
const minX = Math.max(0, Math.min(W - srcW, Math.round(eyeMid - srcW / 2)));
const minY = Math.max(0, Math.min(H - srcH, Math.round(eyeY - srcH * 0.42)));

// Visual size of the crop → fit inside OUT×OUT (letterbox, no stretch)
const visW = srcW * CHAR_ASPECT;
const visH = srcH;
const scale = Math.min(OUT / visW, OUT / visH);
const drawW = visW * scale;
const drawH = visH * scale;
const originX = (OUT - drawW) / 2;
const originY = (OUT - drawH) / 2;

const cells = [];

for (let oy = 0; oy < OUT; oy++) {
  for (let ox = 0; ox < OUT; ox++) {
    const px = ox + 0.5;
    const py = oy + 0.5;
    if (px < originX || px >= originX + drawW || py < originY || py >= originY + drawH) {
      continue;
    }
    const u = (px - originX) / drawW; // 0..1 across crop
    const v = (py - originY) / drawH;
    const cx = minX + u * srcW;
    const cy = minY + v * srcH;

    // Box-filter a small neighborhood in character space
    const x0 = cx - 0.5;
    const x1 = cx + 0.5;
    const y0 = cy - 0.5;
    const y1 = cy + 0.5;
    let sum = 0;
    let n = 0;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        if (y < 0 || y >= H || x < 0 || x >= W) continue;
        sum += dens(rows[y][x]);
        n++;
      }
    }
    const d = n ? sum / n : 0;
    if (d > 0.1) {
      const t = Math.pow(Math.min(1, (d - 0.08) / 0.92), 0.8);
      cells.push({ ox, oy, a: Math.round(t * 100) / 100 });
    }
  }
}

const rects = cells
  .map(
    ({ ox, oy, a }) =>
      `<rect x="${ox}" y="${oy}" width="1" height="1" fill="${ink}" fill-opacity="${a}"/>`
  )
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${OUT} ${OUT}">
  <rect width="${OUT}" height="${OUT}" fill="${paper}"/>
  ${rects}
</svg>
`;

const out = join(root, "favicon.svg");
writeFileSync(out, svg);
console.log(
  `wrote ${out} (${OUT}×${OUT}, crop ${srcW}×${srcH} chars → ${drawW.toFixed(1)}×${drawH.toFixed(1)} px, ${cells.length} pixels)`
);
