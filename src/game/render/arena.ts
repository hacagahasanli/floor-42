import * as THREE from 'three';

import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { ARENA, baseOf, isSolid } from '../sim/constants';

import { mat, mesh, PALETTE } from './palette';

import type { Platform } from '../sim/constants';
import type { GameEvent, Pickup } from '../sim/types';

export const canvasTexture = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

/** Seeded so the skyline and decor are the same every load. */
const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const put = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => {
  o.position.set(x, y, z);
  return o;
};

const BACK_Z = -3.4;
const FRIDGE_Z = -2.75;
/** Boxes in the fight plane: centred a little behind the fighters, front face level with the walkway's front. */
const PROP_Z = -0.45;
const CRATE = { body: 0x7a5636, lid: 0xc39a6b, frame: 0x5a3e27 };
const STEEL = { body: 0x465061, lid: 0x9aa3b8, rib: 0x555e70 };
/** One shared material for the walkways' blue LED strips (it used to be one per walkway). */
const LED_STRIP = new THREE.MeshBasicMaterial({ color: 0x3ec5ff });

/** Where a hanger rod from a platform at (x, y) ends: under the next platform above it, or the ceiling. */
const rodTop = (x: number, y: number) =>
  ARENA.platforms.reduce((top, q) => (!isSolid(q) && q.y > y + 0.01 && q.y < top && x >= q.x0 && x <= q.x1 ? q.y - 0.12 : top), ARENA.ceiling);
const rod = (g: THREE.Group, x0: number, y: number, z: number) => {
  // A box standing on this platform: hang the rod beside it, on the platform's side, not through it.
  let x = x0;
  const onTop = ARENA.platforms.find((q) => isSolid(q) && Math.abs(baseOf(q) - y) < 0.01 && x >= q.x0 - 0.1 && x <= q.x1 + 0.1);
  if (onTop) {
    const host = ARENA.platforms.find((q) => !isSolid(q) && Math.abs(q.y - y) < 0.01 && x >= q.x0 && x <= q.x1);
    const sides = [onTop.x0 - 0.2, onTop.x1 + 0.2].filter((sx) => !host || (sx >= host.x0 + 0.1 && sx <= host.x1 - 0.1));
    if (sides.length) x = sides.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
  }
  const top = rodTop(x, y);
  g.add(put(mesh(new THREE.CylinderGeometry(0.025, 0.025, top - y, 5), mat(PALETTE.ink), false), x, (top + y) / 2, z));
};

const buildCity = (scene: THREE.Scene) => {
  const sky = canvasTexture(4, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    // Blue hour: the sun just down, a deep blue sky warming to a soft amber glow at the horizon.
    grad.addColorStop(0, '#16204a');
    grad.addColorStop(0.45, '#2c3a72');
    grad.addColorStop(0.72, '#5a5a8e');
    grad.addColorStop(0.88, '#b07a86');
    grad.addColorStop(1, '#e09a6a');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  });
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(500, 160), new THREE.MeshBasicMaterial({ map: sky, fog: false }));
  skyPlane.position.set(0, 12, -120);
  scene.add(skyPlane);
  // The low sun between the towers, with a soft halo.
  const halo = canvasTexture(256, 256, (g) => {
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,236,190,1)');
    grad.addColorStop(0.18, 'rgba(255,200,120,0.95)');
    grad.addColorStop(0.45, 'rgba(255,140,80,0.35)');
    grad.addColorStop(1, 'rgba(255,120,80,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), new THREE.MeshBasicMaterial({ map: halo, transparent: true, opacity: 0.6, depthWrite: false, fog: false }));
  sun.position.set(18, -12, -110);
  scene.add(sun);

  // Office towers at night: dark glass, some floors still working (warm), a few screens (cool).
  const facade = canvasTexture(64, 128, (g) => {
    g.fillStyle = '#2a3150';
    g.fillRect(0, 0, 64, 128);
    const r = rng(7);
    for (let y = 4; y < 128; y += 10) {
      const floorLit = r() > 0.55; // whole floors light up together
      for (let x = 4; x < 64; x += 10) {
        const lit = r();
        g.fillStyle = floorLit && lit > 0.25 ? (lit > 0.9 ? '#9fd0ff' : '#ffcf7a') : lit > 0.93 ? '#ffb070' : '#38406a';
        g.fillRect(x, y, 6, 6);
      }
    }
  });
  facade.wrapS = THREE.RepeatWrapping;
  facade.wrapT = THREE.RepeatWrapping;

  const r = rng(42);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 60; i++) {
    const w = 4 + r() * 7;
    const h = 10 + r() * 36;
    const d = 4 + r() * 6;
    const tex = facade.clone();
    tex.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 6)));
    tex.needsUpdate = true;
    const b = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: 0xd6d9ea }));
    const row = i % 2;
    b.scale.set(w, h, d);
    b.position.set(-120 + i * 4 + r() * 3, h / 2 - 36 + row * 2, -34 - row * 22 - r() * 10);
    scene.add(b);
    // A lit crown on some roofs, an antenna on others.
    if (r() < 0.4) {
      const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.5, d * 1.02), new THREE.MeshBasicMaterial({ color: r() < 0.5 ? 0x3ec5ff : 0xffd27a }));
      crown.position.set(b.position.x, b.position.y + h / 2 - 0.6, b.position.z);
      scene.add(crown);
    } else if (h > 22) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 6, 5), new THREE.MeshBasicMaterial({ color: 0x1a1e2c }));
      mast.position.set(b.position.x, b.position.y + h / 2 + 3, b.position.z);
      scene.add(mast);
    }
    // Aircraft warning lights on the tall ones.
    if (h > 30) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3030, fog: false }));
      light.position.set(b.position.x, b.position.y + h / 2 + 0.4, b.position.z);
      light.userData.phase = r() * 6;
      scene.add(light);
      warning.push(light);
    }
  }
  // A far row of dark silhouettes, for depth.
  const far = new THREE.MeshBasicMaterial({ color: 0x252c52 });
  for (let i = 0; i < 40; i++) {
    const w = 6 + r() * 10;
    const h = 20 + r() * 50;
    const b = new THREE.Mesh(geo, far);
    b.scale.set(w, h, 6);
    b.position.set(-160 + i * 8 + r() * 4, h / 2 - 40, -95 - r() * 10);
    scene.add(b);
  }
  return warning;
};
const warning: THREE.Mesh[] = [];

// ---------- Furniture, one builder per platform style. Top surface sits at p.y. ----------

const lamp = (x: number, y: number, z: number) => {
  const g = new THREE.Group();
  const arm = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 5), mat(PALETTE.ink));
  arm.position.y = 0.25;
  arm.rotation.z = 0.3;
  const shade = mesh(new THREE.ConeGeometry(0.14, 0.16, 7, 1, true), mat(PALETTE.gold, { emissive: 0x5a4000 }));
  shade.position.set(-0.08, 0.5, 0);
  shade.rotation.z = -0.6;
  g.add(arm, shade);
  return put(g, x, y, z);
};

const books = (g: THREE.Group, x0: number, x1: number, y: number, z: number, seed: number) => {
  const r = rng(seed);
  const cols = [PALETTE.red, PALETTE.blue, PALETTE.gold, PALETTE.green, PALETTE.lilac, PALETTE.orange];
  let x = x0 + 0.08;
  while (x < x1 - 0.12) {
    const w = 0.06 + r() * 0.08;
    const h = 0.3 + r() * 0.2;
    g.add(put(mesh(box(w, h, 0.32), mat(cols[Math.floor(r() * cols.length)]), false), x + w / 2, y + h / 2, z));
    x += w + 0.01;
  }
};

/** A screen of code, a different slice of it on every monitor. */
const codeScreen = (seed: number) =>
  canvasTexture(256, 150, (g) => {
    g.fillStyle = '#0f1420';
    g.fillRect(0, 0, 256, 150);
    const r = rng(seed * 31 + 7);
    const cols = ['#3ddc84', '#3ec5ff', '#ffd23f', '#ff6a8a', '#c7cede', '#8b93ad'];
    for (let y = 10; y < 146; y += 11) {
      let x = 8 + Math.floor(r() * 3) * 12;
      const n = 1 + Math.floor(r() * 4);
      for (let i = 0; i < n && x < 240; i++) {
        const w = 14 + r() * 50;
        g.fillStyle = cols[Math.floor(r() * cols.length)];
        g.fillRect(x, y, w, 5);
        x += w + 6;
      }
    }
  });

/** A rolling office chair: five-star base, seat, back. */
const chair = (x: number, z: number) => {
  const g = new THREE.Group();
  const dark = mat(0x23262f);
  for (let i = 0; i < 5; i++) {
    const leg = mesh(box(0.38, 0.04, 0.05), dark, false);
    leg.position.set(0, 0.06, 0);
    leg.rotation.y = (i / 5) * Math.PI * 2;
    leg.translateX(0.18);
    g.add(leg);
  }
  g.add(put(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), mat(0x8a8f99), false), 0, 0.28, 0));
  g.add(put(mesh(box(0.5, 0.08, 0.48), dark), 0, 0.5, 0));
  g.add(put(mesh(box(0.48, 0.55, 0.06), dark), 0, 0.82, 0.24));
  return put(g, x, 0, z);
};

export const FURNITURE: Record<Platform['style'], (p: Platform) => THREE.Group> = {
  desk: (p) => {
    const g = new THREE.Group();
    const w = p.x1 - p.x0;
    const cx = (p.x0 + p.x1) / 2;
    g.add(put(mesh(box(w, 0.08, 1.5), mat(PALETTE.paper)), cx, p.y - 0.04, -0.3));
    g.add(put(mesh(box(w, 0.04, 0.04), mat(PALETTE.ink), false), cx, p.y - 0.06, 0.45));
    // Solid end panels exactly where the desk's collision ends, and a modesty panel at the back:
    // it reads as a block you hop onto, not a top on legs you could walk under.
    const legH = p.y - 0.08;
    for (const ex of [p.x0 + 0.04, p.x1 - 0.04]) g.add(put(mesh(box(0.08, legH, 1.36), mat(PALETTE.inkSoft)), ex, legH / 2, -0.3));
    g.add(put(mesh(box(w - 0.16, legH * 0.62, 0.04), mat(PALETTE.inkSoft)), cx, legH - (legH * 0.62) / 2, -0.96));
    g.add(lamp(p.x0 + 0.4, p.y, -0.85));
    // Two monitors with code on them, a keyboard, a mug, and an office chair pushed back.
    for (const [k, off] of [[0, -0.55], [1, 0.25]] as const) {
      const mx = cx + off;
      g.add(put(mesh(box(0.06, 0.32, 0.06), mat(PALETTE.ink), false), mx, p.y + 0.16, -0.95));
      g.add(put(mesh(box(0.74, 0.46, 0.05), mat(0x1a1d26)), mx, p.y + 0.5, -0.98));
      g.add(put(new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.4), new THREE.MeshBasicMaterial({ map: codeScreen(k + Math.round(p.x0 * 10)) })), mx, p.y + 0.5, -0.952));
    }
    g.add(put(mesh(box(0.55, 0.03, 0.18), mat(0x2a2d36)), cx - 0.15, p.y + 0.015, -0.55));
    g.add(put(mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 10), mat(PALETTE.paper)), p.x1 - 0.5, p.y + 0.055, -0.6));
    g.add(chair(cx - 0.2, 0.15));
    // A drawer unit under one end.
    g.add(put(mesh(box(0.5, p.y - 0.15, 0.6), mat(PALETTE.lilac)), p.x1 - 0.45, (p.y - 0.15) / 2, -0.5));
    return g;
  },
  table: (p) => {
    const g = new THREE.Group();
    const w = p.x1 - p.x0;
    const cx = (p.x0 + p.x1) / 2;
    g.add(put(mesh(box(w, 0.1, 1.8), mat(0xb8875a)), cx, p.y - 0.05, -0.4));
    for (const lx of [p.x0 + 0.1, p.x1 - 0.1]) g.add(put(mesh(box(0.14, p.y - 0.1, 0.9), mat(PALETTE.ink)), lx, (p.y - 0.1) / 2, -0.4));
    // A speakerphone in the middle of the meeting.
    g.add(put(mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 3), mat(PALETTE.ink)), cx, p.y + 0.03, -0.9));
    return g;
  },
  counter: (p) => {
    const g = new THREE.Group();
    const w = p.x1 - p.x0;
    const cx = (p.x0 + p.x1) / 2;
    g.add(put(mesh(box(w, 0.08, 1.2), mat(PALETTE.stone)), cx, p.y - 0.04, -0.5));
    g.add(put(mesh(box(w - 0.1, p.y - 0.08, 1.1), mat(PALETTE.paper)), cx, (p.y - 0.08) / 2, -0.55));
    for (let x = p.x0 + 0.6; x < p.x1; x += 1.1) g.add(put(mesh(box(0.25, 0.03, 0.03), mat(PALETTE.ink), false), x, p.y - 0.25, 0.01));
    // The coffee machine that keeps producing ammunition.
    const machine = new THREE.Group();
    machine.add(put(mesh(box(0.6, 0.7, 0.5), mat(PALETTE.ink)), 0, 0.35, 0));
    machine.add(put(mesh(box(0.4, 0.1, 0.3), mat(PALETTE.stone)), 0, 0.05, 0.2));
    machine.add(put(new THREE.Mesh(box(0.2, 0.08, 0.01), new THREE.MeshBasicMaterial({ color: 0x52e08a })), 0, 0.55, 0.26));
    g.add(put(machine, cx + 0.2, p.y, -0.85));
    return g;
  },
  fridge: (p) => {
    const g = new THREE.Group();
    const w = p.x1 - p.x0;
    const cx = (p.x0 + p.x1) / 2;
    // Against the back wall like the bookshelf: you walk in front of it and stand on its top.
    g.add(put(mesh(box(w, p.y - 0.04, 0.9), mat(0xe6e0d4)), cx, (p.y - 0.04) / 2, FRIDGE_Z));
    g.add(put(mesh(box(w + 0.02, 0.04, 0.92), mat(PALETTE.paper)), cx, p.y - 0.02, FRIDGE_Z));
    g.add(put(mesh(box(0.05, 0.9, 0.06), mat(PALETTE.stone)), p.x0 + 0.2, p.y * 0.6, FRIDGE_Z + 0.47));
    const r = rng(3);
    for (let i = 0; i < 4; i++) {
      const note = mesh(box(0.22, 0.22, 0.01), mat([PALETTE.gold, 0xff9ac0, 0x9ad0ff, 0xb6f09a][i]), false);
      note.position.set(p.x0 + 0.5 + r() * (w - 0.8), 0.9 + r() * 1.3, FRIDGE_Z + 0.455);
      note.rotation.z = (r() - 0.5) * 0.4;
      g.add(note);
    }
    return g;
  },
  shelf: (p) => {
    const g = new THREE.Group();
    const w = p.x1 - p.x0;
    const cx = (p.x0 + p.x1) / 2;
    g.add(put(mesh(box(w, p.y, 0.5), mat(0x8a6a4a)), cx, p.y / 2, -2.6));
    for (let y = 0.25; y < p.y - 0.3; y += 0.8) {
      g.add(put(mesh(box(w - 0.1, 0.05, 0.45), mat(0x6a503a)), cx, y, -2.4));
      books(g, p.x0, p.x1, y + 0.03, -2.4, Math.round(y * 100));
    }
    // The top: deep enough to stand on.
    g.add(put(mesh(box(w, 0.1, 1.4), mat(0xa8835c)), cx, p.y - 0.05, -2.1));
    g.add(put(mesh(box(w, 0.03, 0.04), mat(0xd2b48c), false), cx, p.y - 0.012, -1.39));
    return g;
  },
  cabinet: (p) => {
    const g = new THREE.Group();
    const w = p.x1 - p.x0;
    const cx = (p.x0 + p.x1) / 2;
    g.add(put(mesh(box(w, 0.9, 0.6), mat(PALETTE.lilac)), cx, p.y - 0.45, -2.9));
    g.add(put(mesh(box(w, 0.08, 1.4), mat(PALETTE.paper)), cx, p.y - 0.04, -2.3));
    for (let x = p.x0 + 0.5; x < p.x1; x += 1) g.add(put(mesh(box(0.04, 0.2, 0.04), mat(PALETTE.ink), false), x, p.y - 0.5, -2.58));
    for (const bx of [p.x0 + 0.2, p.x1 - 0.2]) g.add(put(mesh(box(0.05, 0.4, 0.6), mat(PALETTE.ink)), bx, p.y - 0.2, -2.3));
    return g;
  },
  walkway: (p) => {
    const g = new THREE.Group();
    const w = p.x1 - p.x0;
    const cx = (p.x0 + p.x1) / 2;
    g.add(put(mesh(box(w, 0.11, 1.4), mat(PALETTE.stone)), cx, p.y - 0.065, -0.6));
    // The deck you stand on is a shade lighter than its sides, with a pale nosing along the front edge.
    g.add(put(mesh(box(w, 0.015, 1.4), mat(PALETTE.lilac)), cx, p.y - 0.0075, -0.6));
    g.add(put(mesh(box(w, 0.03, 0.05), mat(PALETTE.cream), false), cx, p.y - 0.01, 0.085));
    g.add(put(mesh(box(w, 0.05, 1.42), mat(PALETTE.ink), false), cx, p.y - 0.14, -0.6));
    // A blue LED strip under the front edge.
    g.add(put(new THREE.Mesh(box(w, 0.03, 0.03), LED_STRIP), cx, p.y - 0.16, 0.11));
    // Back rail only, so nothing hides the fight.
    g.add(put(mesh(box(w, 0.05, 0.05), mat(PALETTE.ink), false), cx, p.y + 1, -1.28));
    for (let x = p.x0 + 0.2; x <= p.x1; x += 1.4) g.add(put(mesh(box(0.05, 1, 0.05), mat(PALETTE.ink), false), x, p.y + 0.5, -1.28));
    // Hung from the ceiling, or from the platform above.
    for (const x of [p.x0 + 0.3, p.x1 - 0.3]) rod(g, x, p.y, -0.6);
    return g;
  },
  tray: (p) => {
    const g = new THREE.Group();
    const w = p.x1 - p.x0;
    const cx = (p.x0 + p.x1) / 2;
    g.add(put(mesh(box(w, 0.05, 0.9), mat(PALETTE.stone)), cx, p.y - 0.035, -0.3));
    g.add(put(mesh(box(w, 0.012, 0.9), mat(PALETTE.lilac)), cx, p.y - 0.006, -0.3));
    g.add(put(mesh(box(w, 0.16, 0.04), mat(PALETTE.ink), false), cx, p.y + 0.02, -0.75));
    for (const x of [p.x0 + 0.2, p.x1 - 0.2]) rod(g, x, p.y, -0.3);
    [PALETTE.gold, PALETTE.blue, PALETTE.red, PALETTE.green].forEach((col, i) => {
      const xa = p.x0 + 0.2 + i * 0.7;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(xa, p.y - 0.05, -0.4 + i * 0.1),
        new THREE.Vector3(xa + 0.4, p.y - 0.6 - i * 0.12, -0.4 + i * 0.1),
        new THREE.Vector3(xa + 0.8, p.y - 0.05, -0.4 + i * 0.1),
      ]);
      g.add(mesh(new THREE.TubeGeometry(curve, 12, 0.03, 5), mat(col), false));
    });
    return g;
  },
  // ---- Boxes in the fight plane: solid, a lighter lid you stand on, dark sides that read as a block. ----
  crate: (p) => {
    const g = new THREE.Group();
    const w = p.x1 - p.x0;
    const h = p.y - baseOf(p);
    const cx = (p.x0 + p.x1) / 2;
    const b = baseOf(p);
    const D = 1.1;
    const Z = PROP_Z;
    g.add(put(mesh(box(w - 0.04, h - 0.06, D - 0.04), mat(CRATE.body)), cx, b + (h - 0.06) / 2, Z));
    // The lid: the lightest, sun-bleached boards, with a little overhang so its edge catches the key light.
    g.add(put(mesh(box(w + 0.02, 0.06, D + 0.02), mat(CRATE.lid)), cx, p.y - 0.03, Z));
    // Corner posts, a top and bottom batten and an X brace on the face you see.
    const f = Z + D / 2 - 0.005;
    for (const ex of [p.x0 + 0.05, p.x1 - 0.05]) g.add(put(mesh(box(0.1, h - 0.06, 0.06), mat(CRATE.frame)), ex, b + (h - 0.06) / 2, f));
    for (const by of [b + 0.06, p.y - 0.12]) g.add(put(mesh(box(w - 0.04, 0.1, 0.06), mat(CRATE.frame)), cx, by, f));
    const diag = Math.hypot(w - 0.2, h - 0.3);
    const brace = mesh(box(0.09, diag, 0.05), mat(CRATE.frame));
    brace.rotation.z = Math.atan2(w - 0.2, h - 0.3);
    g.add(put(brace, cx, b + (h - 0.06) / 2, f + 0.01));
    return g;
  },
  metal: (p) => {
    const g = new THREE.Group();
    const w = p.x1 - p.x0;
    const h = p.y - baseOf(p);
    const cx = (p.x0 + p.x1) / 2;
    const b = baseOf(p);
    const D = 1.0;
    const Z = PROP_Z;
    g.add(put(mesh(box(w, h - 0.1, D), mat(STEEL.body)), cx, b + (h - 0.1) / 2, Z));
    g.add(put(mesh(box(w + 0.03, 0.1, D + 0.03), mat(STEEL.lid)), cx, p.y - 0.05, Z));
    const f = Z + D / 2 + 0.01;
    // Pressed ribs, a hasp and two carry handles.
    for (const ry of [b + h * 0.3, b + h * 0.62]) g.add(put(mesh(box(w - 0.12, 0.05, 0.03), mat(STEEL.rib), false), cx, ry, f));
    g.add(put(mesh(box(0.14, 0.18, 0.04), mat(PALETTE.gold), false), cx, p.y - 0.2, f + 0.01));
    for (const ex of [p.x0 - 0.02, p.x1 + 0.02]) g.add(put(mesh(box(0.04, 0.06, 0.34), mat(PALETTE.ink), false), ex, b + h * 0.7, Z));
    return g;
  },
  rack: (p) => {
    const g = new THREE.Group();
    const w = p.x1 - p.x0;
    const h = p.y - baseOf(p);
    const cx = (p.x0 + p.x1) / 2;
    const b = baseOf(p);
    const D = 1.0;
    const Z = PROP_Z;
    g.add(put(mesh(box(w, h - 0.06, D), mat(0x1a1d26)), cx, b + (h - 0.06) / 2, Z));
    // A brushed steel top plate, lighter than the black cabinet, so the top reads as a surface.
    g.add(put(mesh(box(w + 0.02, 0.06, D + 0.02), mat(STEEL.lid)), cx, p.y - 0.03, Z));
    const f = Z + D / 2 + 0.01;
    const units = Math.floor((h - 0.4) / 0.22);
    for (let u = 0; u < units; u++) {
      const uy = b + 0.25 + u * 0.22;
      g.add(put(mesh(box(w - 0.12, 0.16, 0.02), mat(0x2a2f3a), false), cx, uy, f));
      for (let k = 0; k < 3; k++) {
        const led = new THREE.Object3D();
        led.position.set(cx + w / 2 - 0.22 + k * 0.07, uy, f + 0.015);
        led.userData.led = { phase: u * 1.7 + k * 0.9, color: k === 2 ? 0xffb347 : 0x3ddc84 };
        g.add(led);
      }
    }
    // Side rails, and a cable bundle running from its back up to the tray in the ceiling.
    for (const ex of [p.x0 + 0.03, p.x1 - 0.03]) g.add(put(mesh(box(0.05, h - 0.06, 0.05), mat(STEEL.rib), false), ex, b + (h - 0.06) / 2, f));
    [PALETTE.blue, PALETTE.gold].forEach((col, i) => {
      const x = cx - 0.15 + i * 0.25;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, p.y - 0.2, Z - D / 2 - 0.04),
        new THREE.Vector3(x - 0.3, p.y + 1.2, Z - D / 2 - 0.25),
        new THREE.Vector3(x - 0.4, rodTop(x, p.y) - 0.3, Z - D / 2 - 0.3),
      ]);
      g.add(mesh(new THREE.TubeGeometry(curve, 10, 0.03, 5), mat(col), false));
    });
    return g;
  },
  ledge: (p) => {
    const g = new THREE.Group();
    const w = p.x1 - p.x0;
    const cx = (p.x0 + p.x1) / 2;
    // A thin steel landing hung on two rods: a believable 8 cm plate, a pale top and a lighter front nosing.
    g.add(put(mesh(box(w, 0.07, 1.0), mat(PALETTE.stone)), cx, p.y - 0.045, -0.4));
    g.add(put(mesh(box(w, 0.012, 1.0), mat(PALETTE.lilac)), cx, p.y - 0.006, -0.4));
    g.add(put(mesh(box(w, 0.03, 0.05), mat(PALETTE.cream), false), cx, p.y - 0.01, 0.085));
    g.add(put(mesh(box(w, 0.04, 1.02), mat(PALETTE.ink), false), cx, p.y - 0.1, -0.4));
    // Two brackets under it, a small toe board at the back.
    for (const x of [p.x0 + 0.25, p.x1 - 0.25]) g.add(put(mesh(box(0.05, 0.22, 0.9), mat(PALETTE.ink), false), x, p.y - 0.2, -0.45));
    g.add(put(mesh(box(w, 0.12, 0.03), mat(PALETTE.ink), false), cx, p.y + 0.06, -0.89));
    for (const x of [p.x0 + 0.25, p.x1 - 0.25]) rod(g, x, p.y, -0.4);
    return g;
  },
};

/**
 * Merges every static mesh under `root` into one mesh per material (and shadow setting), so an office of
 * furniture costs a handful of draw calls instead of hundreds. Meshes flagged `userData.dynamic` stay as
 * they are. Returns the merged meshes in world space.
 */
export const mergeStatic = (root: THREE.Object3D) => {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { material: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[] }>();
  const merged: THREE.Mesh[] = [];
  const done: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.dynamic || Array.isArray(m.material) || (m as THREE.InstancedMesh).isInstancedMesh) return;
    const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { material: m.material, cast: m.castShadow, recv: m.receiveShadow, geos: [] }));
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    b.geos.push(g);
    done.push(m);
  });
  for (const m of done) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  for (const b of buckets.values()) {
    const geo = mergeGeometries(b.geos);
    for (const g of b.geos) g.dispose();
    const m = new THREE.Mesh(geo, b.material);
    m.castShadow = b.cast;
    m.receiveShadow = b.recv;
    merged.push(m);
  }
  return merged;
};

/** Blinking status lights on the server rack: one instanced draw for all of them. */
const buildLeds = (root: THREE.Object3D) => {
  root.updateMatrixWorld(true);
  const spots: { pos: THREE.Vector3; phase: number; color: THREE.Color }[] = [];
  root.traverse((o) => {
    if (o.userData.led) spots.push({ pos: o.getWorldPosition(new THREE.Vector3()), phase: o.userData.led.phase, color: new THREE.Color(o.userData.led.color) });
  });
  const leds = new THREE.InstancedMesh(box(0.04, 0.04, 0.01), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, spots.length));
  leds.count = spots.length;
  const mtx = new THREE.Matrix4();
  spots.forEach((s, i) => {
    leds.setMatrixAt(i, mtx.makeTranslation(s.pos.x, s.pos.y, s.pos.z));
    leds.setColorAt(i, s.color);
  });
  const off = new THREE.Color(0x1a1d26);
  const update = (time: number) => {
    spots.forEach((s, i) => leds.setColorAt(i, Math.sin(time * 7 + s.phase * 3.1) > -0.3 ? s.color : off));
    if (leds.instanceColor) leds.instanceColor.needsUpdate = true;
  };
  return { leds, update };
};

const buildPlant = (x: number, z: number, scale = 1) => {
  const g = new THREE.Group();
  g.add(put(mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 8), mat(PALETTE.orange)), 0, 0.25, 0));
  const r = rng(Math.round(x * 100 + 999));
  for (let i = 0; i < 7; i++) {
    const leaf = mesh(new THREE.ConeGeometry(0.16, 0.9, 4), mat(i % 2 ? PALETTE.green : 0x3f8f5f));
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.12, 0.85, Math.sin(a) * 0.12);
    leaf.rotation.set(Math.sin(a) * 0.5, r(), -Math.cos(a) * 0.5);
    g.add(leaf);
  }
  g.scale.setScalar(scale);
  return put(g, x, 0, z);
};

const crackTexture = () =>
  canvasTexture(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineCap = 'round';
    const r = rng(1234);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + r() * 0.4;
      let x = 128;
      let y = 128;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += Math.cos(a + (r() - 0.5) * 0.7) * (16 + r() * 14);
        y += Math.sin(a + (r() - 0.5) * 0.7) * (16 + r() * 14);
        g.lineTo(x, y);
        g.lineWidth = Math.max(1, 3 - s * 0.5);
      }
      g.stroke();
    }
    for (const rad of [28, 56]) {
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(128, 128, rad + r() * 6, 0, Math.PI * 2);
      g.stroke();
    }
  });

/** A status dashboard for the wall monitors: build graphs and a burndown in the office's own colours. */
const dashboardScreen = () =>
  canvasTexture(256, 160, (g) => {
    g.fillStyle = '#0f1420';
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#1b2234';
    g.fillRect(8, 8, 240, 22);
    g.fillStyle = '#3ddc84';
    g.fillRect(14, 15, 60, 8);
    g.fillStyle = '#e23d5c';
    g.fillRect(80, 15, 34, 8);
    const r = rng(4242);
    // Bars: green builds, the odd red one.
    for (let i = 0; i < 12; i++) {
      const h = 18 + r() * 52;
      g.fillStyle = r() > 0.8 ? '#e23d5c' : '#3ddc84';
      g.fillRect(14 + i * 10, 112 - h, 7, h);
    }
    // A burndown line.
    g.strokeStyle = '#ffc93c';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(140, 44);
    for (let i = 1; i <= 8; i++) g.lineTo(140 + i * 13, 44 + i * 8 + (r() - 0.5) * 10);
    g.stroke();
    g.fillStyle = '#3e7bfa';
    g.fillRect(14, 124, 228, 6);
    g.fillStyle = '#8b93ad';
    for (let i = 0; i < 3; i++) g.fillRect(14, 138 + i * 7, 80 + r() * 140, 3);
  });

/**
 * Wall decor from Reis's concept, all of it against the back wall or hung behind the fight plane, thin and
 * darker than anything you stand on: pendant lamps, wall monitors, ventilation units. None of it collides.
 */
const buildDecor = () => {
  const group = new THREE.Group();
  const fans: THREE.Object3D[] = [];
  const Z = BACK_Z + 0.32;
  // Pendant lamps hung behind the walkways and the tray: a cord, a dark enamel shade, a warm bulb.
  const bulb = new THREE.MeshBasicMaterial({ color: 0xffe2a8 });
  for (const [x, y] of [[-5.2, 8.3], [-1.9, 9.1], [1.9, 9.1], [5.2, 8.3]] as const) {
    const z = -1.9;
    group.add(put(mesh(new THREE.CylinderGeometry(0.015, 0.015, ARENA.ceiling - y, 4), mat(PALETTE.ink), false), x, (ARENA.ceiling + y) / 2, z));
    group.add(put(mesh(new THREE.ConeGeometry(0.32, 0.3, 12, 1, true), mat(PALETTE.inkSoft), false), x, y - 0.12, z));
    group.add(put(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), mat(PALETTE.ink), false), x, y + 0.06, z));
    group.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), bulb), x, y - 0.24, z));
  }
  // Wall monitors on the pillars, between the cabinets and the balconies: status dashboards.
  const screen = new THREE.MeshBasicMaterial({ map: dashboardScreen() });
  for (const [x, y] of [[-12, 7.75], [12, 7.75], [-6, 7.3], [6, 7.3]] as const) {
    group.add(put(mesh(box(1.34, 0.84, 0.06), mat(0x1a1d26), false), x, y, Z));
    group.add(put(new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.74), screen), x, y, Z + 0.035));
    group.add(put(mesh(box(0.1, 0.1, 0.3), mat(PALETTE.ink), false), x, y, Z - 0.15));
  }
  // Ventilation units high on the back wall, their fans turning slowly.
  for (const x of [-9, 9]) {
    const y = 11.7;
    group.add(put(mesh(box(1.1, 1.1, 0.24), mat(STEEL.body), false), x, y, Z));
    group.add(put(mesh(new THREE.TorusGeometry(0.43, 0.04, 6, 24), mat(STEEL.rib), false), x, y, Z + 0.13));
    group.add(put(mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.02, 20).rotateX(Math.PI / 2), mat(PALETTE.ink), false), x, y, Z + 0.1));
    const blades = mergeGeometries(
      [0, 1, 2, 3].map((i) => box(0.15, 0.38, 0.015).translate(0, 0.2, 0).rotateZ(i * (Math.PI / 2) + 0.3).toNonIndexed()),
    );
    const fan = put(mesh(blades, mat(STEEL.lid), false), x, y, Z + 0.12);
    fan.userData.dynamic = true;
    group.add(fan);
    fans.push(fan);
  }
  return { group, fans };
};

/** The warm oak boards of the office floor (the lobby's floating slab uses the same ones). */
export const floorTexture = () =>
  canvasTexture(512, 256, (g) => {
    const r = rng(77);
    for (let row = 0; row < 8; row++) {
      let x = -Math.floor(r() * 200);
      while (x < 512) {
        const len = 140 + r() * 180;
        const l = 52 + r() * 10;
        g.fillStyle = `hsl(${28 + r() * 6}, ${38 + r() * 10}%, ${l}%)`;
        g.fillRect(x, row * 32, len, 32);
        // Grain.
        g.strokeStyle = `rgba(90,55,30,${0.08 + r() * 0.08})`;
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          g.moveTo(x, row * 32 + 5 + k * 7 + r() * 3);
          g.bezierCurveTo(x + len * 0.3, row * 32 + 4 + k * 7 + r() * 6, x + len * 0.7, row * 32 + 6 + k * 7, x + len, row * 32 + 5 + k * 7 + r() * 3);
          g.stroke();
        }
        g.fillStyle = 'rgba(60,35,20,0.45)';
        g.fillRect(x, row * 32, 2, 32);
        x += len;
      }
      g.fillStyle = 'rgba(60,35,20,0.4)';
      g.fillRect(0, row * 32, 512, 1.5);
    }
  });

export interface ArenaView {
  crack: (side: -1 | 1, y: number) => void;
  update: (dt: number, time: number) => void;
  markers: THREE.Mesh[];
  /** The whiteboard and its frame (the menu hides them: they sit right behind the menu column). */
  whiteboard: THREE.Object3D[];
  /** Tone-mapping exposure of this arena; a hit flash adds to it (the office 1.05, OFFSITE 0.95). */
  exposure: number;
  /** What the side walls are made of: decides the wall-splat effect and sound (glass shards, or rock dust and pebbles). */
  wall: 'glass' | 'rock';
  /** Dust / chip colours for the shared vfx pool (OFFSITE: sand). Absent: the office's. */
  vfxColors?: Partial<Record<'dust' | 'glass', number>>;
  /** The render-only wind, 0..1 (OFFSITE; for devtools and the ambient-life checks). */
  wind?: () => number;
  /** Render-only reactions to the sim's events (OFFSITE ambient life). */
  react?: (e: GameEvent) => void;
  /** Bombs on parachutes: called every frame with the pickups. */
  syncPickups?: (pickups: readonly Pickup[]) => void;
  /** The final KO: a tumbleweed rolls through behind the winner at `x`. */
  finale?: (x: number) => void;
  /** The frame-time governor stepped down: drop the next ambient layer. */
  lighten?: () => void;
  /** Reduced motion on or off (OFFSITE: gusts peak lower, no kicks, vultures do not scatter). */
  setReducedMotion?: (on: boolean) => void;
}

export const buildArena = (scene: THREE.Scene, itemCount: number): ArenaView => {
  // The fog only reaches the city outside (the room is ~40 m from the camera), so the dusk outside
  // never tints the fight inside.
  scene.background = new THREE.Color(0x16204a);
  scene.fog = new THREE.Fog(0x3a4478, 70, 180);

  // Light: a cool sky fill, a warm key with shadows, and a dusk rim from the city.
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x6a5c4c, 0.95));
  const key = new THREE.DirectionalLight(0xfff1dc, 1.75);
  key.position.set(-6, 22, 14);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -21;
  sc.right = 21;
  sc.top = 17;
  sc.bottom = -6;
  sc.near = 1;
  sc.far = 60;
  key.shadow.bias = -0.0005;
  scene.add(key);
  // A faint cool rim from the city: it separates the fighters from the windows without colouring the room.
  const rim = new THREE.DirectionalLight(0xb0b8ff, 0.5);
  rim.position.set(4, 5, -20);
  scene.add(rim);

  const blinkers = buildCity(scene);

  const W = ARENA.right - ARENA.left;
  const H = ARENA.ceiling;

  // Warm oak boards, a little glossy.
  const tiles = floorTexture();
  tiles.wrapS = THREE.RepeatWrapping;
  tiles.wrapT = THREE.RepeatWrapping;
  tiles.repeat.set(W / 4, 1.6);
  const floor = new THREE.Mesh(box(W + 1.2, 0.5, 6.6), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.42, metalness: 0.05 }));
  floor.position.set(0, -0.25, -0.5);
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(put(mesh(box(W + 1.2, 0.1, 0.1), mat(PALETTE.ink), false), 0, -0.02, 2.8));
  // A navy rug with a gold border under the meeting table.
  const rugTex = canvasTexture(256, 128, (g) => {
    g.fillStyle = '#1d2747';
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 4;
    g.strokeRect(10, 10, 236, 108);
    g.strokeStyle = 'rgba(255,210,63,0.35)';
    g.lineWidth = 2;
    g.strokeRect(20, 20, 216, 88);
  });
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 3.6), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.receiveShadow = true;
  scene.add(put(rug, 0, 0.005, -0.5));
  // The building below floor 42.
  scene.add(put(mesh(box(W + 10, 14, 0.6), mat(PALETTE.ink), false), 0, -7.5, 2.6));

  scene.add(put(mesh(box(W + 1.2, 0.4, 6.6), mat(PALETTE.cream)), 0, H + 0.2, -0.5));
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xffe8b8, transparent: true, opacity: 0.032, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (let x = ARENA.left + 3; x <= ARENA.right - 3; x += 6) {
    scene.add(put(new THREE.Mesh(box(2.6, 0.04, 1), new THREE.MeshBasicMaterial({ color: 0xfff6e0 })), x, H - 0.01, -0.6));
    // A soft cone of light under each panel.
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 5, 24, 1, true), coneMat);
    scene.add(put(cone, x, H - 2.5, -0.9));
  }
  // Exposed ducts along the ceiling.
  const duct = new THREE.MeshStandardMaterial({ color: 0x8a909c, metalness: 0.6, roughness: 0.4 });
  for (const z of [-2.6, 1.6]) {
    const d = mesh(new THREE.CylinderGeometry(0.28, 0.28, W, 14).rotateZ(Math.PI / 2), duct, false);
    scene.add(put(d, 0, H - 0.5, z));
  }
  // Warm interior light against the dusk outside.
  for (const x of [-11, 0, 11]) {
    const l = new THREE.PointLight(0xffd9a0, 8, 18, 1.6);
    l.position.set(x, H - 2, 0.5);
    scene.add(l);
  }
  // Ceiling vents: IT supplies drop out of these.
  for (let x = ARENA.left + 6; x < ARENA.right; x += 12) {
    scene.add(put(mesh(box(1.4, 0.06, 0.9), mat(PALETTE.inkSoft), false), x, H - 0.02, 0.4));
    for (let i = -2; i <= 2; i++) scene.add(put(mesh(box(1.2, 0.02, 0.05), mat(PALETTE.stone), false), x, H - 0.06, 0.4 + i * 0.15));
  }

  // Back wall: a low sill, pillars, floor-to-ceiling windows onto the city.
  scene.add(put(mesh(box(W, 0.6, 0.3), mat(PALETTE.cream)), 0, 0.3, BACK_Z));
  for (let x = ARENA.left; x <= ARENA.right + 0.01; x += 6) {
    scene.add(put(mesh(box(0.5, H, 0.5), mat(0x3a3f4c)), x, H / 2, BACK_Z));
    scene.add(put(mesh(box(0.54, H * 0.42, 0.54), mat(0x8a5a36)), x, H * 0.21, BACK_Z));
  }
  for (const ty of [5.6, 9.4]) scene.add(put(mesh(box(W, 0.08, 0.1), mat(PALETTE.ink), false), 0, ty, BACK_Z - 0.05));
  const windowGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H - 0.6),
    // Tinted office glass: the city reads a step darker than the room.
    new THREE.MeshBasicMaterial({ color: 0x0a1020, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  scene.add(put(windowGlass, 0, 0.6 + (H - 0.6) / 2, BACK_Z - 0.1));

  // The whiteboard with the conflict that started all this.
  const board = canvasTexture(512, 300, (g) => {
    g.fillStyle = '#fdfbf4';
    g.fillRect(0, 0, 512, 300);
    g.font = 'bold 34px ui-monospace, Menlo, monospace';
    g.fillStyle = '#2f8f5b';
    g.fillText('<<<<<<< HEAD', 24, 60);
    g.fillStyle = '#2a2733';
    g.font = '28px ui-monospace, Menlo, monospace';
    g.fillText('  return "tabs";', 24, 104);
    g.fillStyle = '#8a8478';
    g.fillText('=======', 24, 148);
    g.fillStyle = '#2a2733';
    g.fillText('  return "spaces";', 24, 192);
    g.fillStyle = '#cf3b3b';
    g.font = 'bold 34px ui-monospace, Menlo, monospace';
    g.fillText('>>>>>>> their-branch', 24, 240);
    g.strokeStyle = '#d4552f';
    g.lineWidth = 6;
    g.beginPath();
    g.ellipse(380, 120, 100, 70, -0.2, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#d4552f';
    g.font = 'bold 30px sans-serif';
    g.fillText('FIGHT', 330, 130);
  });
  const whiteboard = [
    put(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2), new THREE.MeshStandardMaterial({ map: board, roughness: 0.6 })), -4.5, 2.6, BACK_Z + 0.32),
    put(mesh(box(3.55, 2.15, 0.06), mat(PALETTE.stone)), -4.5, 2.6, BACK_Z + 0.28),
  ];
  for (const o of whiteboard) scene.add(o);

  // The floor sign lives in the HUD now, under the round timer.

  // Side glass walls you can wall-kick off.
  const cracks: { mesh: THREE.Mesh; life: number }[] = [];
  const crackTex = crackTexture();
  for (const side of [-1, 1] as const) {
    const x = side < 0 ? ARENA.left : ARENA.right;
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, H),
      new THREE.MeshStandardMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide }),
    );
    glass.rotation.y = Math.PI / 2;
    scene.add(put(glass, x, H / 2, -0.5));
    for (const z of [-3.6, 2.7]) scene.add(put(mesh(box(0.16, H, 0.16), mat(PALETTE.ink)), x, H / 2, z));
    for (const y of [0.05, H - 0.05, 3.5, 7, 10.5]) scene.add(put(mesh(box(0.12, 0.08, 6.2), mat(PALETTE.ink), false), x, y, -0.5));
    for (let i = 0; i < 3; i++) {
      const crack = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 2.4),
        new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
      );
      crack.rotation.y = Math.PI / 2;
      crack.position.set(x - side * 0.02, 0, 0.6);
      crack.userData.side = side;
      scene.add(crack);
      cracks.push({ mesh: crack, life: 0 });
    }
  }

  // Every piece of furniture and the wall decor, merged into a few draw calls (fan blades stay separate).
  const furniture = new THREE.Group();
  for (const p of ARENA.platforms) furniture.add(FURNITURE[p.style](p));
  const decor = buildDecor();
  furniture.add(decor.group);
  const rackLeds = buildLeds(furniture);
  for (const m of mergeStatic(furniture)) scene.add(m);
  scene.add(furniture, rackLeds.leds);

  // Decor that is not a platform.
  scene.add(buildPlant(-10.6, -2.6, 1.1));
  scene.add(buildPlant(7.6, -2.6, 0.9));
  const printer = new THREE.Group();
  printer.add(put(mesh(box(1, 0.8, 0.7), mat(PALETTE.paper)), 0, 0.4, 0));
  printer.add(put(mesh(box(0.8, 0.05, 0.4), mat(PALETTE.white)), 0, 0.82, 0.1));
  printer.add(put(new THREE.Mesh(box(0.1, 0.06, 0.01), new THREE.MeshBasicMaterial({ color: 0xff6464 })), 0.3, 0.6, 0.36));
  scene.add(put(printer, 7.4, 0, -2.6));
  // The neon sign of the floor, glowing on the back wall.
  const neon = canvasTexture(512, 160, (g) => {
    g.clearRect(0, 0, 512, 160);
    g.font = 'bold 96px Bungee, Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ffd23f';
    g.shadowBlur = 28;
    g.fillStyle = '#fff3b0';
    g.fillText('FLOOR 42', 256, 84);
    g.shadowBlur = 0;
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 3;
    g.strokeText('FLOOR 42', 256, 84);
  });
  const neonSign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.3), new THREE.MeshBasicMaterial({ map: neon, transparent: true, depthWrite: false }));
  // On the open stretch of wall between the pillars at -12 and -6, above the desks.
  scene.add(put(neonSign, -9, 3.6, BACK_Z + 0.3));
  // The server rack is a real one now, standing on the right walkway (FURNITURE.rack).
  const cooler = new THREE.Group();
  cooler.add(put(mesh(box(0.6, 1.1, 0.6), mat(PALETTE.paper)), 0, 0.55, 0));
  cooler.add(put(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.55, 9), mat(0x7ea6e0, { opacity: 0.7 })), 0, 1.38, 0));
  scene.add(put(cooler, -1.2, 0, -2.8));

  // A bit of life: a wall clock that keeps real time, steam off the coffee machine, a printer
  // that blinks while it "prints", a desk fan that turns.
  const clock = new THREE.Group();
  clock.add(put(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 28).rotateX(Math.PI / 2), mat(PALETTE.paper)), 0, 0, 0));
  clock.add(put(mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 28), mat(PALETTE.ink), false), 0, 0, 0.02));
  const hand = (len: number, w: number) => {
    const h = new THREE.Group();
    h.add(put(new THREE.Mesh(box(w, len, 0.02), new THREE.MeshBasicMaterial({ color: 0x1a1d26 })), 0, len / 2, 0));
    h.position.z = 0.045;
    clock.add(h);
    return h;
  };
  const hourHand = hand(0.22, 0.05);
  const minuteHand = hand(0.33, 0.035);
  scene.add(put(clock, 9, 5.6, BACK_Z + 0.3));
  const steamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false });
  const steam = Array.from({ length: 6 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 1), steamMat.clone());
    m.userData.t = i / 6;
    scene.add(m);
    return m;
  });
  const machineX = ARENA.platforms.find((p) => p.style === 'counter');
  const steamAt = machineX ? { x: (machineX.x0 + machineX.x1) / 2 + 0.2, y: machineX.y + 0.75, z: -0.85 } : { x: 11, y: 2, z: -0.85 };
  const fan = new THREE.Group();
  fan.add(put(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.04, 10), mat(PALETTE.ink), false), 0, 0.02, 0));
  fan.add(put(mesh(box(0.03, 0.4, 0.03), mat(PALETTE.ink), false), 0, 0.22, 0));
  const blades = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const bl = mesh(box(0.06, 0.24, 0.01), mat(PALETTE.stone), false);
    bl.position.y = 0.12;
    const arm = new THREE.Group();
    arm.add(bl);
    arm.rotation.z = (i / 3) * Math.PI * 2;
    blades.add(arm);
  }
  blades.position.set(0, 0.42, 0.06);
  fan.add(blades);
  const firstDesk = ARENA.platforms.find((p) => p.style === 'desk');
  if (firstDesk) scene.add(put(fan, firstDesk.x1 - 0.5, firstDesk.y, -0.95));
  const printerLight = printer.children[2] as THREE.Mesh;

  // Pulsing floor markers under items you can pick up.
  const markers: THREE.Mesh[] = [];
  for (let i = 0; i < itemCount; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.42, 20),
      new THREE.MeshBasicMaterial({ color: PALETTE.gold, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
    markers.push(ring);
  }

  let nextCrack = 0;
  return {
    markers,
    whiteboard,
    exposure: 1.05,
    wall: 'glass',
    crack: (side, y) => {
      const candidates = cracks.filter((c) => c.mesh.userData.side === side);
      const c = candidates[nextCrack++ % candidates.length];
      c.life = 5;
      c.mesh.position.y = y;
      c.mesh.position.z = -0.5 + ((nextCrack * 1.7) % 3) - 1.5;
      c.mesh.rotation.x = nextCrack;
    },
    update: (dt, time) => {
      for (const c of cracks) {
        c.life = Math.max(0, c.life - dt);
        (c.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, c.life / 1.5) * 0.9;
      }
      const s = 1 + Math.sin(time * 5) * 0.12;
      for (const m of markers) m.scale.set(s, s, s);
      const now = new Date();
      minuteHand.rotation.z = -((now.getMinutes() + now.getSeconds() / 60) / 60) * Math.PI * 2;
      hourHand.rotation.z = -(((now.getHours() % 12) + now.getMinutes() / 60) / 12) * Math.PI * 2;
      blades.rotation.z -= dt * 14;
      printerLight.visible = Math.sin(time * 9) > 0;
      for (const m of steam) {
        m.userData.t = ((m.userData.t as number) + dt * 0.35) % 1;
        const k = m.userData.t as number;
        m.position.set(steamAt.x + Math.sin(k * 7 + time) * 0.06, steamAt.y + k * 0.9, steamAt.z);
        m.scale.setScalar(0.6 + k * 1.6);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.3 * (1 - k);
      }
      // Warning lights blink, server LEDs flicker, the neon hums.
      for (const b of blinkers) b.visible = Math.sin(time * 2.2 + (b.userData.phase as number)) > 0.6;
      rackLeds.update(time);
      for (const f of decor.fans) f.rotation.z -= dt * 5;
      (neonSign.material as THREE.MeshBasicMaterial).opacity = 0.92 + Math.sin(time * 37) * 0.04 + (Math.sin(time * 1.3) > 0.97 ? -0.4 : 0);
    },
  };
};
