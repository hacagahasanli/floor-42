// Test helper: can this fighter get from one platform to another with the real physics (step.ts), no wall-kicks?
// Every take-off point on the source in 0.25 m steps, both directions and standing, a standing or running start,
// every air-jump tick and the tick the direction is released. Returns the cheapest jump count that lands on the target.
import { arenaOf, CHARACTERS } from './constants';
import { createGame, step } from './step';
import { EMPTY_INPUT } from './types';

import type { ArenaId, Platform } from './constants';
import type { CharacterId, InputState } from './types';

export type Surface = Platform | 'floor';

const topOf = (arena: ArenaId, s: Surface) => (s === 'floor' ? arenaOf({ arena }).floor : s.y);

export interface Hop {
  /** Air jumps used: 0 = a single jump. */
  airJumps: number;
  x: number;
  dir: -1 | 0 | 1;
}

/** Runs one scripted hop. Returns true when the fighter ends up standing on `to`. */
const hop = (arena: ArenaId, character: CharacterId, from: Surface, to: Platform, x: number, dir: -1 | 0 | 1, preRun: number, airTick: number, holdTicks: number) => {
  const state = createGame([character, 'hotfix'], 1, false, undefined, { arena });
  state.phase = 'fight';
  state.phaseTime = 999;
  state.fighters[1].respawn = 1e9;
  const f = state.fighters[0];
  const halfW = CHARACTERS[character].width / 2;
  f.x = x;
  f.y = topOf(arena, from);
  f.vx = f.vy = 0;
  f.onGround = true;
  f.prev = { ...EMPTY_INPUT };
  const total = preRun + 150;
  for (let t = 0; t < total; t++) {
    const k = t - preRun;
    const input: InputState = { ...EMPTY_INPUT };
    const moving = dir !== 0 && (k < holdTicks || holdTicks < 0);
    if (dir !== 0 && (k < 0 || moving)) {
      input.left = dir < 0;
      input.right = dir > 0;
    }
    input.up = k === 0 || (airTick >= 0 && k === airTick);
    input.aimX = f.x + f.facing * 5;
    input.aimY = f.y + 1;
    step(state, [input, EMPTY_INPUT]);
    if (k > 3 && f.onGround && Math.abs(f.y - to.y) < 1e-6 && f.x + halfW * 0.5 >= to.x0 && f.x - halfW * 0.5 <= to.x1) return true;
    if (k > 3 && f.onGround && f.y < to.y - 1e-6 && k > 100) return false;
  }
  return false;
};

/** The cheapest scripted route from `from` to `to`, or null when none of the tried hops lands on the target. */
export const findHop = (arena: ArenaId, character: CharacterId, from: Surface, to: Platform, maxAir = 2): Hop | null => {
  const a = arenaOf({ arena });
  const halfW = CHARACTERS[character].width / 2;
  const x0 = from === 'floor' ? Math.max(a.left + halfW, to.x0 - 9) : from.x0 + 0.05;
  const x1 = from === 'floor' ? Math.min(a.right - halfW, to.x1 + 9) : from.x1 - 0.05;
  for (let air = 0; air <= maxAir; air++) {
    const ticks = air === 0 ? [-1] : [];
    if (air > 0) for (let k = 4; k <= 70; k += 3) ticks.push(k);
    for (const airTick of ticks) {
      for (const dir of [0, 1, -1] as const) {
        for (const preRun of dir === 0 ? [0] : [0, 14]) {
          for (const hold of dir === 0 ? [0] : [-1, 14, 26, 40]) {
            for (let x = x0; x <= x1 + 1e-9; x += 0.25) {
              if (hop(arena, character, from, to, x, dir, preRun, airTick, hold)) return { airJumps: air, x, dir };
            }
          }
        }
      }
    }
  }
  return null;
};
