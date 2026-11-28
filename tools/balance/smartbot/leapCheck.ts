/**
 * BRIX Leapfrog use per match (smart-bot.md 2.10a, target >= 1.0 per BRIX match at normal):
 *   npx tsx tools/balance/smartbot/leapCheck.ts [level] [rival spec] [matches] [arena]
 * Counts the leap set-ups the bot chose, the leap runs it started and the Leapfrog trait events.
 */
import { createBot } from '../../../src/game/sim/bot';
import { OFFLINE_COUNTDOWN_SECONDS } from '../../../src/game/sim/constants';
import { createGame, step } from '../../../src/game/sim/step';
import { brain } from './brains';

import type { BotLevel } from '../../../src/game/sim/bot';
import type { ArenaId } from '../../../src/game/sim/constants';
import type { CharacterId } from '../../../src/game/sim/types';

const [level = 'normal', rival = 'masher', n = '60', arena = 'offsite'] = process.argv.slice(2);
const ROSTER: CharacterId[] = ['hotfix', 'legacy', 'standup', 'intern'];
let setups = 0;
let runs = 0;
let jumpsNear = 0;
let leaps = 0;
let secs = 0;
for (let k = 0; k < +n; k++) {
  const s = createGame(['hotfix', ROSTER[k % 4]], 7000 + k, false, undefined, { arena: arena as ArenaId, countdownSeconds: OFFLINE_COUNTDOWN_SECONDS, traits: true });
  const b = createBot(0, k * 31 + 5, level as BotLevel);
  const r = brain(rival, 1, k * 17 + 3);
  let prev: string | null = null;
  let wasLeaping = false;
  while (s.phase !== 'over' && s.tick < 12000) {
    step(s, [b(s), r(s)]);
    const g = b.view().goal;
    if (g === 'leap' && prev !== 'leap') setups++;
    prev = g;
    const v = b.view();
    if (v.leaping && !wasLeaping) runs++;
    wasLeaping = v.leaping;
    for (const e of s.events) if (e.type === 'trait' && e.trait === 'leapfrog' && e.fighter === 0) leaps++;
  }
  secs += s.tick / 60;
}
console.log(`BRIX ${level} vs ${rival} on ${arena}, ${n} matches: leap set-ups ${(setups / +n).toFixed(2)}, runs ${(runs / +n).toFixed(2)}, Leapfrogs ${(leaps / +n).toFixed(2)} per match (mean match ${(secs / +n).toFixed(0)} s)`);
