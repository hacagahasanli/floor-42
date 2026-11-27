import { describe, expect, it } from 'vitest';

import { autoTier } from './quality';
import { createGovernor, p95, stepDown } from './governor';

describe('frame-time governor', () => {
  it('stays quiet at a steady 60 fps', () => {
    const g = createGovernor();
    let down = false;
    for (let i = 0; i < 600; i++) down ||= g.sample(16.7);
    expect(down).toBe(false);
  });

  it('asks for a step down when the 95th percentile is slow', () => {
    const g = createGovernor();
    let downs = 0;
    for (let i = 0; i < 200; i++) if (g.sample(i % 10 === 0 ? 60 : 20)) downs++;
    expect(downs).toBeGreaterThan(0);
  });

  it('ignores tab-switch gaps', () => {
    const g = createGovernor();
    let down = false;
    for (let i = 0; i < 400; i++) down ||= g.sample(i % 50 === 0 ? 5000 : 16.7);
    expect(down).toBe(false);
  });

  it('p95 picks the slow tail', () => {
    expect(p95([...Array(95).fill(10), ...Array(5).fill(50)])).toBe(50);
  });

  it('steps down cheapest first and stops at the floor', () => {
    let q: { pixelRatio: number; shadows: boolean } | null = { pixelRatio: 2, shadows: true };
    const seen: string[] = [];
    while (q) {
      seen.push(`${q.pixelRatio}/${q.shadows}`);
      q = stepDown(q);
    }
    expect(seen).toEqual(['2/true', '1.5/true', '1/true', '0.75/true', '0.75/false']);
  });
});

describe('auto tier', () => {
  it('gives a 4-core laptop medium, not high', () => {
    expect(autoTier({ touch: false, cores: 4, memory: 8, dpr: 1 })).toBe('medium');
    expect(autoTier({ touch: false, cores: 8, memory: 8, dpr: 2 })).toBe('high');
    expect(autoTier({ touch: false, cores: 2, memory: 4, dpr: 1 })).toBe('low');
  });
});
