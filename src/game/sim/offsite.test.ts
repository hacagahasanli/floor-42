import { describe, expect, it } from 'vitest';

import { ARENA, arenaOf, baseOf, isClosed, isSolid, OFFSITE } from './constants';
import { findHop } from './reach';
import { createGame, step as stepGame } from './step';
import { EMPTY_INPUT } from './types';

import type { Platform } from './constants';
import type { Surface } from './reach';
import type { CharacterId } from './types';

// Arena 2 "OFFSITE" (docs/collab/CREATIVE/levels/arena-2.md): the data equals the spec, and every platform can be
// reached by every fighter with the real physics and no wall-kick (A6, section 4.2).

const P = OFFSITE.platforms;
const [boulderL, boulderR, walkL, walkR, crateL, crateR, deck, lookL, lookR, roof] = P;
const IDS: CharacterId[] = ['hotfix', 'legacy', 'standup', 'intern'];

describe('OFFSITE data (A1)', () => {
  it('has the ten pieces of section 4.1, in order', () => {
    expect(P.map((p) => [p.x0, p.x1, p.y, p.base ?? null, p.style])).toEqual([
      [-14.6, -12.2, 1.4, null, 'desk'],
      [12.2, 14.6, 1.4, null, 'desk'],
      [-11.4, -3.4, 4.0, null, 'walkway'],
      [3.4, 11.4, 4.0, null, 'walkway'],
      [-4.5, -3.4, 5.0, 4.0, 'crate'],
      [3.4, 4.5, 5.0, 4.0, 'crate'],
      [-2.4, 2.4, 7.0, null, 'walkway'],
      [-17.9, -10.6, 7.8, null, 'walkway'],
      [10.6, 17.9, 7.8, null, 'walkway'],
      [-3.6, 3.6, 10.4, null, 'walkway'],
    ]);
  });
  it('has the spawns of section 4.3 and the gun spawns of section 4.4, the power entry last', () => {
    expect(OFFSITE.spawns).toEqual([
      { x: -11, y: 0 }, { x: 11, y: 0 }, { x: -7.5, y: 4.0 }, { x: 7.5, y: 4.0 }, { x: -4.5, y: 0 }, { x: 4.5, y: 0 },
    ]);
    expect(OFFSITE.gunSpawns.map((g) => g.spots)).toEqual([
      [{ x: 0, y: 0 }, { x: -9, y: 0 }, { x: 9, y: 0 }],
      [{ x: -5.5, y: 4.0 }, { x: 5.5, y: 4.0 }, { x: 0, y: 7.0 }],
      [{ x: -13.4, y: 1.4 }, { x: 13.4, y: 1.4 }],
      [{ x: -10, y: 4.0 }, { x: 10, y: 4.0 }],
      [{ x: -16, y: 7.8 }, { x: 16, y: 7.8 }, { x: 0, y: 10.4 }],
    ]);
    expect(OFFSITE.gunSpawns[4].kinds).toContain('railgun');
    expect(OFFSITE.gunSpawns[4].respawn).toBe(15);
    expect(OFFSITE.gunSpawns[4].firstAt).toBe(10);
    expect(OFFSITE.gunSpawns.slice(0, 4).every((g) => g.firstAt === undefined)).toBe(true);
    expect(OFFSITE.gunSpawns.slice(0, 4).every((g) => g.kinds.every((k) => k !== 'railgun' && k !== 'launcher'))).toBe(true);
  });
  it('keeps the office bounds and drop timing, and is symmetric about x = 0', () => {
    for (const k of ['left', 'right', 'floor', 'ceiling', 'dropEvery', 'dropSlots', 'dropKinds'] as const) expect(OFFSITE[k]).toEqual(ARENA[k]);
    for (const p of P) expect(P.some((q) => q.y === p.y && q.style === p.style && Math.abs(q.x0 + p.x1) < 1e-9 && Math.abs(q.x1 + p.x0) < 1e-9)).toBe(true);
  });
  it('puts every spawn and gun spot on a surface, standing clear of boxes', () => {
    const onSurface = (x: number, y: number) =>
      y === 0 || P.some((p) => !isSolid(p) ? p.y === y && x >= p.x0 && x <= p.x1 : p.y === y && x >= p.x0 && x <= p.x1);
    for (const s of [...OFFSITE.spawns, ...OFFSITE.gunSpawns.flatMap((g) => g.spots)]) expect(onSurface(s.x, s.y), `${s.x},${s.y}`).toBe(true);
    for (const s of [...OFFSITE.spawns, ...OFFSITE.gunSpawns.flatMap((g) => g.spots)])
      for (const b of P.filter(isSolid)) expect(s.y < b.y && s.y >= baseOf(b) && s.x > b.x0 && s.x < b.x1, `${s.x},${s.y} inside a box`).toBe(false);
  });
  it('A10: every spawn is >= 9.0 m from every power spot (min 9.26) and >= 2.0 m from every regular gun spot', () => {
    const power = OFFSITE.gunSpawns[4].spots;
    const regular = OFFSITE.gunSpawns.slice(0, 4).flatMap((g) => g.spots);
    let minPower = Infinity;
    let minRegular = Infinity;
    for (const s of OFFSITE.spawns) {
      for (const g of power) minPower = Math.min(minPower, Math.hypot(s.x - g.x, s.y - g.y));
      for (const g of regular) minRegular = Math.min(minRegular, Math.hypot(s.x - g.x, s.y - g.y));
    }
    expect(minPower).toBeGreaterThanOrEqual(9.26 - 0.005);
    expect(minRegular).toBeGreaterThanOrEqual(2.0 - 1e-9);
  });
  it('A10: no power gun exists before firstAt seconds after FIGHT, on any seed, and one appears right after', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = createGame(['hotfix', 'legacy'], seed, false, undefined, { arena: 'offsite' });
      const power = g.pickups.filter((p) => p.spawn === 4)[0];
      let fightTicks = 0;
      let appeared = -1;
      for (let i = 0; i < 60 * 20 && appeared < 0; i++) {
        stepGame(g, [EMPTY_INPUT, EMPTY_INPUT]);
        if (g.phase === 'fight') fightTicks++;
        if (power.active) appeared = fightTicks;
        else expect(fightTicks).toBeLessThan(60 * 10 + 2);
      }
      expect(appeared).toBeGreaterThanOrEqual(60 * 10 - 1);
      expect(appeared).toBeLessThanOrEqual(60 * 10 + 2);
    }
  });
  it('has crates standing on a boardwalk and boulders solid from the floor', () => {
    for (const c of [crateL, crateR]) {
      expect(isClosed(c)).toBe(true);
      expect(P.some((w) => !isSolid(w) && w.y === baseOf(c) && c.x0 >= w.x0 && c.x1 <= w.x1)).toBe(true);
    }
    expect(isSolid(boulderL) && isSolid(boulderR) && baseOf(boulderL) === 0).toBe(true);
  });
  it('arenaOf picks the data from the state (absent = office)', () => {
    expect(arenaOf({})).toBe(ARENA);
    expect(arenaOf({ arena: 'offsite' })).toBe(OFFSITE);
    expect(OFFSITE.menuSpotX).toBe(5.2);
    // 2.0 m of headroom above a 2.0 m fighter under boardwalk R at 5.2: standing on the open floor.
    expect(P.some((p) => isSolid(p) && p.y > 0 && 5.2 > p.x0 - 0.5 && 5.2 < p.x1 + 0.5 && baseOf(p) === 0)).toBe(false);
  });
});

/** The move table of section 4.2: [from, to, cheapest jump count per fighter in IDS order, null = no route]. */
const MOVES: [string, Surface, Platform, (number | null)[]][] = [
  ['floor -> boulder', 'floor', boulderL, [0, 0, 0, 0]],
  ['boulder -> boardwalk', boulderL, walkL, [0, 1, 0, 0]], // Legacy single has a 0.15 m margin: either is fine
  ['floor -> boardwalk', 'floor', walkL, [1, 1, 1, 1]],
  ['boardwalk -> crate', walkL, crateL, [0, 0, 0, 0]],
  ['crate -> tower deck', crateL, deck, [0, 0, 0, 0]],
  ['boardwalk -> tower deck', walkL, deck, [0, 1, 0, 1]],
  ['boardwalk -> lookout', walkL, lookL, [1, 1, 1, 1]],
  ['tower deck -> roof', deck, roof, [1, 1, 1, 1]],
  ['lookout -> roof', lookL, roof, [1, 1, 1, 1]],
  ['tower deck -> lookout', deck, lookL, [1, 1, 1, 1]],
];

describe('OFFSITE reachability with the real physics (A6, section 4.2)', () => {
  for (const [name, from, to, per] of MOVES) {
    IDS.forEach((id, i) => {
      const want = per[i];
      it(`${id}: ${name}${want === null ? ' has no route' : ` in ${want === 0 ? 'a single' : 'a double'} jump`}`, () => {
        const hop = findHop('offsite', id, from, to, 2);
        expect(hop, 'no route found').not.toBeNull();
        if (name.startsWith('boulder -> boardwalk') && id === 'legacy') expect(hop!.airJumps).toBeLessThanOrEqual(1);
        else expect(hop!.airJumps).toBe(want);
      });
    });
  }

  it('Legacy (the limit case) climbs floor -> boardwalk -> lookout and deck -> roof with a scripted double jump', () => {
    expect(findHop('offsite', 'legacy', 'floor', walkL, 1)).not.toBeNull();
    expect(findHop('offsite', 'legacy', walkR, lookR, 1)).not.toBeNull();
    expect(findHop('offsite', 'legacy', deck, roof, 1)).not.toBeNull();
  });

  it('every platform is reachable from the floor by every fighter, both sides, by chaining hops', () => {
    for (const id of IDS) {
      const reached = new Set<Platform | 'floor'>(['floor']);
      // Per side: boulder, boardwalk, crate, lookout.
      const L = [boulderL, walkL, crateL, lookL];
      const R = [boulderR, walkR, crateR, lookR];
      const chain: [Surface, Platform][] = [];
      for (const S of [L, R]) chain.push(['floor', S[0]], [S[0], S[1]], [S[1], S[2]], [S[2], deck], [S[1], S[3]], [deck, S[3]]);
      chain.push([deck, roof]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const [a, b] of chain) {
          if (reached.has(a) && !reached.has(b) && findHop('offsite', id, a, b, 2)) {
            reached.add(b);
            grew = true;
          }
        }
      }
      expect([...reached].filter((x) => x !== 'floor').length, `${id} reaches ${reached.size - 1} of 10`).toBe(P.length);
    }
  });
});
