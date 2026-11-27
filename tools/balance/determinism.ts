/**
 * Determinism and no-op checks for the trait patch.
 *   npx tsx tools/balance/determinism.ts
 * 1. Traits OFF: the patched sim is bit-identical to the real sim (same final hash every match), so the
 *    hooks change nothing for anyone without a trait, online included.
 * 2. Traits ON: the same seed gives the same final hash twice (no hidden state, no wall clock).
 * 3. Traits ON survive a JSON snapshot round-trip mid-match (what the server sends): resume == straight run.
 */
import { createBot } from '../../src/game/sim/bot';
import { OFFLINE_COUNTDOWN_SECONDS } from '../../src/game/sim/constants';
import * as patched from './.gen/step';
import { hashState, ROSTER, runMatch } from './match';
import { buildPatchedStep } from './patchStep';
import { DEFAULT_TRAITS, TRAITS } from './traits';

import type { BotLevel } from '../../src/game/sim/bot';
import type { CharacterId, GameState } from '../../src/game/sim/types';

buildPatchedStep();
let fail = 0;
let n = 0;
const levels: BotLevel[] = ['easy', 'normal', 'hard'];
for (const level of levels)
  for (const a of ROSTER)
    for (const b of ROSTER)
      for (const seed of [11, 222, 3333]) {
        for (const arena of ['offsite', 'office'] as const) {
          const base = { chars: [a, b] as [CharacterId, CharacterId], seed, level, arena };
          const r = runMatch({ ...base, sim: 'real' });
          const p = runMatch({ ...base, sim: 'patched' });
          const t1 = runMatch({ ...base, sim: 'patched', traits: DEFAULT_TRAITS, leapBot: true });
          const t2 = runMatch({ ...base, sim: 'patched', traits: DEFAULT_TRAITS, leapBot: true });
          n++;
          if (r.hash !== p.hash) (fail++, console.log('OFF != real', base));
          if (t1.hash !== t2.hash) (fail++, console.log('ON not repeatable', base));
        }
      }

// Snapshot round-trip: run 1500 ticks, JSON clone (as the wire does), continue; compare with a straight run.
const play = (s: GameState, bots: ((s: GameState) => ReturnType<ReturnType<typeof createBot>>)[], ticks: number) => {
  for (let i = 0; i < ticks && s.phase !== 'over'; i++) patched.step(s, [bots[0](s), bots[1](s)]);
};
for (const [a, b] of [['hotfix', 'standup'], ['legacy', 'intern']] as [CharacterId, CharacterId][]) {
  TRAITS.cfg = DEFAULT_TRAITS;
  const mk = () => patched.createGame([a, b], 77, true);
  const botsA = [createBot(0, 5, 'hard'), createBot(1, 6, 'hard')];
  const botsB = [createBot(0, 5, 'hard'), createBot(1, 6, 'hard')];
  const s1 = mk();
  play(s1, botsA, 3000);
  const s2 = mk();
  play(s2, botsB, 1500);
  const s3 = JSON.parse(JSON.stringify(s2)) as GameState;
  // JSON turns the pistol's Infinity reserve into null: restore it the way the client decoder must.
  for (const f of s3.fighters) if (f.weapon.reserve === null) f.weapon.reserve = Infinity;
  play(s3, botsB, 1500);
  n++;
  if (hashState(s1) !== hashState(s3)) (fail++, console.log('snapshot round-trip diverged', a, b));
}
void OFFLINE_COUNTDOWN_SECONDS;
console.log(`${n} checks, ${fail} failures`);
process.exit(fail ? 1 : 0);
