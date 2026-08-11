// Generates a stylized ASCII portrait into talk/frames.js — tuned to Saaz's
// actual headshot (curly dark hair, thick brows, smile, quarter-zip collar).
// STILL A PLACEHOLDER until real photo/video frames exist — run
// scripts/make-frames.mjs to replace it. Same frames.js shape either way.
//
// Usage: node scripts/make-placeholder-frames.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const COLS = 92;
const ROWS = 50;
const RAMP = " .:-=+*#%@";

const here = dirname(fileURLToPath(import.meta.url));

// Terminal cells are ~2x taller than wide.
const aspect = 2.05;

function ellipseD(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = ((y - cy) * (aspect / 2)) / ry;
  return Math.sqrt(dx * dx + dy * dy);
}
function ellipse(x, y, cx, cy, rx, ry, soft = 0.12) {
  const d = ellipseD(x, y, cx, cy, rx, ry);
  if (d >= 1 + soft) return 0;
  if (d <= 1) return 1;
  return 1 - (d - 1) / soft;
}
function ring(x, y, cx, cy, rx, ry, width = 0.1) {
  const d = ellipseD(x, y, cx, cy, rx, ry);
  return Math.abs(d - 1) < width ? 1 - Math.abs(d - 1) / width : 0;
}

// Deterministic value noise with a couple of octaves for curl clumps.
function hash(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
function smoothNoise(x, y, scale) {
  const xs = x / scale, ys = y / scale;
  const xi = Math.floor(xs), yi = Math.floor(ys);
  const xf = xs - xi, yf = ys - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}
function curl(x, y) {
  return 0.6 * smoothNoise(x, y, 3) + 0.4 * smoothNoise(x + 40, y + 40, 1.6);
}

const CX = COLS / 2;
const HEAD_CY = 21; // face center; shoulders occupy the bottom rows
const HEAD_RX = 14.5;
const HEAD_RY = 13.5;

function renderFace({ eyesOpen = true, mouth = "smile" }) {
  const rows = [];
  for (let y = 0; y < ROWS; y++) {
    let row = "";
    for (let x = 0; x < COLS; x++) {
      let v = 0;

      const head = ellipse(x, y, CX, HEAD_CY + 1, HEAD_RX, HEAD_RY);
      const skin = head > 0 ? 0.1 + 0.06 * hash(x, y) : 0;

      // --- hair: big irregular curly mass hugging the top half of the head.
      // Envelope: wider than the face, from crown down past the temples.
      const hairEnv =
        ellipse(x, y, CX, HEAD_CY - 8.5, HEAD_RX + 4.5, 9.5) +
        ellipse(x, y, CX - 11, HEAD_CY - 4, 6, 7) * 0.9 + // temple curls L
        ellipse(x, y, CX + 11, HEAD_CY - 4, 6, 7) * 0.9;  // temple curls R
      // Wavy hairline across the forehead
      const hairline = HEAD_CY - 4.5 + 1.3 * Math.sin(x * 0.7 + 1) + 1.1 * curl(x, 3);
      let hair = 0;
      if (hairEnv > 0.25 && y < hairline) {
        const c = curl(x, y);
        hair = c > 0.28 ? 0.55 + 0.45 * c : 0.25 * c; // clumps with gaps = curls
        // ragged silhouette: drop ink near the envelope edge unless a curl pokes out
        if (hairEnv < 0.55 && c < 0.55) hair *= 0.25;
      }
      v = Math.max(skin, hair);

      // Face outline (jaw) — only below the hairline
      if (y > hairline) v = Math.max(v, 0.5 * ring(x, y, CX, HEAD_CY + 1, HEAD_RX, HEAD_RY, 0.06));

      // Ears
      v = Math.max(v, 0.4 * ellipse(x, y, CX - HEAD_RX - 0.8, HEAD_CY + 1.5, 1.6, 2.2));
      v = Math.max(v, 0.4 * ellipse(x, y, CX + HEAD_RX + 0.8, HEAD_CY + 1.5, 1.6, 2.2));

      const eyeY = HEAD_CY - 0.5;
      for (const side of [-1, 1]) {
        const ex = CX + side * 6.5;
        // thick, nearly straight dark brows
        const browY = eyeY - 3 + 0.15 * side * (x - ex);
        if (Math.abs(y - browY) < 0.85 && Math.abs(x - ex) < 4.2) v = Math.max(v, 0.8);
        if (eyesOpen) {
          v = Math.max(v, 0.95 * ellipse(x, y, ex, eyeY, 2.5, 1.05));
        } else if (Math.abs(y - eyeY) < 0.55 && Math.abs(x - ex) < 2.8) {
          v = Math.max(v, 0.85);
        }
      }

      // Nose: shadow line + base
      if (Math.abs(x - CX + 0.5) < 0.7 && y > HEAD_CY + 1 && y < HEAD_CY + 5.5) v = Math.max(v, 0.35);
      v = Math.max(v, 0.45 * ellipse(x, y, CX, HEAD_CY + 6, 1.7, 0.7));

      // --- mouth
      const mouthY = HEAD_CY + 9.5;
      if (mouth === "smile" || mouth === "grin") {
        const t = (x - CX) / 6.5;
        if (Math.abs(t) <= 1) {
          const curveY = mouthY + 1.1 * (t * t - 0.55); // upward curve
          if (Math.abs(y - curveY) < 0.65) v = Math.max(v, 0.85);
          // teeth: light gap just above the smile line
          if (mouth === "grin" && Math.abs(y - (curveY - 1)) < 0.55 && Math.abs(t) < 0.75)
            v = Math.max(v, 0.3);
        }
      } else {
        const open = { m1: 1.1, m2: 2.0, m3: 3.0 }[mouth];
        v = Math.max(v, 0.9 * ellipse(x, y, CX, mouthY, 4.6, open));
      }

      // --- neck
      if (y > HEAD_CY + HEAD_RY - 1 && y < HEAD_CY + HEAD_RY + 5 && Math.abs(x - CX) < 4.5)
        v = Math.max(v, 0.18 + 0.05 * hash(x, y));

      // --- shoulders + dark quarter-zip with open V collar
      const shoulderTop = HEAD_CY + HEAD_RY + 3.5 - 0.004 * Math.pow(Math.abs(x - CX), 2.1);
      if (y > shoulderTop) {
        const vEdge = Math.abs(x - CX) - 0.55 * (y - shoulderTop + 1);
        if (vEdge >= 0) v = Math.max(v, 0.72 + 0.15 * hash(x, y)); // dark fleece
        else if ((x + y) % 5 < 1) v = Math.max(v, 0.4); // faint plaid in the V
        if (Math.abs(vEdge) < 0.45) v = Math.max(v, 0.9); // collar edge
      }

      const idx = Math.min(RAMP.length - 1, Math.floor(v * (RAMP.length - 1) + 0.001));
      row += RAMP[idx];
    }
    rows.push(row);
  }
  return rows;
}

const frames = {
  cols: COLS,
  rows: ROWS,
  ramp: RAMP,
  placeholder: true,
  neutral: renderFace({ eyesOpen: true, mouth: "smile" }),
  neutral2: renderFace({ eyesOpen: true, mouth: "grin" }),
  blink: renderFace({ eyesOpen: false, mouth: "smile" }),
  smile: renderFace({ eyesOpen: true, mouth: "grin" }),
  mouth: [
    renderFace({ eyesOpen: true, mouth: "smile" }),
    renderFace({ eyesOpen: true, mouth: "m1" }),
    renderFace({ eyesOpen: true, mouth: "m2" }),
    renderFace({ eyesOpen: true, mouth: "m3" }),
  ],
};

const out = `// Generated by scripts/make-placeholder-frames.mjs — do not hand-edit.
// Replace by running scripts/make-frames.mjs on a real photo/video.
export const FRAMES = ${JSON.stringify(frames)};
`;

writeFileSync(join(here, "..", "talk", "frames.js"), out);
console.log(`Wrote talk/frames.js (${COLS}x${ROWS}, portrait placeholder)`);
