import { PHYS, PUSH, RULES } from '~/game/sim/constants';

import type { WeaponName } from '../Icon';
import type { GunKind } from '~/game/sim/types';

/**
 * Pure helpers for the Field Day HUD (b06, b07): kept out of the components so the rules are unit-tested.
 */

/** HP per health segment (spec b06: 5 segments, 20 HP each). */
export const SEG_HP = 20;

/** The fill (0..1) of each health segment, from the left. A character with more or less than 100 HP gets more or fewer segments. */
export const healthSegments = (hp: number, maxHp: number): number[] => {
  const n = Math.min(8, Math.max(1, Math.round(maxHp / SEG_HP)));
  const per = maxHp / n;
  return Array.from({ length: n }, (_, i) => Math.min(1, Math.max(0, (hp - i * per) / per)));
};

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
