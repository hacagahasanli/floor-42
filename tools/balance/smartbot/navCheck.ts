/** Reachability check for nav.ts: every surface -> every surface, every character, both arenas. */
import { arenaOf, baseOf, CHARACTERS, isSolid } from '../../../src/game/sim/constants';
import { createGame, step } from '../../../src/game/sim/step';
import { EMPTY_INPUT } from '../../../src/game/sim/types';
import { graphFor, navInput, newNavMem, surfaceOf } from '../../../src/game/sim/botNav';

import type { ArenaId } from '../../../src/game/sim/constants';
import type { CharacterId, InputState } from '../../../src/game/sim/types';

const chars: CharacterId[] = ['hotfix', 'legacy', 'standup', 'intern'];
for (const arena of ['offsite', 'office'] as ArenaId[]) {
  for (const ch of chars) {
    let ok = 0, tot = 0, tsum = 0;
    const fails: string[] = [];
    const A = arenaOf({ arena });
    const g = graphFor(A, ch);
    for (const from of g.surfaces) for (const to of g.surfaces) {
      if (from === to) continue;
      tot++;
      const s = createGame([ch, 'hotfix'], 1, false, undefined, { arena });
      s.phase = 'fight'; s.phaseTime = 999;
      s.fighters[1].respawn = 1e9;
      const f = s.fighters[0];
      const halfW = CHARACTERS[ch].width / 2;
      // stand beside any box that sits on `from` at its centre
      let sx = from.floor ? -4.5 : (from.x0 + from.x1) / 2;
      for (const p of A.platforms) if (isSolid(p) && Math.abs(baseOf(p) - from.y) < 0.05 && sx > p.x0 - halfW && sx < p.x1 + halfW) sx = p.x0 - halfW - 0.3 > from.x0 ? p.x0 - halfW - 0.3 : p.x1 + halfW + 0.3;
      Object.assign(f, { x: sx, y: from.y, vx: 0, vy: 0, onGround: true });
      const mem = newNavMem();
      let last: InputState = { ...EMPTY_INPUT };
      let t = 0;
      let done = false;
      for (; t < 60 * 8; t++) {
        const n = navInput(s, f, g, to, (to.x0 + to.x1) / 2, mem);
        const out: InputState = { ...EMPTY_INPUT, left: n.move < 0, right: n.move > 0, up: n.up && !last.up, down: n.down, aimX: f.x + 3, aimY: f.y + 1 };
        // hop a box in the way
        if (n.move !== 0 && !last.up && f.onGround) {
          const ahead = f.x + n.move * (halfW + 0.5);
          if (A.platforms.some((p) => isSolid(p) && f.y < p.y && f.y >= baseOf(p) - 0.05 && ahead > p.x0 && ahead < p.x1)) out.up = true;
        }
        if (n.down && last.down) out.down = false;
        last = out;
        step(s, [out, EMPTY_INPUT]);
        f.hp = 999;
        if (f.onGround && surfaceOf(g, f).id === to.id) { done = true; break; }
      }
      if (done) { ok++; tsum += t / 60; } else fails.push(`${from.id}(${from.y})->${to.id}(${to.y})`);
    }
    console.log(`${arena} ${ch}: ${ok}/${tot} reached, mean ${(tsum / Math.max(ok, 1)).toFixed(2)} s. fails: ${(process.env.ALL ? fails : fails.slice(0, 12)).join(' ')}${!process.env.ALL && fails.length > 12 ? ' ...' : ''}`);
  }
}
