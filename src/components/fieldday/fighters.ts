import { COPY } from '~/game/copy';
import { ROSTER } from '~/game/roster';

import { statsOf, traitsOf } from './stats';

import type { FighterStats } from './stats';
import type { CharacterId } from '~/game/sim/types';

/**
 * Everything a Field Day screen shows about a fighter, from ONE place: name and accent (roster.ts), role (copy.ts, the plain
 * voice: the Field Day screens never show developer copy), pips and trait chips (stats.ts), and the portrait framing.
 * R-022 swaps names, roles and accents in those files; no screen changes.
 */
export interface FighterView {
  id: CharacterId;
  /** Upper case, as shown. */
  name: string;
  accent: string;
  role: string;
  stats: FighterStats;
  traits: ReturnType<typeof traitsOf>;
}

export const fighterView = (id: CharacterId): FighterView => {
  const r = ROSTER.find((e) => e.id === id)!;
  return {
    id,
    name: r.name.toUpperCase(),
    accent: r.accent,
    role: COPY.fighters[id].role.toUpperCase(),
    stats: statsOf(id),
    traits: traitsOf(id),
  };
};

export const FIGHTER_IDS: CharacterId[] = ROSTER.map((r) => r.id);

/** Where the head is in the VS-door portrait render (fractions of the image), per fighter, from the roster data. */
export const HEAD_ANCHOR: Record<CharacterId, { x: number; y: number; w: number; top: number; h: number }> = Object.fromEntries(
  ROSTER.map((r) => [r.id, r.headAnchor]),
) as Record<CharacterId, { x: number; y: number; w: number; top: number; h: number }>;

/** The VS-door portrait render is 360x440 at 1x. */
export const PORTRAIT_ASPECT = 440 / 360;

/**
 * CSS for a portrait crop in a `w` x `h` frame (design px): the head is `fill` of the frame width and its centre lands at
 * (50 %, `ty` of the frame height). Pure, so the framing rule is unit-tested.
 */
export const portraitCrop = (id: CharacterId, w: number, h: number, fill: number, ty: number) => {
  const a = HEAD_ANCHOR[id];
  const imgW = (w * fill) / a.w;
  const imgH = imgW * PORTRAIT_ASPECT;
  return {
    backgroundSize: `${imgW.toFixed(1)}px ${imgH.toFixed(1)}px`,
    backgroundPosition: `${(w * 0.5 - a.x * imgW).toFixed(1)}px ${(h * ty - a.y * imgH).toFixed(1)}px`,
  };
};

/** F-045: the fighter card's paper and the burst behind the head. */
export const CARD_CREAM = '#FFF1DC';
export const CARD_TOP_MARGIN = 0.08;

/**
 * Portrait framing for the select and menu cards (F-045): the highest point of the figure sits `CARD_TOP_MARGIN` of the frame
 * height below the top edge and the head is `headH` of the frame height, the same for all four. Also returns where the head
 * centre lands (px), for the accent burst. Pure, so the framing rule is unit-tested.
 */
export const cardCrop = (id: CharacterId, w: number, h: number, headH: number) => {
  const a = HEAD_ANCHOR[id];
  const imgH = (h * headH) / a.h;
  const imgW = imgH / PORTRAIT_ASPECT;
  const x = w * 0.5 - a.x * imgW;
  const y = h * CARD_TOP_MARGIN - a.top * imgH;
  return {
    backgroundSize: `${imgW.toFixed(1)}px ${imgH.toFixed(1)}px`,
    backgroundPosition: `${x.toFixed(1)}px ${y.toFixed(1)}px`,
    headCentre: { x: w * 0.5, y: y + a.y * imgH },
    headTop: y + a.top * imgH,
    headHeight: a.h * imgH,
  };
};
