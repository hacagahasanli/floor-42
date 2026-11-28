/** Trace one nav route: npx tsx tools/balance/smartbot/navDebug.ts office legacy 6 2 [startX] */
import { arenaOf, baseOf, CHARACTERS, isSolid } from '../../../src/game/sim/constants';
import { createGame, step } from '../../../src/game/sim/step';
import { EMPTY_INPUT } from '../../../src/game/sim/types';
import { graphFor, navInput, newNavMem, surfaceOf } from '../../../src/game/sim/botNav';

import type { ArenaId } from '../../../src/game/sim/constants';
import type { CharacterId, InputState } from '../../../src/game/sim/types';

const [arena, ch, fromS, toS, sx] = process.argv.slice(2) as [ArenaId, CharacterId, string, string, string?];
const A = arenaOf({ arena });
const g = graphFor(A, ch);
const from = g.surfaces[+fromS];
const to = g.surfaces[+toS];
console.log('from', from, 'to', to, 'edges', g.edges[from.id].map((e) => e.to).join(','));
const s = createGame([ch, 'hotfix'], 1, false, undefined, { arena });
s.phase = 'fight';
s.phaseTime = 999;
s.fighters[1].respawn = 1e9;
const f = s.fighters[0];
Object.assign(f, { x: sx ? +sx : (from.x0 + from.x1) / 2, y: from.y, vx: 0, vy: 0, onGround: true });
const mem = newNavMem();
let last: InputState = { ...EMPTY_INPUT };
const halfW = CHARACTERS[ch].width / 2;
for (let t = 0; t < 300; t++) {
  const n = navInput(s, f, g, to, (to.x0 + to.x1) / 2, mem);
  const out: InputState = { ...EMPTY_INPUT, left: n.move < 0, right: n.move > 0, up: n.up && !last.up, down: n.down && !last.down, aimX: f.x + 3, aimY: f.y + 1 };
  if (n.move !== 0 && !last.up && f.onGround) {
    const ahead = f.x + n.move * (halfW + 0.5);
    if (A.platforms.some((p) => isSolid(p) && f.y < p.y && f.y >= baseOf(p) - 0.05 && ahead > p.x0 && ahead < p.x1)) out.up = true;
  }
  last = out;
  step(s, [out, EMPTY_INPUT]);
  if (t % 6 === 0) console.log(t, f.x.toFixed(2), f.y.toFixed(2), f.onGround ? surfaceOf(g, f).id : 'air', 'hop', mem.hop, 'tk', mem.takeoffX.toFixed(2), n.move, n.up ? 'U' : '', n.down ? 'D' : '');
  if (f.onGround && surfaceOf(g, f).id === to.id) {
    console.log('arrived', t);
    break;
  }
}
