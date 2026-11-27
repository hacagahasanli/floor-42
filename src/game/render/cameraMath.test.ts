import { describe, expect, it } from 'vitest';

import { ARENA, CHARACTERS } from '../sim/constants';
import { DESKTOP_CAM, finaleHolding, finaleScale, followTarget, followWeight, koBeatWeight, nextFollowTime, PHONE_CAM } from './cameraMath';

import type { FollowInput } from './cameraMath';

const tanHalf = Math.tan((36 * Math.PI) / 360);
const aspect = 16 / 9;
const dist = Math.max((ARENA.right + 1.5) / (tanHalf * aspect), (ARENA.ceiling / 2 + 2) / tanHalf);
const base = (o: Partial<FollowInput>): FollowInput => ({
  ax: 0, ay: 0, bx: 0, by: 0, tanHalf, aspect, fw: 1, fh: 1, dist,
  floor: ARENA.floor, ceiling: ARENA.ceiling, halfWidth: ARENA.right + 1.5, rig: DESKTOP_CAM, beat: 0, beatX: 0, beatY: 0, ...o,
});
const run = (i: FollowInput) => {
  const out = { x: 0, y: 0, z: 0 };
  followTarget(i, out);
  return out;
};
const pxHeight = (z: number, h = 720, world = CHARACTERS.hotfix.height) => (world / (2 * z * tanHalf)) * h;

describe('follow camera', () => {
  it('closes in no more than 1.6x on a desktop, and fighters 8 apart stand at least 80 px tall', () => {
    const o = run(base({ ax: -4, bx: 4 }));
    expect(o.z).toBeCloseTo(dist / 1.6, 5);
    expect(pxHeight(o.z)).toBeGreaterThanOrEqual(80);
  });
  it('phones keep their own closer limit and padding', () => {
    expect(run(base({ rig: PHONE_CAM })).z).toBeCloseTo(dist / 1.8, 5);
  });
  it('pulls back to the full view when the fighters stand at opposite walls', () => {
    const o = run(base({ ax: ARENA.left + 1, bx: ARENA.right - 1 }));
    expect(o.z).toBeCloseTo(dist, 5);
    expect(o.x).toBeCloseTo(0, 5);
  });
  it('never shows past the arena edges or below the floor margin', () => {
    const o = run(base({ ax: ARENA.right - 1, bx: ARENA.right - 3, ay: 0, by: 0 }));
    const hw = o.z * tanHalf * aspect;
    expect(o.x + hw).toBeLessThanOrEqual(ARENA.right + 1.5 + 1e-9);
    const hh = o.z * tanHalf;
    expect(o.y - hh).toBeGreaterThanOrEqual(ARENA.floor - 1 - 1e-9);
  });
  it('is stable for a standing pair (same input, same output)', () => {
    const i = base({ ax: -2, bx: 3, ay: 0, by: 4 });
    expect(run(i)).toEqual(run(i));
  });
  it('the KO beat moves 35% toward the victim and 15% closer', () => {
    const a = run(base({ ax: -4, bx: 4 }));
    const b = run(base({ ax: -4, bx: 4, beat: 1, beatX: 4, beatY: a.y }));
    expect(b.z).toBeCloseTo(a.z * 0.85, 5);
    expect(b.x - a.x).toBeCloseTo(4 * 0.35, 5);
  });
});

describe('follow weight and beat timing', () => {
  it('holds the wide view in the countdown and eases in over 0.8 s after FIGHT', () => {
    expect(nextFollowTime(0.5, true, 0.016)).toBe(0);
    expect(followWeight(0)).toBe(0);
    let t = 0;
    for (let i = 0; i < 24; i++) t = nextFollowTime(t, false, 1 / 60);
    expect(followWeight(t)).toBeCloseTo(0.5, 1);
    expect(followWeight(nextFollowTime(0.79, false, 0.1))).toBe(1);
  });
  it('the KO beat holds 0.6 s, then eases out over 0.5 s', () => {
    expect(koBeatWeight(-1)).toBe(0);
    expect(koBeatWeight(0.3)).toBe(1);
    expect(koBeatWeight(0.6)).toBe(1);
    expect(koBeatWeight(0.85)).toBeCloseTo(0.5, 5);
    expect(koBeatWeight(1.1)).toBe(0);
  });
});

describe('final-KO slow motion', () => {
  it('runs the sim at 0.3x for 0.9 s of real time, then back at 1x', () => {
    expect(finaleScale(-1)).toBe(1);
    expect(finaleScale(0)).toBe(0.3);
    expect(finaleScale(0.89)).toBe(0.3);
    expect(finaleScale(0.9)).toBe(1);
  });
  it('keeps the result card back for 0.9 s + 0.4 s', () => {
    expect(finaleHolding(true, -1)).toBe(true);
    expect(finaleHolding(false, 1.29)).toBe(true);
    expect(finaleHolding(false, 1.3)).toBe(false);
    expect(finaleHolding(false, -1)).toBe(false);
  });
});
