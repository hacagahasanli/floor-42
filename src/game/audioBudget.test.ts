import { readFileSync } from 'fs';
import path from 'path';

import { BUDGET, createGate } from './audioBudget';

const sfxSource = readFileSync(path.resolve(__dirname, 'sfx.ts'), 'utf8');

describe('sound budget', () => {
  it('every gated sound has a budget row, and every row is used', () => {
    const asked = new Set([...sfxSource.matchAll(/\bmay\('(\w+)'\)/g)].map((m) => m[1]));
    for (const name of asked) expect(BUDGET).toHaveProperty(name);
    for (const name of Object.keys(BUDGET)) expect(asked.has(name), name).toBe(true);
  });

  it('every row is capped', () => {
    for (const [name, b] of Object.entries(BUDGET)) {
      expect(b.maxVoices, name).toBeGreaterThanOrEqual(1);
      expect(b.maxVoices, name).toBeLessThanOrEqual(3);
      expect(b.lengthMs, name).toBeGreaterThan(0);
    }
  });

  it('a shotgun blast of eight pellets into the wall ticks at most three times', () => {
    const g = createGate();
    let n = 0;
    for (let k = 0; k < 8; k++) if (g.allow('impact', k * 2)) n++;
    expect(n).toBeLessThanOrEqual(3);
  });

  it('the empty-gun click plays at most four times a second', () => {
    const g = createGate();
    let n = 0;
    for (let t = 0; t < 1000; t += 16) if (g.allow('empty', t)) n++;
    expect(n).toBeLessThanOrEqual(4);
  });

  it('the gunshot pool and the limiter are still there', () => {
    expect(sfxSource).toMatch(/SHOT_BUDGET = \d/);
    expect(sfxSource).toMatch(/limit\.ratio\.value = 20/);
  });
});
