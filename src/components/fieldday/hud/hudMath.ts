import { PHYS, PUSH, RULES } from '~/game/sim/constants';

import type { WeaponName } from '../Icon';
import type { GunKind } from '~/game/sim/types';

/**
 * Pure helpers for the Field Day HUD (b06, b07): kept out of the components so the rules are unit-tested.
 */

/** HP per health segment, and the bar's px per HP (R-026 spec 11.4: 2.52 px per HP, so 115 HP is 290 px and 100 HP is 252 px). */
export const SEG_HP = 20;
export const HP_PX = 2.52;

/** The bar's length in design px: it shows max HP, so a point of damage takes the same width off every fighter. */
export const barWidth = (maxHp: number) => Math.round(maxHp * HP_PX);

/** HP in each segment, from the left: 20 each and a partial last one (85 -> 20, 20, 20, 20, 5). */
export const segmentSizes = (maxHp: number): number[] => {
  const n = Math.min(12, Math.max(1, Math.ceil(maxHp / SEG_HP)));
  return Array.from({ length: n }, (_, i) => Math.max(1, Math.min(SEG_HP, maxHp - i * SEG_HP)));
};

/** The fill (0..1) of each health segment, from the left. */
export const healthSegments = (hp: number, maxHp: number): number[] =>
  segmentSizes(maxHp).map((size, i) => Math.min(1, Math.max(0, (hp - i * SEG_HP) / size)));

/** m:ss from seconds (rounds up, never negative). */
export const clock = (seconds: number): string => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Seconds a cooldown still has to go, from the 0..1 "ready" value the HUD gets. */
export const dashLeft = (ready: number) => Math.ceil(Math.max(0, 1 - ready) * PHYS.dashCooldown);
export const pushLeft = (ready: number) => Math.ceil(Math.max(0, 1 - ready) * PUSH.cooldown);

/** Respawn ring: the share of the arc still drawn (it drains over the respawn time). */
export const respawnFraction = (left: number) => Math.min(1, Math.max(0, left / RULES.respawnSeconds));

/** The word for a gun in the KO line and chips ("got you with a ROCKET"). */
export const GUN_NOUN: Record<GunKind, string> = {
  pistol: 'PISTOL',
  smg: 'SMG',
  uzi: 'UZI',
  shotgun: 'SHOTGUN',
  railgun: 'SNIPER RAIL',
  launcher: 'ROCKET',
  bomb: 'BOMB',
};

/** Which silhouette stands for a gun (the sticker set has four; the rest use the nearest shape). Bombs have none. */
export const GUN_ICON: Record<GunKind, WeaponName | null> = {
  pistol: 'pistol',
  smg: 'smg',
  uzi: 'smg',
  shotgun: 'shotgun',
  railgun: 'shotgun',
  launcher: 'rocket',
  bomb: null,
};

/** The weapon chip text: name and the rounds in the gun (infinite reserve shows the infinity sign, no count). */
export const ammoText = (mag: number, reserve: number): { main: string; reserve: string | null } =>
  reserve === Infinity ? { main: '∞', reserve: null } : { main: String(mag), reserve: `+${reserve}` };

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Do two boxes touch, or come closer than `gap` px? The corner pills (AIM / SHAKE, plain CSS px) against the bottom key strip
 * and hint (design px, scaled by the stage): at small windows (CrazyGames QA 821x462 and 800x450) the scaled strip reaches the
 * corner and the pills covered its last key (release QA 2026-11-28 item 1). Empty boxes (display none) never clash.
 */
export const boxesClash = (a: Rect, b: Rect, gap = 0): boolean => {
  const empty = (r: Rect) => r.right <= r.left || r.bottom <= r.top;
  if (empty(a) || empty(b)) return false;
  return a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;
};

export type CornerLayout = 'row' | 'stack' | 'hidden';

/**
 * The AIM / SHAKE corner group (R-030 3 / F-072): a row when the row is clear of the key strip and hint; else a right-aligned
 * column (AIM on top) when the column is clear; hidden only when the column clashes too (or the layout cannot stack: touch, 2P).
 */
export const cornerLayout = (rowClash: boolean, stackClash: boolean, canStack: boolean): CornerLayout =>
  !rowClash ? 'row' : canStack && !stackClash ? 'stack' : 'hidden';
