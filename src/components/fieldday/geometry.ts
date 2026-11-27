/**
 * Pure layout geometry for the Field Day foundation, free of React so it is unit-tested.
 */
export const DESIGN_W = 1280;
export const DESIGN_H = 720;

/** The stage scale for a viewport (spec 2.1: s = min(w/1280, h/720)) and the stage's size in design units. */
export const stageMetrics = (vw: number, vh: number) => {
  const s = Math.min(vw / DESIGN_W, vh / DESIGN_H) || 1;
  return { s, w: vw / s, h: vh / s };
};

/** Pennant spacing along the string, px. 1280 px of string holds 24 pennants (spec 5). */
export const SPACING = 54.5;

/** Pennant positions along a sagging string of `width` px: x of the pennant's top centre and y of the string there. */
export const buntingPennants = (width: number) => {
  const n = Math.max(1, Math.round((width - 40) / SPACING) + 1);
  return Array.from({ length: n }, (_, i) => {
    const x = 20 + i * SPACING;
    const t = x / width;
    return { x, y: 4 + (1 - (2 * t - 1) ** 2) * 25 };
  });
};
