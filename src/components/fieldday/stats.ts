import { CHARACTERS } from '~/game/sim/constants';

import type { CharacterId } from '~/game/sim/types';

/**
 * Fighter stats as 1-5 pips and trait chips (spec 3, b03 note). Thresholds are chosen so the four current fighters map to the
 * CD's table (speed 7.6/9.0/9.4/10.6 -> 1/3/4/5, jump incl. air jumps -> 2/3/4/5, weight 0.8/0.92/1.0/1.38 -> 1/2/3/5).
 * When the roster changes (R-022) only the stats in constants.ts change; this stays.
 */
const steps = (v: number, edges: readonly number[]) => 1 + edges.filter((e) => v >= e).length;

export const speedPips = (speed: number) => steps(speed, [8, 8.8, 9.3, 10.4]);
/** Jump height plus a bonus per extra air jump (a third jump is worth ~2 m/s of launch). */
export const jumpPips = (jump: number, airJumps: number) => steps(jump + (airJumps - 1) * 2, [15, 16, 16.4, 18.5]);
/** Heavier = more pips (hard to shove). */
export const weightPips = (weight: number) => steps(weight, [0.85, 0.95, 1.1, 1.3]);

export interface FighterStats {
  speed: number;
  jump: number;
  weight: number;
  /** Total jumps (ground jump plus air jumps), for "2x JUMP". */
  jumps: number;
}

export const statsOf = (id: CharacterId): FighterStats => {
  const c = CHARACTERS[id];
  return {
    speed: speedPips(c.speed),
    jump: jumpPips(c.jump, c.airJumps),
    weight: weightPips(c.weight),
    jumps: c.airJumps + 1,
  };
};

/** The three trait chips of the home card: speed, jumps, weight, derived from the real stats (same cut-offs as the old nameplate). */
export const traitsOf = (id: CharacterId): { text: string; tone: 'sky' | 'teal' | 'sun' }[] => {
  const c = CHARACTERS[id];
  return [
    { text: c.speed >= 9.3 ? 'FAST' : c.speed <= 8 ? 'SLOW' : 'MID SPEED', tone: 'sky' },
    { text: `${c.airJumps + 1}× JUMP`, tone: 'teal' },
    { text: c.weight >= 1.2 ? 'HEAVY' : c.weight <= 0.85 ? 'LIGHT' : 'MID WEIGHT', tone: 'sun' },
  ];
};
