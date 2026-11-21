import * as THREE from 'three';

import { ARENA } from '../sim/constants';

import { mat, mesh, PALETTE } from './palette';

import type { Platform } from '../sim/constants';

const canvasTexture = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
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

/** Where a hanger rod from a platform at (x, y) ends: under the next platform above it, or the ceiling. */
const rodTop = (x: number, y: number) =>
  ARENA.platforms.reduce((top, q) => (q.y > y + 0.01 && q.y < top && x >= q.x0 && x <= q.x1 ? q.y - 0.12 : top), ARENA.ceiling);
const rod = (g: THREE.Group, x: number, y: number, z: number) => {
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

const FURNITURE: Record<Platform['style'], (p: Platform) => THREE.Group> = {
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
    g.add(put(new THREE.Mesh(box(w, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: 0x3ec5ff })), cx, p.y - 0.16, 0.11));
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

export interface ArenaView {
  crack: (side: -1 | 1, y: number) => void;
  update: (dt: number, time: number) => void;
  markers: THREE.Mesh[];
  /** The whiteboard and its frame (the menu hides them: they sit right behind the menu column). */
  whiteboard: THREE.Object3D[];
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
  const tiles = canvasTexture(512, 256, (g) => {
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

  for (const p of ARENA.platforms) scene.add(FURNITURE[p.style](p));

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
  // A server rack with blinking lights.
  const rack = new THREE.Group();
  rack.add(put(mesh(box(0.9, 2.2, 0.7), mat(0x1a1d26)), 0, 1.1, 0));
  const leds: THREE.Mesh[] = [];
  for (let u = 0; u < 9; u++) {
    rack.add(put(mesh(box(0.8, 0.16, 0.02), mat(0x2a2f3a), false), 0, 0.3 + u * 0.22, 0.36));
    for (let k = 0; k < 3; k++) {
      const led = new THREE.Mesh(box(0.04, 0.04, 0.01), new THREE.MeshBasicMaterial({ color: k === 2 ? 0xffb347 : 0x3ddc84 }));
      led.position.set(0.22 + k * 0.08, 0.3 + u * 0.22, 0.375);
      led.userData.phase = u * 1.7 + k * 0.9;
      rack.add(led);
      leds.push(led);
    }
  }
  scene.add(put(rack, 1.9, 0, -2.9));
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
      for (const l of leds) l.visible = Math.sin(time * 7 + (l.userData.phase as number) * 3.1) > -0.3;
      (neonSign.material as THREE.MeshBasicMaterial).opacity = 0.92 + Math.sin(time * 37) * 0.04 + (Math.sin(time * 1.3) > 0.97 ? -0.4 : 0);
    },
  };
};
