/**
 * Determinism + purity + cost check for the bot (src/game/sim/bot.ts):
 * 1. the same seeds give the same match twice (hash of the final state);
 * 2. calling the bot never changes the state (JSON before == after, sampled);
 * 3. cost per call: mean, p99, p99.9 and max microseconds, plus the max over calls that did not overlap a
 *    garbage-collection pause (GC pauses hit any code on the box; they are reported separately).
 *
 *   npx tsx tools/balance/smartbot/detCheck.ts            # traits on, both arenas (offline)
 *   SMART_NOTRAITS=1 npx tsx tools/balance/smartbot/detCheck.ts   # the online case: no traits
 */
import { PerformanceObserver, performance } from 'node:perf_hooks';

import { createBot } from '../../../src/game/sim/bot';
import { OFFLINE_COUNTDOWN_SECONDS } from '../../../src/game/sim/constants';
import { createGame, step } from '../../../src/game/sim/step';
import { hashState } from '../match';

import type { BotLevel } from '../../../src/game/sim/bot';
import type { ArenaId } from '../../../src/game/sim/constants';
import type { CharacterId } from '../../../src/game/sim/types';

const gcs: [number, number][] = [];
new PerformanceObserver((list) => {
  for (const e of list.getEntries()) gcs.push([e.startTime, e.startTime + e.duration]);
}).observe({ entryTypes: ['gc'] });

const ROSTER: CharacterId[] = ['hotfix', 'legacy', 'standup', 'intern'];
const traits = !process.env.SMART_NOTRAITS;
const calls: [number, number][] = [];
const where: string[] = [];
const play = (seed: number, level: BotLevel, arena: ArenaId, measure: boolean) => {
  const s = createGame([ROSTER[seed % 4], ROSTER[(seed + 1) % 4]], seed, false, undefined, { arena, countdownSeconds: OFFLINE_COUNTDOWN_SECONDS, traits });
  const b = [createBot(0, seed * 3, level), createBot(1, seed * 5, level)];
  let impure = 0;
  while (s.phase !== 'over' && s.tick < 12000) {
    const before = measure && s.tick % 97 === 0 ? JSON.stringify(s) : null;
    const t0 = performance.now();
    const i0 = b[0](s);
    const t1 = performance.now();
    if (measure) {
      calls.push([t0, t1]);
      if (t1 - t0 > 0.8 && process.env.WHERE) where.push(`${(t1 - t0).toFixed(2)} ms ${arena} ${level} seed ${seed} tick ${s.tick} ${s.fighters[0].character}`);
    }
    const i1 = b[1](s);
    if (before && JSON.stringify(s) !== before) impure++;
    step(s, [i0, i1]);
  }
  return { hash: hashState(s), impure };
};

const REPEATS = Number(process.env.REPEATS ?? 3);
const best: number[] = [];
let mark = 0;
let mismatch = 0;
let impure = 0;
let n = 0;
for (const arena of ['offsite', 'office'] as ArenaId[])
  for (const level of ['easy', 'normal', 'hard'] as BotLevel[])
    for (let seed = 1; seed <= 8; seed++) {
      const a = play(seed, level, arena, true);
      const b = play(seed, level, arena, false);
      // The same match again, measured: a call's cost without the box's noise is its cheapest run (the match
      // replays exactly, so call k is the same work every time).
      const from = mark;
      for (let r = 1; r < REPEATS; r++) {
        const at = calls.length;
        play(seed, level, arena, true);
        for (let k = 0; k < at - mark; k++) best[mark + k] = Math.min(best[mark + k] ?? Infinity, calls[at + k][1] - calls[at + k][0]);
        calls.length = at;
      }
      for (let k = from; k < calls.length; k++) best[k] = Math.min(best[k] ?? Infinity, calls[k][1] - calls[k][0]);
      mark = calls.length;
      n++;
      if (a.hash !== b.hash) mismatch++;
      impure += a.impure;
    }

// GC entries arrive asynchronously: let the observer flush before reading them.
setTimeout(() => {
  const us = (x: number) => `${(x * 1000).toFixed(0)} us`;
  const dur = calls.map(([a, b]) => b - a).sort((x, y) => x - y);
  const mean = dur.reduce((p, c) => p + c, 0) / dur.length;
  const q = (p: number) => dur[Math.min(dur.length - 1, Math.floor(dur.length * p))];
  gcs.sort((x, y) => x[0] - y[0]);
  let gi = 0;
  let clean = 0;
  let hitGc = 0;
  let over1ms = 0;
  let over1msGc = 0;
  for (const [a, b] of calls) {
    while (gi < gcs.length && gcs[gi][1] < a) gi++;
    const overlaps = gi < gcs.length && gcs[gi][0] <= b;
    if (overlaps) hitGc++;
    else clean = Math.max(clean, b - a);
    if (b - a > 1) {
      over1ms++;
      if (overlaps) over1msGc++;
    }
  }
  if (where.length) console.log(where.join('\n'));
  const bs = [...best].sort((x, y) => x - y);
  const bq = (p: number) => bs[Math.min(bs.length - 1, Math.floor(bs.length * p))];
  console.log(`traits ${traits ? 'on' : 'off'}; replays with a different result: ${mismatch}/${n}; bot calls that changed the state: ${impure}`);
  console.log(`bot call cost over ${dur.length} calls: mean ${us(mean)}, p99 ${us(q(0.99))}, p99.9 ${us(q(0.999))}, max ${us(dur[dur.length - 1])}`);
  console.log(`per call, cheapest of ${REPEATS} identical replays (the work itself): mean ${us(bs.reduce((p, c) => p + c, 0) / bs.length)}, p99 ${us(bq(0.99))}, p99.9 ${us(bq(0.999))}, max ${us(bs[bs.length - 1])}, calls > 1 ms: ${bs.filter((x) => x > 1).length}`);
  console.log(`single run, calls > 1 ms: ${over1ms} (${over1msGc} of them overlapped a GC pause); max without a GC pause: ${us(clean)} (${hitGc} calls overlapped one of ${gcs.length} GC pauses)`);
}, 200);
