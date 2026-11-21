import { describe, expect, it } from 'vitest';

import { BALANCED_GUNS, dps, falloffAt, hitChance, maxRange, ttk } from './balance';
import { GUNS, RULES } from './constants';

/**
 * Each gun's role, written as TTK bands (docs/BALANCE.md has the table and the reasoning).
 * Change a gun in constants.ts and these say whether it still plays its part.
 */
const t = (k: Parameters<typeof ttk>[0], r: number) => ttk(k, r).seconds;
const shots = (k: Parameters<typeof ttk>[0], r: number) => ttk(k, r).shots;

describe('the TTK model', () => {
  it('follows the falloff, range and spread rules of step.ts', () => {
    const p = GUNS.pistol;
    expect(falloffAt(p, 0)).toBe(1);
    expect(falloffAt(p, 999)).toBeCloseTo(p.falloff!.min);
    expect(falloffAt(GUNS.railgun, 999)).toBe(1);
    expect(hitChance(GUNS.railgun, 50)).toBe(1);
    expect(hitChance(GUNS.uzi, 20)).toBeLessThan(hitChance(GUNS.uzi, 3));
    expect(ttk('shotgun', maxRange(GUNS.shotgun) + 0.5).seconds).toBe(Infinity);
  });

  it('counts reloads and gives up when the ammo runs out', () => {
    // 1 hp needs one shot: just the flight time.
    expect(ttk('smg', 10, 1).seconds).toBeCloseTo(10 / GUNS.smg.speed);
    expect(ttk('railgun', 10, RULES.hp * 7).shots).toBe(Infinity);
    const many = ttk('pistol', 3, RULES.hp * 5);
    expect(many.shots).toBeGreaterThan(GUNS.pistol.mag);
    expect(many.seconds).toBeGreaterThan((many.shots - 1) * GUNS.pistol.rate + GUNS.pistol.reloadTime - 1e-9);
  });
});

describe('every gun has a role', () => {
  it('pistol: the reliable baseline: two hits only point blank, three across a room, still kills across the office', () => {
    expect(shots('pistol', 1.5)).toBe(2);
    expect(shots('pistol', 3)).toBeGreaterThanOrEqual(3);
    expect(shots('pistol', 10)).toBeLessThanOrEqual(3);
    expect(t('pistol', 20)).toBeLessThan(2.5);
    // The most accurate small gun: the best of them across the office.
    expect(t('pistol', 20)).toBeLessThan(t('smg', 20));
    expect(t('pistol', 20)).toBeLessThan(t('uzi', 20));
  });

  it('Uzi: the best close-range shredder, weak at range', () => {
    for (const k of ['pistol', 'smg', 'shotgun'] as const) expect(t('uzi', 3)).toBeLessThan(t(k, 3));
    expect(dps('uzi')).toBeGreaterThan(dps('smg'));
    expect(t('uzi', 10)).toBeGreaterThan(t('smg', 10) * 2);
    expect(t('uzi', 20)).toBeGreaterThan(t('pistol', 20) * 2);
  });

  it('SMG: the mid-range sprayer, never the fastest close kill', () => {
    for (const k of ['pistol', 'uzi'] as const) expect(t('smg', 10)).toBeLessThan(t(k, 10));
    expect(t('smg', 10)).toBeLessThan(1);
    expect(t('smg', 3)).toBeGreaterThan(t('uzi', 3));
    expect(t('smg', 20)).toBeLessThan(3);
  });

  it('shotgun: a close burst: one blast point blank, nothing past its short reach, a slow pump', () => {
    expect(shots('shotgun', 1.5)).toBe(1);
    expect(shots('shotgun', 2.5)).toBe(1);
    expect(shots('shotgun', 3)).toBe(2);
    expect(shots('shotgun', 5)).toBeLessThanOrEqual(2);
    expect(maxRange(GUNS.shotgun)).toBeLessThan(10);
    expect(t('shotgun', 10)).toBe(Infinity);
    expect(GUNS.shotgun.rate).toBeGreaterThanOrEqual(0.7);
  });

  it('rail and rockets: one-shot power weapons with clear costs', () => {
    for (const k of ['railgun', 'launcher'] as const) {
      for (const r of [3, 10, 20]) expect(shots(k, r)).toBe(1);
      expect(GUNS[k].mag + GUNS[k].reserve).toBeLessThanOrEqual(6);
      expect(GUNS[k].rate).toBeGreaterThanOrEqual(1);
      expect(GUNS[k].carry).toBeLessThan(0.9);
    }
    // The rocket is slow enough to see coming and dodge from across the office.
    expect(t('launcher', 20)).toBeGreaterThan(1);
    // The rail is the slowest gun to fire again: a miss is a long wait.
    for (const k of BALANCED_GUNS) if (k !== 'railgun') expect(GUNS.railgun.rate).toBeGreaterThanOrEqual(GUNS[k].rate);
  });

  it('no small gun is best at every range', () => {
    const small = ['pistol', 'smg', 'uzi', 'shotgun'] as const;
    const best = [3, 10, 20].map((r) => small.reduce((a, b) => (t(b, r) < t(a, r) ? b : a)));
    expect(new Set(best).size).toBe(3);
    expect(best).toEqual(['uzi', 'smg', 'pistol']);
  });
});
