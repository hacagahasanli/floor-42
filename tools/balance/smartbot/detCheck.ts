/**
 * Determinism + purity + cost check for the smart bot prototype:
 * 1. the same seeds give the same match twice (hash of the final state);
 * 2. calling the bot never changes the state (JSON before == after, sampled);
 * 3. think cost: mean and worst microseconds per call.
 */
import { OFFLINE_COUNTDOWN_SECONDS } from '../../../src/game/sim/constants';
import { createGame, step } from '../../../src/game/sim/step';
import { hashState } from '../match';
import { createSmartBot } from './smartBot';

import type { BotLevel } from '../../../src/game/sim/bot';
import type { ArenaId } from '../../../src/game/sim/constants';
import type { CharacterId } from '../../../src/game/sim/types';

const ROSTER: CharacterId[] = ['hotfix', 'legacy', 'standup', 'intern'];
const play = (seed: number, level: BotLevel, arena: ArenaId, checkPure: boolean) => {
  const s = createGame([ROSTER[seed % 4], ROSTER[(seed + 1) % 4]], seed, false, undefined, { arena, countdownSeconds: OFFLINE_COUNTDOWN_SECONDS, traits: true });
  const b = [createSmartBot(0, seed * 3, level), createSmartBot(1, seed * 5, level)];
  let impure = 0;
  const times: number[] = [];
  while (s.phase !== 'over' && s.tick < 12000) {
    const before = checkPure && s.tick % 97 === 0 ? JSON.stringify(s) : null;
    const t0 = performance.now();
    const i0 = b[0](s);
    times.push(performance.now() - t0);
    const i1 = b[1](s);
    if (before && JSON.stringify(s) !== before) impure++;
    step(s, [i0, i1]);
  }
  return { hash: hashState(s), impure, times };
};

let mismatch = 0;
let impure = 0;
const all: number[] = [];
for (const arena of ['offsite', 'office'] as ArenaId[])
  for (const level of ['easy', 'normal', 'hard'] as BotLevel[])
    for (let seed = 1; seed <= 8; seed++) {
      const a = play(seed, level, arena, true);
      const b = play(seed, level, arena, false);
      if (a.hash !== b.hash) mismatch++;
      impure += a.impure;
      all.push(...a.times);
    }
all.sort((x, y) => x - y);
const mean = all.reduce((p, c) => p + c, 0) / all.length;
console.log(`replays with a different result: ${mismatch}/48; bot calls that changed the state: ${impure}`);
console.log(`bot call cost: mean ${(mean * 1000).toFixed(1)} us, p99 ${(all[Math.floor(all.length * 0.99)] * 1000).toFixed(0)} us, max ${(all[all.length - 1] * 1000).toFixed(0)} us over ${all.length} calls`);
