import { describe, expect, it } from 'vitest';

import { RIM_COLOR } from './render/characters';
import { isCharacterId, ROSTER } from './roster';
import { CHARACTERS } from './sim/constants';

describe('roster (R-022b / R-024)', () => {
  it('keeps the internal ids and shows the new names, accents and rim tints', () => {
    expect(ROSTER.map((r) => [r.id, r.name, r.accent, r.rim])).toEqual([
      ['hotfix', 'Brix', '#E5392F', '#FFB3A8'],
      ['legacy', 'Ormo', '#14A37F', '#9FF0D8'],
      ['standup', 'Zuzu', '#F25CB8', '#FFC4E6'],
      ['intern', 'Tavo', '#2456D6', '#A9C2FF'],
    ]);
    // old links (?p1=hotfix) and saved picks keep working
    for (const id of ['hotfix', 'legacy', 'standup', 'intern']) expect(isCharacterId(id)).toBe(true);
    expect(isCharacterId('brix')).toBe(false);
  });

  it('lights each model with its roster rim tint', () => {
    for (const r of ROSTER) expect('#' + RIM_COLOR[r.id].toString(16).padStart(6, '0').toUpperCase(), r.id).toBe(r.rim);
  });

  it('has the spec trait labels, and the gameplay stats are untouched', () => {
    expect(ROSTER.map((r) => r.trait)).toEqual(['LEAPFROG', 'TEA BREAK', 'SUGAR RUSH', 'PACKED EXTRA']);
    const stats = Object.fromEntries(Object.entries(CHARACTERS).map(([k, c]) => [k, [c.speed, c.jump, c.weight, c.hp, c.height, c.width, c.airJumps]]));
    expect(stats).toEqual({
      hotfix: [9.4, 16.5, 0.92, 100, 2.0, 0.7, 1],
      legacy: [7.6, 15.2, 1.38, 100, 1.85, 1.0, 1],
      standup: [10.6, 17, 0.8, 100, 1.5, 0.7, 2],
      intern: [9.0, 16.2, 1.0, 100, 1.7, 0.8, 1],
    });
  });
});
