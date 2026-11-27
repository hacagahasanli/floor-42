import * as THREE from 'three';

import { mat, mesh } from './palette';
import { bake, LOOKS, REST_EXPR, SHEET_POSES, STANCE, WIN_EXPR } from './rosterRigs';

import type { Fx, Hang, PoseDef, ShowPose } from './rosterRigs';

import type { CharacterId, GunKind } from '../sim/types';

/** Floor 42's guns, plus empty hands. */
type WeaponKind = GunKind | 'fists';

/**
 * Low-poly fighters built from primitives (rosterRigs.ts has the four: BRIX the skater with the striped helmet, ORMO the wide
 * office dad with the walrus moustache, ZUZU the small coach with two hair puffs, TAVO under his towering pack).
 * Models face +z; the arena turns them sideways.
 */

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  /** Upper arms (pivot at the shoulder) and forearms (pivot at the elbow). */
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  armLen: number;
  shoulderL: THREE.Vector3;
  shoulderR: THREE.Vector3;
  /** Thighs (pivot at the hip) and shins (pivot at the knee). */
  legL: THREE.Group;
  legR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  legLen: number;
  weapon: THREE.Group;
  hand: THREE.Object3D;
  chestY: number;
  phase: number;
  turn: number;
  head: THREE.Group;
  /** The plate carrier, shown while you wear armor. */
  vest: THREE.Group;
  /** Where the hips and legs face on the map (they lag the upper body and follow the run). */
  hipYaw: number;
  hipInit: boolean;
  /** Between root and body: the flinch tilt, weight shift and breathing ride here, so the pose code never sees them. */
  sway: THREE.Group;
  /**
   * Everything above the hips (torso, head, arms, weapon) hangs from this group, which sits inside body at the origin:
   * rotating it about the hips (position compensated) bends the torso while the legs stay planted. Children keep body-space coordinates.
   */
  upper: THREE.Group;
  torso: THREE.Group;
  /** Weight and life state (see lifeRig). */
  life: Life;
  /** The fighter's face, props and prop motion (rosterRigs.ts). */
  fx: Fx;
  /** Where the story props lie in a defeat pose: the fighter's frame, child of the root. */
  ground: THREE.Group;
}

/** One hanging part (hood, cable, belly, backpack, hair) on a pivot, lagging the body on two springs. */
interface Secondary {
  g: THREE.Group;
  /** Angular frequency and damping of the springs: w 11-15 / zeta 0.22 trails the body by 5-8 frames. */
  w: number;
  zeta: number;
  /** Radians of pitch per m/s^2 of forward acceleration, and metres of lift per m/s^2 of vertical acceleration. */
  pitchGain: number;
  liftGain: number;
  maxPitch: number;
  maxLift: number;
  pitch: { x: number; v: number };
  lift: { x: number; v: number };
  baseY: number;
}

export interface Life {
  id: CharacterId;
  /** Standing height in metres: the run bob is 3.5 % of it. */
  height: number;
  /** Motion scale: 1, or 0.4 with Shake OFF / reduced motion (set by the caller each frame). */
  k: number;
  /** Seconds since the last landing / take-off / turn-around / winner pose began (9 = none). */
  landT: number;
  landAmt: number;
  takeT: number;
  /** 0 none, 1 ground jump (crouch then stretch), 2 air jump (stretch only). */
  takeKind: number;
  turnT: number;
  turnDir: number;
  /** Knee-bend load 0..1 read by poseSide, and the whole-body scale this frame (caller applies to the root). */
  load: number;
  sx: number;
  sy: number;
  /** Body kick of the last shots, on a spring (1 = one pistol shot); poseSide lifts the gun by it. */
  shot: { x: number; v: number };
  /** Seconds since the last hit, which way the body tilts (+1: top goes to world -x, away from a shooter on the right), strength. */
  flinchT: number;
  flinchSide: number;
  flinchAmt: number;
  flinch: number;
  /** 0..1 how still the fighter is: breathing and weight shift only show at rest. */
  idle: number;
  blinkT: number;
  blinkLeft: number;
  prevVx: number;
  prevVy: number;
  prevFacing: number;
  /** Smoothed run lean (radians, + = the top goes to world -x). */
  run: number;
  ax: number;
  ay: number;
  secondary: Secondary[];
  eyes: THREE.Mesh[];
  /** A belly and its jiggle spring (+/-10 % of scale y): none of the current four has one. */
  belly: THREE.Object3D | null;
  bellyBase: number;
  jiggle: { x: number; v: number };
  thumb: THREE.Object3D | null;
  headY: number;
  shoulderY: number;
  phase: number;
  /** Winner pose: seconds since it began (9 = off) and whether the gun is put away. */
  winT: number;
  hideGun: boolean;
  /** Bit 1: a turn-around skid just began (the caller spawns dust). */
  events: number;
  /** Per-rig clones of the shared materials (with the rim light); disposed with the rig. */
  mats: THREE.Material[];
  /** The knock-out pose (and its props) is showing: poseSide clears it when the fighter is back up. */
  down: boolean;
  /** The winner props (cup, flag) are showing. */
  winProps: boolean;
  /** Half the foot's length (metres), and how far the knocked-out pose is lifted so nothing sinks into the floor (-1 = not measured yet). */
  footHalf: number;
  downLift: number;
}

const DEG = Math.PI / 180;
/** One-shot body effects (F-029): each holds its peak >= 100 ms near the top and returns with a spring overshoot. */
export const FLINCH = { torso: 22 * DEG, body: 6 * DEG, head: 12 * DEG, shift: 0.06, hold: 0.11, ret: 0.2, end: 0.26, over: 5 / 22 };
export const FLINCH_SECONDS = FLINCH.end;
export const FLINCH_RADIANS = FLINCH.torso;
export const LAND = { y: 0.3, x: 0.22, hold: 0.05, ret: 0.17, end: 0.27, over: 0.2, loadAmt: 0.75, loadSeconds: 0.13 };
export const TAKEOFF = { load: 0.9, dip: 0.18, loadSeconds: 0.06, peakAt: 0.1, y: 0.22, x: 0.15, end: 0.2, airY: 0.15 };
export const WINNER_SECONDS = 0.9;
export const LOAD_SECONDS = TAKEOFF.loadSeconds;

const ico = (r: number, detail = 1) => new THREE.IcosahedronGeometry(r, detail);
const cyl = (r: number, h: number, seg = 7, r2 = r) => new THREE.CylinderGeometry(r2, r, h, seg);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const put = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
  o.position.set(x, y, z);
  return o;
};

/**
 * F-049: TAVO's blue flannel sits on the office's navy windows, so on the office his rim is 1.3x (tint unchanged). One number per
 * fighter and arena; every other pair is 1. It multiplies the shared rim strength in the shader, so the governor still fades it.
 */
export const rimBoostFor = (id: CharacterId, arena: string): number => (id === 'intern' && arena === 'office' ? 1.3 : 1);

export const buildRig = (id: CharacterId, opts: { rimBoost?: number } = {}): Rig => {
  const s = LOOKS[id];
  const root = new THREE.Group();
  const sway = new THREE.Group();
  const body = new THREE.Group();
  const upper = new THREE.Group();
  root.add(sway);
  sway.add(body);
  body.add(upper);
  const secondary: Secondary[] = [];
  const hang: Hang = (parent, pivot, tune, ...parts) => {
    const g = new THREE.Group();
    g.userData.keep = true;
    g.position.set(pivot[0], pivot[1], pivot[2]);
    parent.add(g);
    for (const part of parts) {
      part.position.sub(g.position);
      g.add(part);
    }
    const t = { w: 13, pitchGain: 0.004, liftGain: 0.001, maxLift: 0.03, maxPitch: 0.15, ...tune };
    // F-029: slow springs (w 11-15, zeta 0.22: 5-8 frames of lag and one visible swing), drive x2.5, clamp 28 degrees.
    secondary.push({
      g, w: t.w, zeta: 0.22, pitchGain: t.pitchGain * 2.5, liftGain: t.liftGain * 2.5, maxPitch: 28 * DEG, maxLift: t.maxLift * 2.5,
      pitch: { x: 0, v: 0 }, lift: { x: 0, v: 0 }, baseY: g.position.y,
    });
  };
  const bone = () => {
    const g = new THREE.Group();
    g.userData.keep = true;
    return g;
  };

  const torso = bone();
  torso.position.y = s.legLen;
  const torsoMesh = mesh(box(s.torsoW, s.torsoH, s.torsoD), mat(s.top));
  torsoMesh.position.y = s.torsoH / 2;
  torso.add(torsoMesh);
  const hem = mesh(box(s.torsoW * 0.96, 0.12, s.torsoD * 0.96), mat(s.pants));
  hem.position.y = 0.02;
  torso.add(hem);
  upper.add(torso);

  const head = bone();
  head.position.y = s.legLen + s.torsoH + s.headR * 0.95;
  head.add(mesh(ico(s.headR, 1), mat(s.skin)));
  const neck = mesh(cyl(s.headR * 0.42, 0.14, 6), mat(s.skin));
  neck.position.y = -s.headR * 0.85;
  head.add(neck);
  upper.add(head);

  // The plate carrier, shown while you wear armor: separate meshes, hidden until then.
  const oliveDark = mat(0x3b412a);
  const olive = mat(0x4f5638);
  const vest = bone();
  const plate = mesh(box(s.torsoW + 0.07, s.torsoH * 0.58, s.torsoD + 0.08), oliveDark);
  plate.position.y = s.torsoH * 0.6;
  vest.add(plate);
  for (let i = -1; i <= 1; i++) {
    const mag = mesh(box(0.1, 0.15, 0.06), olive);
    mag.position.set(i * 0.12, s.torsoH * 0.45, s.torsoD / 2 + 0.07);
    vest.add(mag);
  }
  vest.visible = false;
  torso.add(vest);

  // Two-bone arms (the sheet's build): an upper arm and a forearm hinged at the elbow, so hands can reach a grip.
  const makeArm = () => {
    const u = s.armLen / 2;
    const upperC = s.sleeve ?? s.top;
    const arm = bone();
    arm.add(put(mesh(cyl(s.armR, u, 7), mat(upperC)), 0, -u / 2, 0));
    if (s.rolled) arm.add(put(mesh(cyl(s.armR * 1.12, 0.07, 7), mat(upperC)), 0, -u + 0.02, 0));
    const fore = bone();
    fore.position.y = -u;
    const foreC = s.rolled || s.sleeve ? s.skin : s.top;
    fore.add(put(mesh(cyl(s.armR * (s.rolled ? 1.08 : 0.9), u, 7, s.armR * (s.rolled ? 0.95 : 0.9)), mat(foreC)), 0, -u / 2, 0));
    if (!s.hideFists) {
      const fist = mesh(ico(s.armR * s.fist, 0), mat(s.fistC ?? s.skin));
      fist.scale.set(1, 1.05, 1.1);
      fist.position.y = -u - 0.02;
      fore.add(fist);
    }
    arm.add(fore);
    return { upper: arm, fore };
  };
  const shoulderY = s.legLen + s.torsoH - s.armR * 1.2;
  const left = makeArm();
  const right = makeArm();
  const armL = left.upper;
  const armR = right.upper;
  armL.position.set(-(s.torsoW / 2 + s.armR * 0.9), shoulderY, 0);
  armR.position.set(s.torsoW / 2 + s.armR * 0.9, shoulderY, 0);
  upper.add(armL, armR);

  // Two-bone legs: a thigh and a shin hinged at the knee. The shin ends at the floor; a sock, shoe or skate sits on it.
  const makeLeg = () => {
    const t = s.legLen / 2;
    const thigh = bone();
    thigh.add(put(mesh(cyl(s.legR, t, 7), mat(s.pants)), 0, -t / 2, 0));
    const shin = bone();
    shin.position.y = -t;
    const lift = s.footLift ?? 0;
    const shinLen = t - lift;
    shin.add(put(mesh(cyl(s.legR * 0.92, shinLen, 7), mat(s.sock ? s.skin : s.pants)), 0, -shinLen / 2, 0));
    if (s.sock) shin.add(put(mesh(cyl(s.legR * 0.98, t * 0.5, 7), mat(s.sock)), 0, -t * 0.66, 0));
    // The sole, not the middle of the shoe, sits at the end of the leg: standing on a table or a walkway the feet rest on top.
    if (!lift) shin.add(put(mesh(box(s.legR * 2.3, 0.1, s.legR * 3.6), mat(s.shoes)), 0, -t + 0.05, s.legR * 0.7));
    thigh.add(shin);
    return { thigh, shin };
  };
  const ll = makeLeg();
  const lr = makeLeg();
  const legL = ll.thigh;
  const legR = lr.thigh;
  legL.position.set(-s.torsoW * 0.24, s.legLen, 0);
  legR.position.set(s.torsoW * 0.24, s.legLen, 0);
  // Legs yaw first, then stride, so a twisted stance still swings along the hips' direction.
  legL.rotation.order = 'YXZ';
  legR.rotation.order = 'YXZ';
  body.add(legL, legR);

  const chestY = s.legLen + s.torsoH * 0.6;
  const weapon = new THREE.Group();
  weapon.position.set(0, chestY, 0);
  const hand = new THREE.Object3D();
  hand.position.set(0, 0, s.torsoD / 2 + Math.min(s.armLen, 0.55));
  weapon.add(hand);
  upper.add(weapon);

  // Everything that lies on the floor in a defeat pose hangs from here (the fighter's frame, turned with the root).
  const ground = bone();
  root.add(ground);
  const eyes: THREE.Mesh[] = [];
  const fx = s.build(
    { head, torso, foreL: left.fore, foreR: right.fore, legL, legR, shinL: ll.shin, shinR: lr.shin, ground, hang, eyes },
    s,
  );
  // Bake: every static part of a bone becomes one vertex-coloured mesh (and one skin mesh).
  for (const g of [torso, head, armL, armR, legL, legR]) bake(g, s.skin);

  const life: Life = {
    id, height: s.legLen + s.torsoH + 0.08 + s.headR * 2, k: 1,
    landT: 9, landAmt: 0, takeT: 9, takeKind: 0, turnT: 9, turnDir: 0, load: 0, sx: 1, sy: 1, shot: { x: 0, v: 0 },
    flinchT: 9, flinchSide: 0, flinchAmt: 0, flinch: 0, idle: 0,
    blinkT: 1.5 + Math.random() * 3, blinkLeft: 0, prevVx: 0, prevVy: 0, prevFacing: 0, run: 0, ax: 0, ay: 0,
    secondary, eyes, belly: null, bellyBase: 1, jiggle: { x: 0, v: 0 }, thumb: null,
    headY: head.position.y, shoulderY: shoulderY, phase: Math.random() * 6.28, winT: 9, hideGun: false, events: 0, mats: [],
    down: false, winProps: false, footHalf: s.footHalf, downLift: -1,
  };
  const rig: Rig = {
    root, body, armL, armR, foreL: left.fore, foreR: right.fore, armLen: s.armLen,
    shinL: ll.shin, shinR: lr.shin, legLen: s.legLen,
    head, vest, hipYaw: 0, hipInit: false,
    shoulderL: armL.position.clone(), shoulderR: armR.position.clone(),
    legL, legR, weapon, hand, chestY, phase: 0, turn: 0,
    sway, upper, torso, life, fx, ground,
  };
  if (CHARACTER_FX.rim) applyRim(rig, RIM_COLOR[id], s.skin, opts.rimBoost ?? 1);
  return rig;
};

/** Each fighter's own colour: the rim light, the menu accent. */
/** The rim tints of roster-v2 section 4 (light, so they separate from both dark and mid backgrounds): BRIX, ORMO, ZUZU, TAVO. */
export const RIM_COLOR: Record<CharacterId, number> = { hotfix: 0xffb3a8, legacy: 0x9ff0d8, standup: 0xffc4e6, intern: 0xa9c2ff };

/**
 * Cheap effects that scale with the quality tier. `rim` decides at build time (the low tier builds plain materials);
 * `lite` is the frame-time governor's switch: it stops the dust and the hanging parts and fades the rim, no recompile.
 */
export const CHARACTER_FX = { rim: true, lite: false };
export const setCharacterFx = (tier: 'low' | 'medium' | 'high') => {
  CHARACTER_FX.rim = tier !== 'low';
};
/** Shared by every rim material: the governor sets .value to 0 to fade it out. */
const RIM_STRENGTH = { value: 1 };
export const setRimStrength = (v: number) => {
  RIM_STRENGTH.value = v;
};

/**
 * A rim light in the fighter's colour, as a fresnel term in the standard material's fragment shader: no extra
 * light, no shadow pass. The shared materials are cloned per rig (the colour is per fighter); all clones share one
 * compiled program (customProgramCacheKey), so it costs one extra shader variant, not one per fighter.
 */
const applyRim = (rig: Rig, color: number, skin: number, boost: number) => {
  const rimColor = { value: new THREE.Color(color) };
  const rimBoost = { value: boost };
  const clones = new Map<THREE.Material, THREE.Material>();
  rig.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const src = o.material as THREE.MeshStandardMaterial;
    // Never on the eyes or on skin (face, hands): they keep the plain material.
    if (o.userData.noRim || rig.life.eyes.includes(o) || src.color.getHex() === new THREE.Color(skin).getHex()) return;
    let m = clones.get(src);
    if (!m) {
      m = src.clone();
      m.onBeforeCompile = (sh) => {
        sh.uniforms.rimColor = rimColor;
        sh.uniforms.rimStrength = RIM_STRENGTH;
        sh.uniforms.rimBoost = rimBoost;
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimBoost;')
          .replace(
            '#include <opaque_fragment>',
            // A narrow edge band on faces turned away from the camera, on the top and back only (light from behind and above),
            // in the fighter's colour mixed 50 % with warm white. It adds light only where the band is: base colours stay.
            'float rimF = 1.0 - saturate(dot(normalize(vViewPosition), normal));\n' +
              '  float rimB = smoothstep(0.60, 0.80, rimF) * saturate(0.35 + dot(normal, normalize(vec3(-0.3, 0.9, -0.2))));\n' +
              '  outgoingLight += mix(rimColor, vec3(1.0, 0.945, 0.839), 0.5) * rimB * rimStrength * rimBoost;\n#include <opaque_fragment>',
          );
      };
      m.customProgramCacheKey = () => 'f42-rim';
      clones.set(src, m);
      rig.life.mats.push(m);
    }
    o.material = m;
  });
};

/** Free what a rig owns: geometry and the rim material clones. */
export const disposeRig = (rig: Rig) => {
  rig.root.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
  for (const m of rig.life.mats) m.dispose();
  rig.life.mats.length = 0;
};

export interface PoseInput {
  dt: number;
  time: number;
  vx: number;
  vy: number;
  onGround: boolean;
  facing: 1 | -1;
  /** Aim angle in world space: 0 = right, PI/2 = up. */
  aim: number;
  /** Turn the model sideways to the camera (arena) or keep it facing the viewer (gallery). */
  sideways: boolean;
  wall: -1 | 0 | 1;
  dashing: boolean;
  stunned: boolean;
  /** Two-handed guns pull both arms onto the weapon. */
  twoHanded: boolean;
  /** Seconds since the last shot: drives the recoil kick. */
  sinceShot: number;
  recoil: number;
  reloading: boolean;
  /** 0..1 while the Force Push is out. */
  pushing: number;
}

const damp = (cur: number, target: number, k: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-k * dt));

/** Largest step a spring takes at once. A 60 fps frame fits in one step, so the feel there is unchanged. */
export const SPRING_MAX_STEP = 1 / 50;

/**
 * Moves a damped spring (angular frequency w, damping ratio zeta) toward its target by dt, in place.
 * Semi-implicit Euler goes unstable once w * dt gets near 1 (a 0.1 s frame at 10 fps does it), so a long
 * frame is cut into equal steps no longer than SPRING_MAX_STEP.
 */
export const stepSpring = (s: { x: number; v: number }, target: number, w: number, zeta: number, dt: number) => {
  const n = Math.ceil(dt / SPRING_MAX_STEP - 1e-9);
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (w * w * (target - s.x) - 2 * zeta * w * s.v) * h;
    s.x += s.v * h;
  }
};
const turnSpring = { x: 0, v: 0 };

/** Procedural animation: running, jumping, aiming, recoil, Force Push. */
export const poseRig = (rig: Rig, p: PoseInput) => {
  const { dt } = p;
  const turnTarget = p.sideways ? p.facing * (Math.PI / 2 - 0.3) : 0;
  rig.turn = damp(rig.turn, turnTarget, 18, dt);
  rig.root.rotation.y = rig.turn;

  // Run cycle, played backwards when you back-pedal while aiming the other way.
  const speed = Math.abs(p.vx);
  const running = p.onGround && speed > 0.6;
  const backwards = p.vx * p.facing < 0 ? -1 : 1;
  rig.phase += dt * (running ? 4 + speed * 1.1 : 0) * backwards;
  const swing = running ? Math.sin(rig.phase) * Math.min(1, speed / 7) : 0;

  let legL = swing * 0.9;
  let legR = -swing * 0.9;
  if (!p.onGround) {
    legL = p.vy > 0 ? -0.7 : -0.25;
    legR = p.vy > 0 ? 0.35 : 0.2;
  }
  rig.legL.rotation.x = damp(rig.legL.rotation.x, legL, 20, dt);
  rig.legR.rotation.x = damp(rig.legR.rotation.x, legR, 20, dt);

  let lean = running ? 0.1 * backwards : 0;
  if (p.dashing) lean = 0.45;
  if (p.stunned) lean = -0.35;
  if (p.pushing > 0) lean = 0.3 * p.pushing;
  rig.body.rotation.x = damp(rig.body.rotation.x, lean, 14, dt);
  rig.body.rotation.z = p.stunned ? Math.sin(p.time * 30) * 0.12 : damp(rig.body.rotation.z, 0, 10, dt);
  rig.body.position.y = running ? Math.abs(Math.sin(rig.phase)) * 0.06 : 0;

  // Elevation of the aim relative to where the model faces, in [-PI/2, PI/2].
  const elev = p.sideways ? Math.atan2(Math.sin(p.aim), Math.abs(Math.cos(p.aim))) : 0.15 * Math.sin(p.time);
  const kick = Math.max(0, 1 - p.sinceShot / 0.12) * p.recoil;
  let r = -elev - kick * 0.25;
  if (p.reloading) r = 0.7 + Math.sin(p.time * 14) * 0.1;
  rig.weapon.rotation.x = damp(rig.weapon.rotation.x, r, 30, dt);
  rig.weapon.position.z = -kick * 0.12;
  rig.weapon.position.x = p.twoHanded ? 0 : 0.16;
  const toWeapon = rig.weapon.rotation.x - Math.PI / 2;

  let armL = p.onGround ? -swing * 0.8 : -0.4;
  let armR = toWeapon;
  let armLz = p.onGround ? 0 : -0.6;
  let armRz = p.twoHanded ? -0.25 : -0.08;
  if (p.twoHanded) {
    armL = toWeapon;
    armLz = 0.25;
  }
  if (p.pushing > 0) {
    // Free hand shoves forward, palm out.
    armL = -Math.PI / 2 * p.pushing;
    armLz = 0.35 * p.pushing;
  }
  rig.armL.rotation.x = damp(rig.armL.rotation.x, armL, 30, dt);
  rig.armR.rotation.x = damp(rig.armR.rotation.x, armR, 40, dt);
  rig.armL.rotation.z = damp(rig.armL.rotation.z, armLz, 14, dt);
  rig.armR.rotation.z = damp(rig.armR.rotation.z, armRz, 14, dt);
};

export const disposeObject = (obj: THREE.Object3D) => {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
};

/**
 * Where each gun sits relative to the chest (body space, model facing +z): x to the right,
 * y up, `grip` how far forward the firing hand is, `support` how much further the other hand
 * reaches along the gun (0 = both hands on the grip).
 */
const HOLD: Record<WeaponKind, { x: number; y: number; grip: number; support: number }> = {
  fists: { x: 0, y: 0, grip: 0.3, support: 0 },
  pistol: { x: 0.02, y: 0.06, grip: 0.46, support: 0 },
  uzi: { x: 0.04, y: 0.05, grip: 0.42, support: 0 },
  bomb: { x: 0.1, y: 0.02, grip: 0.36, support: 0 },
  smg: { x: 0.13, y: 0.02, grip: 0.24, support: 0.4 },
  shotgun: { x: 0.13, y: 0.03, grip: 0.24, support: 0.44 },
  railgun: { x: 0.13, y: 0.04, grip: 0.24, support: 0.46 },
  launcher: { x: 0.2, y: 0.16, grip: 0.18, support: 0.32 },
};

const tmpE = new THREE.Euler();
const tmpGrip = new THREE.Vector3();
const tmpSupport = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const vD = new THREE.Vector3();
const qA = new THREE.Quaternion();

/**
 * Point an upper arm and forearm so the hand lands on `target` (both in body space). Elbows
 * bend down and outwards. If the target is out of reach the arm straightens towards it.
 */
const reach = (upper: THREE.Group, fore: THREE.Group, shoulder: THREE.Vector3, target: THREE.Vector3, len: number, side: 1 | -1) => {
  const a = len / 2;
  const toT = vA.subVectors(target, shoulder);
  const d = Math.min(Math.max(toT.length(), 0.05), len * 0.999);
  const u = vD.copy(toT).normalize();
  // Elbow direction: out to the side and down, made perpendicular to the shoulder-hand line.
  const pole = vB.set(side * 0.8, -1, -0.2);
  pole.sub(vC.copy(u).multiplyScalar(pole.dot(u))).normalize();
  const cosA = Math.min(1, d / (2 * a));
  const sinA = Math.sqrt(1 - cosA * cosA);
  const elbowDir = vC.copy(u).multiplyScalar(cosA).addScaledVector(pole, sinA).normalize();
  upper.quaternion.setFromUnitVectors(DOWN, elbowDir);
  // Forearm: from the elbow towards the hand, expressed in the upper arm's frame.
  const elbow = vB.copy(shoulder).addScaledVector(elbowDir, a);
  const handDir = vA.copy(shoulder).addScaledVector(u, d).sub(elbow).normalize();
  handDir.applyQuaternion(qA.copy(upper.quaternion).invert());
  fore.quaternion.setFromUnitVectors(DOWN, handDir);
};

export interface TopDownPose {
  dt: number;
  time: number;
  /** World velocity on the map (m/s). */
  vx: number;
  vy: number;
  /** Where the body faces on the map (radians, 0 = +x). */
  yaw: number;
  /** How fast the visual yaw is turning (rad/s): the body banks into turns. */
  yawRate: number;
  onGround: boolean;
  dashing: boolean;
  /** Seconds since the last shot: drives the recoil kick. */
  sinceShot: number;
  /** What's in the hands: decides the grip and where each hand goes. */
  gun: WeaponKind;
  /** 0..1 through a reload, or null. */
  reload: number | null;
  /** -1 (left) .. 1 (right). */
  lean: number;
  /** 0..1 through a vault over a rail or sill, or null. */
  vault: number | null;
  /** 0..1 through the landing roll, or null. */
  roll: number | null;
}

/** How hard each gun kicks: the shotgun and the sniper rock the whole body. */
const KICK: Record<WeaponKind, number> = { fists: 0.3, pistol: 0.6, uzi: 0.3, bomb: 0.4, smg: 0.35, shotgun: 1.3, railgun: 1.5, launcher: 1.4 };

/**
 * Top-down animation, built to feel physical:
 * - the stride follows the real velocity (strafing steps sideways, back-pedalling runs the cycle
 *   backwards), the torso counter-twists, the head and the gun bob with each step;
 * - each gun kicks by its own weight: muzzle climb, the gun driven back, the shoulders rocked;
 * - reloading drops the support hand to the magazine and tilts the gun;
 * - leaning tilts the body out to the side;
 * - a vault plants a hand on the rail, tucks the legs and swings over;
 * - the landing after a parachute drop is a forward roll.
 */
export const poseTopDown = (rig: Rig, p: TopDownPose) => {
  const { dt } = p;
  const speed = Math.hypot(p.vx, p.vy);
  const amp = Math.min(1, speed / 6.5);
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

  // ---- the hips: they follow the run, the upper body follows the aim. Running sideways or
  // back-pedalling twists the waist (legs one way, gun the other) up to ~60 degrees; standing,
  // the feet stay planted until the twist gets too big, then step round under you.
  if (!rig.hipInit) {
    rig.hipYaw = p.yaw;
    rig.hipInit = true;
  }
  let hipWant = rig.hipYaw;
  if (speed > 0.6) {
    const move = Math.atan2(p.vy, p.vx);
    hipWant = Math.abs(wrap(move - p.yaw)) > 1.9 ? move + Math.PI : move; // back-pedal: hips face the gun
  } else if (Math.abs(wrap(p.yaw - rig.hipYaw)) > 0.75) hipWant = p.yaw;
  const stepping = speed <= 0.6 && Math.abs(wrap(hipWant - rig.hipYaw)) > 0.05;
  rig.hipYaw += wrap(hipWant - rig.hipYaw) * (1 - Math.exp(-(speed > 0.6 ? 10 : 7) * dt));
  // Never twist past what a waist can do: beyond it the hips are dragged round.
  const maxTwist = 1.05;
  const tw = wrap(rig.hipYaw - p.yaw);
  if (Math.abs(tw) > maxTwist) rig.hipYaw = p.yaw + Math.sign(tw) * maxTwist;
  const twist = wrap(rig.hipYaw - p.yaw);
  if (stepping) rig.phase += dt * 9; // a quick shuffle while turning on the spot
  // The head turns a little ahead of the body into a turn.
  rig.head.rotation.y = damp(rig.head.rotation.y, Math.max(-0.45, Math.min(0.45, -p.yawRate * 0.08)), 10, dt);

  const rel = Math.atan2(p.vy, p.vx) - rig.hipYaw;
  const fwd = speed > 0.05 ? Math.cos(rel) : 0;
  const side = speed > 0.05 ? Math.sin(rel) : 0;
  const running = p.onGround && speed > 0.3 && p.vault === null && p.roll === null;
  rig.phase += dt * (running ? 3.2 + speed * 1.2 : 0) * (fwd < -0.35 ? -1 : 1);
  const swing = running ? Math.sin(rig.phase) * amp : 0;
  const bob = running ? Math.abs(Math.sin(rig.phase)) : 0;

  // ---- the landing roll: curl up and turn over around the hips, then stand.
  if (p.roll !== null) {
    const k = p.roll;
    const turn = k * Math.PI * 2;
    const hip = 0.55;
    // Kept in (-PI, PI] so the body doesn't spin back a whole turn when the roll ends.
    rig.body.rotation.set(turn > Math.PI ? turn - Math.PI * 2 : turn, 0, 0);
    rig.body.position.set(0, hip - hip * Math.cos(turn) - 0.35 * Math.sin(k * Math.PI), -hip * Math.sin(turn) * 0.4);
    const tuck = Math.sin(k * Math.PI);
    rig.legL.rotation.set(-1.6 * tuck, 0, 0);
    rig.legR.rotation.set(-1.4 * tuck, 0, 0);
    rig.shinL.rotation.set(2.0 * tuck, 0, 0);
    rig.shinR.rotation.set(1.8 * tuck, 0, 0);
    rig.armL.quaternion.setFromEuler(tmpE.set(-1.2 * tuck, 0, 0.3));
    rig.armR.quaternion.setFromEuler(tmpE.set(-1.2 * tuck, 0, -0.3));
    rig.foreL.quaternion.setFromEuler(tmpE.set(-1.4 * tuck, 0, 0));
    rig.foreR.quaternion.setFromEuler(tmpE.set(-1.4 * tuck, 0, 0));
    rig.weapon.visible = false;
    return;
  }
  rig.body.rotation.y = damp(rig.body.rotation.y, running ? -swing * 0.12 * Math.abs(fwd) : 0, 12, dt); // torso twist

  // ---- legs: stride along the direction of travel; tucked during a vault.
  const along = Math.max(Math.abs(fwd), 0.25);
  let kneeL: number;
  let kneeR: number;
  if (p.vault !== null) {
    const tuck = Math.sin(Math.min(1, p.vault / 0.8) * Math.PI);
    rig.legL.rotation.x = damp(rig.legL.rotation.x, -1.3 * tuck, 25, dt);
    rig.legR.rotation.x = damp(rig.legR.rotation.x, -0.9 * tuck, 25, dt);
    rig.legL.rotation.z = damp(rig.legL.rotation.z, 0.5 * tuck, 25, dt);
    rig.legR.rotation.z = damp(rig.legR.rotation.z, 0.5 * tuck, 25, dt);
    kneeL = 1.9 * tuck;
    kneeR = 1.6 * tuck;
  } else {
    // A real run cycle: the leg swinging through bends hard at the knee and lifts the foot; the
    // standing leg stays nearly straight. Standing still: a ready stance, knees a little bent.
    const c = running ? Math.cos(rig.phase) : 0;
    const ready = 0.22;
    rig.legL.rotation.x = damp(rig.legL.rotation.x, -swing * 1.0 * along - ready * 0.6, 16, dt);
    rig.legR.rotation.x = damp(rig.legR.rotation.x, swing * 1.0 * along - ready * 0.6, 16, dt);
    rig.legL.rotation.z = damp(rig.legL.rotation.z, -swing * 0.45 * side - 0.04, 16, dt);
    rig.legR.rotation.z = damp(rig.legR.rotation.z, swing * 0.45 * side + 0.04, 16, dt);
    kneeL = ready + (running ? Math.max(0, c) * 1.5 * amp + 0.15 * amp : 0);
    kneeR = ready + (running ? Math.max(0, -c) * 1.5 * amp + 0.15 * amp : 0);
  }
  rig.shinL.rotation.x = damp(rig.shinL.rotation.x, kneeL, 18, dt);
  rig.shinR.rotation.x = damp(rig.shinR.rotation.x, kneeR, 18, dt);
  // Legs face the hips (local yaw is the opposite sign of map yaw). A small step on the spot lifts
  // the feet while turning.
  rig.legL.rotation.y = -twist;
  rig.legR.rotation.y = -twist;
  if (stepping) {
    const lift = Math.max(0, Math.sin(rig.phase)) * 0.5;
    rig.shinL.rotation.x += lift;
    rig.legL.rotation.x -= lift * 0.4;
  }
  // Keep the lower foot on the ground: the body drops as far as the bent legs shorten it.
  const reachOf = (thigh: number, knee: number) => (Math.cos(thigh) + Math.cos(thigh + knee)) / 2;
  const legDrop = rig.legLen * (1 - Math.max(reachOf(rig.legL.rotation.x, rig.shinL.rotation.x), reachOf(rig.legR.rotation.x, rig.shinR.rotation.x)));

  // ---- body: lean into the run, bank into turns, lean out (Q/E), the kick of the gun.
  const sinceShot = p.sinceShot;
  const kickT = sinceShot < 0.25 ? sinceShot / 0.25 : 1;
  // A kick that snaps back and settles with a small overshoot.
  const kick = (1 - kickT) * Math.cos(kickT * Math.PI * 1.5) * KICK[p.gun];
  // Running leans the body into it like a soldier on the move; firing straightens it a little.
  let leanX = p.dashing ? 0.45 : 0.26 * fwd * amp + 0.05 - kick * 0.07;
  let bank = Math.max(-0.18, Math.min(0.18, -p.yawRate * 0.035)) + 0.08 * side * amp - p.lean * 0.38;
  if (p.vault !== null) {
    // Swing over sideways with the weight on the planted hand.
    leanX = 0.35 * Math.sin(p.vault * Math.PI);
    bank = -0.55 * Math.sin(p.vault * Math.PI);
  }
  rig.body.rotation.x = damp(rig.body.rotation.x, leanX, 14, dt);
  rig.body.rotation.z = damp(rig.body.rotation.z, bank, 10, dt);
  const breathe = running ? 0 : Math.sin(p.time * 2.1) * 0.012;
  rig.body.position.set(
    damp(rig.body.position.x, p.lean * 0.22, 10, dt),
    (running ? bob * 0.06 * amp : breathe) - legDrop,
    -kick * 0.05,
  );

  // ---- the gun: at the chest, stock at the right shoulder; bobs with the steps, kicks by its
  // weight, tilts and drops a little during a reload.
  const h = HOLD[p.gun];
  const step = running ? Math.sin(rig.phase * 2) * 0.03 * amp : 0;
  const sway = running ? Math.sin(rig.phase) * 0.05 * amp : Math.sin(p.time * 1.3) * 0.02;
  const r = p.reload;
  const reloadTilt = r === null ? 0 : Math.sin(Math.min(1, r * 1.3) * Math.PI) * 0.55;
  rig.weapon.visible = p.gun !== 'fists' && p.vault === null;
  rig.weapon.position.set(h.x + sway * 0.4, rig.chestY + h.y + step - reloadTilt * 0.12, -Math.max(0, kick) * 0.12);
  // Running without firing for a moment: the gun drops to low ready, muzzle down; it comes up
  // the moment you shoot.
  const lowReady = running && sinceShot > 0.8 && p.gun !== 'pistol' && p.gun !== 'uzi' ? 0.35 * amp : 0;
  rig.weapon.rotation.x = damp(rig.weapon.rotation.x, -kick * 0.35 + sway * 0.4 + reloadTilt * 0.5 + lowReady, 30 - lowReady * 40, dt);
  rig.weapon.rotation.y = damp(rig.weapon.rotation.y, sway * 0.6, 10, dt);
  rig.weapon.rotation.z = damp(rig.weapon.rotation.z, reloadTilt * 0.6 + p.lean * 0.2, 12, dt);
  rig.hand.position.set(0, 0, h.grip);

  if (p.vault !== null) {
    // Both hands planted on the rail ahead, sliding back as the body goes over it.
    const k = p.vault;
    const z = 0.55 - Math.max(0, k - 0.15) * 1.4;
    const y = 0.95 - rig.body.position.y;
    tmpGrip.set(0.22, y, z);
    tmpSupport.set(-0.22, y, z);
    if (k < 0.75) {
      reach(rig.armR, rig.foreR, rig.shoulderR, tmpGrip, rig.armLen, 1);
      reach(rig.armL, rig.foreL, rig.shoulderL, tmpSupport, rig.armLen, -1);
    } else {
      rig.armL.quaternion.setFromEuler(tmpE.set(-0.6, 0, 0.5));
      rig.armR.quaternion.setFromEuler(tmpE.set(-0.6, 0, -0.5));
    }
    return;
  }

  if (p.gun === 'fists') {
    // Arms pump with the stride, elbows bent; a jab on each punch.
    const jab = Math.max(0, 1 - sinceShot / 0.2);
    const swingArm = (upper: THREE.Group, fore: THREE.Group, sign: number) => {
      const punch = sign > 0 ? jab : 0;
      upper.quaternion.setFromEuler(tmpE.set(p.onGround ? sign * swing * 0.9 * along - punch * 1.4 : -0.4, 0, sign * 0.1));
      fore.quaternion.setFromEuler(tmpE.set(-0.6 - Math.max(0, sign * swing) * 0.6 + punch * 0.5, 0, 0));
    };
    swingArm(rig.armL, rig.foreL, -1);
    swingArm(rig.armR, rig.foreR, 1);
    return;
  }
  // Two-bone IK: right hand on the grip, left hand on the fore-end (or cupping the pistol grip);
  // during a reload the left hand goes down to the magazine well and back.
  rig.weapon.updateMatrix();
  tmpGrip.set(0, -0.02, h.grip).applyMatrix4(rig.weapon.matrix);
  if (r !== null && r < 0.85) {
    const drop = Math.sin(Math.min(1, r / 0.85) * Math.PI);
    tmpSupport.set(-0.05, -0.12 - drop * 0.35, h.grip + 0.1).applyMatrix4(rig.weapon.matrix);
  } else {
    tmpSupport.set(h.support === 0 ? -0.05 : 0, h.support === 0 ? -0.04 : 0.03, h.grip + h.support).applyMatrix4(rig.weapon.matrix);
  }
  reach(rig.armR, rig.foreR, rig.shoulderR, tmpGrip, rig.armLen, 1);
  reach(rig.armL, rig.foreL, rig.shoulderL, tmpSupport, rig.armLen, -1);
};

/**
 * Hanging under the parachute: hands up on the risers, legs loose and swinging a little,
 * the body tilted the way you steer. With the gun out (you fired in the last moments) the right
 * hand brings the pistol down and forward while the left keeps hold of a riser.
 */
export const poseChute = (rig: Rig, p: { dt: number; time: number; seed: number; steerX: number; steerZ: number; shooting: boolean }) => {
  const { dt, time, seed } = p;
  rig.body.position.set(0, 0, 0);
  rig.body.rotation.x = damp(rig.body.rotation.x, p.steerZ * 0.12, 4, dt);
  rig.body.rotation.z = damp(rig.body.rotation.z, -p.steerX * 0.12, 4, dt);
  rig.body.rotation.y = 0;
  const dangle = Math.sin(time * 1.7 + seed) * 0.18;
  rig.legL.rotation.set(dangle - 0.1, 0, -0.05);
  rig.legR.rotation.set(-dangle * 0.8 - 0.05, 0, 0.05);
  rig.shinL.rotation.set(0.35 + dangle * 0.5, 0, 0);
  rig.shinR.rotation.set(0.25 - dangle * 0.4, 0, 0);
  rig.armL.quaternion.setFromEuler(tmpE.set(Math.PI - 0.35, 0, -0.35));
  rig.foreL.quaternion.setFromEuler(tmpE.set(0.25, 0, 0));
  rig.weapon.visible = p.shooting;
  if (p.shooting) {
    const h = HOLD.pistol;
    rig.weapon.position.set(h.x + 0.1, rig.chestY + h.y, 0);
    rig.weapon.rotation.set(0, 0, 0);
    rig.hand.position.set(0, 0, h.grip);
    rig.weapon.updateMatrix();
    tmpGrip.set(0, -0.02, h.grip).applyMatrix4(rig.weapon.matrix);
    reach(rig.armR, rig.foreR, rig.shoulderR, tmpGrip, rig.armLen, 1);
  } else {
    rig.armR.quaternion.setFromEuler(tmpE.set(Math.PI - 0.35, 0, 0.35));
    rig.foreR.quaternion.setFromEuler(tmpE.set(0.25, 0, 0));
  }
};

/**
 * Free fall, face down: arms out and bent up towards the sky, knees bent with the feet up behind,
 * the limbs fluttering in the wind. The caller tips the root so the body lies flat.
 */
export const poseFreefall = (rig: Rig, p: { dt: number; time: number; seed: number }) => {
  const f = Math.sin(p.time * 7 + p.seed) * 0.06;
  rig.body.position.set(0, 0, 0);
  rig.body.rotation.set(1.3, 0, Math.sin(p.time * 0.8 + p.seed) * 0.04);
  rig.weapon.visible = false;
  // Limbs in the body's frame: -z is the back, which faces the sky.
  rig.armL.quaternion.setFromEuler(tmpE.set(0.55 + f, 0, -1.25));
  rig.armR.quaternion.setFromEuler(tmpE.set(0.55 - f, 0, 1.25));
  rig.foreL.quaternion.setFromEuler(tmpE.set(1.1, 0, 0));
  rig.foreR.quaternion.setFromEuler(tmpE.set(1.1, 0, 0));
  rig.legL.rotation.set(0.35 - f, 0, -0.25);
  rig.legR.rotation.set(0.35 + f, 0, 0.25);
  rig.shinL.rotation.set(1.25, 0, 0);
  rig.shinR.rotation.set(1.25, 0, 0);
};

export interface SidePose {
  dt: number;
  time: number;
  vx: number;
  vy: number;
  onGround: boolean;
  /** 1 facing right, -1 facing left. */
  facing: 1 | -1;
  /** Aim angle in world space: 0 = right, PI/2 = up. */
  aim: number;
  /** -1 / 1 while sliding down a wall on that side, else 0. */
  wall: number;
  dashing: boolean;
  stunned: boolean;
  gun: GunKind;
  /** Seconds since the last shot. */
  sinceShot: number;
  /** 0..1 through a reload, or null. */
  reload: number | null;
  /** 0..1 while the Force Push is out. */
  pushing: number;
  /** 0 standing .. 1 crouched (the sim eases it in 0.1 s). */
  crouch?: number;
}

/**
 * The squat at full crouch (angles in the world): thighs forward, knees deep, the torso leaning over the gun
 * from the hips. It brings the top of the body down to about the crouched hitbox (CROUCH.height, 52 %).
 */
const CROUCH_POSE = { thighL: -1.5, thighR: -1.25, kneeL: 2.75, kneeR: 2.8, lean: 0.6, head: 0.45 };

/**
 * Floor 42's side-on animation, with the same body as the battle royale: two-bone arms that hold
 * the gun by the grip and fore-end and point it where you aim (up and down too), two-bone legs
 * with knees, a real run cycle (and back-pedalling when you run away from where you aim), a knee
 * drive on the jump, legs braced on a wall slide, the lean of a dash, a gun that kicks by its
 * weight, a reload with the hand at the magazine, and the free hand shoving on a Force Push.
 * The body turns round through the camera when you change sides, on a spring.
 */
export const poseSide = (rig: Rig, p: SidePose) => {
  const { dt } = p;
  if (dt > 0) advanceWeight(rig, dt);
  if (rig.life.down) {
    // Back on their feet after a knock-out: the defeat props go away (the pose itself is rebuilt every frame below).
    rig.life.down = false;
    rig.fx.setProps(null);
    rig.life.winProps = false;
  }
  // Turn three-quarters to the side you face; a spring a little under critical damping.
  const turnTarget = p.facing * (Math.PI / 2 - 0.3);
  const w = 16;
  const ud = rig.root.userData as { turnV?: number };
  turnSpring.x = rig.turn;
  turnSpring.v = ud.turnV ?? 0;
  stepSpring(turnSpring, turnTarget, w, 0.75, dt);
  rig.turn = turnSpring.x;
  ud.turnV = turnSpring.v;
  rig.root.rotation.y = rig.turn;

  const speed = Math.abs(p.vx);
  const amp = Math.min(1, speed / 7);
  const fwd = speed > 0.3 ? Math.sign(p.vx) * p.facing : 0; // 1 forward, -1 back-pedalling
  const running = p.onGround && speed > 0.5 && !p.dashing;
  rig.phase += dt * (running ? 3.4 + speed * 1.15 : 0) * (fwd < 0 ? -1 : 1);
  const swing = running ? Math.sin(rig.phase) * amp : 0;
  const c = running ? Math.cos(rig.phase) : 0;

  // ---- legs
  let tl: number;
  let tr: number;
  let kl: number;
  let kr: number;
  if (p.wall !== 0 && !p.onGround) {
    // Braced on the wall: knees up, feet against it.
    tl = -0.9; tr = -0.5; kl = 1.4; kr = 1.0;
  } else if (!p.onGround) {
    // Rising: drive one knee up; falling: legs reach down for the floor.
    const rise = Math.max(0, Math.min(1, p.vy / 8));
    tl = -0.2 - 0.9 * rise; tr = 0.25 - 0.2 * rise;
    kl = 0.4 + 1.2 * rise; kr = 0.5 + 0.3 * rise;
  } else if (p.dashing) {
    tl = -0.7; tr = 0.6; kl = 0.5; kr = 1.1;
  } else {
    // Standing still, each fighter drops into their own idle stance from the sheets (Brix's skater crouch, Ormo's wide stand).
    const ready = 0.24 + STANCE[rig.life.id].knee * rig.life.idle;
    tl = -swing * 1.0 - ready * 0.6;
    tr = swing * 1.0 - ready * 0.6;
    kl = ready + (running ? Math.max(0, c) * 1.5 * amp + 0.15 * amp : 0);
    kr = ready + (running ? Math.max(0, -c) * 1.5 * amp + 0.15 * amp : 0);
  }
  // Crouch: blend into the squat by the sim's crouch amount; the stride shrinks to a shuffle. While crouching
  // (and a moment after standing up) the joints follow fast, so the pose keeps up with the 0.1 s hitbox.
  // The knee bend of a landing (load 0.75, 130 ms) and of a take-off (0.9, 60 ms; the sim has already jumped) borrows the squat, in the air too.
  const cr = Math.max(p.onGround && !p.dashing ? (p.crouch ?? 0) : 0, rig.life.load);
  const ud2 = rig.root.userData as { crouchT?: number; crouchLean?: number; shotRot?: number };
  ud2.crouchT = cr > 0 ? 0.2 : Math.max(0, (ud2.crouchT ?? 0) - dt);
  const quick = ud2.crouchT > 0;
  // The crouch lean turns the body at the hips: the legs take it back out, so they keep their angles in the world.
  const cl = CROUCH_POSE.lean * cr;
  if (cr > 0) {
    const C = CROUCH_POSE;
    tl += (C.thighL - swing * 0.3 - tl) * cr;
    tr += (C.thighR + swing * 0.3 - tr) * cr;
    kl += (C.kneeL - kl) * cr;
    kr += (C.kneeR - kr) * cr;
  }
  const lk = quick ? 45 : p.onGround ? 18 : 12;
  rig.legL.rotation.x = damp(rig.legL.rotation.x, tl - cl, lk, dt);
  rig.legR.rotation.x = damp(rig.legR.rotation.x, tr - cl, lk, dt);
  rig.legL.rotation.y = 0;
  rig.legR.rotation.y = 0;
  const spread = STANCE[rig.life.id].spread * rig.life.idle;
  rig.legL.rotation.z = damp(rig.legL.rotation.z, -0.04 - spread, 10, dt);
  rig.legR.rotation.z = damp(rig.legR.rotation.z, 0.04 + spread, 10, dt);
  rig.shinL.rotation.x = damp(rig.shinL.rotation.x, kl, lk, dt);
  rig.shinR.rotation.x = damp(rig.shinR.rotation.x, kr, lk, dt);
  // A tilted foot dips below the ankle by half its length times the tilt: the body stands that much higher.
  const tilt = rig.life.footHalf / rig.legLen;
  const reachOf = (thigh: number, knee: number) => (Math.cos(thigh) + Math.cos(thigh + knee)) / 2 + tilt * Math.abs(Math.sin(thigh + knee));
  const legDrop = p.onGround ? rig.legLen * (1 - Math.max(reachOf(rig.legL.rotation.x + cl, rig.shinL.rotation.x), reachOf(rig.legR.rotation.x + cl, rig.shinR.rotation.x))) : 0;

  // ---- body
  const kickT = p.sinceShot < 0.25 ? p.sinceShot / 0.25 : 1;
  const kick = (1 - kickT) * Math.cos(kickT * Math.PI * 1.5) * KICK[p.gun];
  // The run lean is mostly the torso bending at the hips (lifeRig adds 10 degrees there): the legs keep their stride.
  let lean = 0.08 * fwd * amp + 0.04 - kick * 0.07;
  if (p.dashing) lean = 0.55;
  if (p.pushing > 0) lean = 0.3 * p.pushing;
  if (!p.onGround && p.vy > 0) lean = 0.12;
  // The usual lean eases as before; the crouch lean (already eased by the sim) rides on top of it.
  const baseLean = rig.body.rotation.x - (ud2.crouchLean ?? 0);
  rig.body.rotation.x = damp(baseLean, lean, 12, dt) + cl;
  ud2.crouchLean = cl;
  rig.body.rotation.y = damp(rig.body.rotation.y, running ? -swing * 0.1 : 0, 12, dt);
  rig.body.rotation.z = p.stunned ? Math.sin(p.time * 30) * 0.12 : damp(rig.body.rotation.z, 0, 10, dt);
  const bob = running ? Math.abs(Math.sin(rig.phase)) * 0.035 * rig.life.height * amp : Math.sin(p.time * 2.1) * 0.012;
  // Keep the hips over the feet while the crouch lean turns the body.
  rig.body.position.set(0, bob - legDrop + rig.legLen * (1 - Math.cos(cl)), -Math.max(0, kick) * 0.05 - rig.legLen * Math.sin(cl));
  rig.head.rotation.y = 0;
  rig.head.rotation.x = -CROUCH_POSE.head * cr; // look up at the rival, not at the floor

  // ---- the gun: pointed where you aim (up and down), kicked by its weight, tilted on a reload.
  const h = HOLD[p.gun];
  const elev = Math.atan2(Math.sin(p.aim), Math.abs(Math.cos(p.aim)));
  const r = p.reload;
  const reloadTilt = r === null ? 0 : Math.sin(Math.min(1, r * 1.3) * Math.PI) * 0.5;
  const sway = running ? Math.sin(rig.phase) * 0.04 * amp : Math.sin(p.time * 1.3) * 0.015;
  rig.weapon.visible = true;
  // Both hands hold the gun, so the arms' counter-swing (+/-25 degrees at the shoulder, opposite the lead leg) is the
  // gun carried along that arc; it settles while you shoot, reload or push.
  const busy = r !== null || p.pushing > 0 ? 0 : Math.min(1, p.sinceShot / 0.5);
  const armA = running ? -swing * 25 * DEG * busy : 0;
  const L = rig.life;
  rig.weapon.position.set(
    h.x,
    rig.chestY + h.y + (running ? Math.sin(rig.phase * 2) * 0.025 * amp : 0) - 0.45 * (1 - Math.cos(armA)),
    -Math.max(0, kick) * 0.12 + 0.45 * Math.sin(armA) - L.shot.x * 0.08,
  );
  // The crouch lean is taken back out of the gun, so it stays on the aim. A shot kicks the gun arm up 14 degrees.
  const shotRot = L.shot.x * 14 * DEG;
  rig.weapon.rotation.x =
    damp(rig.weapon.rotation.x + (ud2.shotRot ?? 0), -elev - kick * 0.3 + sway * 0.3 + reloadTilt * 0.5 - cl - armA * 0.4, quick ? 40 : 28, dt) - shotRot;
  ud2.shotRot = shotRot;
  rig.weapon.rotation.y = 0;
  rig.weapon.rotation.z = damp(rig.weapon.rotation.z, reloadTilt * 0.6, 12, dt);
  rig.hand.position.set(0, 0, h.grip);
  rig.weapon.updateMatrix();
  tmpGrip.set(0, -0.02, h.grip).applyMatrix4(rig.weapon.matrix);
  reach(rig.armR, rig.foreR, rig.shoulderR, tmpGrip, rig.armLen, 1);
  if (p.pushing > 0) {
    // The free hand shoves straight out, palm first.
    tmpSupport.set(-0.1, rig.chestY + 0.15, 0.25 + 0.55 * p.pushing);
  } else if (r !== null && r < 0.85) {
    const drop = Math.sin(Math.min(1, r / 0.85) * Math.PI);
    tmpSupport.set(-0.05, -0.12 - drop * 0.35, h.grip + 0.1).applyMatrix4(rig.weapon.matrix);
  } else {
    tmpSupport.set(h.support === 0 ? -0.05 : 0, h.support === 0 ? -0.04 : 0.03, h.grip + h.support).applyMatrix4(rig.weapon.matrix);
  }
  reach(rig.armL, rig.foreL, rig.shoulderL, tmpSupport, rig.armLen, -1);
};

const wBox = new THREE.Box3();
const dQ = new THREE.Quaternion();
const dE = new THREE.Euler();
const jointRad = (j: { x?: number; y?: number; z?: number } | undefined) => dE.set((j?.x ?? 0) * DEG, (j?.y ?? 0) * DEG, (j?.z ?? 0) * DEG);
/** An arm or forearm turns from where it is towards the pose's angles by `w` (0..1). */
const blendLimb = (g: THREE.Group, j: { x?: number; y?: number; z?: number } | undefined, w: number) => {
  g.quaternion.slerp(dQ.setFromEuler(jointRad(j)), w);
};
/** A thigh, shin or head eases its rotation towards the pose's angles by `w`. */
const blendJoint = (g: THREE.Object3D, j: { x?: number; y?: number; z?: number } | undefined, w: number) => {
  g.rotation.x += ((j?.x ?? 0) * DEG - g.rotation.x) * w;
  g.rotation.y += ((j?.y ?? 0) * DEG - g.rotation.y) * w;
  g.rotation.z += ((j?.z ?? 0) * DEG - g.rotation.z) * w;
};
/** The limbs and head of a sheet pose, `w` of the way from where they are. */
const blendPose = (rig: Rig, p: PoseDef, w: number) => {
  blendLimb(rig.armL, p.armL, w);
  blendLimb(rig.armR, p.armR, w);
  blendLimb(rig.foreL, p.foreL, w);
  blendLimb(rig.foreR, p.foreR, w);
  blendJoint(rig.legL, p.legL, w);
  blendJoint(rig.legR, p.legR, w);
  blendJoint(rig.shinL, p.shinL, w);
  blendJoint(rig.shinR, p.shinR, w);
  blendJoint(rig.head, p.head, w);
};
/** Everything a pose sets, back to the rest shape. */
const resetBones = (rig: Rig) => {
  for (const g of [rig.armL, rig.armR, rig.foreL, rig.foreR]) g.quaternion.identity();
  for (const g of [rig.legL, rig.legR, rig.shinL, rig.shinR, rig.head, rig.sway, rig.body]) g.rotation.set(0, 0, 0);
  rig.body.position.set(0, 0, 0);
  rig.sway.position.set(0, 0, 0);
  rig.torso.scale.set(1, 1, 1);
  rig.upper.rotation.set(0, 0, 0);
  rig.upper.position.set(0, 0, 0);
  rig.head.position.y = rig.life.headY;
  rig.armL.position.y = rig.shoulderL.y;
  rig.armR.position.y = rig.shoulderR.y;
};
/** Bend the torso (everything above the hips) by the pose's angles, the hips staying where they are. */
const bendTorso = (rig: Rig, j: { x?: number; y?: number; z?: number } | undefined, w: number) => {
  rig.upper.rotation.set((j?.x ?? 0) * DEG * w, (j?.y ?? 0) * DEG * w, (j?.z ?? 0) * DEG * w);
  wV.set(0, rig.legLen, 0).applyEuler(rig.upper.rotation);
  rig.upper.position.set(-wV.x, rig.legLen - wV.y, -wV.z);
};

/**
 * Knocked out: the sheet's defeat pose, `t` seconds in (the fall takes 0.6 s): Brix flat on her back with her skate off, Ormo sitting
 * in his tea, Zuzu with her red card, Tavo with the pan on his head. `seed` is kept for callers; the pose is the same every time.
 */
export const poseDeath = (rig: Rig, t: number, _seed: number) => {
  const k = Math.min(1, t / 0.6);
  const e = k < 1 ? 1 - Math.pow(1 - k, 3) : 1;
  const bounce = k >= 1 ? 0 : Math.sin(k * Math.PI) * 0.05;
  const pose = SHEET_POSES[rig.life.id].defeat;
  resetBones(rig);
  rig.weapon.visible = false;
  blendPose(rig, pose, e);
  bendTorso(rig, pose.torso, e);
  rig.body.rotation.x = (pose.root?.x ?? 0) * DEG * e;
  rig.body.position.set(0, (pose.root?.y ?? 0) * e + bounce, -(pose.root?.pz ?? 0) * e);
  // Nothing sinks into the floor: lift the pose by how far its lowest point is below the feet (measured while it settles, then kept).
  if (!rig.life.down) rig.life.downLift = -1;
  let lift = rig.life.downLift;
  if (k < 1 || lift < 0) {
    rig.root.updateMatrixWorld(true);
    wBox.setFromObject(rig.body);
    lift = Math.max(0, rig.root.position.y - wBox.min.y);
  }
  rig.life.downLift = k < 1 ? -1 : lift;
  rig.body.position.y += lift;
  rig.life.down = true;
  rig.fx.setExpr(k < 0.35 ? 'shock' : pose.expr);
  rig.fx.setProps(k >= 0.6 ? (pose.flags ?? null) : null);
  rig.fx.tick(0.016, t);
  for (const eye of rig.life.eyes) eye.scale.y = rig.fx.eyeTall;
};

/**
 * One of the sheet poses (idle, victory, defeat, taunt) held still, for the home page, the result screen and the portraits.
 * Frees the rig from the gun and from the fight's lean: call it instead of poseSide.
 */
export const poseShow = (rig: Rig, kind: ShowPose, time = 0) => {
  const pose = SHEET_POSES[rig.life.id][kind];
  resetBones(rig);
  rig.weapon.visible = false;
  blendPose(rig, pose, 1);
  bendTorso(rig, pose.torso, 1);
  rig.body.rotation.x = (pose.root?.x ?? 0) * DEG;
  rig.body.position.set(0, pose.root?.y ?? 0, -(pose.root?.pz ?? 0));
  rig.life.down = kind === 'defeat';
  rig.fx.setExpr(pose.expr);
  rig.fx.setProps(pose.flags ?? null);
  rig.fx.tick(0.016, time);
};

// ---------------------------------------------------------------------------------------------------------------
// Weight and life (purely visual; the sim never sees any of it). F-029..F-031: every one-shot body effect holds its
// peak >= 100 ms (near the top), moves the outline >= 8 px at 1280x720 with the follow camera (about 54 px per metre)
// and returns with one spring overshoot. Everything runs on state kept in rig.life: no allocation per frame.
// ---------------------------------------------------------------------------------------------------------------

const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
/** 1 until `hold`, eases to -over by `ret` (one overshoot), settles to 0 by `end`. */
export const ringEnv = (t: number, hold: number, ret: number, end: number, over: number) =>
  t < hold ? 1 : t < ret ? 1 - (1 + over) * smooth((t - hold) / (ret - hold)) : t < end ? -over * (1 - smooth((t - ret) / (end - ret))) : 0;

const AXIS_Z = new THREE.Vector3(0, 0, 1);
const wQa = new THREE.Quaternion();
const wQb = new THREE.Quaternion();
const wE = new THREE.Euler();
const wV = new THREE.Vector3();

/** The jump just left the ground: knee bend (load 0.9) and root dip 18 % for 60 ms, then a stretch peaking at 100 ms. Air jumps only stretch. */
export const startTakeoff = (rig: Rig, air = false) => {
  rig.life.takeT = 0;
  rig.life.takeKind = air ? 2 : 1;
};

/** A landing: `hard` 0..1 is how fast you hit ((|vy| - 4) / 12). Squash, knee bend and a belly jiggle. */
export const startLanding = (rig: Rig, hard: number) => {
  rig.life.landT = 0;
  rig.life.landAmt = Math.min(1, hard);
  rig.life.jiggle.x = -hard;
  rig.life.jiggle.v = 0;
};

/** A hit: tilt away from the shot. side +1 = the shot came from the right (the top goes to -x); amount 1 = a normal hit, 1.5 = a heavy one. */
export const startFlinch = (rig: Rig, side: number, amount = 1) => {
  rig.life.flinchT = 0;
  rig.life.flinchSide = side >= 0 ? 1 : -1;
  rig.life.flinchAmt = amount;
  rig.life.jiggle.x = 0.8 * Math.min(1.5, amount);
  rig.life.jiggle.v = 0;
};

/** Per-gun share of the body kick: shotgun, rocket launcher and railgun x2.2, SMG and Uzi x0.5 (they pile up to 9 degrees of torso). */
export const SHOT_KICK: Partial<Record<GunKind, number>> = { shotgun: 2.2, launcher: 2.2, railgun: 2.2, smg: 0.5, uzi: 0.5 };
const SHOT_CAP_LIGHT = 9 / 5;
export const startShot = (rig: Rig, gun: GunKind) => {
  const a = SHOT_KICK[gun] ?? 1;
  rig.life.shot.x = Math.min(Math.max(SHOT_CAP_LIGHT, a), rig.life.shot.x + a);
  rig.life.shot.v = 0;
};

/** The winner pose (0.9 s): call at the final knockout for the fighter who stays up. */
export const startWinner = (rig: Rig) => {
  rig.life.winT = 0;
};
export const cancelWinner = (rig: Rig) => {
  const L = rig.life;
  L.winT = 9;
  L.hideGun = false;
  if (L.thumb) L.thumb.visible = false;
};

export interface LifeInput {
  /** Pose time step (0 during hit-stop: the flinch holds its peak on the freeze frame). */
  dt: number;
  /** Real frame time: the flinch eases in even while the pose is frozen. */
  rawDt: number;
  time: number;
  vx: number;
  vy: number;
  onGround: boolean;
  dashing?: boolean;
  facing: 1 | -1;
}

const clampAbs = (v: number, m: number) => (v > m ? m : v < -m ? -m : v);

/**
 * Timers and the numbers poseSide and the caller read: knee-bend load, whole-body scale (L.sx, L.sy; the caller sets
 * root.scale), the gun-kick spring. Runs at the top of poseSide, with the pose time step (0 on a hit-stop frame).
 */
const advanceWeight = (rig: Rig, dt: number) => {
  const L = rig.life;
  L.landT += dt;
  L.takeT += dt;
  L.turnT += dt;
  stepSpring(L.shot, 0, 24, 0.55, dt);
  let dy = 0;
  let dx = 0;
  let load = 0;
  if (L.landT < LAND.end) {
    const e = ringEnv(L.landT, LAND.hold, LAND.ret, LAND.end, LAND.over) * L.landAmt;
    dy -= LAND.y * e;
    dx += LAND.x * e;
    if (L.landT < LAND.loadSeconds) load = LAND.loadAmt * L.landAmt * (0.5 + 0.5 * Math.cos((Math.PI * L.landT) / LAND.loadSeconds));
  }
  if (L.takeKind === 1) {
    const t = L.takeT;
    const T = TAKEOFF;
    const y =
      t < 0.03 ? -T.dip * smooth(t / 0.03)
      : t < T.loadSeconds ? -T.dip
      : t < T.peakAt ? -T.dip + (T.y + T.dip) * smooth((t - T.loadSeconds) / (T.peakAt - T.loadSeconds))
      : t < T.end ? T.y * (1 - smooth((t - T.peakAt) / (T.end - T.peakAt)))
      : 0;
    dy += y;
    dx -= y * (T.x / T.y);
    if (t < T.loadSeconds + 0.03) load = Math.max(load, T.load * (t < T.loadSeconds ? 1 : 1 - smooth((t - T.loadSeconds) / 0.03)));
    if (t >= T.end) L.takeKind = 0;
  } else if (L.takeKind === 2) {
    const t = L.takeT;
    const y = t < TAKEOFF.peakAt ? TAKEOFF.airY * smooth(t / TAKEOFF.peakAt) : t < TAKEOFF.end ? TAKEOFF.airY * (1 - smooth((t - TAKEOFF.peakAt) / (TAKEOFF.end - TAKEOFF.peakAt))) : 0;
    dy += y;
    dx -= y * (TAKEOFF.x / TAKEOFF.y);
    if (t >= TAKEOFF.end) L.takeKind = 0;
  }
  L.load = load * L.k;
  L.sy = Math.max(0.5, 1 + dy * L.k);
  L.sx = 1 + dx * L.k;
};

const winEnv = (t: number) => smooth(t / 0.12) * (1 - smooth((t - 0.76) / 0.14));

/** Winner poses: the sheet's victory pose blended over the normal one, last thing in lifeRig. The gun is put away. */
const applyWinner = (rig: Rig, t: number) => {
  const L = rig.life;
  const e = winEnv(t);
  const full = L.k >= 1;
  const kk = Math.min(1, t / WINNER_SECONDS);
  const pose = SHEET_POSES[L.id].victory;
  L.hideGun = e > 0.02;
  blendPose(rig, pose, e);
  if (full) rig.root.position.y += (pose.root?.y ?? 0) * e;
  switch (L.id) {
    case 'hotfix':
      // Two turns on one skate in 0.6 s, then the arm up.
      if (full) rig.root.rotation.y += Math.PI * 4 * smooth(Math.min(1, t / 0.6));
      break;
    case 'legacy':
      // The chest puffs twice.
      if (full) rig.torso.scale.set(1 + 0.04 * Math.sin(kk * Math.PI * 4) * e, 1 + 0.05 * Math.sin(kk * Math.PI * 4) * e, 1 + 0.04 * Math.sin(kk * Math.PI * 4) * e);
      break;
    case 'intern': {
      // The pack hitched up 0.08 m.
      const pack = L.secondary[0];
      if (pack && full) pack.g.position.y += 0.08 * Math.sin(Math.PI * Math.min(1, t / 0.5));
      break;
    }
    default:
      break;
  }
};

/** Call after poseSide and after root.rotation.y is final. */
export const lifeRig = (rig: Rig, p: LifeInput) => {
  const L = rig.life;
  const { dt, rawDt, time } = p;
  const k = L.k;
  if (dt > 0) L.flinchT += dt;

  // Flinch: the peak holds to 110 ms, recovers by 260 ms with one overshoot to -5 degrees (the low-pass adds the 40 ms ramp-in).
  const env = L.flinchT < FLINCH.end ? ringEnv(L.flinchT, FLINCH.hold, FLINCH.ret, FLINCH.end, FLINCH.over) : 0;
  L.flinch += (env * L.flinchSide * L.flinchAmt - L.flinch) * (1 - Math.exp(-90 * rawDt));

  // Rest: breathing and a slow weight shift only show when the fighter is not moving.
  const still = p.onGround && !p.dashing && Math.abs(p.vx) < 0.5 ? 1 : 0;
  L.idle += (still - L.idle) * (1 - Math.exp(-4 * rawDt));
  const breath = Math.sin(time * 2.3 + L.phase);
  const th = (rig.chestY - rig.legLen) / 0.6;
  const rise = th * 0.045 * breath * (0.4 + 0.6 * L.idle);
  rig.torso.scale.set(1 + 0.02 * breath, 1 + 0.03 * breath, 1 + 0.02 * breath);
  rig.head.position.y = L.headY + rise;
  rig.armL.position.y = rig.shoulderL.y + rise;
  rig.armR.position.y = rig.shoulderR.y + rise;
  rig.weapon.position.y += rise;
  // Arms swing 4 degrees in phase with the breath (at rest).
  const armSwing = 4 * DEG * breath * L.idle;
  rig.armL.quaternion.premultiply(wQa.setFromAxisAngle(AXIS_Z, armSwing));
  rig.armR.quaternion.premultiply(wQa.setFromAxisAngle(AXIS_Z, -armSwing));
  const shift = Math.sin(time * ((Math.PI * 2) / 3.5) + L.phase * 1.7) * 3 * DEG * L.idle;

  // Turn-around: reversing at speed (or flipping to face the other way while running) skids, leaning back for 120 ms with dust.
  if (dt > 0) {
    const flipped = L.prevFacing !== 0 && p.facing !== L.prevFacing;
    const reversed = p.vx * L.prevVx < 0;
    if ((flipped || reversed) && p.onGround && !p.dashing && Math.abs(L.prevVx) > 3 && L.turnT > 0.3) {
      L.turnT = 0;
      L.turnDir = Math.sign(L.prevVx);
      L.events |= 1;
    }
    L.prevFacing = p.facing;
  }
  const skidEnv = L.turnT < 0.2 ? (L.turnT < 0.02 ? L.turnT / 0.02 : L.turnT < 0.12 ? 1 : 1 - smooth((L.turnT - 0.12) / 0.08)) : 0;

  // Run lean: 10 degrees into the motion at full speed, bending at the hips.
  const runT = p.onGround && !p.dashing ? -Math.sign(p.vx) * Math.min(1, Math.abs(p.vx) / 7) * 10 * DEG : 0;
  L.run += (runT - L.run) * (1 - Math.exp(-12 * rawDt));

  // The torso bends at the hips (everything above them rotates, the legs stay planted); the whole body tilts 6 degrees at the
  // feet. A lean is about the world z axis: the root's yaw splits it into the rig's own x and z.
  const yaw = rig.root.rotation.y;
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const aBody = L.flinch * FLINCH.body;
  rig.sway.rotation.set(-sy * aBody, 0, cy * aBody);
  const aUp = L.flinch * FLINCH.torso + shift + L.run + L.turnDir * 12 * DEG * skidEnv * k + p.facing * 5 * DEG * L.shot.x * k;
  // The winner pose bends the torso too (Brix leans back with her arm up, Ormo tips back for the toast).
  const win = L.winT < WINNER_SECONDS ? winEnv(L.winT) : 0;
  const wt = win > 0 ? SHEET_POSES[L.id].victory.torso : undefined;
  rig.upper.rotation.set(-sy * aUp + (wt?.x ?? 0) * DEG * win, (wt?.y ?? 0) * DEG * win, cy * aUp + (wt?.z ?? 0) * DEG * win);
  wV.set(0, rig.legLen, 0).applyEuler(rig.upper.rotation);
  // The torso also slides 6 cm away from the shot, and 3 cm back from a gun's kick.
  const dxW = -L.flinch * FLINCH.shift - p.facing * 0.03 * L.shot.x * k;
  rig.upper.position.set(-wV.x + dxW * cy, rig.legLen - wV.y, -wV.z + dxW * sy);
  // The head adds 12 degrees on the same envelope.
  const aHead = L.flinch * FLINCH.head;
  rig.head.rotation.x += -sy * aHead;
  rig.head.rotation.z = cy * aHead;

  // Face: the expression of the moment (a hit is a shock for 0.2 s; a winner wears the victory face).
  const fx = rig.fx;
  fx.setExpr(L.flinchT < 0.2 ? 'shock' : win > 0.3 ? WIN_EXPR[L.id] : REST_EXPR[L.id]);
  if ((win > 0.3) !== L.winProps) {
    L.winProps = win > 0.3;
    fx.setProps(L.winProps ? (SHEET_POSES[L.id].victory.flags ?? null) : null);
  }
  // Idle life from the sheets: Brix rolls side to side on her skates, Zuzu bounces on her toes.
  const sheetIdle = L.idle * k;
  if (L.id === 'hotfix') rig.sway.position.x = Math.sin(time * 2 * Math.PI * 0.5) * 0.1 * sheetIdle;
  else if (L.id === 'standup') rig.sway.position.y = Math.abs(Math.sin(time * Math.PI * 3)) * 0.035 * sheetIdle;
  if (dt > 0) fx.tick(dt, time);

  // Blink.
  L.blinkT -= rawDt;
  if (L.blinkT <= 0) {
    L.blinkLeft = 0.12;
    L.blinkT = 2.2 + Math.random() * 3.8;
  }
  L.blinkLeft = Math.max(0, L.blinkLeft - rawDt);
  const open = L.blinkLeft > 0 ? 0.1 : 1;
  for (const e of L.eyes) e.scale.y = open * fx.eyeTall;

  // Hanging parts: trail the acceleration of the body on two springs each.
  if (dt > 0) {
    L.ax = clampAbs((p.vx - L.prevVx) / dt, 120) * p.facing;
    L.ay = clampAbs((p.vy - L.prevVy) / dt, 160);
    L.prevVx = p.vx;
    L.prevVy = p.vy;
    const lite = CHARACTER_FX.lite;
    for (const sc of L.secondary) {
      stepSpring(sc.pitch, lite ? 0 : clampAbs(sc.pitchGain * L.ax, sc.maxPitch), sc.w, sc.zeta, dt);
      stepSpring(sc.lift, lite ? 0 : clampAbs(-sc.liftGain * L.ay, sc.maxLift), sc.w, sc.zeta, dt);
      sc.g.rotation.x = sc.pitch.x;
      sc.g.position.y = sc.baseY + sc.lift.x;
    }
    if (L.belly) {
      stepSpring(L.jiggle, 0, 18, 0.25, dt);
      L.belly.scale.y = L.bellyBase * (1 + (CHARACTER_FX.lite ? 0 : 0.1 * L.jiggle.x * k));
    }
  }

  if (L.winT < WINNER_SECONDS) {
    L.winT += rawDt;
    applyWinner(rig, L.winT);
  } else if (L.winT < 9) {
    cancelWinner(rig);
  }
};
