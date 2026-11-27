import { describe, expect, it } from 'vitest';

import { tumbleweedAxes } from './render/arenaOffsite';
import { nameCardVisible, OFFSITE_HUD_SCRIM, OFFSITE_HUD_TEXT_SHADOW } from './offsiteHud';
import { OFFSITE_PROJECTILES, R8, SAND_SHAPES } from './render/projectileStyle';
import { headedTracerGeometry } from './render/projectileGeometry';

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

describe('arena name card (F-044)', () => {
  const R = 150;
  it('shows on the title card and for the first 3 s of the fight, at any size', () => {
    expect(nameCardVisible('countdown', R, R, false, false)).toBe(true);
    expect(nameCardVisible('fight', R - 0.5, R, false, false)).toBe(true);
    expect(nameCardVisible('fight', R - 2.99, R, false, false)).toBe(true);
  });
  it('is gone from 3 s after FIGHT, back in pause, the menu and the result', () => {
    expect(nameCardVisible('fight', R - 3, R, false, false)).toBe(false);
    expect(nameCardVisible('fight', 40, R, false, false)).toBe(false);
    expect(nameCardVisible('fight', 40, R, true, false)).toBe(true);
    expect(nameCardVisible('fight', 40, R, false, true)).toBe(true);
    expect(nameCardVisible('over', 40, R, false, false)).toBe(true);
  });
});

describe('OFFSITE projectiles (F-041)', () => {
  it('tracer ink 0.9 x 0.08 with a 0.22 canvas head, pellet ink 0.35 x 0.08', () => {
    expect(OFFSITE_PROJECTILES.tracer).toEqual({ body: 0x1b1f2e, head: 0xf3ede0, length: 0.9, headLength: 0.22, thickness: 0.08 });
    expect(OFFSITE_PROJECTILES.pellet).toEqual({ color: 0x1b1f2e, length: 0.35, thickness: 0.08 });
  });
  it('the headed tracer is one geometry (one draw call): unit length along +x, light head at the leading end', () => {
    const g = headedTracerGeometry(0.22 / 0.9, 0x1b1f2e, 0xf3ede0, 0.06);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.x).toBeCloseTo(-0.5);
    expect(g.boundingBox!.max.x).toBeCloseTo(0.5);
    const pos = g.getAttribute('position');
    const col = g.getAttribute('color');
    let headVerts = 0;
    for (let i = 0; i < pos.count; i++) if (col.getX(i) > 0.5) { headVerts++; expect(pos.getX(i)).toBeGreaterThanOrEqual(0.5 - 0.22 / 0.9 - 1e-6); }
    expect(headVerts).toBe(24);
  });
});

describe('rule R8 for the OFFSITE sand pool (F-041)', () => {
  const quads: [string, number, number, number, number][] = [
    ['streamer start', SAND_SHAPES.streamer.w0, SAND_SHAPES.streamer.h0, SAND_SHAPES.streamer.speed, SAND_SHAPES.streamer.minY],
    ['streamer end', SAND_SHAPES.streamer.w1, SAND_SHAPES.streamer.h1, SAND_SHAPES.streamer.speed, SAND_SHAPES.streamer.minY],
    ['skitter start', SAND_SHAPES.skitter.w, SAND_SHAPES.skitter.h0, SAND_SHAPES.skitter.speed, SAND_SHAPES.skitter.y0],
    ['skitter end', SAND_SHAPES.skitter.w, SAND_SHAPES.skitter.h1, SAND_SHAPES.skitter.speed, SAND_SHAPES.skitter.y0],
  ];
  it.each(quads)('%s: aspect <= 2.5:1, and <= 6 m/s when below y 13.5', (_n, w, h, v, y) => {
    expect(w / h).toBeLessThanOrEqual(R8.maxAspect);
    if (y < R8.belowY) expect(v).toBeLessThanOrEqual(R8.maxSpeed);
  });
  it('streamers stay above the 13.5 ceiling; skitter stays on the floor at 0.02..0.20 m', () => {
    expect(SAND_SHAPES.streamer.minY).toBeGreaterThan(R8.belowY);
    expect([SAND_SHAPES.skitter.y0, SAND_SHAPES.skitter.y1]).toEqual([0.02, 0.2]);
    expect(SAND_SHAPES.skitter.alpha).toBe(0.22);
    expect(SAND_SHAPES.streamer.alpha).toBe(0.35);
  });
});
