import { ATTACKS, CHARACTERS } from './constants';
import { EMPTY_INPUT } from './types';

import type { GameState, InputState } from './types';

/** Small seeded PRNG so a bot is deterministic for a given seed. */
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Press = 'up' | 'dash' | 'attack' | 'grab' | 'push' | 'down';

/**
 * A simple opponent for the single-player prototype. It re-thinks every few ticks
 * (a human-like reaction delay) and taps buttons rather than holding them.
 */
export const createBot = (myId: number, seed = 42, reactionTicks = 7) => {
  const rand = mulberry32(seed);
  let plan: { move: -1 | 0 | 1; presses: Press[]; holdDown: boolean } = { move: 0, presses: [], holdDown: false };
  let last: InputState = { ...EMPTY_INPUT };

  type Plan = typeof plan;
  const think = (state: GameState): Plan => {
    const me = state.fighters[myId];
    const foe = state.fighters.find((f) => f.id !== myId)!;
    const c = CHARACTERS[me.character];
    const presses: Press[] = [];
    let move: -1 | 0 | 1 = 0;

    if (state.phase !== 'fight' || me.respawn > 0) return { move, presses, holdDown: false };

    const held = me.held !== null ? state.items[me.held] : null;
    const dx = foe.x - me.x;
    const dy = foe.y - me.y;
    const dist = Math.abs(dx);
    const toFoe = (dx < 0 ? -1 : 1) as -1 | 1;

    // No weapon and one lies close: go and get it.
    if (!held) {
      const free = state.items
        .filter((i) => i.active && i.holder === null && i.thrownBy === null)
        .sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x))[0];
      if (free && Math.abs(free.x - me.x) < 6 && (dist > 3 || foe.respawn > 0)) {
        const ix = free.x - me.x;
        if (Math.abs(ix) < c.width / 2 + 0.8 && free.y - me.y > -0.5 && free.y - me.y < c.height) presses.push('grab');
        else move = ix < 0 ? -1 : 1;
        if (free.y > me.y + 0.8 && rand() < 0.5) presses.push('up');
        if (free.y < me.y - 0.5 && me.onGround) presses.push('down');
        return { move, presses, holdDown: false };
      }
    }

    if (foe.respawn > 0) return { move: (-me.x > 0 ? 1 : -1) as -1 | 1, presses, holdDown: false };

    // Coffee is best thrown from range.
    if (held?.kind === 'mug' && dist > 3 && dist < 10 && Math.abs(dy) < 1.5 && me.facing === toFoe) {
      presses.push('grab');
      return { move: toFoe, presses, holdDown: false };
    }

    const kind = held?.kind === 'keyboard' ? 'sweep' : held?.kind === 'monitor' ? 'bash' : held?.kind === 'mug' ? 'splash' : 'jab';
    const range = ATTACKS[kind].reach * c.reach + c.width / 2 + 0.3;

    if (dist < 2.2 && me.pushCooldown <= 0 && Math.abs(dy) < 1 && rand() < 0.35) {
      if (me.facing !== toFoe) move = toFoe;
      else presses.push('push');
    } else if (dist < range && Math.abs(dy) < 1.4) {
      if (me.facing !== toFoe) move = toFoe;
      else if (rand() < 0.8) presses.push('attack');
      if (foe.attack && held?.kind === 'monitor' && rand() < 0.5) return { move: 0, presses: [], holdDown: true };
    } else {
      move = toFoe;
      if (dist > 5 && rand() < 0.2) presses.push('dash');
    }

    if (dy > 1 && rand() < 0.6) presses.push('up');
    if (dy < -1 && me.onGround && me.y > 0.1) presses.push('down');
    if (me.wall !== 0 && rand() < 0.5) presses.push('up');
    if (rand() < 0.04) presses.push('up');
    return { move, presses, holdDown: false };
  };

  return (state: GameState): InputState => {
    if (state.tick % reactionTicks === 0) plan = think(state);
    const out: InputState = {
      ...EMPTY_INPUT,
      left: plan.move < 0,
      right: plan.move > 0,
      down: plan.holdDown,
    };
    // Tap: press on one tick, release on the next, so the sim sees an edge.
    for (const p of plan.presses) out[p] = !last[p];
    last = out;
    return out;
  };
};
