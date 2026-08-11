// Converts a pre-made ASCII portrait (dark-terminal polarity: dense char =
// bright pixel) into talk/frames.js for the paper-background face.
//
//   node scripts/make-frames-from-art.mjs <art.txt> [--debug]
//
// Pipeline: chars → brightness grid (classic 70-char ramp) → invert for
// ink-on-paper → crop → box-filter downsample → contrast curve → frames
// (neutral / blink / mouth 0-3) with feature edits at CONFIG coordinates.
// --debug prints the neutral frame with rulers for tuning CONFIG.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OUT_RAMP, MOUTH, MOUTH_SHAPES, clone, makeMouthShape } from "./mouth-shapes.mjs";

const CONFIG = {
  // source crop (chars, in the art's coordinate space)
  crop: { x0: 52, x1: 168, y0: 10, y1: 118 },
  targetCols: 96,
  // feature boxes in TARGET coordinates — run with --debug to tune
  eyes: [
    { x: 29, y: 37, w: 9, h: 3 },
    { x: 56, y: 37, w: 9, h: 3 },
  ],
  mouth: MOUTH,
  contrast: 2.1, // s-curve steepness; >1 deepens features
  center: 0.57, // s-curve midpoint; higher pushes background toward paper
  inkFloor: 0.12, // drop near-white noise so the paper stays clean
};

// classic image→ASCII ramp, dark → light
const SRC_RAMP = "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ";

const density = new Map([...SRC_RAMP].map((c, i) => [c, 1 - i / (SRC_RAMP.length - 1)]));
// density: 1 = dense char = bright pixel (dark-terminal polarity)

const [, , artPath, flag] = process.argv;
if (!artPath) {
  console.error("Usage: node scripts/make-frames-from-art.mjs <art.txt> [--debug]");
  process.exit(1);
}

const lines = readFileSync(artPath, "utf8").replace(/\r/g, "").split("\n");
while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
const srcW = Math.max(...lines.map((l) => l.length));
const srcH = lines.length;

// brightness grid, inverted to ink (dark photo area = high ink)
const { x0, x1, y0, y1 } = CONFIG.crop;
const cropW = x1 - x0;
const cropH = y1 - y0;
const ink = (x, y) => {
  const ch = (lines[y] ?? "")[x] ?? " ";
  return 1 - (density.get(ch) ?? 0); // unknown chars count as dark background
};

// downsample with a box filter; keep the char-cell aspect (both grids are
// made of 2:1-tall cells, so plain proportional scaling preserves shape)
const cols = CONFIG.targetCols;
const rows = Math.round((cropH * cols) / cropW);
const grid = [];
for (let ty = 0; ty < rows; ty++) {
  grid.push([]);
  for (let tx = 0; tx < cols; tx++) {
    const sx0 = x0 + (tx * cropW) / cols;
    const sx1 = x0 + ((tx + 1) * cropW) / cols;
    const sy0 = y0 + (ty * cropH) / rows;
    const sy1 = y0 + ((ty + 1) * cropH) / rows;
    let sum = 0;
    let n = 0;
    for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++)
      for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
        sum += ink(sx, sy);
        n++;
      }
    let v = sum / n;
    // contrast s-curve around CONFIG.center, then floor the paper noise —
    // pushes the photo's background bokeh down to faint texture
    v = 1 / (1 + Math.exp(-CONFIG.contrast * 4 * (v - CONFIG.center)));
    if (v < CONFIG.inkFloor) v = 0;
    grid[ty].push(v);
  }
}

const toChar = (v) =>
  OUT_RAMP[Math.min(OUT_RAMP.length - 1, Math.floor(v * (OUT_RAMP.length - 1) + 0.001))];
const renderGrid = (g) => g.map((row) => row.map(toChar).join(""));

// --- frame edits -----------------------------------------------------------

// blink: replace each eye box with skin tone + a dark lash line
function makeBlink(g) {
  const out = clone(g);
  for (const e of CONFIG.eyes) {
    // sample skin just below the eye box
    const skinRow = out[e.y + e.h + 1] ?? out[e.y];
    for (let dy = 0; dy < e.h; dy++)
      for (let dx = 0; dx < e.w; dx++) {
        const y = e.y + dy;
        const x = e.x + dx;
        if (!out[y]) continue;
        out[y][x] = Math.min(skinRow[x] ?? 0.1, 0.25);
      }
    const lashY = e.y + Math.floor(e.h / 2);
    for (let dx = 1; dx < e.w - 1; dx++) out[lashY][e.x + dx] = 0.8;
  }
  return out;
}

// smile: deepen the smile line and corners, add cheek creases, squint the
// eyes a touch — distinct from the (already smiling) neutral portrait.
function makeSmile(g) {
  const out = clone(g);
  const { cx, cy, rx } = CONFIG.mouth;
  for (let dx = -(rx + 2); dx <= rx + 2; dx++) {
    const t = dx / (rx + 2);
    const y = Math.round(cy + 1.2 - 2.0 * t * t); // corners curve upward
    if (out[y]?.[cx + dx] !== undefined) out[y][cx + dx] = Math.max(out[y][cx + dx], 0.75);
  }
  for (const s of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const x = cx + s * (rx + 2 + i);
      const y = cy - 1 - i;
      if (out[y]?.[x] !== undefined) out[y][x] = Math.max(out[y][x], 0.55); // cheek crease
    }
  for (const e of CONFIG.eyes) {
    const y = e.y + e.h;
    for (let dx = 1; dx < e.w - 1; dx++)
      if (out[y]?.[e.x + dx] !== undefined)
        out[y][e.x + dx] = Math.max(out[y][e.x + dx], 0.45); // lower-lid squint
  }
  return out;
}

// neutral2: barely-perceptible texture shift for idle life
function makeNeutral2(g) {
  const out = clone(g);
  for (let y = 0; y < out.length; y++)
    for (let x = (y * 7) % 3; x < out[y].length; x += 3) {
      const v = out[y][x];
      if (v > 0.15 && v < 0.85) out[y][x] = v + (((x + y) % 2) * 2 - 1) * 0.06;
    }
  return out;
}

// --- output ----------------------------------------------------------------

if (flag === "--debug") {
  const frame = renderGrid(grid);
  const ruler = [...Array(cols)].map((_, i) => (i % 10 === 0 ? String((i / 10) % 10) : "·")).join("");
  console.log("   " + ruler);
  frame.forEach((r, i) => console.log(String(i).padStart(2, " ") + " " + r));
  console.log(`\n${cols}x${rows} — tune CONFIG.eyes / CONFIG.mouth against the rulers, then rerun without --debug`);
  process.exit(0);
}

const frames = {
  cols,
  rows,
  ramp: OUT_RAMP,
  placeholder: false,
  neutral: renderGrid(grid),
  neutral2: renderGrid(makeNeutral2(grid)),
  blink: renderGrid(makeBlink(grid)),
  smile: renderGrid(makeSmile(grid)),
  mouth: MOUTH_SHAPES.map((s) => renderGrid(s ? makeMouthShape(grid, s, CONFIG.mouth) : grid)),
  eyes: CONFIG.eyes, // eye boxes — lets the client splice blinks onto any frame
};

const here = dirname(fileURLToPath(import.meta.url));
const out = `// Generated by scripts/make-frames-from-art.mjs — do not hand-edit.\nexport const FRAMES = ${JSON.stringify(frames)};\n`;
writeFileSync(join(here, "..", "talk", "frames.js"), out);
console.log(`Wrote talk/frames.js (${cols}x${rows}, from ${artPath})`);
