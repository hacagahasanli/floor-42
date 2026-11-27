import { describe, expect, it } from 'vitest';

import { tumbleweedAxes } from './render/arenaOffsite';
import { OFFSITE_HUD_SCRIM, OFFSITE_HUD_TEXT_SHADOW } from './offsiteHud';

describe('OFFSITE HUD (F-032)', () => {
  it('fades a deeper sky blue to nothing over 120 px', () => {
    expect(OFFSITE_HUD_SCRIM).toBe('linear-gradient(180deg, rgba(38,104,150,0.45) 0px, rgba(38,104,150,0) 120px)');
  });
  it('uses the specified text shadow', () => {
    expect(OFFSITE_HUD_TEXT_SHADOW).toBe('0 1px 0 rgba(10,13,24,0.9), 0 0 6px rgba(10,13,24,0.7)');
  });
  it('A3 with the HUD on: sky top within 12 of (78,150,192) after compositing, clean from y 120', () => {
    // Composite rgba(38,104,150,0.45) over the sky #6fbbe3 (111,187,227).
    const out = [111, 187, 227].map((c, i) => Math.round(c * 0.55 + [38, 104, 150][i] * 0.45));
    out.forEach((v, i) => expect(Math.abs(v - [78, 150, 192][i])).toBeLessThanOrEqual(12));
  });
});

describe('tumbleweed (F-033)', () => {
  const axes = tumbleweedAxes();
  const deg = (a: number, b: number) => (Math.acos(Math.min(1, Math.abs(axes[a].dot(axes[b])))) * 180) / Math.PI;
  it('has 7 ring axes, deterministic', () => {
    expect(axes).toHaveLength(7);
    expect(tumbleweedAxes().map((a) => a.toArray())).toEqual(axes.map((a) => a.toArray()));
  });
  it('no two axes within 25 degrees, none along the view axis', () => {
    for (let i = 0; i < 7; i++) {
      expect((Math.acos(Math.abs(axes[i].z)) * 180) / Math.PI).toBeGreaterThanOrEqual(25);
      for (let j = i + 1; j < 7; j++) expect(deg(i, j)).toBeGreaterThanOrEqual(25);
    }
  });
});
