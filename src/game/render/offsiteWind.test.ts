import { describe, expect, it } from 'vitest';

import { baseWind, createWind, GUST, gustEnvelope, REDUCED_PEAK } from './offsiteWind';

const run = (seed: number, seconds: number, reduced = false) => {
  const w = createWind(seed);
  const starts: number[] = [];
  const samples: number[] = [];
  for (let t = 0; t <= seconds; t += 1 / 60) {
    const v = w.update(t, reduced);
    if (w.out.gust) starts.push(t);
    samples.push(v);
  }
  return { w, starts, samples };
};

describe('OFFSITE wind (R-017)', () => {
  it('blows between 0 and 1, with a base of 0.25 +- 0.05', () => {
    for (let t = 0; t < 30; t += 0.1) {
      expect(baseWind(t)).toBeGreaterThanOrEqual(0.2 - 1e-9);
      expect(baseWind(t)).toBeLessThanOrEqual(0.3 + 1e-9);
    }
    const { samples } = run(3, 120);
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples)).toBeLessThanOrEqual(1);
  });

  it('fires a gust every 6-11 s, at least three in any 30 s clip (L1)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { starts } = run(seed, 300);
      for (let i = 1; i < starts.length; i++) {
        const gap = starts[i] - starts[i - 1];
        expect(gap).toBeGreaterThanOrEqual(GUST.minGap - 0.02);
        expect(gap).toBeLessThanOrEqual(GUST.maxGap + 0.02);
      }
      // from the start of the clip
      expect(starts.filter((s) => s <= 30).length).toBeGreaterThanOrEqual(3);
      // and from a clip that starts anywhere
      for (let a = 0; a + 30 <= 290; a += 7) expect(starts.filter((s) => s >= a && s < a + 30).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('gust envelope: peak in 0.5 s (ease-out), hold 1.0 s, back to calm in 1.8 s (ease-in)', () => {
    expect(gustEnvelope(0)).toBe(0);
    expect(gustEnvelope(0.5)).toBeCloseTo(1, 9);
    expect(gustEnvelope(0.25)).toBeGreaterThan(0.5); // ease-out: more than half done at the half way mark
    expect(gustEnvelope(1.0)).toBe(1);
    expect(gustEnvelope(1.5)).toBeCloseTo(1, 9);
    expect(gustEnvelope(1.5 + 0.9)).toBeGreaterThan(0.5); // ease-in: still above half at the half way mark of the fall
    expect(gustEnvelope(3.3)).toBeCloseTo(0, 9);
    expect(gustEnvelope(10)).toBe(0);
  });

  it('peaks at 1.0 for about 60 % of gusts and 0.7 for the rest', () => {
    let full = 0;
    let soft = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const w = createWind(seed);
      let peak = 0;
      let last = 0;
      for (let t = 0; t < 400; t += 1 / 30) {
        w.update(t);
        if (w.out.gust) {
          if (last) (peak > 0.95 ? full++ : soft++);
          peak = 0;
          last = 1;
        }
        peak = Math.max(peak, w.out.value);
      }
    }
    expect(full / (full + soft)).toBeGreaterThan(0.5);
    expect(full / (full + soft)).toBeLessThan(0.7);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    expect(run(5, 60).starts).toEqual(run(5, 60).starts);
    expect(run(5, 60).starts).not.toEqual(run(6, 60).starts);
  });

  it('a kick holds the wind at 1.0 for 0.6 s; under reduced motion nothing kicks and gusts peak at 0.6', () => {
    const w = createWind(9);
    w.update(1);
    w.kick(1);
    expect(w.update(1.3)).toBe(1);
    expect(w.update(1.59)).toBe(1);
    expect(w.update(1.7)).toBeLessThan(1);
    const r = createWind(9);
    r.update(1, true);
    r.kick(1, true);
    expect(r.update(1.3, true)).toBeLessThan(0.5);
    expect(Math.max(...run(9, 120, true).samples)).toBeLessThanOrEqual(REDUCED_PEAK + 1e-9);
  });
});
