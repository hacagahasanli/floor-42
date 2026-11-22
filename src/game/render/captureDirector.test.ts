import { describe, expect, it } from 'vitest';

import { ARENA } from '../sim/constants';

import { createCaptureDirector } from './captureDirector';

import type { DirectorFighter } from './captureDirector';

const f = (x: number, y = 0): DirectorFighter => ({ x, y, vx: 0, facing: 1, respawn: 0 });
const run = (d: ReturnType<typeof createCaptureDirector>, a: DirectorFighter, b: DirectorFighter, secs: number, dt = 1 / 60) => {
  let shot = d.update({ dt, fighters: [a, b], fov: 36, aspect: 16 / 9 });
  for (let t = dt; t < secs; t += dt) shot = d.update({ dt, fighters: [a, b], fov: 36, aspect: 16 / 9 });
  return { ...shot };
};

describe('capture director', () => {
  it('stays closer than the full-office frame and never shows past the walls', () => {
    const shot = run(createCaptureDirector({ minDistance: 11, maxDistance: 15 }), f(-16, 0), f(16, 0), 3);
    const tanHalf = Math.tan((36 * Math.PI) / 360);
    expect(shot.z).toBeLessThanOrEqual(15 + 1e-6);
    expect(shot.x - shot.z * tanHalf * (16 / 9)).toBeGreaterThanOrEqual(ARENA.left - 1.3);
    expect(shot.x + shot.z * tanHalf * (16 / 9)).toBeLessThanOrEqual(ARENA.right + 1.3);
  });

  it('pushes in on a KO and keeps the same side-on axis (no yaw: x/y only, small roll)', () => {
    const d = createCaptureDirector({ minDistance: 11 });
    const before = run(d, f(-4), f(4), 3);
    d.notify({ type: 'ko', fighter: 1, by: 0, x: 4, y: 1 });
    const after = run(d, f(-4), f(4), 0.6);
    expect(after.z).toBeLessThan(before.z);
    expect(Math.abs(after.roll)).toBeLessThan(0.05);
  });

  it('settles to the same frame at 30 and 144 fps (frame-rate independent smoothing)', () => {
    const a = run(createCaptureDirector(), f(-6), f(2), 4, 1 / 30);
    const b = run(createCaptureDirector(), f(-6), f(2), 4, 1 / 144);
    expect(Math.abs(a.x - b.x)).toBeLessThan(0.3);
    expect(Math.abs(a.z - b.z)).toBeLessThan(0.3);
  });
});
