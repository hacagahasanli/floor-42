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

const buildCity = (scene: THREE.Scene) => {
  const sky = canvasTexture(4, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1f1d3a');
    grad.addColorStop(0.45, '#4a3f6b');
    grad.addColorStop(0.75, '#c96a4f');
    grad.addColorStop(1, '#f0b060');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  });
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(500, 160), new THREE.MeshBasicMaterial({ map: sky, fog: false }));
  skyPlane.position.set(0, 12, -120);
  scene.add(skyPlane);

  const facade = canvasTexture(64, 128, (g) => {
    g.fillStyle = '#2b2837';
    g.fillRect(0, 0, 64, 128);
    const r = rng(7);
    for (let y = 4; y < 128; y += 10) {
      for (let x = 4; x < 64; x += 10) {
        const lit = r();
        g.fillStyle = lit > 0.62 ? '#ffd27a' : lit > 0.5 ? '#ff9a5a' : '#3a3650';
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
    const b = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
    const row = i % 2;
    b.scale.set(w, h, d);
    b.position.set(-120 + i * 4 + r() * 3, h / 2 - 36 + row * 2, -34 - row * 22 - r() * 10);
    scene.add(b);
  }
};

// ---------- Furniture, one builder per platform style. Top surface sits at p.y. ----------

const legs = (g: THREE.Group, x0: number, x1: number, h: number, z0: number, z1: number, color = PALETTE.ink) => {
  for (const lx of [x0 + 0.12, x1 - 0.12]) {
    for (const lz of [z0, z1]) g.add(put(mesh(box(0.07, h, 0.07), mat(color)), lx, h / 2, lz));
  }
};

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

const FURNITURE: Record<Platform['style'], (p: Platform) => THREE.Group> = {
  desk: (p) => {
    const g = new THREE.Group();
    const w = p.x1 - p.x0;
    const cx = (p.x0 + p.x1) / 2;
    g.add(put(mesh(box(w, 0.08, 1.5), mat(PALETTE.paper)), cx, p.y - 0.04, -0.3));
    g.add(put(mesh(box(w, 0.04, 0.04), mat(PALETTE.ink), false), cx, p.y - 0.06, 0.45));
    legs(g, p.x0, p.x1, p.y - 0.08, -0.95, 0.35);
    g.add(lamp(p.x0 + 0.4, p.y, -0.85));
    g.add(put(mesh(box(0.5, 0.05, 0.36), mat(PALETTE.white)), p.x1 - 1.1, p.y + 0.025, -0.75));
    // A drawer unit under one end.
    g.add(put(mesh(box(0.5, p.y - 0.15, 0.6), mat(PALETTE.lilac)), p.x1 - 0.45, (p.y - 0.15) / 2, -0.5));
    return g;
  },
  table: (p) => {
    const g = new THREE.Group();
    const w = p.x1 - p.x0;
    const cx = (p.x0 + p.x1) / 2;
    g.add(put(mesh(box(w, 0.1, 1.8), mat(0xb8875a)), cx, p.y - 0.05, -0.4));
    for (const lx of [p.x0 + 0.6, p.x1 - 0.6]) g.add(put(mesh(box(0.14, p.y - 0.1, 0.9), mat(PALETTE.ink)), lx, (p.y - 0.1) / 2, -0.4));
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
    g.add(put(mesh(box(w, p.y, 1), mat(0xe6e0d4)), cx, p.y / 2, -0.7));
    g.add(put(mesh(box(0.05, 0.9, 0.06), mat(PALETTE.stone)), p.x0 + 0.2, p.y * 0.6, -0.17));
    const r = rng(3);
    for (let i = 0; i < 4; i++) {
      const note = mesh(box(0.22, 0.22, 0.01), mat([PALETTE.gold, 0xff9ac0, 0x9ad0ff, 0xb6f09a][i]), false);
      note.position.set(p.x0 + 0.5 + r() * (w - 0.8), 0.9 + r() * 1.3, -0.19);
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
    g.add(put(mesh(box(w, 0.1, 1.4), mat(0x8a6a4a)), cx, p.y - 0.05, -2.1));
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
    g.add(put(mesh(box(w, 0.12, 1.4), mat(PALETTE.stone)), cx, p.y - 0.06, -0.6));
    g.add(put(mesh(box(w, 0.05, 1.42), mat(PALETTE.ink), false), cx, p.y - 0.14, -0.6));
    // Back rail only, so nothing hides the fight.
    g.add(put(mesh(box(w, 0.05, 0.05), mat(PALETTE.ink), false), cx, p.y + 1, -1.28));
    for (let x = p.x0 + 0.2; x <= p.x1; x += 1.4) g.add(put(mesh(box(0.05, 1, 0.05), mat(PALETTE.ink), false), x, p.y + 0.5, -1.28));
    // Hung from the ceiling.
    for (const x of [p.x0 + 0.3, p.x1 - 0.3]) {
      g.add(put(mesh(new THREE.CylinderGeometry(0.025, 0.025, ARENA.ceiling - p.y, 5), mat(PALETTE.ink), false), x, (ARENA.ceiling + p.y) / 2, -0.6));
    }
    return g;
  },
  tray: (p) => {
    const g = new THREE.Group();
    const w = p.x1 - p.x0;
    const cx = (p.x0 + p.x1) / 2;
    g.add(put(mesh(box(w, 0.06, 0.9), mat(PALETTE.stone)), cx, p.y - 0.03, -0.3));
    g.add(put(mesh(box(w, 0.16, 0.04), mat(PALETTE.ink), false), cx, p.y + 0.02, -0.75));
    for (const x of [p.x0 + 0.2, p.x1 - 0.2]) {
      g.add(put(mesh(new THREE.CylinderGeometry(0.025, 0.025, ARENA.ceiling - p.y, 5), mat(PALETTE.ink), false), x, p.y + (ARENA.ceiling - p.y) / 2, -0.3));
    }
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
}

export const buildArena = (scene: THREE.Scene, itemCount: number): ArenaView => {
  scene.background = new THREE.Color(0x1f1d3a);
  scene.fog = new THREE.Fog(0x4a3f6b, 45, 130);

  // Light: a cool sky fill, a warm key with shadows, and a dusk rim from the city.
  scene.add(new THREE.HemisphereLight(0xe6ecff, 0x8a7a66, 1.25));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.1);
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
  const rim = new THREE.DirectionalLight(0xff9a5a, 0.9);
  rim.position.set(4, 5, -20);
  scene.add(rim);

  buildCity(scene);

  const W = ARENA.right - ARENA.left;
  const H = ARENA.ceiling;

  const tiles = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#c9cfdb';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#aeb6c6';
    g.lineWidth = 3;
    g.strokeRect(0, 0, 128, 128);
  });
  tiles.wrapS = THREE.RepeatWrapping;
  tiles.wrapT = THREE.RepeatWrapping;
  tiles.repeat.set(W / 1.5, 4.5);
  const floor = new THREE.Mesh(box(W + 1.2, 0.5, 6.6), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.9 }));
  floor.position.set(0, -0.25, -0.5);
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(put(mesh(box(W + 1.2, 0.1, 0.1), mat(PALETTE.ink), false), 0, -0.02, 2.8));
  // The building below floor 42.
  scene.add(put(mesh(box(W + 10, 14, 0.6), mat(PALETTE.ink), false), 0, -7.5, 2.6));

  scene.add(put(mesh(box(W + 1.2, 0.4, 6.6), mat(PALETTE.cream)), 0, H + 0.2, -0.5));
  for (let x = ARENA.left + 3; x <= ARENA.right - 3; x += 6) {
    scene.add(put(new THREE.Mesh(box(2.6, 0.04, 1), new THREE.MeshBasicMaterial({ color: 0xfff6e0 })), x, H - 0.01, -0.6));
  }
  // Ceiling vents: IT supplies drop out of these.
  for (let x = ARENA.left + 6; x < ARENA.right; x += 12) {
    scene.add(put(mesh(box(1.4, 0.06, 0.9), mat(PALETTE.inkSoft), false), x, H - 0.02, 0.4));
    for (let i = -2; i <= 2; i++) scene.add(put(mesh(box(1.2, 0.02, 0.05), mat(PALETTE.stone), false), x, H - 0.06, 0.4 + i * 0.15));
  }

  // Back wall: a low sill, pillars, floor-to-ceiling windows onto the city.
  scene.add(put(mesh(box(W, 0.6, 0.3), mat(PALETTE.cream)), 0, 0.3, BACK_Z));
  for (let x = ARENA.left; x <= ARENA.right + 0.01; x += 6) scene.add(put(mesh(box(0.5, H, 0.5), mat(PALETTE.lilac)), x, H / 2, BACK_Z));
  for (const ty of [5.6, 9.4]) scene.add(put(mesh(box(W, 0.08, 0.1), mat(PALETTE.ink), false), 0, ty, BACK_Z - 0.05));
  const windowGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H - 0.6),
    new THREE.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.08, depthWrite: false }),
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
  scene.add(put(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2), new THREE.MeshStandardMaterial({ map: board, roughness: 0.6 })), -4.5, 2.6, BACK_Z + 0.32));
  scene.add(put(mesh(box(3.55, 2.15, 0.06), mat(PALETTE.stone)), -4.5, 2.6, BACK_Z + 0.28));

  const sign = canvasTexture(1024, 128, (g) => {
    g.fillStyle = '#2a2733';
    g.fillRect(0, 0, 1024, 128);
    g.fillStyle = '#f0c24a';
    g.font = 'bold 72px ui-monospace, Menlo, monospace';
    g.textBaseline = 'middle';
    g.fillText('FLOOR 42', 40, 66);
    g.fillStyle = '#cfc6d8';
    g.font = '40px ui-monospace, Menlo, monospace';
    g.fillText('agents-know · merge room', 420, 68);
  });
  scene.add(put(new THREE.Mesh(new THREE.PlaneGeometry(7.2, 0.9), new THREE.MeshBasicMaterial({ map: sign })), 0, 8.7, BACK_Z + 0.3));

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
  const cooler = new THREE.Group();
  cooler.add(put(mesh(box(0.6, 1.1, 0.6), mat(PALETTE.paper)), 0, 0.55, 0));
  cooler.add(put(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.55, 9), mat(0x7ea6e0, { opacity: 0.7 })), 0, 1.38, 0));
  scene.add(put(cooler, -1.2, 0, -2.8));

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
    },
  };
};
