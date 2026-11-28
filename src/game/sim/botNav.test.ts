import { describe, expect, it } from 'vitest';

import { graphFor, navInput, newNavMem, routeOf, surfaceOf } from './botNav';
import { arenaOf, baseOf, CHARACTERS, isSolid } from './constants';
import { createGame, step } from './step';
import { EMPTY_INPUT } from './types';

import type { ArenaId } from './constants';
import type { CharacterId, InputState } from './types';

const CHARS: CharacterId[] = ['hotfix', 'legacy', 'standup', 'intern'];

/**
 * Walk the real sim from every surface to every other one with navInput alone (plus the bot's hop over a box in the
 * way), 8 s per route. Returns the routes that never arrived.
 */
const reach = (arena: ArenaId, ch: CharacterId) => {
  const A = arenaOf({ arena });
  const g = graphFor(A, ch);
  const halfW = CHARACTERS[ch].width / 2;
  const fails: string[] = [];
  let total = 0;
  for (const from of g.surfaces)
    for (const to of g.surfaces) {
      if (from === to) continue;
      total++;
      const s = createGame([ch, 'hotfix'], 1, false, undefined, { arena });
      s.phase = 'fight';
      s.phaseTime = 999;
      s.fighters[1].respawn = 1e9;
      const f = s.fighters[0];
      // Start beside any box that sits on `from` at its centre.
      let sx = from.floor ? -4.5 : (from.x0 + from.x1) / 2;
      for (const p of A.platforms)
        if (isSolid(p) && Math.abs(baseOf(p) - from.y) < 0.05 && sx > p.x0 - halfW && sx < p.x1 + halfW)
          sx = p.x0 - halfW - 0.3 > from.x0 ? p.x0 - halfW - 0.3 : p.x1 + halfW + 0.3;
      Object.assign(f, { x: sx, y: from.y, vx: 0, vy: 0, onGround: true });
      const mem = newNavMem();
      let last: InputState = { ...EMPTY_INPUT };
      let done = false;
      for (let t = 0; t < 60 * 8 && !done; t++) {
        const n = navInput(s, f, g, to, (to.x0 + to.x1) / 2, mem);
        const out: InputState = { ...EMPTY_INPUT, left: n.move < 0, right: n.move > 0, up: n.up && !last.up, down: n.down && !last.down, aimX: f.x + 3, aimY: f.y + 1 };
        if (n.move !== 0 && !last.up && f.onGround) {
          const ahead = f.x + n.move * (halfW + 0.5);
          if (A.platforms.some((p) => isSolid(p) && f.y < p.y && f.y >= baseOf(p) - 0.05 && ahead > p.x0 && ahead < p.x1)) out.up = true;
        }
        last = out;
        step(s, [out, EMPTY_INPUT]);
        f.hp = 999;
        done = f.onGround && surfaceOf(g, f).id === to.id;
      }
      if (!done) fails.push(`${from.id}->${to.id}`);
    }
  return { fails, total };
};

describe('bot navigation (smart-bot.md 3.5, plan steps 1 and 3)', () => {
  it('the route table finds a path between every pair of surfaces on both arenas', () => {
    for (const arena of ['offsite', 'office'] as ArenaId[])
      for (const ch of CHARS) {
        const g = graphFor(arenaOf({ arena }), ch);
        for (const a of g.surfaces) for (const b of g.surfaces) expect(routeOf(g, a.id, b.id), `${arena} ${ch} ${a.id}->${b.id}`).not.toBeNull();
      }
  });

  for (const ch of CHARS)
    it(`OFFSITE: ${ch} walks every surface-to-surface route on the real sim`, () => {
      const r = reach('offsite', ch);
      expect(r.fails).toEqual([]);
    });

  for (const ch of CHARS)
    it(`office: ${ch} walks at least 98 % of the routes, the beam and the box tops included`, () => {
      const r = reach('office', ch);
      expect(r.total - r.fails.length).toBeGreaterThanOrEqual(Math.ceil(r.total * 0.98));
      // The power-gun beam and the rack / crate / metal box tops are reachable from the floor.
      for (const top of [7, 12, 13, 16, 17, 20]) expect(r.fails).not.toContain(`0->${top}`);
    });
});
