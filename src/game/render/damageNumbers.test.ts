import { describe, expect, it } from 'vitest';

import { DT, GUNS } from '../sim/constants';
import { createNumberMerger, MERGE_WINDOW, numberTier } from './damageNumbers';

const pellet = (target: number, by: number, damage: number, tick: number) => ({ target, by, damage, now: tick * DT, pellet: true });

/** Plays hits through the merger like the renderer: spawn -> bind a fresh slot; merge -> same slot. Returns the numbers shown. */
const run = (hits: Parameters<ReturnType<typeof createNumberMerger<number>>['hit']>[0][]) => {
  const m = createNumberMerger<number>();
  const shown: number[] = [];
  for (const h of hits) {
    const a = m.hit(h);
    if (a.kind === 'merge') shown[a.slot] = a.total;
    else {
      shown.push(a.total);
      m.bind(h.target, shown.length - 1);
    }
  }
  return shown;
};

describe('damage numbers (F-069)', () => {
  it('the window is 50 ms', () => expect(MERGE_WINDOW).toBe(0.05));

  it('four pellets of one blast in the same tick show one number with the sum', () => {
    expect(run([pellet(1, 0, 16, 100), pellet(1, 0, 16, 100), pellet(1, 0, 16, 100), pellet(1, 0, 16, 100)])).toEqual([64]);
  });

  it('pellets spread over 3 ticks (50 ms) still merge; one 4 ticks after the first starts a new number', () => {
    expect(run([pellet(1, 0, 18, 100), pellet(1, 0, 18, 102), pellet(1, 0, 18, 103)])).toEqual([54]);
    expect(run([pellet(1, 0, 18, 100), pellet(1, 0, 18, 104)])).toEqual([18, 18]);
  });

  it('the next blast (0.8 s later) gets its own number', () => {
    const next = Math.round(GUNS.shotgun.rate / DT);
    expect(run([pellet(1, 0, 18, 100), pellet(1, 0, 18, 100), pellet(1, 0, 18, 100 + next)])).toEqual([36, 18]);
  });

  it('different targets and different attackers never merge', () => {
    expect(run([pellet(1, 0, 16, 100), pellet(0, 1, 16, 100)])).toEqual([16, 16]);
    expect(run([pellet(1, 0, 16, 100), pellet(1, 2, 16, 100)])).toEqual([16, 16]);
  });

  it('non-pellet hits (SMG, Uzi, rail) always get their own number, even in the same tick', () => {
    const bullet = (tick: number) => ({ target: 1, by: 0, damage: 14, now: tick * DT, pellet: false });
    expect(run([bullet(100), bullet(100), bullet(101)])).toEqual([14, 14, 14]);
    // A bullet between pellets closes the blast: the next pellet starts fresh.
    expect(run([pellet(1, 0, 16, 100), bullet(100), pellet(1, 0, 16, 101)])).toEqual([16, 14, 16]);
  });

  it('fractional pellet damage (falloff) is summed before rounding', () => {
    const shown = run([pellet(1, 0, 6.3, 100), pellet(1, 0, 6.3, 100), pellet(1, 0, 6.3, 101)]);
    expect(shown).toHaveLength(1);
    expect(Math.round(shown[0])).toBe(19);
  });

  it('the size/colour tier follows the summed damage', () => {
    expect(numberTier(16)).toEqual({ color: '#ffd23f', size: 1.1 });
    expect(numberTier(16 * 4)).toEqual({ color: '#ff3d6e', size: 1.5 });
    expect(numberTier(49.6).size).toBe(1.1);
    expect(numberTier(50).size).toBe(1.5);
  });

  it('an unbound spawn (renderer never stored a slot) cannot be merged into', () => {
    const m = createNumberMerger<number>();
    expect(m.hit(pellet(1, 0, 16, 100)).kind).toBe('spawn');
    expect(m.hit(pellet(1, 0, 16, 100)).kind).toBe('spawn');
  });
});
