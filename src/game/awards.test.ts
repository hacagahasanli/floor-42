import { describe, expect, it } from 'vitest';

import { chooseAwards, createMatchTally, emptyTally } from './awards';
import { GRENADE } from './sim/constants';

import type { AwardInput } from './awards';
import type { GameEvent } from './sim/types';

const slot = (id: number) => (id === 0 ? 0 : id === 1 ? 1 : null);
const player = (over: Partial<AwardInput['tally']> = {}, accuracy = 0, shots = 0): AwardInput => ({
  tally: { ...emptyTally(), ...over },
  accuracy,
  shots,
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

describe('chooseAwards', () => {
  it('picks the three most remarkable, each to the bigger number', () => {
    const me = player({ jumps: 52, pushedBack: 6, rocketsTaken: 0, damageTaken: 150 }, 44, 20);
    const rival = player({ jumps: 20, pushedBack: 1, rocketsTaken: 0, damageTaken: 380 }, 61, 18);
    const awards = chooseAwards([me, rival]);
    expect(awards).toHaveLength(3);
    // boomerang 6/3 = 2.0 (you), bouncy 52/40 = 1.3 (you), sharpshooter 61/60 = 1.02 (rival) beat sponge 380/400 = 0.95
    expect(awards.map((a) => [a.id, a.holder])).toEqual([
      ['boomerang', 0],
      ['bouncy', 0],
      ['sharpshooter', 1],
    ]);
  });

  it('a tie gives the award to nobody', () => {
    const p = player({ jumps: 30 });
    expect(chooseAwards([p, p]).find((a) => a.id === 'bouncy')).toBeUndefined();
  });

  it('too small to count is not shown: a quiet match has fewer than three, never "took 0 rockets"', () => {
    const me = player({ jumps: 3, damageTaken: 20 }, 100, 1);
    const rival = player({ jumps: 2, damageTaken: 40 }, 0, 1);
    expect(chooseAwards([me, rival])).toEqual([]);
  });

  it('accuracy needs at least four shots', () => {
    const me = player({}, 100, 3);
    const rival = player({}, 40, 10);
    expect(chooseAwards([me, rival]).map((a) => a.id)).toEqual(['sharpshooter']);
    expect(chooseAwards([me, rival])[0].holder).toBe(1);
  });

  it('no player takes all three while the other has one to show', () => {
    const me = player({ jumps: 80, pushedBack: 9, rocketsTaken: 0, damageTaken: 0 }, 90, 20);
    const rival = player({ jumps: 0, pushedBack: 0, rocketsTaken: 0, damageTaken: 450 }, 10, 10);
    const awards = chooseAwards([me, rival]);
    expect(awards).toHaveLength(3);
    expect(awards.filter((a) => a.holder === 0).length).toBeLessThanOrEqual(2);
    expect(awards.some((a) => a.holder === 1)).toBe(true);
  });

  it('when only one player has awards the slots are still filled', () => {
    const me = player({ jumps: 80, pushedBack: 9, rocketsTaken: 4 }, 0, 0);
    const rival = player();
    expect(chooseAwards([me, rival]).map((a) => a.holder)).toEqual([0, 0, 0]);
  });

  it('the order is stable: highest score first, pool order on a tie', () => {
    const me = player({ rocketsTaken: 3, pushedBack: 3 });
    const rival = player();
    expect(chooseAwards([me, rival]).map((a) => a.id)).toEqual(['pinata', 'boomerang']);
  });
});
