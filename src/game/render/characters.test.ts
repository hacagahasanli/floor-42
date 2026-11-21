import { describe, expect, it } from 'vitest';

import { buildRig, poseSide, stepSpring } from './characters';

import type { SidePose } from './characters';

const TURN_RIGHT = Math.PI / 2 - 0.3;
const DTS = [1 / 60, 0.05, 0.1, 0.25];

const pose = (dt: number, facing: 1 | -1): SidePose => ({
  dt, time: 0, vx: 0, vy: 0, onGround: true, facing, aim: 0, wall: 0, dashing: false,
  stunned: false, gun: 'pistol', sinceShot: 9, reload: null, pushing: 0,
});

describe('poseSide at any frame time', () => {
  for (const dt of DTS) {
    it(`turns round and settles without blowing up at dt = ${dt.toFixed(3)} s`, () => {
      const rig = buildRig('hotfix');
      let maxTurn = 0;
      // Face right, then flip to the left: the body swings through the camera on its spring.
      for (let t = 0; t < 1; t += dt) poseSide(rig, pose(dt, 1));
      for (let t = 0; t < 2; t += dt) {
        poseSide(rig, pose(dt, -1));
        maxTurn = Math.max(maxTurn, Math.abs(rig.turn));
        expect(Number.isFinite(rig.turn)).toBe(true);
        expect(Number.isFinite(rig.legL.rotation.x)).toBe(true);
        expect(Number.isFinite(rig.body.rotation.x)).toBe(true);
      }
      // A little overshoot (zeta 0.75), never a runaway.
      expect(maxTurn).toBeLessThan(TURN_RIGHT * 1.2);
      expect(rig.turn).toBeCloseTo(-TURN_RIGHT, 3);
      expect(rig.root.rotation.y).toBeCloseTo(-TURN_RIGHT, 3);
    });
  }
});

describe('stepSpring', () => {
  it('is the same single semi-implicit step at 60 fps', () => {
    const s = { x: 0.3, v: -1 };
    const w = 16;
    const dt = 1 / 60;
    const v = -1 + (w * w * (1 - 0.3) - 2 * 0.75 * w * -1) * dt;
    stepSpring(s, 1, w, 0.75, dt);
    expect(s.v).toBe(v);
    expect(s.x).toBe(0.3 + v * dt);
  });

  for (const dt of DTS) {
    it(`keeps the squash springs bounded at dt = ${dt.toFixed(3)} s`, () => {
      for (const [K, zeta] of [[320, 1], [260, 0.55]]) {
        const s = { x: -0.22, v: -6 };
        for (let t = 0; t < 2; t += dt) {
          stepSpring(s, 0, Math.sqrt(K), zeta, dt);
          expect(Math.abs(s.x)).toBeLessThan(1);
        }
        expect(Math.abs(s.x)).toBeLessThan(1e-3);
      }
    });
  }
});
