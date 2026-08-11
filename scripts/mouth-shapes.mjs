// Shared ASCII mouth-viseme carving. Used by make-frames-from-art.mjs and
// regen-mouth.mjs. Shapes are lip-curve openings (width × height × roundness),
// not a single ellipse that scales open/closed.

export const OUT_RAMP = " .:-=+*#%@";

// Feature coords in the downsampled portrait (same as CONFIG.mouth / eyes).
export const MOUTH = { cx: 49, cy: 52, rx: 8 };

// index 0 is closed (caller leaves the base portrait alone).
// Client maps spectral cues → these indices (see talk/talk.js).
export const MOUTH_SHAPES = [
  null,
  { rx: 5.2, open: 0.7, teeth: false, round: 0.15 }, // slight — consonants / rest
  { rx: 9.8, open: 1.05, teeth: true, round: 0.05 }, // ee — wide, barely open
  { rx: 7.2, open: 2.15, teeth: true, round: 0.35 }, // ah — medium open
  { rx: 4.6, open: 2.35, teeth: false, round: 0.95 }, // oh — round
  { rx: 8.2, open: 3.2, teeth: false, round: 0.4 }, // wide open
];

export function clone(g) {
  return g.map((r) => [...r]);
}

export function charsToInk(rows, ramp = OUT_RAMP) {
  const idx = new Map([...ramp].map((c, i) => [c, i / (ramp.length - 1)]));
  return rows.map((row) => [...row].map((c) => idx.get(c) ?? 0));
}

export function inkToChars(g, ramp = OUT_RAMP) {
  return g.map((row) =>
    row
      .map((v) => ramp[Math.min(ramp.length - 1, Math.floor(v * (ramp.length - 1) + 0.001))])
      .join(""),
  );
}

// Draw upper/lower lip curves and fill the cavity between them.
export function makeMouthShape(g, { rx, open, teeth = false, round = 0.25 }, mouth = MOUTH) {
  const out = clone(g);
  const { cx, cy } = mouth;
  const halfOpen = open;
  const yPad = Math.ceil(halfOpen + 2);
  const xPad = Math.ceil(rx + 2);

  for (let y = cy - yPad; y <= cy + yPad; y++) {
    if (!out[y]) continue;
    for (let x = cx - xPad; x <= cx + xPad; x++) {
      if (out[y][x] === undefined) continue;
      const t = (x - cx) / rx;
      if (Math.abs(t) > 1.15) continue;
      // Flatten near corners so the opening pinches shut (lip corners).
      const pinch = Math.max(0, 1 - Math.abs(t) ** (2.2 - round));
      // Slight smile bow: corners sit a touch higher than center.
      const bow = 0.55 * t * t;
      const upper = cy - halfOpen * 0.42 * pinch + bow;
      const lower = cy + halfOpen * 0.78 * pinch + bow * 0.35;
      if (y > upper + 0.35 && y < lower - 0.35) {
        const rel = (y - upper) / Math.max(0.001, lower - upper);
        out[y][x] = teeth && rel < 0.34 ? 0.26 : 0.9;
      } else if (Math.abs(y - upper) <= 0.7 || Math.abs(y - lower) <= 0.7) {
        out[y][x] = Math.max(out[y][x], 0.62); // lip rim
      }
    }
  }
  return out;
}

export function buildMouthFrames(baseGrid, mouth = MOUTH) {
  return MOUTH_SHAPES.map((s) => (s ? makeMouthShape(baseGrid, s, mouth) : clone(baseGrid)));
}
