import { describe, expect, it } from 'vitest';

import { chooseAwards, createMatchTally, emptyTally } from './awards';
import { GRENADE } from './sim/constants';

import type { AwardInput } from './awards';
import type { GameEvent } from './sim/types';

const slot = (id: number) => (id === 0 ? 0 : id === 1 ? 1 : null);
const player = (over: Partial<AwardInput['tally']> = {}, accuracy = 0, shots = 0, sim: Partial<Pick<AwardInput, 'damage' | 'bestStreak' | 'kos'>> = {}): AwardInput => ({
  tally: { ...emptyTally(), ...over },
  accuracy,
  shots,
  damage: 0,
  bestStreak: 0,
  kos: 0,
  ...sim,
});

describe('match tally', () => {
  it('counts jumps and deflections per player', () => {
    const t = createMatchTally(slot);
    const ev: GameEvent[] = [
      { type: 'jump', x: 0, y: 0, wallKick: false, fighter: 0 },
      { type: 'jump', x: 0, y: 0, wallKick: true, fighter: 0 },
      { type: 'jump', x: 0, y: 0, wallKick: false, fighter: 1 },
      { type: 'deflect', x: 0, y: 0, fighter: 1 },
      { type: 'jump', x: 0, y: 0, wallKick: false }, // no owner: ignored
    ];
    ev.forEach(t.feed);
    const [a, b] = t.snapshot();
    expect([a.jumps, b.jumps, a.pushedBack, b.pushedBack]).toEqual([2, 1, 0, 1]);
  });

  it('a rocket blast that hurts you counts once per victim, bombs and own blasts do not', () => {
    const t = createMatchTally(slot);
    // Fighter 1's rocket hurts fighter 0 (and itself, half damage).
    t.feed({ type: 'explosion', x: 0, y: 0, radius: GRENADE.radius, owner: 1 });
    t.feed({ type: 'hit', fighter: 0, x: 0, y: 0, power: 5, damage: 60, by: 1 });
    t.feed({ type: 'hit', fighter: 1, x: 0, y: 0, power: 5, damage: 20, by: 1 });
    t.endBatch();
    // A bomb (other radius) and a plain bullet in a later batch.
    t.feed({ type: 'explosion', x: 0, y: 0, radius: GRENADE.radius + 0.4, owner: 1 });
    t.feed({ type: 'hit', fighter: 0, x: 0, y: 0, power: 5, damage: 50, by: 1 });
    t.endBatch();
    t.feed({ type: 'hit', fighter: 0, x: 0, y: 0, power: 5, damage: 10, by: 1 });
    const [a, b] = t.snapshot();
    expect(a.rocketsTaken).toBe(1);
    expect(b.rocketsTaken).toBe(0);
    expect(a.damageTaken).toBe(120);
    expect(b.damageTaken).toBe(20);
  });

  it('reset starts a new match from zero', () => {
    const t = createMatchTally(slot);
    t.feed({ type: 'jump', x: 0, y: 0, wallKick: false, fighter: 0 });
    t.reset();
    expect(t.snapshot()[0]).toEqual(emptyTally());
  });
});

describe('chooseAwards: the pool (draw rule: at most 3, at most 2 per player)', () => {
  it('picks the most remarkable, each to the bigger number', () => {
    const me = player({ jumps: 52, pushedBack: 6, rocketsTaken: 0, damageTaken: 150 }, 44, 20);
    const rival = player({ jumps: 20, pushedBack: 1, rocketsTaken: 0, damageTaken: 380 }, 61, 18);
    const awards = chooseAwards([me, rival], null);
    // boomerang 6/3 = 2.0 (you), bouncy 52/40 = 1.3 (you), sharpshooter 61/60 = 1.02 (rival) beat sponge 380/400 = 0.95
    expect(awards.map((a) => [a.id, a.holder])).toEqual([
      ['boomerang', 0],
      ['bouncy', 0],
      ['sharpshooter', 1],
    ]);
  });

  it('a tie gives the award to nobody', () => {
    const p = player({ jumps: 30 });
    expect(chooseAwards([p, p], null).find((a) => a.id === 'bouncy')).toBeUndefined();
  });

  it('too small to count is not shown: a quiet draw has none, never "took 0 rockets"', () => {
    const me = player({ jumps: 3, damageTaken: 20 }, 100, 1);
    const rival = player({ jumps: 2, damageTaken: 40 }, 0, 1);
    expect(chooseAwards([me, rival], null)).toEqual([]);
  });

  it('accuracy needs at least four shots', () => {
    const me = player({}, 100, 3);
    const rival = player({}, 40, 10);
    expect(chooseAwards([me, rival], null).map((a) => a.id)).toEqual(['sharpshooter']);
    expect(chooseAwards([me, rival], null)[0].holder).toBe(1);
  });

  it('HEAVY HITTER is damage dealt (min 100), HOT STREAK the best streak (min 2)', () => {
    const me = player({}, 0, 0, { damage: 99.6, bestStreak: 2 });
    const rival = player({}, 0, 0, { damage: 50, bestStreak: 1 });
    expect(chooseAwards([me, rival], null).map((a) => [a.id, a.holder, a.value])).toEqual([
      ['streak', 0, 2],
      ['hitter', 0, 100],
    ]);
    expect(chooseAwards([player({}, 0, 0, { damage: 99, bestStreak: 1 }), player()], null)).toEqual([]);
  });

  it('a draw with every candidate held by one player shows at most 2 (no fill pass)', () => {
    const me = player({ jumps: 80, pushedBack: 9, rocketsTaken: 4 }, 0, 0);
    expect(chooseAwards([me, player()], null).map((a) => a.holder)).toEqual([0, 0]);
    expect(chooseAwards([player(), me], null).map((a) => a.holder)).toEqual([1, 1]);
  });

  it('the order is stable: highest score first, pool order on a tie', () => {
    const me = player({ rocketsTaken: 3, pushedBack: 3 });
    expect(chooseAwards([me, player()], null).map((a) => a.id)).toEqual(['pinata', 'boomerang']);
  });
});

describe('chooseAwards: decisive matches (F-074)', () => {
  // The playtest case (docs/playtest/2026-11-28-old-vs-new.md R2).
  const winner = player({ jumps: 20, damageTaken: 300 }, 31, 30, { kos: 5, damage: 520, bestStreak: 2 });
  const rival = player({ jumps: 62, damageTaken: 456 }, 40, 25, { kos: 3, damage: 300, bestStreak: 1 });

  it('the playtest 5-3: the winner gets HEAVY HITTER and HOT STREAK, the rival one award', () => {
    const a = chooseAwards([winner, rival], 0);
    expect(a.map((x) => [x.id, x.holder])).toEqual([
      ['hitter', 0],
      ['streak', 0],
      ['bouncy', 1],
    ]);
  });

  it('the same match with the slots swapped (2P as P2) is the mirror', () => {
    const a = chooseAwards([rival, winner], 1);
    expect(a.map((x) => [x.id, x.holder])).toEqual([
      ['hitter', 1],
      ['streak', 1],
      ['bouncy', 0],
    ]);
  });

  it('a winner with no pool award gets exactly BLUE RIBBON (their KOs), plus at most 1 for the loser', () => {
    const w = player({}, 0, 0, { kos: 5 });
    const l = player({ jumps: 80, pushedBack: 9, rocketsTaken: 4, damageTaken: 500 }, 90, 20, { kos: 4, damage: 500, bestStreak: 3 });
    for (const [pair, wi] of [[[w, l], 0], [[l, w], 1]] as const) {
      const a = chooseAwards(pair as [AwardInput, AwardInput], wi);
      expect(a.filter((x) => x.holder === wi)).toEqual([{ id: 'ribbon', holder: wi, value: 5, score: 0 }]);
      expect(a[0].id).toBe('ribbon');
      expect(a.filter((x) => x.holder !== wi)).toHaveLength(1);
    }
  });

  it('random matches: the loser never has more than 1, the winner never 0 and never fewer than the loser (both slots)', () => {
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return Math.floor((seed / 2147483648) * n);
    };
    const rp = () =>
      player(
        { jumps: rnd(90), pushedBack: rnd(8), rocketsTaken: rnd(5), damageTaken: rnd(700) },
        rnd(100),
        rnd(40),
        { kos: rnd(6), damage: rnd(700), bestStreak: rnd(5) },
      );
    for (let i = 0; i < 500; i++) {
      const pair: [AwardInput, AwardInput] = [rp(), rp()];
      for (const w of [0, 1] as const) {
        const a = chooseAwards(pair, w);
        const mine = a.filter((x) => x.holder === w).length;
        const theirs = a.length - mine;
        expect(a.length).toBeLessThanOrEqual(3);
        expect(theirs).toBeLessThanOrEqual(1);
        expect(mine).toBeGreaterThanOrEqual(1);
        expect(mine).toBeLessThanOrEqual(2);
        expect(mine).toBeGreaterThanOrEqual(theirs);
        expect(a[0].holder).toBe(w);
      }
    }
  });
});
