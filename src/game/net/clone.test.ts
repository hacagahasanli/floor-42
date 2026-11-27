import { createGame, step } from '../sim/step';
import { EMPTY_INPUT } from '../sim/types';

import { cloneState } from './clone';

describe('cloneState', () => {
  it('equals structuredClone for a state in the middle of a fight, Infinity included, and shares nothing', () => {
    const s = createGame(['hotfix', 'legacy'], 7, true);
    for (let i = 0; i < 900; i++) {
      step(s, [
        { ...EMPTY_INPUT, fire: i % 7 === 0, right: i % 200 < 100, left: i % 200 >= 100, up: i % 50 === 0, throwBomb: i % 331 === 0 },
        { ...EMPTY_INPUT, fire: true, left: i % 300 < 150, right: i % 300 >= 150, push: i % 97 === 0 },
      ]);
    }
    expect(s.projectiles.length + s.pickups.length).toBeGreaterThan(0);
    const c = cloneState(s);
    expect(c).toEqual(structuredClone(s));
    expect(c.fighters[0].weapon.reserve).toBe(s.fighters[0].weapon.reserve);
    // Nothing shared: changing the copy leaves the original alone.
    c.fighters[0].weapon.mag = -1;
    c.fighters[0].stats.shots = -1;
    c.fighters[0].prev.fire = !c.fighters[0].prev.fire;
    c.pickups.forEach((p) => (p.x = -99));
    expect(s.fighters[0].weapon.mag).not.toBe(-1);
    expect(s.fighters[0].stats.shots).not.toBe(-1);
    expect(s.pickups.every((p) => p.x !== -99)).toBe(true);
  });
});
