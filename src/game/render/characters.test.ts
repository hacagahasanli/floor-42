import { describe, expect, it } from 'vitest';

import * as THREE from 'three';
import { buildRig, cancelWinner, FLINCH, rimBoostFor, lifeRig, poseDeath, poseShow, poseSide, ringEnv, startFlinch, startLanding, startShot, startTakeoff, startWinner, stepSpring, WINNER_SECONDS } from './characters';

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

describe('weight and life', () => {
  const life = (rig: ReturnType<typeof buildRig>, dt: number, t: number, vx = 0, vy = 0) =>
    lifeRig(rig, { dt, rawDt: dt, time: t, vx, vy, onGround: vy === 0, facing: 1 });

  const peakOf = (rig: ReturnType<typeof buildRig>, dt: number, n: number, read: () => number) => {
    let peak = 0;
    let first = -1;
    let last = -1;
    const vals: number[] = [];
    for (let i = 0; i < n; i++) {
      poseSide(rig, pose(dt, 1));
      life(rig, dt, i * dt);
      vals.push(read());
    }
    for (const v of vals) peak = Math.max(peak, Math.abs(v));
    vals.forEach((v, i) => {
      if (Math.abs(v) >= peak * 0.9) {
        if (first < 0) first = i;
        last = i;
      }
    });
    return { peak, heldMs: (last - first + 1) * dt * 1000, vals };
  };

  it('flinches 22 degrees at the hips, holds it, and recovers with one overshoot to -5 degrees by 260 ms', () => {
    const rig = buildRig('legacy');
    const dt = 1 / 240;
    startFlinch(rig, 1);
    const { peak, heldMs, vals } = peakOf(rig, dt, 120, () => rig.life.flinch);
    expect(peak * FLINCH.torso).toBeGreaterThan(FLINCH.torso * 0.97);
    expect(peak).toBeLessThanOrEqual(1.0001);
    // Peak held (>= 90 %) for at least 100 ms: the visibility rule.
    expect(heldMs).toBeGreaterThanOrEqual(100);
    // One overshoot to about -5 degrees, then upright by 300 ms.
    const min = Math.min(...vals);
    expect(min * FLINCH.torso).toBeLessThan(-4 * (Math.PI / 180));
    expect(min * FLINCH.torso).toBeGreaterThan(-6 * (Math.PI / 180));
    expect(Math.abs(vals[vals.length - 1])).toBeLessThan(0.02);
    // The other side tilts the other way; heavy hits go 1.5x.
    startFlinch(rig, -1, 1.5);
    life(rig, dt, 0);
    life(rig, dt, 0);
    expect(rig.life.flinch).toBeLessThan(0);
    // The torso really bends at the hips: the upper group is turned, the legs are not under it.
    startFlinch(rig, 1);
    for (let i = 0; i < 20; i++) life(rig, dt, 0);
    expect(Math.hypot(rig.upper.rotation.x, rig.upper.rotation.z)).toBeGreaterThan(0.1);
  });

  it('holds the flinch peak on a hit-stop freeze frame (pose dt 0) and plays it out afterwards', () => {
    const rig = buildRig('intern');
    startFlinch(rig, 1);
    for (let i = 0; i < 10; i++) lifeRig(rig, { dt: 0, rawDt: 1 / 60, time: 0, vx: 0, vy: 0, onGround: true, facing: 1 });
    expect(rig.life.flinch).toBeGreaterThan(0.9);
  });

  it('lands with y 0.70 / x 1.22, holds the bottom 50 ms and returns with one overshoot to y 1.06; knee load 0.75 for 130 ms', () => {
    const rig = buildRig('hotfix');
    startLanding(rig, 1);
    const dt = 1 / 240;
    let minY = 9;
    let maxY = 0;
    let maxX = 0;
    let maxLoad = 0;
    let loadAt130 = 1;
    for (let t = 0; t < 0.5; t += dt) {
      poseSide(rig, pose(dt, 1));
      minY = Math.min(minY, rig.life.sy);
      maxY = Math.max(maxY, rig.life.sy);
      maxX = Math.max(maxX, rig.life.sx);
      maxLoad = Math.max(maxLoad, rig.life.load);
      if (t > 0.131 && loadAt130 === 1) loadAt130 = rig.life.load;
    }
    expect(minY).toBeCloseTo(0.7, 2);
    expect(maxX).toBeCloseTo(1.22, 2);
    expect(maxY).toBeCloseTo(1.06, 2);
    expect(maxLoad).toBeCloseTo(0.75, 2);
    expect(loadAt130).toBeLessThan(0.02);
    expect(rig.life.sy).toBeCloseTo(1, 3);
    // The bottom is held for 50 ms.
    expect(ringEnv(0.049, 0.05, 0.17, 0.27, 0.2)).toBe(1);
  });

  it('takes off with load 0.9 and an 18 % root dip for 60 ms, then a y 1.22 / x 0.85 stretch peaking at 100 ms, back to 1 by 200 ms', () => {
    const rig = buildRig('hotfix');
    startTakeoff(rig);
    const dt = 1 / 480;
    let minY = 9;
    let maxY = 0;
    let minX = 9;
    let maxLoad = 0;
    let peakT = 0;
    for (let t = 0; t < 0.4; t += dt) {
      poseSide(rig, { ...pose(dt, 1), onGround: false, vy: 12 });
      minY = Math.min(minY, rig.life.sy);
      minX = Math.min(minX, rig.life.sx);
      maxLoad = Math.max(maxLoad, rig.life.load);
      if (rig.life.sy > maxY) {
        maxY = rig.life.sy;
        peakT = t;
      }
    }
    expect(maxLoad).toBeCloseTo(0.9, 2);
    expect(minY).toBeCloseTo(0.82, 2);
    expect(maxY).toBeCloseTo(1.22, 2);
    expect(minX).toBeCloseTo(0.85, 2);
    expect(peakT).toBeGreaterThan(0.095);
    expect(peakT).toBeLessThan(0.11);
    expect(rig.life.sy).toBe(1);
    // An air jump only stretches (y 1.15).
    const air = buildRig('hotfix');
    startTakeoff(air, true);
    let aMin = 9;
    let aMax = 0;
    for (let t = 0; t < 0.3; t += dt) {
      poseSide(air, { ...pose(dt, 1), onGround: false, vy: 12 });
      aMin = Math.min(aMin, air.life.sy);
      aMax = Math.max(aMax, air.life.sy);
    }
    expect(aMin).toBe(1);
    expect(aMax).toBeCloseTo(1.15, 2);
  });

  it('shows less of everything with Shake OFF / reduced motion (k = 0.4)', () => {
    const rig = buildRig('hotfix');
    rig.life.k = 0.4;
    startLanding(rig, 1);
    let minY = 9;
    for (let t = 0; t < 0.3; t += 1 / 240) {
      poseSide(rig, pose(1 / 240, 1));
      minY = Math.min(minY, rig.life.sy);
    }
    expect(minY).toBeCloseTo(1 - 0.3 * 0.4, 2);
  });

  it('kicks the body per shot: x2.2 for heavy guns, x0.5 for SMG and Uzi, SMG torso capped at 9 degrees, settled in 120 ms', () => {
    const rig = buildRig('standup');
    startShot(rig, 'pistol');
    expect(rig.life.shot.x).toBe(1);
    startShot(rig, 'shotgun');
    expect(rig.life.shot.x).toBeCloseTo(2.2, 5);
    const smg = buildRig('standup');
    for (let i = 0; i < 20; i++) startShot(smg, 'smg');
    expect(smg.life.shot.x * 5).toBeLessThanOrEqual(9.0001);
    const one = buildRig('standup');
    startShot(one, 'pistol');
    for (let t = 0; t < 0.12; t += 1 / 240) poseSide(one, pose(1 / 240, 1));
    expect(Math.abs(one.life.shot.x)).toBeLessThan(0.1);
  });

  it('plays a 0.9 s winner pose for each fighter, can be cancelled, and puts everything back', () => {
    for (const id of ['hotfix', 'legacy', 'standup', 'intern'] as const) {
      const rig = buildRig(id);
      startWinner(rig);
      let sawGunAway = false;
      for (let t = 0; t < WINNER_SECONDS + 0.2; t += 1 / 60) {
        poseSide(rig, pose(1 / 60, 1));
        life(rig, 1 / 60, t);
        sawGunAway ||= rig.life.hideGun;
        for (const c of [rig.armL, rig.armR, rig.root]) expect(Number.isFinite(c.position.y)).toBe(true);
      }
      expect(sawGunAway, id).toBe(true); // every victory pose uses both hands: the gun goes away
      expect(rig.life.hideGun).toBe(false);
      expect(rig.life.thumb?.visible ?? false).toBe(false);
      startWinner(rig);
      life(rig, 1 / 60, 0);
      cancelWinner(rig);
      expect(rig.life.winT).toBe(9);
    }
  });

  for (const dt of DTS) {
    it(`keeps every hanging part bounded through a sprint and a hard landing at dt = ${dt.toFixed(3)} s`, () => {
      for (const id of ['hotfix', 'legacy', 'standup', 'intern'] as const) {
        const rig = buildRig(id);
        expect(rig.life.secondary.length).toBeGreaterThan(0);
        let t = 0;
        for (; t < 1; t += dt) life(rig, dt, t, t < 0.5 ? 9 : -9, t < 0.8 ? 0 : -16);
        for (; t < 2; t += dt) life(rig, dt, t);
        for (const sc of rig.life.secondary) {
          expect(Number.isFinite(sc.g.rotation.x)).toBe(true);
          expect(Math.abs(sc.g.rotation.x)).toBeLessThan(sc.maxPitch * 3);
          expect(Math.abs(sc.g.position.y - sc.baseY)).toBeLessThan(0.3);
        }
      }
    });
  }

  it('breathes 0.045 x torso height (F-029): a visible rise, never more than 3 cm', () => {
    const rig = buildRig('standup');
    let max = 0;
    for (let t = 0; t < 5; t += 1 / 60) {
      life(rig, 1 / 60, t);
      max = Math.max(max, Math.abs(rig.head.position.y - rig.life.headY));
    }
    expect(max).toBeGreaterThan(0.001);
    expect(max).toBeGreaterThan(0.015);
    expect(max).toBeLessThan(0.03);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// R-022b roster (BRIX hotfix, ORMO legacy, ZUZU standup, TAVO intern): rigs, faces, props, poses.
// ---------------------------------------------------------------------------------------------------------------------
describe('roster v3 rigs', () => {
  const IDS = ['hotfix', 'legacy', 'standup', 'intern'] as const;
  /** Meshes that would be drawn: visible, with every parent visible. */
  const drawn = (root: THREE.Object3D) => {
    let n = 0;
    root.traverseVisible((o) => {
      if ((o as THREE.Mesh).isMesh) n++;
    });
    return n;
  };
  /** Visible meshes of the fighters this roster replaced (measured before the swap, same pose and kit). */
  const BEFORE = { hotfix: 43, legacy: 44, standup: 44, intern: 41 };

  it('draws fewer meshes than the fighters it replaced (the bake merges every static part of a bone)', () => {
    for (const id of IDS) {
      const n = drawn(buildRig(id).root);
      expect(n, id).toBeLessThanOrEqual(26);
      expect(n, id).toBeLessThan(BEFORE[id]);
    }
  });

  it('has no star shape anywhere (R-024): no extruded or shape geometry, in any rig or in any pose', () => {
    for (const id of IDS) {
      const rig = buildRig(id);
      for (const kind of ['idle', 'victory', 'defeat', 'taunt'] as const) poseShow(rig, kind);
      rig.root.traverse((o) => {
        const g = (o as THREE.Mesh).geometry;
        if (g) expect(['ExtrudeGeometry', 'ShapeGeometry'], `${id} ${g.type}`).not.toContain(g.type);
      });
    }
  });

  const life = (rig: ReturnType<typeof buildRig>, dt: number, t: number) => lifeRig(rig, { dt, rawDt: dt, time: t, vx: 0, vy: 0, onGround: true, facing: 1 });

  it('shows exactly one face per expression, X eyes on a KO and no blinking eyes while they are shut', () => {
    for (const id of IDS) {
      const rig = buildRig(id);
      for (const e of ['angry', 'grin', 'smug', 'shout', 'shock', 'sad', 'closed', 'ko'] as const) {
        rig.fx.setExpr(e);
        expect(rig.fx.expr).toBe(e);
        const eyesOn = rig.life.eyes.every((m) => m.visible);
        expect(eyesOn, `${id} ${e}`).toBe(e !== 'ko' && e !== 'closed');
      }
      // a hit is a shock, a knock-out is X eyes
      rig.fx.setExpr('grin');
      startFlinch(rig, 1);
      poseSide(rig, pose(1 / 60, 1));
      life(rig, 1 / 60, 0);
      expect(rig.fx.expr, id).toBe('shock');
      poseDeath(rig, 1, 0);
      expect(rig.fx.expr, id).toBe(id === 'legacy' ? 'sad' : id === 'standup' ? 'shout' : 'ko');
    }
  });

  it('hangs its secondary parts (braids, walrus ends and tie, hair puffs and whistle, pack and bandana) on springs', () => {
    const want = { hotfix: 2, legacy: 4, standup: 3, intern: 2 };
    for (const id of IDS) expect(buildRig(id).life.secondary.length, id).toBeGreaterThanOrEqual(want[id]);
    // Tavo's pack is the first: the winner pose hitches it
    expect(buildRig('intern').life.secondary[0].g.getObjectByName('pack') ?? buildRig('intern').life.secondary[0].g.children[0].name).toBeTruthy();
  });

  it('puts the defeat props on the floor on a knock-out and takes them away when the fighter is back up', () => {
    const at = (rig: ReturnType<typeof buildRig>, name: string) => rig.root.getObjectByName(name)!;
    {
      const rig = buildRig('hotfix');
      expect(at(rig, 'skate-r').parent, 'skate on the foot').toBe(rig.shinR);
      poseDeath(rig, 1, 0);
      expect(at(rig, 'skate-r').parent, 'skate off').toBe(rig.ground);
      expect(at(rig, 'sock-r').visible).toBe(true);
      poseSide(rig, pose(1 / 60, 1));
      expect(at(rig, 'skate-r').parent).toBe(rig.shinR);
      expect(at(rig, 'sock-r').visible).toBe(false);
    }
    {
      const rig = buildRig('legacy');
      poseDeath(rig, 1, 0);
      expect(at(rig, 'tea-spill').visible).toBe(true);
      expect(at(rig, 'thermos').visible).toBe(false);
      poseSide(rig, pose(1 / 60, 1));
      expect(at(rig, 'tea-spill').visible).toBe(false);
      expect(at(rig, 'thermos').visible).toBe(true);
    }
    {
      const rig = buildRig('standup');
      poseDeath(rig, 1, 0);
      expect(at(rig, 'red-card').visible).toBe(true);
      poseSide(rig, pose(1 / 60, 1));
      expect(at(rig, 'red-card').visible).toBe(false);
    }
    {
      const rig = buildRig('intern');
      expect(at(rig, 'pan').parent).toBe(at(rig, 'pack'));
      poseDeath(rig, 1, 0);
      expect(at(rig, 'pan').parent, 'pan on his head').toBe(rig.head);
      expect(at(rig, 'pack').parent, 'pack slid off').toBe(rig.ground);
      expect(at(rig, 'swirls').visible).toBe(true);
      poseSide(rig, pose(1 / 60, 1));
      expect(at(rig, 'pan').parent).toBe(at(rig, 'pack'));
      expect(at(rig, 'pack').parent).not.toBe(rig.ground);
      expect(at(rig, 'swirls').visible).toBe(false);
    }
  });

  it('the knock-out pose is finite and nothing sinks into the floor', () => {
    for (const id of IDS) {
      const rig = buildRig(id);
      for (const t of [0, 0.2, 0.6, 3]) {
        poseDeath(rig, t, 0);
        rig.root.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(rig.root);
        expect(Number.isFinite(b.min.y) && Number.isFinite(b.max.y), `${id} ${t}`).toBe(true);
        if (t >= 0.6) expect(b.min.y, `${id} ${t}`).toBeGreaterThan(-0.02);
      }
    }
  });

  it('every sheet pose (idle, victory, defeat, taunt) poses finite joints', () => {
    for (const id of IDS) {
      const rig = buildRig(id);
      for (const kind of ['idle', 'victory', 'defeat', 'taunt'] as const) {
        poseShow(rig, kind);
        for (const g of [rig.armL, rig.armR, rig.foreL, rig.foreR]) expect(g.quaternion.toArray().every(Number.isFinite), `${id} ${kind}`).toBe(true);
        for (const g of [rig.legL, rig.legR, rig.shinL, rig.shinR, rig.head]) expect([g.rotation.x, g.rotation.y, g.rotation.z].every(Number.isFinite), `${id} ${kind}`).toBe(true);
      }
    }
  });

  it('F-046 BRIX skate: 1.35x, wheels up, 0.55 m to the camera side; F-048 ORMO cup stays below his hair; F-049 rim boost', () => {
    for (const facing of [1, -1] as const) {
      const rig = buildRig('hotfix');
      rig.root.rotation.y = facing * TURN_RIGHT;
      rig.root.updateMatrixWorld(true);
      poseDeath(rig, 1, 0);
      const sk = rig.root.getObjectByName('skate-r')!;
      rig.fx.tick(0.016, 0);
      expect(sk.scale.x).toBeCloseTo(1.35);
      expect(Math.abs(sk.rotation.x)).toBeCloseTo(Math.PI);
      rig.root.updateMatrixWorld(true);
      // the camera is at +z: the skate sits on the +z side of the fighter's own axis
      const w = sk.getWorldPosition(new THREE.Vector3());
      const r = rig.root.getWorldPosition(new THREE.Vector3());
      expect(w.z - r.z, `facing ${facing}`).toBeGreaterThan(0.3);
    }
    const ormo = buildRig('legacy');
    poseShow(ormo, 'victory');
    ormo.root.updateMatrixWorld(true);
    const hair = new THREE.Box3().setFromObject(ormo.head).max.y;
    const cup = new THREE.Box3().setFromObject(ormo.foreL.children.flatMap((c) => c.children).find((c) => c.visible && c.children.length) ?? ormo.foreL);
    expect(cup.max.y).toBeLessThan(hair);
    expect(rimBoostFor('intern', 'office')).toBe(1.3);
    expect(rimBoostFor('intern', 'offsite')).toBe(1);
    expect(rimBoostFor('hotfix', 'office')).toBe(1);
  });
});
