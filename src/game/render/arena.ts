import * as THREE from 'three';

import { ARENA } from '../sim/constants';

import { mat, mesh, PALETTE } from './palette';

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

/** Seeded so the skyline is the same every load. */
const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

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
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(400, 140), new THREE.MeshBasicMaterial({ map: sky, fog: false }));
  skyPlane.position.set(0, 10, -110);
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
  for (let i = 0; i < 46; i++) {
    const w = 4 + r() * 7;
    const h = 8 + r() * 34;
    const d = 4 + r() * 6;
    const tex = facade.clone();
    tex.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 6)));
    tex.needsUpdate = true;
    const b = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
    const row = i % 2;
    b.scale.set(w, h, d);
    b.position.set(-90 + i * 4 + r() * 3, h / 2 - 34 + row * 2, -32 - row * 22 - r() * 10);
    scene.add(b);
  }
};

const buildDesk = (x0: number, x1: number, y: number) => {
  const g = new THREE.Group();
  const w = x1 - x0;
  const top = mesh(new THREE.BoxGeometry(w, 0.08, 1.5), mat(PALETTE.paper));
  top.position.set((x0 + x1) / 2, y - 0.04, -0.3);
  g.add(top);
  const edge = mesh(new THREE.BoxGeometry(w, 0.04, 0.04), mat(PALETTE.ink), false);
  edge.position.set((x0 + x1) / 2, y - 0.06, 0.45);
  g.add(edge);
  for (const lx of [x0 + 0.12, x1 - 0.12]) {
    for (const lz of [-0.95, 0.35]) {
      const leg = mesh(new THREE.BoxGeometry(0.07, y - 0.08, 0.07), mat(PALETTE.ink));
      leg.position.set(lx, (y - 0.08) / 2, lz);
      g.add(leg);
    }
  }
  // Clutter at the back of the desk: a lamp, papers, a plant.
  const lamp = new THREE.Group();
  const lampArm = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 5), mat(PALETTE.ink));
  lampArm.position.y = 0.25;
  lampArm.rotation.z = 0.3;
  const shade = mesh(new THREE.ConeGeometry(0.14, 0.16, 7, 1, true), mat(PALETTE.gold, { emissive: 0x5a4000 }));
  shade.position.set(-0.08, 0.5, 0);
  shade.rotation.z = -0.6;
  lamp.add(lampArm, shade);
  lamp.position.set(x0 + 0.5, y, -0.85);
  g.add(lamp);
  const papers = mesh(new THREE.BoxGeometry(0.5, 0.05, 0.36), mat(PALETTE.white));
  papers.position.set(x1 - 1.0, y + 0.025, -0.75);
  papers.rotation.y = 0.2;
  g.add(papers);
  return g;
};

const buildPlant = (x: number, z: number, scale = 1) => {
  const g = new THREE.Group();
  const pot = mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 8), mat(PALETTE.orange));
  pot.position.y = 0.25;
  g.add(pot);
  const r = rng(Math.round(x * 100 + 999));
  for (let i = 0; i < 7; i++) {
    const leaf = mesh(new THREE.ConeGeometry(0.16, 0.9, 4), mat(i % 2 ? PALETTE.green : 0x3f8f5f));
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.12, 0.85, Math.sin(a) * 0.12);
    leaf.rotation.set(Math.sin(a) * 0.5, r(), -Math.cos(a) * 0.5);
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  return g;
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
  scene.fog = new THREE.Fog(0x4a3f6b, 40, 120);

  // Light: a cool sky fill, a warm key with shadows, and a dusk rim from the city.
  scene.add(new THREE.HemisphereLight(0xe6ecff, 0x8a7a66, 1.25));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.1);
  key.position.set(-6, 16, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -13;
  sc.right = 13;
  sc.top = 12;
  sc.bottom = -4;
  sc.near = 1;
  sc.far = 50;
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff9a5a, 0.9);
  rim.position.set(4, 5, -20);
  scene.add(rim);

  buildCity(scene);

  const W = ARENA.right - ARENA.left;
  const H = ARENA.ceiling;

  // Floor with tiles.
  const tiles = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#f1ebdf';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#ddd3c2';
    g.lineWidth = 3;
    g.strokeRect(0, 0, 128, 128);
  });
  tiles.wrapS = THREE.RepeatWrapping;
  tiles.wrapT = THREE.RepeatWrapping;
  tiles.repeat.set(W / 1.5, 4);
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(W + 1.2, 0.5, 6),
    new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.9 }),
  );
  floor.position.set(0, -0.25, -0.4);
  // The building below floor 42: a dark slab, so the city only shows through the windows.
  const slab = mesh(new THREE.BoxGeometry(W + 6, 12, 0.6), mat(PALETTE.ink), false);
  slab.position.set(0, -6.5, 2.4);
  scene.add(slab);
  floor.receiveShadow = true;
  scene.add(floor);
  const lip = mesh(new THREE.BoxGeometry(W + 1.2, 0.1, 0.1), mat(PALETTE.ink), false);
  lip.position.set(0, -0.02, 2.6);
  scene.add(lip);

  // Ceiling with light panels.
  const ceiling = mesh(new THREE.BoxGeometry(W + 1.2, 0.4, 6), mat(PALETTE.cream));
  ceiling.position.set(0, H + 0.2, -0.4);
  scene.add(ceiling);
  for (let x = -7.5; x <= 7.5; x += 5) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 1), new THREE.MeshBasicMaterial({ color: 0xfff6e0 }));
    panel.position.set(x, H - 0.01, -0.5);
    scene.add(panel);
  }

  // Back wall: a low sill, pillars, floor-to-ceiling windows onto the city.
  const sill = mesh(new THREE.BoxGeometry(W, 0.6, 0.3), mat(PALETTE.cream));
  sill.position.set(0, 0.3, -3.1);
  scene.add(sill);
  for (let x = ARENA.left; x <= ARENA.right; x += 5) {
    const pillar = mesh(new THREE.BoxGeometry(0.45, H, 0.45), mat(PALETTE.lilac));
    pillar.position.set(x, H / 2, -3.1);
    scene.add(pillar);
  }
  const mullion = mat(PALETTE.ink);
  const transom = mesh(new THREE.BoxGeometry(W, 0.08, 0.1), mullion, false);
  transom.position.set(0, 5.2, -3.15);
  scene.add(transom);
  const windowGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H - 0.6),
    new THREE.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.08, depthWrite: false }),
  );
  windowGlass.position.set(0, 0.6 + (H - 0.6) / 2, -3.2);
  scene.add(windowGlass);

  // A whiteboard with the conflict that started this.
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
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2), new THREE.MeshStandardMaterial({ map: board, roughness: 0.6 }));
  boardMesh.position.set(-7.5, 4.9, -2.8);
  scene.add(boardMesh);
  const boardFrame = mesh(new THREE.BoxGeometry(3.55, 2.15, 0.06), mat(PALETTE.stone));
  boardFrame.position.set(-7.5, 4.9, -2.84);
  scene.add(boardFrame);

  // Floor sign over the windows.
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
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 0.9), new THREE.MeshBasicMaterial({ map: sign }));
  signMesh.position.set(3.2, 7.2, -2.85);
  scene.add(signMesh);

  // Side glass walls you can wall-kick off.
  const cracks: { mesh: THREE.Mesh; life: number }[] = [];
  const crackTex = crackTexture();
  for (const side of [-1, 1] as const) {
    const x = side < 0 ? ARENA.left : ARENA.right;
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(6, H),
      new THREE.MeshStandardMaterial({
        color: 0xbfe0ff,
        transparent: true,
        opacity: 0.22,
        roughness: 0.1,
        metalness: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    glass.rotation.y = Math.PI / 2;
    glass.position.set(x, H / 2, -0.4);
    scene.add(glass);
    for (const z of [-3.3, 2.5]) {
      const post = mesh(new THREE.BoxGeometry(0.16, H, 0.16), mat(PALETTE.ink));
      post.position.set(x, H / 2, z);
      scene.add(post);
    }
    for (const y of [0.05, H - 0.05, 3]) {
      const rail = mesh(new THREE.BoxGeometry(0.12, 0.08, 5.8), mat(PALETTE.ink), false);
      rail.position.set(x, y, -0.4);
      scene.add(rail);
    }
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

  // Desks and the hanging cable tray.
  scene.add(buildDesk(ARENA.platforms[0].x0, ARENA.platforms[0].x1, ARENA.platforms[0].y));
  scene.add(buildDesk(ARENA.platforms[1].x0, ARENA.platforms[1].x1, ARENA.platforms[1].y));
  const tray = ARENA.platforms[2];
  const trayGroup = new THREE.Group();
  const grate = mesh(new THREE.BoxGeometry(tray.x1 - tray.x0, 0.06, 0.9), mat(PALETTE.stone));
  grate.position.set(0, tray.y - 0.03, -0.2);
  trayGroup.add(grate);
  for (const z of [-0.65, 0.25]) {
    const lipM = mesh(new THREE.BoxGeometry(tray.x1 - tray.x0, 0.16, 0.04), mat(PALETTE.ink), false);
    lipM.position.set(0, tray.y + 0.02, z);
    trayGroup.add(lipM);
  }
  for (const x of [tray.x0 + 0.2, tray.x1 - 0.2]) {
    const rod = mesh(new THREE.CylinderGeometry(0.025, 0.025, H - tray.y, 5), mat(PALETTE.ink), false);
    rod.position.set(x, tray.y + (H - tray.y) / 2, -0.2);
    trayGroup.add(rod);
  }
  const cableColors = [PALETTE.gold, PALETTE.blue, PALETTE.red, PALETTE.green];
  cableColors.forEach((col, i) => {
    const xa = tray.x0 + 0.3 + i * 0.9;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(xa, tray.y - 0.05, -0.3 + i * 0.1),
      new THREE.Vector3(xa + 0.5, tray.y - 0.6 - i * 0.12, -0.3 + i * 0.1),
      new THREE.Vector3(xa + 1.0, tray.y - 0.05, -0.3 + i * 0.1),
    ]);
    trayGroup.add(mesh(new THREE.TubeGeometry(curve, 12, 0.03, 5), mat(col), false));
  });
  scene.add(trayGroup);

  // Corners: plants and a water cooler.
  scene.add(buildPlant(-9.3, -2.2, 1.1));
  scene.add(buildPlant(9.2, -2.3, 0.9));
  const cooler = new THREE.Group();
  const cBody = mesh(new THREE.BoxGeometry(0.6, 1.1, 0.6), mat(PALETTE.paper));
  cBody.position.y = 0.55;
  const jug = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.55, 9), mat(0x7ea6e0, { opacity: 0.7 }));
  jug.position.y = 1.38;
  cooler.add(cBody, jug);
  cooler.position.set(8.2, 0, -2.4);
  scene.add(cooler);

  // Pulsing floor markers under pick-up-able items.
  const markers: THREE.Mesh[] = [];
  for (let i = 0; i < itemCount; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.42, 20),
      new THREE.MeshBasicMaterial({ color: PALETTE.gold, transparent: true, opacity: 0.7, depthWrite: false }),
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
      c.mesh.position.z = -0.4 + ((nextCrack * 1.7) % 3) - 1.5;
      c.mesh.rotation.x = nextCrack;
    },
    update: (dt, time) => {
      for (const c of cracks) {
        c.life = Math.max(0, c.life - dt);
        (c.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, c.life / 1.5) * 0.9;
      }
      for (const m of markers) {
        const s = 1 + Math.sin(time * 5) * 0.12;
        m.scale.set(s, s, s);
      }
    },
  };
};
