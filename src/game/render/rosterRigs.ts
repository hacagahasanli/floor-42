import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { mat, mesh } from './palette';

import type { CharacterId } from '../sim/types';

/**
 * R-022b / R-024 roster (docs/collab/CREATIVE/characters/roster-v3.md and roster-v3/sheets.html): the four fighters' bodies,
 * faces, props and sheet poses. Ids stay internal (hotfix = BRIX, legacy = ORMO, standup = ZUZU, intern = TAVO A).
 * The geometry is the CD's three.js build from sheets.html, ported to this rig and then baked: every static part of a bone is
 * merged into one vertex-coloured mesh (plus one skin mesh), so a fighter costs fewer draw calls than the model it replaces.
 * Pure visuals: nothing here is read by the sim.
 */

const D = Math.PI / 180;

export type Expr = 'angry' | 'grin' | 'smug' | 'shout' | 'shock' | 'sad' | 'closed' | 'ko';

/** What a defeat or victory pose adds on top of the joint angles (the story props). */
export interface PoseFlags {
  skateOff?: boolean;
  thermosSpill?: boolean;
  cup?: 'up' | 'down' | 'sip';
  /** Walrus ends, degrees (+ lifts). */
  tache?: number;
  redCard?: boolean;
  whistleMouth?: boolean;
  flag?: boolean;
  sandwich?: boolean;
  packOff?: boolean;
  panOnHead?: boolean;
}

/** What a rig exposes to the pose and life code (characters.ts). */
export interface Fx {
  expr: Expr;
  setExpr: (e: Expr) => void;
  /** Eyes read taller on a shock. */
  eyeTall: number;
  /** Shows the props a pose asks for (null = none: back to the plain fighter). Cheap to call every frame with the same flags. */
  setProps: (flags: PoseFlags | null) => void;
  /** Per-frame prop motion (spinning wheels, circling swirls). */
  tick: (dt: number, time: number) => void;
}

export type Hang = (
  parent: THREE.Object3D,
  pivot: [number, number, number],
  tune: { w?: number; pitchGain?: number; liftGain?: number; maxPitch?: number; maxLift?: number },
  ...parts: THREE.Object3D[]
) => void;

export interface BuildCtx {
  head: THREE.Group;
  torso: THREE.Group;
  /** Game-side names: L is the -x limb, R the +x limb. */
  foreL: THREE.Group;
  foreR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  /** Fighter-frame group for things that lie on the floor in a defeat pose (child of the rig root). */
  ground: THREE.Group;
  hang: Hang;
  eyes: THREE.Mesh[];
}

export interface Look {
  legLen: number;
  legR: number;
  torsoW: number;
  torsoH: number;
  torsoD: number;
  headR: number;
  armLen: number;
  armR: number;
  fist: number;
  skin: number;
  top: number;
  pants: number;
  shoes: number;
  /** Upper-arm colour when it differs from the top (Ormo's shirt sleeves). */
  sleeve?: number;
  /** A cuff band at the elbow, forearms in skin. */
  rolled?: boolean;
  fistC?: number;
  /** A sock over the shin and the colour of it. */
  sock?: number;
  /** The skates carry the last bit of the leg: the shin cylinder stops this far above the floor. */
  footLift?: number;
  brow: number;
  /** Zuzu's mitts replace the fists. */
  hideFists?: boolean;
  /** Half the length of the shoe or skate: a tilted foot dips this much times sin(angle) below the ankle. */
  footHalf: number;
  build: (c: BuildCtx, s: Look) => Fx;
}

// ---------------------------------------------------------------------------------------------------------------- parts

const box = (w: number, h: number, d: number, c: number) => mesh(new THREE.BoxGeometry(w, h, d), mat(c));
const ico = (r: number, c: number, det = 1) => mesh(new THREE.IcosahedronGeometry(r, det), mat(c));
const cyl = (r: number, h: number, c: number, seg = 8, r2 = r) => mesh(new THREE.CylinderGeometry(r2, r, h, seg), mat(c));
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
  o.position.set(x, y, z);
  return o;
};
const rot = <T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0): T => {
  o.rotation.set(x * D, y * D, z * D);
  return o;
};
/** A group the bake leaves in place (a pivot the pose or spring code moves). */
const pivot = () => {
  const g = new THREE.Group();
  g.userData.keep = true;
  return g;
};
/** A plain grouping of static parts: the bake flattens it into its bone's mesh. */
const parts = () => new THREE.Group();
const keep = <T extends THREE.Object3D>(o: T): T => {
  o.userData.keep = true;
  return o;
};

const INK = 0x1b1f2e;
const CREAM = 0xfff1dc;
const GOLD = 0xffc83d;
const RED = 0xe5392f;

// ---------------------------------------------------------------------------------------------------------------- bake

/** One vertex-coloured, double-sided material for every merged part (the rim light clones it per rig). */
const VC = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.04, side: THREE.DoubleSide });

interface Piece {
  geo: THREE.BufferGeometry;
  m: THREE.Matrix4;
  color: number;
}

const merged = (list: Piece[]): THREE.BufferGeometry | null => {
  if (!list.length) return null;
  const c = new THREE.Color();
  const geos = list.map(({ geo, m, color }) => {
    let g = geo.clone();
    g.applyMatrix4(m);
    if (g.index) g = g.toNonIndexed();
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    c.setHex(color);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  const out = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return out;
};

/**
 * Merges every static mesh under `root` (through plain groups) into at most two meshes: one in vertex colours and one in the
 * skin material. Anything marked `userData.keep` (eyes, pivots, props) stays where it is; kept groups are baked on their own.
 */
export const bake = (root: THREE.Object3D, skin: number) => {
  const flat: Piece[] = [];
  const skinned: Piece[] = [];
  const I = new THREE.Matrix4();
  const walk = (o: THREE.Object3D, m: THREE.Matrix4) => {
    for (const c of [...o.children]) {
      c.updateMatrix();
      if (c.userData.keep) {
        if (o !== root) {
          // A kept object inside a flattened group moves up to the root with the group's transform applied.
          m.clone().multiply(c.matrix).decompose(c.position, c.quaternion, c.scale);
          root.add(c);
        }
        if (!(c instanceof THREE.Mesh)) bake(c, skin);
        continue;
      }
      const cm = m.clone().multiply(c.matrix);
      if (c instanceof THREE.Mesh) {
        const color = (c.material as THREE.MeshStandardMaterial).color.getHex();
        (color === skin ? skinned : flat).push({ geo: c.geometry, m: cm, color });
        o.remove(c);
      } else {
        walk(c, cm);
        o.remove(c);
      }
    }
  };
  walk(root, I);
  const fg = merged(flat);
  if (fg) root.add(keep(mesh(fg, VC)));
  const sg = merged(skinned);
  if (sg) root.add(keep(mesh(sg, mat(skin))));
  for (const p of [...flat, ...skinned]) p.geo.dispose();
};

// ---------------------------------------------------------------------------------------------------------------- faces

/** Brow z-angle (degrees, on the +x brow, mirrored) per expression. */
const BROW: Record<Expr, number> = { angry: 20, grin: 14, smug: -12, sad: -20, shock: -6, ko: -10, closed: -4, shout: 26 };
const EXPRS = Object.keys(BROW) as Expr[];

/**
 * The face kit (roster-v3 section 3): brows and a mouth per expression, X eyes for a KO, closed lines for a toast. One merged
 * mesh per expression; the blinking eyes are shared. Ormo has no mouth (the moustache is his mouth).
 */
const buildFace = (c: BuildCtx, s: Look, ormo: boolean, gold: boolean, first: Expr) => {
  const r = s.headR;
  const ex = r * 0.37;
  const ey = 0.025;
  const faces = {} as Record<Expr, THREE.Group>;
  const f = pivot();
  f.position.z = r * 0.9;
  c.head.add(f);
  for (const sx of [-1, 1]) {
    const eye = keep(box(0.042, 0.06, 0.02, INK));
    eye.position.set(sx * ex, ey, 0.03);
    eye.userData.noRim = true;
    f.add(eye);
    c.eyes.push(eye);
  }
  const browC = ormo ? 0xc9c3b8 : s.brow;
  const my = -0.075;
  for (const expr of EXPRS) {
    const g = pivot();
    for (const sx of [-1, 1]) {
      if (expr === 'ko') for (const a of [45, -45]) g.add(rot(at(box(0.075, 0.018, 0.02, INK), sx * ex, ey, 0.03), 0, 0, a));
      else if (expr === 'closed') g.add(rot(at(box(0.06, 0.016, 0.02, INK), sx * ex, ey - 0.005, 0.03), 0, 0, sx * -8));
      const by = expr === 'shock' ? 0.11 : expr === 'sad' ? 0.095 : expr === 'smug' && sx > 0 ? 0.11 : 0.085;
      const bang = expr === 'smug' ? (sx > 0 ? -12 : 16) : BROW[expr];
      g.add(
        rot(
          at(box(ormo ? 0.11 : 0.085, ormo ? 0.032 : 0.026, 0.03, browC), sx * ex * 1.02, by + (ormo ? 0.01 : 0), 0.035),
          0,
          0,
          sx * bang * (ormo ? 0.55 : 1),
        ),
      );
    }
    if (!ormo) {
      if (expr === 'grin' || expr === 'smug') {
        g.add(at(box(0.12, 0.05, 0.02, INK), 0, my, 0.025));
        g.add(rot(at(box(0.1, 0.03, 0.02, gold ? GOLD : 0xffffff), 0, my + 0.004, 0.032), 0, 0, expr === 'smug' ? 6 : 0));
      } else if (expr === 'shout' || expr === 'shock') {
        g.add(at(box(expr === 'shout' ? 0.09 : 0.05, expr === 'shout' ? 0.07 : 0.06, 0.02, 0x5a1e2a), 0, my - 0.005, 0.03));
      } else if (expr === 'sad' || expr === 'ko') {
        g.add(rot(at(box(0.05, 0.016, 0.02, INK), -0.022, my, 0.03), 0, 0, 18));
        g.add(rot(at(box(0.05, 0.016, 0.02, INK), 0.022, my, 0.03), 0, 0, -18));
      } else if (expr === 'closed') {
        g.add(at(box(0.05, 0.016, 0.02, INK), 0, my, 0.03));
      } else {
        g.add(at(box(0.085, 0.018, 0.02, INK), 0, my, 0.03));
      }
    }
    bake(g, s.skin);
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) o.userData.noRim = true;
    });
    f.add(g);
    faces[expr] = g;
  }
  const show = (e: Expr) => {
    for (const k of EXPRS) faces[k].visible = k === e;
    const eyesOn = e !== 'ko' && e !== 'closed';
    for (const eye of c.eyes) eye.visible = eyesOn;
  };
  show(first);
  return show;
};

/** The shared part of every fighter's Fx: the expression switch. */
const makeFx = (show: (e: Expr) => void, first: Expr, setProps: Fx['setProps'], tick?: Fx['tick']): Fx => {
  const fx: Fx = {
    expr: first,
    eyeTall: 1,
    setExpr: (e) => {
      if (e === fx.expr) return;
      fx.expr = e;
      fx.eyeTall = e === 'shock' ? 1.25 : 1;
      show(e);
    },
    setProps,
    tick: tick ?? (() => {}),
  };
  return fx;
};

// ---------------------------------------------------------------------------------------------------------------- the four

// --- BRIX, The Jammer (slot hotfix): matte black helmet with one scarlet racing stripe, pads, skates. R-024: no star anywhere.
const SKATE_Z = 0.85;
const SKATE_ROLL = 0.45;
const buildBrix = (c: BuildCtx, s: Look): Fx => {
  const { head, torso } = c;
  const helm = parts();
  helm.position.set(0, 0.05, -0.01);
  head.add(helm);
  const shell = ico(s.headR * 1.14, INK, 1);
  shell.scale.set(1, 0.82, 1.04);
  helm.add(shell);
  const arc = (rad: number, tube: number, col: number, x: number) => {
    const t = mesh(new THREE.TorusGeometry(rad, tube, 4, 12, Math.PI * 1.08), mat(col));
    t.rotation.set(0, Math.PI / 2, -0.04 * Math.PI);
    t.scale.set(1, 0.82, 1.04);
    t.position.x = x;
    return t;
  };
  helm.add(arc(s.headR * 1.15, 0.042, RED, 0));
  // F-050: pinstripes 0.035 m wide (was 0.02), pushed out 6 mm so they keep their gap to the red stripe.
  for (const sx of [-1, 1]) helm.add(arc(s.headR * 1.13, 0.0175, CREAM, sx * 0.058));
  head.add(at(box(s.headR * 1.5, s.headR * 0.9, 0.05, s.skin), 0, -0.06, s.headR * 0.78));
  for (const sx of [-1, 1]) head.add(at(box(0.02, 0.18, 0.02, INK), sx * s.headR * 0.92, -0.08, 0.02));
  // Two short braids with gold beads: they swing behind the helmet.
  for (const sx of [-1, 1]) {
    const b = pivot();
    b.position.set(sx * 0.08, -0.02, -s.headR * 0.95);
    b.rotation.set(35 * D, 0, sx * 12 * D);
    head.add(b);
    const braid = parts();
    braid.add(at(box(0.06, 0.2, 0.06, 0x1a0f0b), 0, -0.1, 0));
    braid.add(at(box(0.07, 0.04, 0.07, GOLD), 0, -0.2, 0));
    c.hang(b, [0, 0, 0], { w: 13, pitchGain: 0.006, maxPitch: 0.3, liftGain: 0.001, maxLift: 0.02 }, braid);
  }
  // Jersey: cream band and black shorts.
  torso.add(at(box(s.torsoW + 0.01, 0.07, s.torsoD + 0.01, CREAM), 0, s.torsoH * 0.58, 0));
  torso.add(at(box(s.torsoW * 1.02, 0.16, s.torsoD * 1.02, INK), 0, 0.05, 0));
  // Elbow pads, wrist guards, knee pads (big: armour reads at game scale).
  for (const k of [c.foreL, c.foreR]) {
    k.add(at(box(s.armR * 2.9, 0.15, s.armR * 2.9, INK), 0, -0.03, 0));
    k.add(at(box(s.armR * 2.3, 0.08, s.armR * 2.3, 0x2c2f3e), 0, -s.armLen * 0.43, 0));
  }
  for (const k of [c.shinL, c.shinR]) {
    k.add(at(box(s.legR * 3.0, 0.19, s.legR * 3.1, INK), 0, -0.04, 0.03));
    k.add(at(box(s.legR * 2.4, 0.05, 0.03, GOLD), 0, -0.04, s.legR * 1.6));
  }
  // Skates: boot, plate, four wheels, toe stop. The shin ends at the floor; the skate sits `lift` above that so the wheels touch
  // it. The right skate is its own group and can come off (its wheels are separate meshes so they spin on the floor).
  const lift = s.footLift ?? 0;
  const skate = (separateWheels: boolean) => {
    const f = separateWheels ? pivot() : parts();
    f.add(at(box(0.17, 0.14, 0.27, CREAM), 0, -0.01 + lift, 0.05));
    f.add(at(box(0.175, 0.03, 0.275, RED), 0, 0.055 + lift, 0.05));
    f.add(at(box(0.12, 0.025, 0.3, 0x9aa0aa), 0, -0.09 + lift, 0.05));
    f.add(at(box(0.07, 0.06, 0.05, INK), 0, -0.1 + lift, 0.23));
    const wheels: THREE.Mesh[] = [];
    for (const z of [-0.06, 0.16])
      for (const x of [-0.07, 0.07]) {
        const w = cyl(0.045, 0.045, RED, 10);
        w.rotation.z = Math.PI / 2;
        w.position.set(x, -0.12 + lift, z);
        if (separateWheels) {
          // spin about their own axle: a pivot at the wheel centre
          const p = pivot();
          p.position.copy(w.position);
          w.position.set(0, 0, 0);
          p.add(keep(w));
          f.add(p);
          wheels.push(w);
        } else f.add(w);
      }
    return { f, wheels };
  };
  c.shinL.add(skate(false).f);
  const right = skate(true);
  const skateR = right.f;
  skateR.name = 'skate-r';
  c.shinR.add(skateR);
  // The sock where the right skate was, and the mouthguard on the floor.
  const sock = parts();
  sock.add(at(box(0.14, 0.11, 0.24, CREAM), 0, -0.01 + lift, 0.05));
  sock.add(at(box(0.145, 0.035, 0.245, RED), 0, 0.03 + lift, 0.05));
  const sockP = pivot();
  sockP.name = 'sock-r';
  sockP.add(sock);
  sockP.visible = false;
  c.shinR.add(sockP);
  const guard = keep(at(rot(box(0.1, 0.035, 0.05, GOLD), 0, 40, 0), 0.0, 0.02, 0.35));
  guard.visible = false;
  c.ground.add(guard);
  let off = false;
  // F-046: the lost skate is 1.35x (a cheat, the prop only), upside down (wheels up) and side-on to the camera, 0.55 m from her
  // hip on the camera side, never on her facing axis. The camera is at +z in the world, so the side is whichever way the rig's local
  // x axis leans in z; it is re-read every frame (the sign only changes if she is turned around).
  const SKATE_SCALE = 1.35;
  let side = -1;
  const placeSkate = () => {
    c.ground.updateWorldMatrix(true, false);
    side = c.ground.matrixWorld.elements[2] >= 0 ? 1 : -1;
    skateR.position.set(side * 0.55, 0.4, SKATE_Z);
    // Flipped over (wheels to the sky), then rolled so the camera sees the boot's profile and both rows of wheels.
    skateR.rotation.set(Math.PI, 0, side * SKATE_ROLL);
  };
  const show = buildFace(c, s, false, true, 'grin');
  return makeFx(
    show,
    'grin',
    (flags) => {
      const want = !!flags?.skateOff;
      if (want === off) return;
      off = want;
      sockP.visible = want;
      guard.visible = want;
      if (want) {
        placeSkate();
        c.ground.add(skateR);
        skateR.scale.setScalar(SKATE_SCALE);
      } else {
        c.shinR.add(skateR);
        skateR.position.set(0, 0, 0);
        skateR.rotation.set(0, 0, 0);
        skateR.scale.setScalar(1);
      }
    },
    (dt) => {
      if (!off) return;
      placeSkate();
      for (const w of right.wheels) w.parent!.rotation.x += dt * 9;
    },
  );
};

// --- ORMO, The Office Dad (slot legacy): silver quiff, walrus moustache, argyle vest, brick tie. R-024: no belly, never bald.
const buildOrmo = (c: BuildCtx, s: Look): Fx => {
  const { head, torso } = c;
  const SIL = 0xcfc9bf;
  const SIL2 = 0xa9a297;
  const sleeve = s.sleeve!;
  // Shirt V + collar + tie.
  torso.add(at(box(0.26, 0.2, 0.03, sleeve), 0, s.torsoH - 0.1, s.torsoD / 2));
  for (const sx of [-1, 1]) torso.add(rot(at(box(0.12, 0.06, 0.04, sleeve), sx * 0.07, s.torsoH - 0.015, s.torsoD / 2 + 0.01), 0, 0, sx * -24));
  torso.add(at(box(0.07, 0.05, 0.035, 0x8c3a2b), 0, s.torsoH - 0.035, s.torsoD / 2 + 0.025));
  const tie = pivot();
  tie.position.set(0, s.torsoH - 0.05, s.torsoD / 2 + 0.02);
  torso.add(tie);
  const tieBody = parts();
  tieBody.add(at(box(0.1, 0.2, 0.03, 0xa8483a), 0, -0.1, 0));
  c.hang(tie, [0, 0, 0], { w: 12, pitchGain: 0.005, maxPitch: 0.25, liftGain: 0.001, maxLift: 0.02 }, tieBody);
  for (const sx of [-1, 1]) torso.add(rot(at(box(0.05, s.torsoH * 0.32, 0.035, 0x0b7a5e), sx * 0.13, s.torsoH - 0.12, s.torsoD / 2 + 0.005), 0, 0, sx * 22));
  // Argyle: dark diamonds front and sides, small cream diamonds between them.
  const dia = (col: number, sz: number) => rot(box(sz, sz, 0.02, col), 0, 0, 45);
  for (const [x, y] of [[-0.3, 0.2], [0, 0.2], [0.3, 0.2], [-0.3, 0.45], [0.3, 0.45]]) torso.add(at(dia(0x0b6b52, 0.13), x, y, s.torsoD / 2 + 0.008));
  for (const [x, y] of [[-0.15, 0.325], [0.15, 0.325], [-0.15, 0.075], [0.15, 0.075]]) torso.add(at(dia(0xf3ebdd, 0.045), x, y, s.torsoD / 2 + 0.01));
  for (const sx of [-1, 1])
    for (const [z, y] of [[-0.12, 0.2], [0.12, 0.45], [-0.12, 0.6]]) {
      const d = dia(0x0b6b52, 0.12);
      d.rotation.set(0, Math.PI / 2, 45 * D);
      d.position.set(sx * (s.torsoW / 2 + 0.008), y, z);
      torso.add(d);
    }
  // Silver hair with a quiff, mutton chops down the cheeks.
  const hair = ico(s.headR * 1.06, SIL, 1);
  hair.scale.set(1.03, 0.78, 1.0);
  hair.position.set(0, 0.07, -0.045);
  head.add(hair);
  head.add(rot(at(box(0.3, 0.1, 0.17, SIL), 0.03, s.headR * 0.92, s.headR * 0.42), -18, 0, -8));
  head.add(rot(at(box(0.18, 0.07, 0.12, SIL2), -0.09, s.headR * 0.84, s.headR * 0.5), -22, 0, 12));
  for (const sx of [-1, 1]) head.add(at(box(0.075, 0.22, 0.15, SIL), sx * s.headR * 0.93, -0.04, 0.06));
  // Walrus moustache: wide and bushy, the ends hang down towards the chops (and lift into a smile on his toast).
  const tache = pivot();
  tache.position.set(0, -0.075, s.headR * 0.93);
  head.add(tache);
  const tacheBody = parts();
  tacheBody.add(box(0.24, 0.1, 0.1, SIL));
  tacheBody.add(at(box(0.2, 0.03, 0.09, SIL2), 0, -0.05, 0.005));
  tache.add(tacheBody);
  const ends: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const a = pivot();
    a.position.set(sx * 0.1, 0, -0.01);
    a.userData.sx = sx;
    tache.add(a);
    const arm = parts();
    const part = box(0.12, 0.1, 0.09, SIL);
    part.position.set(sx * 0.06, -0.035, 0);
    part.rotation.z = sx * -0.5;
    arm.add(part);
    arm.add(at(box(0.07, 0.06, 0.08, SIL2), sx * 0.1, -0.09, -0.01));
    // The ends sway on their own spring when he moves; the pose angle rides on the group `a`.
    c.hang(a, [0, 0, 0], { w: 14, pitchGain: 0.004, maxPitch: 0.2, liftGain: 0.0008, maxLift: 0.01 }, arm);
    ends.push(a);
  }
  head.add(at(ico(0.045, 0xe2a585, 0), 0, -0.005, s.headR * 1.0));
  // The thermos on his hip, hanging from the belt.
  const th = pivot();
  th.name = 'thermos';
  th.position.set(-s.torsoW / 2 - 0.02, 0.12, 0.05);
  torso.add(th);
  const thBody = parts();
  thBody.add(cyl(0.07, 0.3, 0xc9ced8, 8));
  thBody.add(at(cyl(0.075, 0.07, RED, 8), 0, 0.18, 0));
  c.hang(th, [0, 0.15, 0], { w: 11, pitchGain: 0.004, maxPitch: 0.16, liftGain: 0.0012, maxLift: 0.03 }, thBody);
  // The spilled set: tipped thermos, tea puddle, the cap rolled away.
  const spilled = pivot();
  spilled.name = 'tea-spill';
  spilled.visible = false;
  const tipped = parts();
  tipped.add(cyl(0.07, 0.3, 0xc9ced8, 8));
  tipped.rotation.set(0, 0.4, Math.PI / 2);
  tipped.position.set(0.05, 0.07, 0.95);
  spilled.add(tipped);
  const pud = keep(mesh(new THREE.CircleGeometry(0.32, 14), mat(0x8a5a2b)));
  pud.rotation.x = -Math.PI / 2;
  pud.scale.set(1.3, 0.8, 1);
  pud.position.set(0.1, 0.006, 0.62);
  pud.userData.noRim = true;
  spilled.add(pud);
  spilled.add(rot(at(cyl(0.075, 0.07, RED, 8), -0.3, 0.09, 0.4), 70, 0, 20));
  c.ground.add(spilled);
  // The cup in his hand: up for the toast, down for peering into it, tilted for a sip.
  const handHolder = pivot();
  handHolder.position.set(0, -s.armLen / 2 - 0.03, 0);
  c.foreL.add(handHolder);
  const mkCup = (kind: 'up' | 'down' | 'sip') => {
    const cup = pivot();
    const body = parts();
    body.add(cyl(0.1, 0.17, RED, 9));
    if (kind !== 'down') body.add(at(cyl(0.09, 0.01, 0x8a5a2b, 8), 0, 0.08, 0));
    cup.add(body);
    if (kind === 'up') {
      cup.position.set(0, -0.26, 0);
      cup.rotation.x = Math.PI;
    } else if (kind === 'down') cup.position.set(0, -0.24, 0.06);
    else {
      cup.position.set(0, -0.22, 0.05);
      cup.rotation.x = Math.PI - 0.5;
    }
    cup.visible = false;
    handHolder.add(cup);
    return cup;
  };
  const cups = { up: mkCup('up'), down: mkCup('down'), sip: mkCup('sip') };
  let key = '';
  const show = buildFace(c, s, true, false, 'angry');
  return makeFx(show, 'angry', (f) => {
    const k = `${f?.cup ?? ''}|${f?.tache ?? 0}|${f?.thermosSpill ? 1 : 0}`;
    if (k === key) return;
    key = k;
    for (const [n, cup] of Object.entries(cups)) cup.visible = f?.cup === n;
    th.visible = !f?.thermosSpill;
    spilled.visible = !!f?.thermosSpill;
    for (const a of ends) a.rotation.z = a.userData.sx * (f?.tache ?? 0) * D;
  });
};

// --- ZUZU, The Tiny Coach (slot standup): two hair puffs, gold punch mitts, headband, whistle.
const buildZuzu = (c: BuildCtx, s: Look): Fx => {
  const { head, torso } = c;
  const cap = ico(s.headR * 1.05, 0x2b2230, 1);
  cap.scale.set(1, 0.7, 1);
  cap.position.set(0, 0.07, -0.02);
  head.add(cap);
  for (const sx of [-1, 1]) {
    const puff = ico(0.19, 0x2b2230, 1);
    puff.position.set(sx * 0.2, 0.25, -0.02);
    c.hang(head, [sx * 0.2, 0.1, -0.02], { w: 14, pitchGain: -0.0035, maxPitch: 0.16, liftGain: 0.0012, maxLift: 0.045 }, puff);
  }
  head.add(at(cyl(s.headR * 1.03, 0.05, 0xf25cb8, 10), 0, 0.09, 0));
  // Lanyard and whistle: the whistle swings on its cord and can move to her mouth.
  for (const sx of [-1, 1]) torso.add(at(box(0.025, 0.24, 0.02, GOLD), sx * 0.08, s.torsoH - 0.12, s.torsoD / 2 + 0.01));
  const wh = pivot();
  wh.position.set(0, s.torsoH - 0.26, s.torsoD / 2 + 0.04);
  torso.add(wh);
  const whBody = parts();
  whBody.add(box(0.1, 0.06, 0.06, GOLD));
  whBody.add(at(box(0.04, 0.04, 0.08, GOLD), 0.06, 0.0, 0.03));
  c.hang(wh, [0, 0, 0], { w: 12, pitchGain: 0.006, maxPitch: 0.3, liftGain: 0.001, maxLift: 0.02 }, whBody);
  torso.add(at(box(s.torsoW + 0.01, 0.06, s.torsoD + 0.01, 0xfffaf0), 0, s.torsoH * 0.55, 0));
  // Punch mitts: big gold pads with a white target ring, on both hands. One hand can swap for a fist holding the red card.
  const mitts: THREE.Group[] = [];
  const handY = -s.armLen / 2 - 0.03;
  for (const k of [c.foreL, c.foreR]) {
    const m = pivot();
    m.position.set(0, handY - 0.02, 0);
    k.add(m);
    const mb = parts();
    mb.add(at(box(0.2, 0.22, 0.13, GOLD), 0, -0.04, 0));
    const ring = cyl(0.06, 0.02, 0xfffaf0, 10);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, -0.04, 0.07);
    mb.add(ring);
    const dot = cyl(0.03, 0.025, RED, 8);
    dot.rotation.x = Math.PI / 2;
    dot.position.set(0, -0.04, 0.075);
    mb.add(dot);
    m.add(mb);
    mitts.push(m);
  }
  const cardHand = pivot();
  cardHand.name = 'red-card';
  cardHand.position.set(0, handY, 0);
  c.foreL.add(cardHand);
  const fist = ico(s.armR * 1.45, s.skin, 0);
  fist.scale.set(1, 1.05, 1.1);
  fist.position.y = -0.02;
  cardHand.add(fist);
  cardHand.add(at(box(0.26, 0.36, 0.02, RED), 0, -0.2, 0.04));
  cardHand.visible = false;
  let key = '';
  const show = buildFace(c, s, false, false, 'shout');
  return makeFx(show, 'shout', (f) => {
    const k = `${f?.redCard ? 1 : 0}|${f?.whistleMouth ? 1 : 0}`;
    if (k === key) return;
    key = k;
    mitts[0].visible = !f?.redCard;
    cardHand.visible = !!f?.redCard;
    if (f?.whistleMouth) {
      head.add(wh);
      wh.position.set(0, -0.08, s.headR * 1.05);
      wh.rotation.set(0, -Math.PI / 2, 0);
    } else {
      torso.add(wh);
      wh.position.set(0, s.torsoH - 0.26, s.torsoD / 2 + 0.04);
      wh.rotation.set(0, 0, 0);
    }
  });
};

// --- TAVO, The Trailblazer (slot intern): towering orange pack with the green mat, headlamp, bandana, rolled sleeves, pan.
const buildTavo = (c: BuildCtx, s: Look): Fx => {
  const { head, torso } = c;
  const hair = ico(s.headR * 1.04, 0x5a3a22, 1);
  hair.scale.set(1, 0.75, 1);
  hair.position.set(0, 0.06, -0.03);
  head.add(hair);
  head.add(at(cyl(s.headR * 1.06, 0.07, 0x3f7a4a, 10), 0, 0.08, 0));
  // The pack is secondary[0]: hinged at the shoulders, it swings behind every start and stop (the winner pose hitches it).
  const pack = pivot();
  pack.name = 'pack';
  pack.position.set(0, 0.0, -s.torsoD / 2 - 0.22);
  const packBody = parts();
  packBody.add(at(box(0.62, 0.98, 0.42, 0xf08a24), 0, 0.5, 0));
  packBody.add(at(box(0.5, 0.3, 0.08, 0xc96e16), 0, 0.82, 0.2));
  packBody.add(at(box(0.44, 0.3, 0.1, 0xc96e16), 0, 0.28, -0.22));
  const matRoll = cyl(0.13, 0.78, 0x3f7a4a, 9);
  matRoll.rotation.z = Math.PI / 2;
  matRoll.position.set(0, 1.11, 0);
  packBody.add(matRoll);
  for (const sx of [-1, 1]) {
    const b = cyl(0.135, 0.05, 0x2c2c2c, 9);
    b.rotation.z = Math.PI / 2;
    b.position.set(sx * 0.22, 1.11, 0);
    packBody.add(b);
  }
  packBody.add(at(cyl(0.06, 0.1, 0xfffaf0, 8), -0.41, 0.1, 0.05));
  pack.add(packBody);
  // The frying pan hangs on the side of the pack (a round shield shape that breaks the outline). Its own group: it leaves the
  // pack and lands on his head when he is knocked out. The pack-side and head-side shapes are two small meshes.
  const pan = pivot();
  pan.name = 'pan';
  pan.position.set(0.34, 0.5, 0.02);
  const panPack = parts();
  const disc = cyl(0.19, 0.04, 0x3a3a44, 12);
  disc.rotation.z = Math.PI / 2;
  panPack.add(disc);
  panPack.add(at(box(0.03, 0.26, 0.04, 0x5a4130), 0, 0.3, 0));
  const panPackP = pivot();
  panPackP.add(panPack);
  // On his head (F-047) the pan is face down: dark top up, a 0.03 m lighter rim, tilted 18 degrees toward the camera, the handle
  // sticking out sideways toward the camera at 0.32 m. The camera side is read from the head every frame (see `camSide`).
  const panHead = parts();
  panHead.add(cyl(0.185, 0.04, 0x1b1f2e, 14));
  panHead.add(at(cyl(0.2, 0.03, 0x6b6f78, 14), 0, -0.012, 0));
  const handle = at(box(0.32, 0.04, 0.045, 0x1b1f2e), 0.2 + 0.16, -0.004, 0);
  panHead.add(handle);
  const panHeadP = pivot();
  panHeadP.add(panHead);
  panHeadP.visible = false;
  pan.add(panPackP, panHeadP);
  pack.add(pan);
  c.hang(torso, [0, s.torsoH * 0.9, -s.torsoD / 2], { w: 12, pitchGain: 0.006, maxPitch: 0.26, liftGain: 0.0008, maxLift: 0.03 }, pack);
  const packHome = pack.parent!;
  const packPos = pack.position.clone();
  // Bandana knot with two tails behind the head, and the headlamp.
  const knot = pivot();
  knot.position.set(0, 0.08, -s.headR * 1.02);
  head.add(knot);
  const tails = parts();
  tails.add(rot(at(box(0.05, 0.14, 0.03, 0x3f7a4a), 0.03, -0.06, 0), 0, 0, 18));
  tails.add(rot(at(box(0.05, 0.12, 0.03, 0x3f7a4a), -0.03, -0.05, 0), 0, 0, -22));
  c.hang(knot, [0, 0, 0], { w: 15, pitchGain: 0.012, maxPitch: 0.5, liftGain: 0, maxLift: 0 }, tails);
  const lamp = parts();
  lamp.position.set(0, 0.085, s.headR * 1.02);
  lamp.add(box(0.1, 0.07, 0.06, 0x2c2c2c));
  const lens = cyl(0.03, 0.02, 0xffe58a, 10);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.035;
  lamp.add(lens);
  head.add(lamp);
  // Flannel check lines, straps, chest clip, cargo pockets.
  for (const y of [0.15, 0.32]) torso.add(at(box(s.torsoW + 0.01, 0.03, s.torsoD + 0.01, 0x163a94), 0, y, 0));
  for (const sx of [-1, 1]) torso.add(at(box(0.065, s.torsoH * 0.95, 0.04, 0xb85f12), sx * 0.16, s.torsoH / 2, s.torsoD / 2 + 0.01));
  torso.add(at(box(0.36, 0.05, 0.03, 0xb85f12), 0, s.torsoH * 0.62, s.torsoD / 2 + 0.03));
  for (const k of [c.legL, c.legR]) k.add(at(box(0.05, 0.12, 0.12, 0x7a6a47), (k === c.legR ? 1 : -1) * (s.legR + 0.01), -0.22, 0));
  // The spilled lunch, the flag and the sandwich in his hand.
  const spill = pivot();
  spill.name = 'lunch-spill';
  spill.visible = false;
  const lunch = parts();
  lunch.add(at(cyl(0.06, 0.1, 0xfffaf0, 8), 0.04, 0.05, 0.9));
  lunch.add(rot(at(box(0.18, 0.07, 0.15, 0xe9c98f), 0.4, 0.04, 0.78), 0, 34, 0));
  lunch.add(rot(at(box(0.16, 0.025, 0.13, 0x5fb04a), 0.4, 0.085, 0.78), 0, 34, 0));
  spill.add(lunch);
  c.ground.add(spill);
  const handHolder = pivot();
  handHolder.position.set(0, -s.armLen / 2 - 0.03, 0);
  c.foreL.add(handHolder);
  const flag = pivot();
  const flagBody = parts();
  flagBody.add(at(cyl(0.012, 0.55, 0x5a4130, 5), 0, -0.1, 0));
  const tri = mesh(new THREE.ConeGeometry(0.12, 0.3, 3), mat(GOLD));
  tri.rotation.z = Math.PI / 2;
  tri.position.set(-0.15, -0.3, 0);
  flagBody.add(tri);
  flag.add(flagBody);
  flag.rotation.x = Math.PI;
  flag.visible = false;
  handHolder.add(flag);
  const sandwich = pivot();
  const swBody = parts();
  swBody.add(box(0.2, 0.08, 0.15, 0xe9c98f));
  swBody.add(at(box(0.21, 0.025, 0.16, 0x5fb04a), 0, 0.0, 0));
  sandwich.add(swBody);
  sandwich.position.set(0, -0.05, 0.06);
  sandwich.rotation.set(0.2, 0, 1.3);
  sandwich.visible = false;
  handHolder.add(sandwich);
  // Dizzy swirls (R-024: small spirals circling the head, never stars) while the pan sits on it.
  const swirls = pivot();
  swirls.name = 'swirls';
  swirls.visible = false;
  swirls.position.set(0, s.headR + 0.05 + 0.2, 0);
  head.add(swirls);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 4;
    const r = 0.012 + (i / 28) * 0.048;
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  const spiral = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, 0.018, 4);
  const swirlList: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const sw = keep(mesh(spiral, mat(GOLD, { emissive: 0x4a3600 }), false));
    sw.userData.noRim = true;
    swirlList.push(sw);
    swirls.add(sw);
  }
  const q = new THREE.Quaternion();
  const orbit = new THREE.Vector3();
  const ORBIT_TILT = 20 * D;
  let key = '';
  let dizzy = false;
  const show = buildFace(c, s, false, false, 'grin');
  return makeFx(
    show,
    'grin',
    (f) => {
      const k = `${f?.flag ? 1 : 0}${f?.sandwich ? 1 : 0}${f?.packOff ? 1 : 0}${f?.panOnHead ? 1 : 0}`;
      if (k === key) return;
      key = k;
      flag.visible = !!f?.flag;
      sandwich.visible = !!f?.sandwich;
      dizzy = !!f?.panOnHead;
      swirls.visible = dizzy;
      spill.visible = !!f?.packOff;
      if (f?.packOff) {
        // The pack slid off and lies behind him; the pan stays with whoever has it.
        c.ground.add(pack);
        pack.position.set(0.1, 0.42, -1.0);
        pack.rotation.set(0, 0.3, -1.4);
      } else {
        packHome.add(pack);
        pack.position.copy(packPos);
        pack.rotation.set(0, 0, 0);
      }
      if (f?.panOnHead) {
        head.add(pan);
        pan.position.set(0, s.headR + 0.05, 0);
        pan.rotation.set(0, 0, 0);
        panPackP.visible = false;
        panHeadP.visible = true;
      } else {
        pack.add(pan);
        pan.position.set(0.34, 0.5, 0.02);
        pan.rotation.set(0, 0, 0);
        panPackP.visible = true;
        panHeadP.visible = false;
      }
    },
    (_dt, time) => {
      if (!dizzy) return;
      // Which way is the camera (world +z) in the head's frame: +1 if the head's local x leans toward it, else -1.
      head.updateWorldMatrix(true, false);
      const side = head.matrixWorld.elements[2] >= 0 ? 1 : -1;
      panHeadP.rotation.z = -side * 18 * D;
      handle.position.x = side * 0.36;
      // The spirals orbit at 0.45 m in a plane tilted 20 degrees toward the camera (its near side lower), each turned to face it.
      swirls.parent!.getWorldQuaternion(q).invert();
      swirlList.forEach((sw, i) => {
        const a = time * 3.2 + (i * Math.PI * 2) / 3;
        const bob = Math.sin(time * 5 + i * 2) * 0.02;
        orbit.set(Math.cos(a) * 0.45, bob - Math.sin(a) * 0.45 * Math.sin(ORBIT_TILT), Math.sin(a) * 0.45 * Math.cos(ORBIT_TILT));
        sw.position.copy(orbit).applyQuaternion(q);
        sw.quaternion.copy(q);
      });
    },
  );
};

export const LOOKS: Record<CharacterId, Look> = {
  hotfix: {
    legLen: 0.945, legR: 0.085, torsoW: 0.48, torsoH: 0.62, torsoD: 0.31, headR: 0.18, armLen: 0.76, armR: 0.068, fist: 1.45,
    skin: 0x7a4a2e, top: RED, pants: INK, shoes: CREAM, footLift: 0.165, footHalf: 0.15, brow: 0x2a1a14, build: buildBrix,
  },
  legacy: {
    legLen: 0.55, legR: 0.15, torsoW: 0.95, torsoH: 0.75, torsoD: 0.55, headR: 0.23, armLen: 0.66, armR: 0.125, fist: 1.6,
    skin: 0xe9b48f, top: 0x14a37f, pants: 0x6b6f78, shoes: 0x4a3426, sleeve: 0xf3ebdd, rolled: true, footHalf: 0.27, brow: 0xc9c3b8, build: buildOrmo,
  },
  standup: {
    legLen: 0.45, legR: 0.085, torsoW: 0.48, torsoH: 0.45, torsoD: 0.3, headR: 0.21, armLen: 0.48, armR: 0.065, fist: 1.2,
    skin: 0x8d5a3b, top: 0xf25cb8, pants: INK, shoes: GOLD, sock: 0xfffaf0, brow: 0x2a1a14, hideFists: true, footHalf: 0.15, build: buildZuzu,
  },
  intern: {
    legLen: 0.7, legR: 0.1, torsoW: 0.56, torsoH: 0.55, torsoD: 0.33, headR: 0.19, armLen: 0.62, armR: 0.08, fist: 1.5,
    skin: 0xf1c7a0, top: 0x2456d6, pants: 0x8c7a55, shoes: 0x5a4130, rolled: true, fistC: 0x3a2e2a, footHalf: 0.18, brow: 0x5a3a22, build: buildTavo,
  },
};

// ---------------------------------------------------------------------------------------------------------------- poses

export type ShowPose = 'idle' | 'victory' | 'defeat' | 'taunt';

interface J {
  x?: number;
  y?: number;
  z?: number;
}

/** A sheet pose in this rig's names (degrees): L is the -x limb. `root` lowers/tips the whole body; `torso` bends at the hips. */
export interface PoseDef {
  expr: Expr;
  root?: { y?: number; x?: number; pz?: number };
  torso?: J;
  head?: J;
  armL?: J;
  foreL?: J;
  armR?: J;
  foreR?: J;
  legL?: J;
  shinL?: J;
  legR?: J;
  shinR?: J;
  flags?: PoseFlags;
}

/** The sheets name limbs by the +x side first (their L is +x); this rig's L is -x, so every limb key swaps. */
const SWAP: Record<string, keyof PoseDef> = {
  armL: 'armR', armR: 'armL', foreL: 'foreR', foreR: 'foreL', legL: 'legR', legR: 'legL', shinL: 'shinR', shinR: 'shinL',
};

const fromSheet = (p: Record<string, unknown>, flags?: PoseFlags): PoseDef => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) out[SWAP[k] ?? k] = v;
  if (flags) out.flags = flags;
  return out as unknown as PoseDef;
};

/** roster-v3/sheets.html POSES, verbatim angles (feet joints dropped: this rig has none). */
export const SHEET_POSES: Record<CharacterId, Record<ShowPose, PoseDef>> = {
  hotfix: {
    idle: fromSheet({
      expr: 'grin', root: { y: -0.1 }, torso: { x: 24 }, head: { x: -20 }, armL: { x: 40, z: 18 }, foreL: { x: -30 }, armR: { x: -62, z: -12 }, foreR: { x: -96 },
      legL: { x: -40, z: 7 }, shinL: { x: 55 }, legR: { x: 12, z: -7 }, shinR: { x: 40 },
    }),
    victory: fromSheet({
      expr: 'grin', torso: { x: -6, z: 4 }, head: { x: -14 }, armR: { x: -176, z: -6 }, foreR: { x: -4 }, armL: { x: -10, z: 70 }, foreL: { x: -20 },
      legL: { x: 0, z: 34 }, shinL: { x: 6 }, legR: { x: 0, z: -2 },
    }),
    defeat: fromSheet(
      {
        expr: 'ko', root: { y: 0.2, x: -90, pz: -0.85 }, head: { x: -10, z: 12 }, armL: { x: 0, z: 80 }, foreL: { x: -10 }, armR: { x: -10, z: -95 }, foreR: { x: -20 },
        legL: { x: -70, z: 10 }, shinL: { x: 20 }, legR: { x: -95, z: -8 }, shinR: { x: 45 },
      },
      { skateOff: true },
    ),
    taunt: fromSheet({
      expr: 'smug', root: { y: -0.04 }, torso: { x: -6, y: 10 }, head: { x: -6, z: 6 }, armR: { x: -150, z: -38 }, foreR: { x: -70 }, armL: { x: -90, z: 8 }, foreL: { x: -4 },
      legL: { x: -12, z: 6 }, shinL: { x: 14 }, legR: { x: 14, z: -6 }, shinR: { x: 10 },
    }),
  },
  legacy: {
    idle: fromSheet({
      expr: 'angry', root: { y: -0.06 }, torso: { x: 8 }, head: { x: -6 }, armL: { x: -38, z: 22 }, foreL: { x: -62 }, armR: { x: -38, z: -22 }, foreR: { x: -62 },
      legL: { x: -8, z: 13 }, shinL: { x: 18 }, legR: { x: -8, z: -13 }, shinR: { x: 18 },
    }),
    victory: fromSheet(
      {
        expr: 'closed', torso: { x: -6 }, head: { x: -14 }, armR: { x: -72, z: -32 }, foreR: { x: -105 }, armL: { x: -36, z: 18 }, foreL: { x: -90 },
        legL: { z: 6 }, legR: { z: -6 },
      },
      { cup: 'up', tache: 18 },
    ),
    defeat: fromSheet(
      {
        expr: 'sad', root: { y: -0.5 }, torso: { x: 10 }, head: { x: 10 }, armL: { x: -40, z: 16 }, foreL: { x: -20 }, armR: { x: -62, z: -4 }, foreR: { x: -70 },
        legL: { x: -86, z: 22 }, shinL: { x: 5 }, legR: { x: -86, z: -22 }, shinR: { x: 5 },
      },
      { cup: 'down', thermosSpill: true, tache: -32 },
    ),
    taunt: fromSheet(
      {
        expr: 'closed', torso: { x: -4 }, head: { x: -8 }, armR: { x: -64, z: -18 }, foreR: { x: -128 }, armL: { x: 38, z: 8 }, foreL: { x: -72 },
        legL: { z: 6 }, legR: { z: -6 },
      },
      { cup: 'sip', tache: 6 },
    ),
  },
  standup: {
    idle: fromSheet({
      expr: 'shout', root: { y: -0.05 }, torso: { x: 10 }, head: { x: -10 }, armL: { x: -58, z: 14 }, foreL: { x: -112 }, armR: { x: -64, z: -14 }, foreR: { x: -110 },
      legL: { x: -28, z: 6 }, shinL: { x: 40 }, legR: { x: -10, z: -6 }, shinR: { x: 32 },
    }),
    victory: fromSheet({
      expr: 'grin', root: { y: 0.34 }, head: { x: -12 }, armL: { x: -5, z: 150 }, foreL: { x: -10 }, armR: { x: -5, z: -150 }, foreR: { x: -10 },
      legL: { z: 24 }, shinL: { x: 6 }, legR: { z: -24 }, shinR: { x: 6 },
    }),
    defeat: fromSheet(
      {
        expr: 'shout', root: { y: -0.36 }, torso: { x: -10 }, head: { x: -14, z: 6 }, armR: { x: -168, z: -10 }, foreR: { x: -6 }, armL: { x: 10, z: 32 }, foreL: { x: -110, z: 0 },
        legL: { x: -84, z: 24 }, shinL: { x: 6 }, legR: { x: -80, z: -20 }, shinR: { x: 20 },
      },
      { redCard: true },
    ),
    taunt: fromSheet(
      {
        expr: 'shout', root: { y: -0.02 }, torso: { x: 4 }, head: { x: -6 }, armR: { x: -90, z: -4 }, foreR: { x: -2 }, armL: { x: -30, z: 14 }, foreL: { x: -100 },
        legL: { x: -16, z: 6 }, shinL: { x: 18 }, legR: { x: 8, z: -6 }, shinR: { x: 10 },
      },
      { whistleMouth: true },
    ),
  },
  intern: {
    idle: fromSheet({
      expr: 'grin', root: { y: -0.06 }, torso: { x: 10, y: -10 }, head: { x: -6, y: 8 }, armR: { x: -72, z: -10 }, foreR: { x: -112 }, armL: { x: -16, z: 6 }, foreL: { x: -118 },
      legL: { x: -24, z: 6 }, shinL: { x: 30 }, legR: { x: 16, z: -6 }, shinR: { x: 18 },
    }),
    victory: fromSheet(
      {
        expr: 'grin', root: { y: 0.05 }, head: { x: -10 }, armR: { x: -165, z: -15 }, foreR: { x: -10 }, armL: { x: -70, z: 30 }, foreL: { x: -120 },
        legL: { z: 5 }, legR: { z: -5 },
      },
      { flag: true },
    ),
    defeat: fromSheet(
      {
        expr: 'ko', root: { y: -0.6 }, torso: { x: 4 }, head: { x: 6, z: -10 }, armL: { x: 20, z: 24 }, foreL: { x: -10 }, armR: { x: 20, z: -24 }, foreR: { x: -10 },
        legL: { x: -88, z: 6 }, legR: { x: -88, z: -6 },
      },
      { packOff: true, panOnHead: true },
    ),
    taunt: fromSheet(
      {
        expr: 'angry', root: { y: -0.02 }, torso: { x: 2 }, head: { x: -4 }, armR: { x: -64, z: -18 }, foreR: { x: -128 }, armL: { x: -16, z: 6 }, foreL: { x: -118 },
        legL: { x: -10, z: 5 }, legR: { x: 8, z: -5 },
      },
      { sandwich: true },
    ),
  },
};

/** Standing stance in the fight (the sheet idles): extra knee bend (rad), and how far the legs spread (rad). Eases in as they stand still. */
export const STANCE: Record<CharacterId, { knee: number; hip: number; spread: number }> = {
  hotfix: { knee: 0.62, hip: 0.5, spread: 0.1 },
  legacy: { knee: 0.2, hip: 0.1, spread: 0.12 },
  standup: { knee: 0.5, hip: 0.35, spread: 0.08 },
  intern: { knee: 0.38, hip: 0.3, spread: 0.08 },
};

/** The expression each fighter wears at rest (roster-v3 section 3). */
export const REST_EXPR: Record<CharacterId, Expr> = { hotfix: 'grin', legacy: 'angry', standup: 'shout', intern: 'grin' };
/** The expression on the winner pose. */
export const WIN_EXPR: Record<CharacterId, Expr> = { hotfix: 'grin', legacy: 'closed', standup: 'grin', intern: 'grin' };
