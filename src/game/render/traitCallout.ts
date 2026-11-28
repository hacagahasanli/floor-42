/**
 * The trait callout textures (spec 11.1): a paper pill with a 4 px grape border and drop, a 40 px accent disc with the white trait
 * icon, and the word in Titan One 22 px grape. Drawn once per trait at 2x into canvases (the disc-only form too), so a fire only
 * swaps a pooled sprite's map: nothing is drawn or allocated while playing. Needs Titan One loaded first (`whenFontReady`).
 */
import * as THREE from 'three';

import { ROSTER } from '../roster';

import { TRAIT_NAME } from './traitFx';

import type { TraitId } from '../sim/types';

const GRAPE = '#3B1F6B';
const PAPER = '#FFFBF0';
const SCALE = 2;
const FONT = '400 22px "Titan One", sans-serif';

interface IconPart {
  d: string;
  fill: boolean;
}
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

/** The 24 px sticker icons of traits/icons/*.svg (white fill, grape 2.4 stroke), as path data for a canvas. */
const ICON_PARTS: Record<TraitId, IconPart[]> = {
  leapfrog: [
    { d: circle(12, 15.2, 2.6), fill: true },
    { d: 'M7.6 22v-.8a4.4 4.4 0 0 1 8.8 0v.8z', fill: true },
    { d: 'M3.2 17.5Q11.5 -0.5 20.4 14.2', fill: false },
    { d: 'M20.3 10.2l.1 4-3.6-1.9', fill: false },
  ],
  teaBreak: [
    { d: 'M16 11.2h1.4a2.6 2.6 0 0 1 0 5.2H15.6', fill: false },
    { d: 'M4.6 9.8h11.6v4.6a5.2 5.2 0 0 1-5.2 5.2h-1.2a5.2 5.2 0 0 1-5.2-5.2z', fill: true },
    { d: 'M3 21.6h15', fill: false },
    { d: 'M9 2.6c-1.6 1.4 1.6 2.6 0 4.4M12.8 3.4c-1.3 1.2 1.3 2.1 0 3.6', fill: false },
  ],
  sugarRush: [
    { d: 'M15 3.6l6 3-6 3-6-3z', fill: true },
    { d: 'M9 6.6v7.4l6 3.2V9.6z', fill: true },
    { d: 'M21 6.6v7.4l-6 3.2V9.6z', fill: true },
    { d: 'M1.8 9.4h4.2M1.2 13.4h5M2.6 17.4h5.4', fill: false },
  ],
  packedExtra: [
    { d: 'M9.6 5V2.8h4.8V5', fill: false },
    { d: 'M5.4 9.2a4.2 4.2 0 0 1 4.2-4.2h4.8a4.2 4.2 0 0 1 4.2 4.2v12.4H5.4z', fill: true },
    { d: 'M8.4 13.2h7.2v8.4H8.4z', fill: true },
    { d: 'M12 15v4.4M9.8 17.2h4.4', fill: false },
  ],
};
// Built on first use: Path2D is a browser API, and this module is also loaded by the server render (/play), where it does not exist.
let iconPaths: Record<TraitId, { path: Path2D; fill: boolean }[]> | null = null;
const iconPathsOf = (id: TraitId) => {
  iconPaths ??= Object.fromEntries(
    (Object.keys(ICON_PARTS) as TraitId[]).map((k) => [k, ICON_PARTS[k].map((p) => ({ path: new Path2D(p.d), fill: p.fill }))]),
  ) as never;
  return iconPaths![id];
};

export const accentOfTrait = (id: TraitId) => ROSTER.find((r) => r.traitId === id)?.accent ?? '#888888';

export interface CalloutArt {
  tex: THREE.CanvasTexture;
  /** On-screen size at s = 1 (CSS px). */
  w: number;
  h: number;
}

const roundRect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
};

/** A trait's icon at `size` px with its top-left at x, y (24 px grid). */
const drawIcon = (g: CanvasRenderingContext2D, id: TraitId, x: number, y: number, size: number) => {
  g.save();
  g.translate(x, y);
  g.scale(size / 24, size / 24);
  g.lineWidth = 2.4;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = GRAPE;
  g.fillStyle = '#fff';
  for (const { path, fill } of iconPathsOf(id)) {
    if (fill) g.fill(path);
    g.stroke(path);
  }
  g.restore();
};

const draw = (id: TraitId, word: boolean): { canvas: HTMLCanvasElement; w: number; h: number } => {
  const disc = 40;
  const border = 4;
  const drop = 4;
  const gap = 10;
  const padR = 16;
  const c = document.createElement('canvas');
  const g0 = c.getContext('2d')!;
  g0.font = FONT;
  const label = `${TRAIT_NAME[id]}!`;
  const textW = word ? Math.ceil(g0.measureText(label).width) : 0;
  const inner = word ? disc + 4 + gap + textW + padR : disc + 4;
  const h = disc + 4 + 2 * border + drop;
  const w = inner + 2 * border;
  c.width = Math.ceil(w * SCALE);
  c.height = Math.ceil((h + 2) * SCALE);
  const g = c.getContext('2d')!;
  g.scale(SCALE, SCALE);
  const bodyH = disc + 4 + 2 * border;
  const rr = bodyH / 2;
  // Drop, then paper with the grape border.
  g.fillStyle = GRAPE;
  roundRect(g, 0, drop, w, bodyH, rr);
  g.fill();
  g.fillStyle = PAPER;
  g.strokeStyle = GRAPE;
  g.lineWidth = border;
  roundRect(g, border / 2, border / 2, w - border, bodyH - border, rr - border / 2);
  g.fill();
  g.stroke();
  // The accent disc with a grape ring and the white icon.
  const cx = border + 2 + disc / 2;
  const cy = border / 2 + bodyH / 2;
  g.fillStyle = accentOfTrait(id);
  g.strokeStyle = GRAPE;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cy, disc / 2, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  drawIcon(g, id, cx - 13, cy - 13, 26);
  if (word) {
    g.font = FONT;
    g.fillStyle = GRAPE;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(label, border + 2 + disc + gap, cy + 1);
  }
  return { canvas: c, w, h };
};

/** Resolves once Titan One can be drawn on a canvas (it is a web font); resolves anyway when the font API is missing. */
export const whenFontReady = (): Promise<void> => {
  if (typeof document === 'undefined' || !document.fonts?.load) return Promise.resolve();
  return document.fonts.load(FONT, 'LEAPFROG!').then(
    () => undefined,
    () => undefined,
  );
};

/** All eight textures (4 traits x word / disc). Dispose them with `dispose`. */
export const buildCalloutArt = () => {
  const art = new Map<string, CalloutArt>();
  for (const id of Object.keys(TRAIT_NAME) as TraitId[]) {
    for (const word of [true, false]) {
      const { canvas, w, h } = draw(id, word);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      art.set(`${id}|${word ? 'word' : 'disc'}`, { tex, w, h });
    }
  }
  return { get: (id: TraitId, word: boolean) => art.get(`${id}|${word ? 'word' : 'disc'}`)!, dispose: () => art.forEach((a) => a.tex.dispose()) };
};
