/**
 * Time to kill, straight from the gun constants: a small pure model so balance changes show up in tests
 * (balance.test.ts) and in docs/BALANCE.md. It mirrors the rules in step.ts:
 * - damage falls off linearly with the distance travelled (`falloff`), as in updateProjectiles;
 * - spread is a uniform cone of ±spread, so at range only part of the shots (or pellets) meet the body;
 * - a shot vanishes after `life` seconds, so nothing lands beyond speed × life;
 * - the first shot leaves at t = 0, the next ones every `rate` s, and an empty magazine costs a reload;
 * - the last round still has to fly to the target (rockets are slow on purpose).
 * Expected damage per shot is used (hit chance × damage), the usual way to compare guns on paper.
 */
import { CHARACTERS, CROUCH, GUNS, RULES } from './constants';

import type { GunStats } from './constants';
import type { GunKind } from './types';

/** Half the height of a typical fighter (the Intern, 1.7 m): the vertical window a shot must land in. */
export const TARGET_HALF_HEIGHT = CHARACTERS.intern.height / 2;
/** The same fighter crouched (CROUCH.height of the body): aim that follows the crouch has a smaller window. */
export const CROUCHED_HALF_HEIGHT = TARGET_HALF_HEIGHT * CROUCH.height;
/** The ranges the balance table is written for: close, across a room, across the office. */
export const RANGES = [3, 10, 20] as const;

/** Damage multiplier at `distance` metres (1 inside `near`, `min` beyond `far`). */
export const falloffAt = (g: GunStats, distance: number) => {
  const fo = g.falloff;
  if (!fo) return 1;
  return 1 - (1 - fo.min) * Math.min(1, Math.max(0, (distance - fo.near) / (fo.far - fo.near)));
};

/** How far a shot flies before it vanishes. */
export const maxRange = (g: GunStats) => g.speed * g.life;

/** Share of shots (or pellets) that meet a body at `distance`, aimed at its centre. */
export const hitChance = (g: GunStats, distance: number, halfHeight = TARGET_HALF_HEIGHT) =>
  g.spread <= 0 ? 1 : Math.min(1, Math.atan(halfHeight / Math.max(distance, 0.01)) / g.spread);

/** Expected damage of one trigger pull at `distance` (all pellets; a rocket's direct hit). */
export const damagePerShot = (g: GunStats, distance: number, halfHeight = TARGET_HALF_HEIGHT) => {
  if (distance > maxRange(g)) return 0;
  return g.pellets * g.damage * falloffAt(g, distance) * hitChance(g, distance, halfHeight);
};

export interface Ttk {
  /** Trigger pulls to drop a full-health fighter (Infinity when it cannot: out of range or out of ammo). */
  shots: number;
  /** Seconds from the first shot to the KO, flight time and reloads included. */
  seconds: number;
}

/** `halfHeight`: the target's half height (CROUCHED_HALF_HEIGHT for a crouched fighter). */
export const ttk = (kind: GunKind, distance: number, hp = RULES.hp, halfHeight = TARGET_HALF_HEIGHT): Ttk => {
  const g = GUNS[kind];
  const per = damagePerShot(g, distance, halfHeight);
  // A tiny tolerance so exactly 2 × 50 counts as two shots, like hp <= 0 in step.ts.
  const shots = per > 0 ? Math.ceil(hp / per - 1e-9) : Infinity;
  if (!Number.isFinite(shots) || shots > g.mag + g.reserve) return { shots: Infinity, seconds: Infinity };
  const reloads = Math.floor((shots - 1) / g.mag);
  return { shots, seconds: (shots - 1) * g.rate + reloads * g.reloadTime + distance / g.speed };
};

/** Sustained damage per second at full damage, ignoring reloads (the "on paper" number). */
export const dps = (kind: GunKind) => (GUNS[kind].damage * GUNS[kind].pellets) / GUNS[kind].rate;

/** Every gun the floors offer, in table order. The bomb is a thrown pickup, not a gun. */
export const BALANCED_GUNS: GunKind[] = ['pistol', 'smg', 'uzi', 'shotgun', 'railgun', 'launcher'];

/** The whole table: TTK per gun per range. */
export const ttkTable = () =>
  Object.fromEntries(BALANCED_GUNS.map((k) => [k, RANGES.map((r) => ttk(k, r))])) as Record<GunKind, Ttk[]>;

