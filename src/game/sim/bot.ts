import { CHARACTERS } from './constants';
import { EMPTY_INPUT } from './types';

import type { GameState, GunKind, InputState } from './types';

/** Small seeded PRNG so a bot is deterministic for a given seed. */
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export type BotLevel = 'easy' | 'normal' | 'hard';

const LEVELS: Record<BotLevel, { reaction: number; aimError: number; trigger: number; dodge: number }> = {
  easy: { reaction: 16, aimError: 0.22, trigger: 0.45, dodge: 0.05 },
  normal: { reaction: 10, aimError: 0.12, trigger: 0.7, dodge: 0.15 },
  hard: { reaction: 6, aimError: 0.05, trigger: 0.9, dodge: 0.3 },
};

/** Preferred distance to the target for each gun. */
const RANGE: Record<GunKind, [number, number]> = {
  pistol: [8, 15],
  smg: [6, 11],
  shotgun: [2.5, 5],
  railgun: [12, 24],
  launcher: [9, 16],
};

type Press = 'up' | 'down' | 'dash' | 'pickup' | 'push' | 'reload';

interface Plan {
  move: -1 | 0 | 1;
  presses: Press[];
  fire: boolean;
  aimErr: number;
}

/**
 * Single-player opponent. It re-thinks every few ticks (a human-like reaction
 * delay), aims at your chest with an error that depends on the level, and keeps
 * the distance its gun likes.
 */
export const createBot = (myId: number, seed = 42, level: BotLevel = 'normal') => {
  const rand = mulberry32(seed);
  const cfg = LEVELS[level];
  let plan: Plan = { move: 0, presses: [], fire: false, aimErr: 0 };
  let last: InputState = { ...EMPTY_INPUT };

  const think = (state: GameState): Plan => {
    const me = state.fighters[myId];
    const foe = state.fighters.find((f) => f.id !== myId)!;
    const presses: Press[] = [];
    let move: -1 | 0 | 1 = 0;
    const aimErr = (rand() - 0.5) * 2 * cfg.aimError;
    if (state.phase !== 'fight' || me.respawn > 0) return { move, presses, fire: false, aimErr };

    const dx = foe.x - me.x;
    const dy = foe.y - me.y;
    const dist = Math.abs(dx);
    const toFoe = (dx < 0 ? -1 : 1) as -1 | 1;

    // Only a pistol: a better gun nearby is worth a detour.
    if (me.weapon.kind === 'pistol') {
      const gun = state.pickups
        .filter((p) => p.active && Math.abs(p.y - me.y) < 3.5)
        .sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x))[0];
      if (gun && Math.abs(gun.x - me.x) < 9) {
        move = gun.x < me.x ? -1 : 1;
        if (gun.y > me.y + 0.8 && rand() < 0.6) presses.push('up');
        if (gun.y < me.y - 0.5 && me.onGround) presses.push('down');
        return { move, presses, fire: foe.respawn <= 0 && rand() < cfg.trigger, aimErr };
      }
    }

    if (foe.respawn > 0) {
      if (me.weapon.mag < 3) presses.push('reload');
      return { move: (me.x < 0 ? 1 : -1) as -1 | 1, presses, fire: false, aimErr };
    }

    // Keep the distance the gun likes: back off when they close in, drift in when too far,
    // otherwise hold position and strafe a little. Wounded bots play even further back.
    const [near, far] = RANGE[me.weapon.kind];
    const wounded = me.hp <= 50 ? 3 : 0;
    if (dist < near + wounded) {
      move = (-toFoe) as -1 | 1;
      if (me.wall !== 0 || Math.abs(me.x) > 16) presses.push('up'); // cornered: get over them
    } else if (dist > far + wounded) {
      move = rand() < 0.7 ? toFoe : 0;
    } else {
      const r = rand();
      move = r < 0.25 ? -1 : r < 0.5 ? 1 : 0;
    }

    if (dist < 2.4 && me.pushCooldown <= 0 && Math.abs(dy) < 1.2 && rand() < 0.5) presses.push('push');
    if (foe.firing < 0.2 && me.dashCooldown <= 0 && rand() < cfg.dodge) presses.push('dash');
    if (dy > 1.2 && rand() < 0.6) presses.push('up');
    if (dy < -1.2 && me.onGround && me.y > 0.1 && rand() < 0.6) presses.push('down');
    if (me.wall !== 0 && rand() < 0.5) presses.push('up');
    if (rand() < 0.06) presses.push('up');

    return { move, presses, fire: rand() < cfg.trigger, aimErr };
  };

  return (state: GameState): InputState => {
    if (state.tick % cfg.reaction === 0) plan = think(state);
    const me = state.fighters[myId];
    const foe = state.fighters.find((f) => f.id !== myId)!;
    const fc = CHARACTERS[foe.character];
    // Track the target every tick; the error is fixed per decision, like a shaky hand.
    const tx = foe.x;
    const ty = foe.y + fc.height * 0.55;
    const d = Math.hypot(tx - me.x, ty - me.y);
    const out: InputState = {
      ...EMPTY_INPUT,
      left: plan.move < 0,
      right: plan.move > 0,
      fire: plan.fire,
      aimX: tx,
      aimY: ty + plan.aimErr * d,
    };
    for (const p of plan.presses) out[p] = !last[p];
    last = out;
    return out;
  };
};
