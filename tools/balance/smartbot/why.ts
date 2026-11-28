/** Where does a brain's time go? Share of fight ticks with a shot available, trigger held, weapon reloading, goal kinds. */
import { OFFLINE_COUNTDOWN_SECONDS } from '../../../src/game/sim/constants';
import { createGame, step, visibleAim } from '../../../src/game/sim/step';
import { createBot } from '../../../src/game/sim/bot';
import { createDecent, createMasher, createStrafer } from './players';
import { createSmartBot, DEBUG } from './smartBot';

import type { ArenaId } from '../../../src/game/sim/constants';
import type { CharacterId } from '../../../src/game/sim/types';

const [specA, specB, arena = 'offsite', n = '20'] = process.argv.slice(2);
const ROSTER: CharacterId[] = ['hotfix', 'legacy', 'standup', 'intern'];
const make = (spec: string, id: number, seed: number) => {
  const [k, l] = spec.split(':');
  return k === 'smart' ? createSmartBot(id, seed, l as never) : k === 'bot' ? createBot(id, seed, l as never) : k === 'masher' ? createMasher(id, seed) : k === 'strafer' ? createStrafer(id, seed) : createDecent(id, seed);
};
const acc = [0, 1].map(() => ({ alive: 0, vis: 0, fire: 0, firedVis: 0, reload: 0, ground: 0, moving: 0, dist: 0, dy: 0 }));
for (let k = 0; k < +n; k++) {
  const s = createGame([ROSTER[k % 4], ROSTER[(k + 1) % 4]], 9000 + k, false, undefined, { arena: arena as ArenaId, countdownSeconds: OFFLINE_COUNTDOWN_SECONDS, traits: true });
  const b = [make(specA, 0, k * 13 + 1), make(specB, 1, k * 17 + 2)];
  while (s.phase !== 'over' && s.tick < 12000) {
    const ins = [b[0](s), b[1](s)];
    if (s.phase === 'fight')
      for (const i of [0, 1]) {
        const me = s.fighters[i];
        const foe = s.fighters[1 - i];
        if (me.respawn > 0 || foe.respawn > 0) continue;
        const a = acc[i];
        a.alive++;
        const v = visibleAim(s, i) !== null;
        if (v) a.vis++;
        if (ins[i].fire) a.fire++;
        if (ins[i].fire && v) a.firedVis++;
        if (me.weapon.reload > 0) a.reload++;
        if (me.onGround) a.ground++;
        if (ins[i].left || ins[i].right) a.moving++;
        a.dist += Math.abs(foe.x - me.x);
        a.dy += me.y - foe.y;
      }
    step(s, ins);
  }
}
for (const i of [0, 1]) {
  const a = acc[i];
  const p = (x: number) => `${((100 * x) / a.alive).toFixed(0)}%`;
  console.log(`${i ? specB : specA}: has shot ${p(a.vis)}, trigger ${p(a.fire)}, trigger&shot ${p(a.firedVis)}, reloading ${p(a.reload)}, grounded ${p(a.ground)}, moving ${p(a.moving)}, mean |dx| ${(a.dist / a.alive).toFixed(1)} m, mean height over rival ${(a.dy / a.alive).toFixed(2)} m`);
}

console.log(Object.fromEntries(Object.entries(DEBUG).map(([k, v]) => [k, `${((100 * v) / DEBUG.spot).toFixed(1)}%`])));
