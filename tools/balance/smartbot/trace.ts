/** Debug trace of one bot vs a statue rival: npx tsx tools/balance/smartbot/trace.ts <arena> <botChar> <level> <seed> <bx> <by> <rx> <ry> [ticks] */
import { createBot } from '../../../src/game/sim/bot';
import { createGame, step } from '../../../src/game/sim/step';
import { EMPTY_INPUT } from '../../../src/game/sim/types';

import type { BotLevel } from '../../../src/game/sim/bot';
import type { ArenaId } from '../../../src/game/sim/constants';
import type { CharacterId } from '../../../src/game/sim/types';

const [arena, ch, level, seed, bx, by, rx, ry, ticks] = process.argv.slice(2);
const s = createGame([ch as CharacterId, 'hotfix'], 3, false, undefined, { arena: arena as ArenaId });
s.phase = 'fight';
s.phaseTime = 999;
Object.assign(s.fighters[0], { x: +bx, y: +by });
Object.assign(s.fighters[1], { x: +rx, y: +ry });
const bot = createBot(0, +seed, level as BotLevel);
for (let t = 0; t < +(ticks ?? 480); t++) {
  Object.assign(s.fighters[1], { x: +rx, y: +ry, vx: 0, vy: 0, hp: 1000 });
  s.fighters[0].hp = 1000;
  if (process.env.NOPICK) for (const p of s.pickups) Object.assign(p, { active: false, respawn: 999 });
  const o = bot(s);
  step(s, [o, EMPTY_INPUT]);
  const f = s.fighters[0];
  const v = bot.view();
  if (t % +(process.env.EVERY ?? 15) === 0) console.log(t, f.x.toFixed(2), f.y.toFixed(2), f.weapon.kind, v.goal, v.goalX.toFixed(1), v.goalY, o.left ? 'L' : o.right ? 'R' : '-', o.up ? 'U' : '', o.fire ? 'F' : '', o.crouch ? 'C' : '');
}
