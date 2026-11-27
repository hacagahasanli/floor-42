import { describe, expect, it } from 'vitest';

import { TRAIT_CFG } from '../sim/traits';

import { badgeFor, CALLOUT_DELAY, calloutLife, calloutPose, lineStretch, WORD_FIRES } from './traitFx';

import type { CalloutPose } from './traitFx';

const pose = (t: number, life: number, reduced = false) => calloutPose(t, life, reduced, { scale: 0, rise: 0, alpha: 0 } as CalloutPose);
const T0 = { rush: 0, rushCd: 0, leapCd: 0 };
const FULL = { hp: 100, max: 100, sinceHit: 9, delay: 3 };

describe('trait callout (spec 11.1)', () => {
  it('the first three fires are the full pill (1.13 s), later ones a disc (0.6 s)', () => {
    for (let n = 1; n <= WORD_FIRES; n++) expect(calloutLife(n)).toBeCloseTo(1.13);
    expect(calloutLife(WORD_FIRES + 1)).toBeCloseTo(0.6);
    expect(calloutLife(9)).toBeCloseTo(0.6);
  });
  it('scale springs 0 -> 1.15 -> 1 over 180 ms, holds, then rises 0.3 m and fades over 250 ms', () => {
    expect(pose(0, 1.13).scale).toBe(0);
    expect(pose(0.108, 1.13).scale).toBeCloseTo(1.15);
    expect(pose(0.18, 1.13).scale).toBe(1);
    expect(pose(0.5, 1.13)).toMatchObject({ scale: 1, rise: 0, alpha: 1 });
    expect(pose(1.13, 1.13).rise).toBeCloseTo(0.3);
    expect(pose(1.13, 1.13).alpha).toBeCloseTo(0);
    expect(pose(1.005, 1.13).alpha).toBeCloseTo(0.5);
  });
  it('reduced motion: no scale, no rise, 120 ms fade in and out', () => {
    expect(pose(0.06, 1.13, true)).toMatchObject({ scale: 1, rise: 0 });
    expect(pose(0.06, 1.13, true).alpha).toBeCloseTo(0.5);
    expect(pose(0.5, 1.13, true).alpha).toBe(1);
    expect(pose(1.07, 1.13, true).alpha).toBeCloseTo(0.5);
    expect(pose(1.13, 1.13, true).alpha).toBe(0);
  });
  it('Sugar Rush waits 120 ms (after the damage number), Packed Extra 150 ms (after the gun callout)', () => {
    expect(CALLOUT_DELAY).toEqual({ leapfrog: 0, teaBreak: 0, sugarRush: 0.12, packedExtra: 0.15 });
  });
  it('speed lines stretch with speed within bounds', () => {
    expect(lineStretch(0)).toBe(0.5);
    expect(lineStretch(-4)).toBe(1);
    expect(lineStretch(99)).toBe(1.5);
  });
});

describe('HUD trait badge state', () => {
  it('Leapfrog: ready, then a 2.5 s refill', () => {
    expect(badgeFor('leapfrog', T0, FULL).state).toBe('ready');
    expect(badgeFor('leapfrog', { ...T0, leapCd: TRAIT_CFG.leapfrog.cooldown }, FULL)).toMatchObject({ state: 'cooldown', fill: 0 });
    expect(badgeFor('leapfrog', { ...T0, leapCd: 1.25 }, FULL).fill).toBeCloseTo(0.5);
  });
  it('Sugar Rush: lit for the burst, then refills to 4 s', () => {
    expect(badgeFor('sugarRush', { ...T0, rush: 0.7, rushCd: 3.7 }, FULL).state).toBe('lit');
    expect(badgeFor('sugarRush', { ...T0, rushCd: 2 }, FULL)).toMatchObject({ state: 'cooldown', fill: 0.5 });
    expect(badgeFor('sugarRush', T0, FULL).state).toBe('ready');
  });
  it('Tea Break: grey and refilling over his 3 s wait, lit while he heals, ready at full HP', () => {
    const hurt = { hp: 60, max: 115, delay: 3 };
    const b = badgeFor('teaBreak', T0, { ...hurt, sinceHit: 0.6 });
    expect(b.state).toBe('cooldown');
    expect(b.fill).toBeCloseTo(0.2);
    expect(badgeFor('teaBreak', T0, { ...hurt, sinceHit: 3 }).state).toBe('lit');
    expect(badgeFor('teaBreak', T0, { hp: 115, max: 115, sinceHit: 0, delay: 3 }).state).toBe('ready');
  });
  it('Packed Extra is always ready', () => {
    expect(badgeFor('packedExtra', T0, FULL).state).toBe('ready');
  });
});
