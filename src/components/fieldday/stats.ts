import { CHARACTERS } from '~/game/sim/constants';
import { TRAIT_HP } from '~/game/sim/traits';

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

/** Max health with signature traits (offline): 85 -> 2, 100 -> 3, 110 -> 4, 115 -> 5 (R-026 section 11.3). */
export const healthPips = (hp: number) => steps(hp, [80, 95, 105, 112]);

export interface FighterStats {
  health: number;
  speed: number;
  jump: number;
  weight: number;
  /** Total jumps (ground jump plus air jumps), for "2x JUMP". */
  jumps: number;
}

export const statsOf = (id: CharacterId): FighterStats => {
  const c = CHARACTERS[id];
  return {
    health: healthPips(TRAIT_HP[id]),
    speed: speedPips(c.speed),
    jump: jumpPips(c.jump, c.airJumps),
    weight: weightPips(c.weight),
    jumps: c.airJumps + 1,
  };
};

/** The two stat chips of the home card, speed and jumps, derived from the real stats. The third chip is the trait (`fighterView().trait`). */
export const traitsOf = (id: CharacterId): { text: string; tone: 'sky' | 'teal' | 'sun' }[] => {
  const c = CHARACTERS[id];
  return [
    { text: c.speed >= 9.3 ? 'FAST' : c.speed <= 8 ? 'SLOW' : 'MID SPEED', tone: 'sky' },
    { text: `${c.airJumps + 1}× JUMP`, tone: 'teal' },
  ];
};
