import * as THREE from 'three';

import { ROSTER } from '../roster';
import { getSettings } from '../settings';
import { GUNS } from '../sim/constants';

import { canvasTexture, floorTexture, FURNITURE, mergeStatic } from './arena';
import { buildRig, disposeRig as disposeFighter, lifeRig, poseSide, setCharacterFx, setRimStrength, stepSpring } from './characters';
import { buildGun } from './guns';
import { mat, mesh, PALETTE } from './palette';
import { deviceFacts, renderProfile } from './quality';

import type { Settings } from '../settings';
import type { CharacterId, GunKind } from '../sim/types';
import type { Rig } from './characters';
import type { GunView } from './guns';

/**
 * The online lobby's scene: one slab of floor 42, broken off the building and floating above the clouds at last
 * light. Your fighter stands on it facing the camera; the empty spot for the rival is a gun ring, and a cardboard
 * cutout stands on it while you search. Everything on the slab is an existing arena piece (the oak floor, the desk,
 * the crate, the pickup ring, the cable tubes); only the clouds and the cutout are new, and both are tiny.
 *
 * Cheap on purpose (phones are first-class): one renderer for the whole page, static furniture merged into a few
 * meshes, all clouds in one InstancedMesh, no shadows on the low tier, 30 fps there. Stops drawing in a hidden tab.
 * Layout, rival-spot states and motion follow docs/collab/CREATIVE/ui/lobby-v2.md section 3.
 */

export type RivalSpot = 'idle' | 'searching' | 'found' | 'error';
export type Framing = { x: number; y: number; height: number };

export interface LobbyStats {
  calls: number;
  triangles: number;
  fps: number;
  tier: string;
  pixelRatio: number;
  shadows: boolean;
}

const SLAB = { w: 9, d: 4, cx: 0.6, thick: 0.6 };
/** The rival's spot on the slab, in front of the crate. */
const FZ = 0.9;
const RIVAL = new THREE.Vector3(1.3, 0, FZ - 0.15);
const FIGHTER_H = 1.9;
const FOV = 32;
const SHOW_GUNS: GunKind[] = ['pistol', 'smg', 'shotgun'];
/** The roster's accents (roster.ts) as colours, and a slightly lighter shade of each for the rim light. */
const ACCENT = Object.fromEntries(ROSTER.map((r) => [r.id, parseInt(r.accent.slice(1), 16)])) as Record<CharacterId, number>;
const RIM = Object.fromEntries(ROSTER.map((r) => [r.id, parseInt(r.rim.slice(1), 16)])) as Record<CharacterId, number>;
/** Idle tempo per fighter (the P0 fallback for signature beats): speed of the idle, and how much they look around. */
const TEMPO: Record<CharacterId, { speed: number; look: number }> = {
  hotfix: { speed: 1.15, look: 1.6 },
  legacy: { speed: 0.7, look: 0.5 },
  standup: { speed: 1.6, look: 1 },
  intern: { speed: 1.25, look: 2 },
};

const rand = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/** Low-poly puffs, vertex-coloured by height: a sunlit top and a blue-grey underside. One material. */
const puffGeometry = () => {
  const g = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
  const pos = g.attributes.position;
  const top = new THREE.Color('#fff2e0');
  const mid = new THREE.Color('#f6c9a6');
  const under = new THREE.Color('#c7a9be');
  const c = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const h = THREE.MathUtils.clamp((pos.getY(i) + 1) / 2, 0, 1);
    if (h < 0.5) c.copy(under).lerp(mid, h * 2);
    else c.copy(mid).lerp(top, (h - 0.5) * 2);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
};

const haloTexture = () =>
  canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,236,190,1)');
    grad.addColorStop(0.2, 'rgba(255,217,160,0.95)');
    grad.addColorStop(0.5, 'rgba(255,170,100,0.3)');
    grad.addColorStop(1, 'rgba(255,140,80,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });

/** The kraft cardboard cutout with a big painted question mark. */
const standeeTexture = () =>
  canvasTexture(128, 224, (g) => {
    g.fillStyle = '#b98a5a';
    g.fillRect(0, 0, 128, 224);
    g.strokeStyle = 'rgba(90,58,30,0.25)';
    g.lineWidth = 1;
    for (let y = 6; y < 224; y += 6) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(128, y);
      g.stroke();
    }
    g.strokeStyle = '#7a5530';
    g.lineWidth = 5;
    g.strokeRect(5, 5, 118, 214);
    g.fillStyle = '#141a2c';
    g.font = 'bold 150px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('?', 64, 118);
  });

export const startLobbyScene = (
  canvas: HTMLCanvasElement,
  first: CharacterId,
  opts: { onReady?: () => void } = {},
) => {
  const store = getSettings();
  let settings: Settings = store.get();
  let profile = renderProfile(settings, deviceFacts());
  const reducedQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const isStill = () => settings.reducedMotion || !!reducedQuery?.matches;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: profile.tier !== 'low',
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(profile.pixelRatio);
  renderer.shadowMap.enabled = profile.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft was removed in r187 (it already fell back to PCF)
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd99870, 0.011);
  const sky = canvasTexture(4, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1b2550');
    grad.addColorStop(0.42, '#3a4580');
    grad.addColorStop(0.74, '#a1708f');
    grad.addColorStop(1, '#f2a65a');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  });
  sky.minFilter = THREE.LinearFilter;
  scene.background = sky;

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
  scene.add(camera);

  // ---- light
  scene.add(new THREE.HemisphereLight(0xc9d4ff, 0x6b5446, 1.1));
  const sun = new THREE.DirectionalLight(0xffd2a1, 2.1);
  sun.position.set(-7, 5.5, 6);
  sun.target.position.set(0.5, 0.6, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(
    profile.tier === 'high' ? 1024 : 512,
    profile.tier === 'high' ? 1024 : 512,
  );
  const sc = sun.shadow.camera;
  sc.left = -6;
  sc.right = 6;
  sc.top = 4.5;
  sc.bottom = -2;
  sc.near = 1;
  sc.far = 24;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const rim = new THREE.PointLight(RIM[first], 22, 9, 1.5);
  rim.position.set(0.9, 2.9, -2.1);
  scene.add(rim);

  // ---- the slab (a group that bobs, with everything on it)
  const slab = new THREE.Group();
  scene.add(slab);
  const statics = new THREE.Group();

  const oak = floorTexture();
  oak.wrapS = oak.wrapT = THREE.RepeatWrapping;
  oak.repeat.set(SLAB.w / 4, SLAB.d / 2.5);
  const oakMat = new THREE.MeshStandardMaterial({ map: oak, roughness: 0.45, metalness: 0.05 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(SLAB.w, 0.1, SLAB.d), oakMat);
  top.position.set(SLAB.cx, -0.05, 0);
  top.receiveShadow = true;
  slab.add(top);

  const stone = mat(PALETTE.stone);
  const body = mesh(new THREE.BoxGeometry(SLAB.w - 0.06, SLAB.thick - 0.1, SLAB.d - 0.06), stone);
  body.position.set(SLAB.cx, -0.1 - (SLAB.thick - 0.1) / 2, 0);
  statics.add(body);
  // The torn edge: low-poly chunks along the front and the right cut, so it reads as broken off, not a stage.
  const r = rand(9);
  const chunk = (x: number, y: number, z: number, s: number) => {
    const m = mesh(new THREE.DodecahedronGeometry(s, 0), stone);
    m.scale.set(1 + r() * 0.6, 0.55 + r() * 0.4, 1 + r() * 0.5);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    m.position.set(x, y, z);
    statics.add(m);
  };
  const frontZ = SLAB.d / 2;
  const rightX = SLAB.cx + SLAB.w / 2;
  chunk(-2.4, -0.55, frontZ - 0.05, 0.42);
  chunk(0.2, -0.62, frontZ + 0.02, 0.5);
  chunk(3.1, -0.58, frontZ, 0.4);
  chunk(rightX - 0.05, -0.55, 0.9, 0.46);
  chunk(rightX, -0.6, -1.0, 0.38);
  // The underside: a ragged wedge hanging below.
  const wedge = mesh(new THREE.ConeGeometry(2.6, 1.1, 6), stone);
  wedge.rotation.x = Math.PI;
  wedge.position.set(SLAB.cx + 0.4, -SLAB.thick - 0.5, 0.2);
  wedge.scale.set(1.5, 1, 0.8);
  statics.add(wedge);
  // Rebar stubs sticking out of the broken face.
  const iron = mat(PALETTE.inkSoft);
  for (const x of [-2, 0.9, 3.4]) {
    const bar = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 5), iron, false);
    bar.rotation.x = Math.PI / 2 + (x > 1 ? -0.15 : 0.1);
    bar.position.set(x, -0.3, frontZ + 0.1);
    statics.add(bar);
  }

  // The only wall: one glass panel with a frame and a mullion, back left.
  const frameMat = mat(PALETTE.ink);
  const gx = -2.0;
  const gz = -SLAB.d / 2 + 0.2;
  for (const [w, h, x, y] of [
    [3.1, 0.07, 0, 2.4],
    [3.1, 0.07, 0, 0.02],
    [0.07, 2.4, -1.5, 1.2],
    [0.07, 2.4, 1.5, 1.2],
    [0.05, 2.4, 0, 1.2],
  ] as const) {
    const f = mesh(new THREE.BoxGeometry(w, h, 0.07), frameMat, false);
    f.position.set(gx + x, y, gz);
    statics.add(f);
  }
  // The desk, with its monitors and mug, and the crate: the game's own builders.
  const desk = FURNITURE.desk({ x0: -1, x1: 1, y: 0.75, style: 'desk' });
  desk.position.set(-2.0, 0, -0.6);
  statics.add(desk);
  const crate = FURNITURE.crate({ x0: -0.45, x1: 0.45, y: 0.9, style: 'crate' });
  crate.position.set(3.3, 0, 0.5);
  statics.add(crate);

  slab.add(...mergeStatic(statics));
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 2.4),
    new THREE.MeshBasicMaterial({
      color: 0xbfd8ff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  glass.position.set(gx, 1.2, gz);
  slab.add(glass);

  // Two cables hanging off the front, swaying: the one goofy detail.
  const cables: THREE.Group[] = [];
  [
    [PALETTE.gold, -3.4, 0],
    [PALETTE.blue, 2.8, 1.6],
  ].forEach(([col, x, phase]) => {
    const pivot = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.05, -0.55, 0.06),
      new THREE.Vector3(-0.04, -1.0, 0.1),
      new THREE.Vector3(0.06, -1.45, 0.12),
    ]);
    pivot.add(mesh(new THREE.TubeGeometry(curve, 10, 0.03, 5), mat(col), false));
    pivot.position.set(x, -0.45, frontZ - 0.1);
    pivot.userData.phase = phase;
    slab.add(pivot);
    cables.push(pivot);
  });

  // ---- the fighter's accent: a glow on the floor under them
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.2, 36),
    new THREE.MeshBasicMaterial({
      color: ACCENT[first],
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(0, 0.02, FZ);
  slab.add(glow);

  // ---- the rival's spot: a gun ring, and a cardboard cutout that stands on it while you search
  const ringMat = new THREE.MeshBasicMaterial({
    color: PALETTE.gold,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 28), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(RIVAL).setY(0.02);
  slab.add(ring);
  const standee = new THREE.Group();
  standee.position.copy(RIVAL);
  const board = new THREE.Group();
  standee.add(board);
  // Plain kraft board plus a printed front plane: two draw calls, and the "?" is on the front face only.
  const kraft = new THREE.MeshStandardMaterial({ color: 0xb98a5a, roughness: 1 });
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.03), kraft);
  card.position.y = 0.8;
  card.castShadow = true;
  board.add(card);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 1.6),
    new THREE.MeshStandardMaterial({ map: standeeTexture(), roughness: 1 }),
  );
  face.position.set(0, 0.8, 0.0165);
  board.add(face);
  standee.scale.setScalar(0.0001);
  slab.add(standee);
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.594),
    new THREE.MeshLambertMaterial({ color: 0xfffaf0, side: THREE.DoubleSide }),
  );
  sheet.visible = false;
  slab.add(sheet);

  // ---- clouds: a sea below, drifting, one draw call
  const puffs = new THREE.InstancedMesh(
    puffGeometry(),
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      emissive: 0x4a3a40,
      emissiveIntensity: 1.1,
    }),
    52,
  );
  puffs.frustumCulled = false;
  const cr = rand(21);
  const puffData: {
    x: number;
    y: number;
    z: number;
    sx: number;
    sy: number;
    sz: number;
    ry: number;
  }[] = [];
  for (let c = 0; c < 10; c++) {
    // Three clusters sit close and low, so their sunlit tops show right under the slab.
    const near = c < 3;
    const cx = near ? (cr() - 0.5) * 24 : (cr() - 0.5) * 78;
    const cy = near ? -3.5 - cr() * 1.5 : -14 - cr() * 4;
    const cz = near ? -2 - cr() * 6 : -12 - cr() * 55;
    for (let k = 0; k < 5; k++) {
      const s = 1.8 + cr() * 2;
      puffData.push({
        x: cx + (cr() - 0.5) * 7,
        y: cy + (cr() - 0.3) * 1.2,
        z: cz + (cr() - 0.5) * 5,
        sx: s * 1.6,
        sy: s * 0.38,
        sz: s,
        ry: cr() * 3,
      });
    }
  }
  while (puffData.length < 52)
    puffData.push({ x: 0, y: -40, z: -80, sx: 0.01, sy: 0.01, sz: 0.01, ry: 0 });
  const dummy = new THREE.Object3D();
  const WRAP = 46;
  let drift = 0;
  const placePuffs = () => {
    puffData.forEach((p, i) => {
      let x = p.x + drift;
      x = ((((x + WRAP) % (WRAP * 2)) + WRAP * 2) % (WRAP * 2)) - WRAP;
      dummy.position.set(x, p.y, p.z);
      dummy.rotation.set(0, p.ry, 0);
      dummy.scale.set(p.sx, p.sy, p.sz);
      dummy.updateMatrix();
      puffs.setMatrixAt(i, dummy.matrix);
    });
    puffs.instanceMatrix.needsUpdate = true;
  };
  placePuffs();
  scene.add(puffs);

  // ---- the sun disc and two far-off floors, fixed to the screen so every layout shows them
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshBasicMaterial({
      map: haloTexture(),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      fog: false,
    }),
  );
  camera.add(halo);
  const distant: THREE.Group[] = [];
  [
    { ndc: [-0.78, 0.42], dist: 55, s: 0.26 },
    { ndc: [0.86, -0.2], dist: 70, s: 0.2 },
  ].forEach((d) => {
    const g = new THREE.Group();
    const part = mesh(new THREE.BoxGeometry(SLAB.w, 1, SLAB.d), stone, false);
    part.scale.setScalar(d.s);
    g.add(part);
    g.userData = { ndc: d.ndc, dist: d.dist };
    // First on the cut list for the low tier's draw-call budget (spec section 14).
    g.visible = profile.tier !== 'low';
    camera.add(g);
    distant.push(g);
  });

  // ---- the fighter
  const guns = Object.fromEntries(
    SHOW_GUNS.map((k) => {
      const v = buildGun(k);
      v.root.visible = false;
      scene.add(v.root);
      return [k, v];
    }),
  ) as Record<GunKind, GunView>;
  let rig: Rig | null = null;
  let leaving: { rig: Rig; t: number } | null = null;
  let character = first;
  let drop = 0;
  let dropV = 0;
  const squash = { s: 0, v: 0 };
  const squashSpring = { x: 0, v: 0 };
  // Six cream cubes that puff out when a fighter lands.
  const dust = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xf1e6d2, transparent: true }),
    6,
  );
  dust.frustumCulled = false;
  dust.visible = false;
  slab.add(dust);
  let dustT = 1;

  const disposeRig = (x: Rig) => {
    slab.remove(x.root);
    disposeFighter(x);
  };
  const place = (id: CharacterId, animate: boolean) => {
    if (leaving) {
      disposeRig(leaving.rig);
      leaving = null;
    }
    if (rig) leaving = { rig, t: 0 };
    setCharacterFx(profile.tier);
    setRimStrength(0.35); // close-ups: a quieter rim than the arena's 0.8
    rig = buildRig(id);
    rig.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    slab.add(rig.root);
    character = id;
    colourFrom = new THREE.Color().copy(rim.color);
    colourTo = new THREE.Color(RIM[id]);
    colourT = animate && !isStill() ? 0 : 1;
    glowTo = new THREE.Color(ACCENT[id]);
    drop = animate && !isStill() ? 3.2 : 0;
    dropV = 0;
    if (!animate && leaving) {
      disposeRig(leaving.rig);
      leaving = null;
    }
    if (isStill() && leaving) {
      disposeRig(leaving.rig);
      leaving = null;
    }
  };
  let colourFrom = new THREE.Color(RIM[first]);
  let colourTo = new THREE.Color(RIM[first]);
  let glowTo = new THREE.Color(ACCENT[first]);
  let colourT = 1;
  place(first, false);
  rim.color.setHex(RIM[first]);

  // ---- rival spot state machine
  let spot: RivalSpot = 'idle';
  let spotT = 0;
  const setSpot = (s: RivalSpot) => {
    if (s === spot) return;
    spot = s;
    spotT = isStill() ? 99 : 0;
  };
  const white = new THREE.Color(0xffffff);
  const red = new THREE.Color(0xff3b4e);
  const gold = new THREE.Color(PALETTE.gold);
  const grey = new THREE.Color(PALETTE.stone);
  const updateSpot = (dt: number, time: number) => {
    spotT += dt;
    const still = isStill();
    // Ring.
    if (spot === 'idle') {
      ringMat.color.copy(gold);
      ringMat.opacity =
        0.25 + (still ? 0 : (Math.sin((time * Math.PI * 2) / 2) * 0.5 + 0.5) * 0.15);
    } else if (spot === 'searching') {
      ringMat.color.copy(gold);
      ringMat.opacity = 0.9;
    } else if (spot === 'found') {
      ringMat.opacity = 1;
      if (spotT < 0.2) ringMat.color.copy(gold).lerp(white, spotT / 0.2);
      else if (spotT < 0.45) ringMat.color.copy(white).lerp(red, (spotT - 0.2) / 0.25);
      else ringMat.color.copy(red);
    } else {
      ringMat.color.copy(grey);
      ringMat.opacity = 0.5;
    }
    // Cutout.
    let scale = 0;
    let swayAmp = 0;
    let spinY = 0;
    let tipX = 0;
    if (spot === 'searching') {
      const k = Math.min(1, spotT / 0.3);
      scale = k < 0.7 ? (k / 0.7) * 1.1 : 1.1 - ((k - 0.7) / 0.3) * 0.1;
      swayAmp = 3;
    } else if (spot === 'found') {
      scale = 1;
      spinY = Math.min(1, spotT / 0.6) * Math.PI * 4;
      tipX = spotT > 0.6 ? -(Math.PI / 2) * Math.min(1, (spotT - 0.6) / 0.25) : 0;
    } else if (spot === 'error') {
      scale = standee.scale.x > 0.5 ? 1 : 0;
      // Falls forward onto its face in 0.4 s, bounces back 6 degrees and settles in 0.12 s.
      const fall = Math.min(1, spotT / 0.4);
      const bounce = spotT > 0.4 && spotT < 0.52 ? Math.sin((Math.PI * (spotT - 0.4)) / 0.12) : 0;
      tipX = scale ? (Math.PI / 2) * fall * fall - THREE.MathUtils.degToRad(6) * bounce : 0;
    }
    standee.scale.setScalar(Math.max(0.0001, scale));
    const sway = still
      ? 0
      : Math.sin((time * Math.PI * 2) / 2.4) * THREE.MathUtils.degToRad(swayAmp);
    board.rotation.set(tipX, spinY, sway);
    // Inverted pop on a tipped card: it lies on its face, so lower it a touch.
    board.position.y = 0;
  };

  // ---- camera framing
  let framing: Framing = { x: 0.44, y: 0.7, height: 0.5 };
  const target = new THREE.Vector3(0, 1.0, FZ);
  const feet = new THREE.Vector3();
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const AZ = 0.34;
  const EL = 0.22;
  let vw = 1;
  let vh = 1;
  const frameCamera = () => {
    const dist = FIGHTER_H / (framing.height * 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    const az = AZ + THREE.MathUtils.degToRad(1.5) * pointer.sx;
    const el = EL + THREE.MathUtils.degToRad(0.8) * pointer.sy;
    camera.position.set(
      target.x + Math.sin(az) * Math.cos(el) * dist,
      target.y + Math.sin(el) * dist,
      target.z + Math.cos(az) * Math.cos(el) * dist,
    );
    camera.lookAt(target);
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // Slide the picture so the fighter's feet land where the layout wants them.
    feet.set(0, 0, FZ).applyMatrix4(slab.matrixWorld).project(camera);
    const cx = (feet.x * 0.5 + 0.5) * vw;
    const cy = (-feet.y * 0.5 + 0.5) * vh;
    camera.setViewOffset(vw, vh, -(framing.x * vw - cx), -(framing.y * vh - cy), vw, vh);
    camera.updateProjectionMatrix();
  };
  const layoutSky = () => {
    const halfH = 150 * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    halo.position.set(-0.6 * halfH * camera.aspect, -0.1 * halfH, -150);
    halo.scale.setScalar(Math.min(1.3, 1 + 0.2 / camera.aspect));
    for (const g of distant) {
      const [nx, ny] = g.userData.ndc as number[];
      const d = g.userData.dist as number;
      const hh = d * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      g.position.set(nx * hh * camera.aspect, ny * hh, -d);
    }
  };
  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const pr = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) {
      renderer.setSize(w, h, false);
      vw = w;
      vh = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      layoutSky();
    }
  };

  // Pointer parallax: desktop only, never with reduced motion.
  const fine = window.matchMedia?.('(pointer: fine)').matches ?? false;
  const onMove = (e: PointerEvent) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  if (fine) window.addEventListener('pointermove', onMove, { passive: true });

  // ---- the paper sheet that slips off the desk and falls into the clouds
  let sheetT = -1;
  let nextSheet = 5 + Math.random() * 5;
  const sheetVel = new THREE.Vector3();
  const sheetSpin = new THREE.Vector3();

  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  let time = 0;
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let readySent = false;
  let frames = 0;
  let fpsAt = performance.now();
  const stats: LobbyStats = {
    calls: 0,
    triangles: 0,
    fps: 0,
    tier: profile.tier,
    pixelRatio: renderer.getPixelRatio(),
    shadows: profile.shadows,
  };

  const render = (dt: number) => {
    time += dt;
    resize();
    const still = isStill();
    const t = still ? 0 : time;

    // The slab breathes with the wind: bob 4 cm, roll 0.4 degrees, over 6 s.
    slab.position.y = Math.sin((t * Math.PI * 2) / 6) * 0.04;
    slab.rotation.z = Math.sin((t * Math.PI * 2) / 6 + 1) * THREE.MathUtils.degToRad(0.4);
    slab.updateMatrixWorld(true);
    if (!still) {
      drift += dt * 0.15;
      placePuffs();
    }
    distant[0].children[0].position.y = (Math.sin((t * Math.PI * 2) / 8) * 0.1) / 0.26;
    distant[1].children[0].position.y = (Math.sin((t * Math.PI * 2) / 9.5 + 2) * 0.1) / 0.2;
    for (const c of cables) {
      const ph = c.userData.phase as number;
      c.rotation.z = THREE.MathUtils.degToRad(6) * Math.sin((t * Math.PI * 2) / 3.2 + ph);
      c.rotation.x = THREE.MathUtils.degToRad(3) * Math.sin((t * Math.PI * 2) / 3.7 + ph * 0.7);
    }
    updateSpot(dt, time);

    if (colourT < 1) {
      colourT = Math.min(1, colourT + dt / 0.4);
      rim.color.copy(colourFrom).lerp(colourTo, colourT);
      (glow.material as THREE.MeshBasicMaterial).color.lerp(glowTo, Math.min(1, colourT * 1.4));
    } else {
      (glow.material as THREE.MeshBasicMaterial).color.copy(glowTo);
    }

    if (rig) {
      if (drop > 0) {
        dropV -= 30 * dt;
        drop = Math.max(0, drop + dropV * dt);
        if (drop === 0) {
          squash.v = -6;
          dust.visible = true;
          dustT = 0;
        }
      }
      squashSpring.x = squash.s;
      squashSpring.v = squash.v;
      stepSpring(squashSpring, 0, Math.sqrt(260), 0.55, dt);
      squash.s = squashSpring.x;
      squash.v = squashSpring.v;

      // Idle: the showcase's weight shift, glance and gun check, at the fighter's own tempo.
      const tempo = TEMPO[character];
      const it = time * tempo.speed;
      const cycle = it % 6;
      const gun = SHOW_GUNS[Math.floor(it / 6) % SHOW_GUNS.length];
      const aim =
        cycle > 3.4 && cycle < 5
          ? 0.3 + Math.sin(it * 1.3) * 0.08 * tempo.look
          : -0.12 + Math.sin(it * 0.7) * 0.06 * tempo.look;
      poseSide(rig, {
        dt,
        time: it,
        vx: 0,
        vy: drop > 0 ? dropV : 0,
        onGround: drop === 0,
        facing: 1,
        aim,
        wall: 0,
        dashing: false,
        stunned: false,
        gun,
        sinceShot: cycle > 4.2 && cycle < 4.25 ? 0 : 1,
        reload: cycle > 0.4 && cycle < 1.4 ? (cycle - 0.4) / GUNS[gun].reloadTime : null,
        pushing: 0,
      });
      // Three-quarter front, a little toward the rival's spot: never the back.
      rig.root.rotation.y = rig.turn * 0.3 + Math.sin(it * 0.4) * 0.05 * tempo.look;
      lifeRig(rig, { dt, rawDt: dt, time: it, vx: 0, vy: drop > 0 ? dropV : 0, onGround: drop === 0, facing: 1 });
      rig.root.position.set(0, drop, FZ);
      const sy = 1 + squash.s * 0.18;
      rig.root.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      rig.root.updateMatrixWorld(true);
      for (const k of SHOW_GUNS) guns[k].root.visible = k === gun;
      rig.hand.getWorldPosition(tmpV);
      rig.hand.getWorldQuaternion(tmpQ);
      guns[gun].root.position.copy(tmpV);
      guns[gun].root.quaternion.copy(tmpQ);
      (glow.material as THREE.MeshBasicMaterial).opacity =
        0.35 + (still ? 0 : Math.sin(time * 2) * 0.03);
    }
    // The old fighter pops up and out in 0.2 s.
    if (leaving) {
      leaving.t += dt;
      const k = Math.min(1, leaving.t / 0.2);
      leaving.rig.root.position.y = k * 0.5;
      leaving.rig.root.position.z = FZ;
      leaving.rig.root.scale.setScalar(Math.max(0.001, 1 - k));
      if (k >= 1) {
        disposeRig(leaving.rig);
        leaving = null;
      }
    }
    if (dust.visible) {
      dustT += dt;
      const k = dustT / 0.3;
      if (k >= 1) dust.visible = false;
      else {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          dummy.position.set(
            Math.cos(a) * (0.3 + k * 0.7),
            0.06 + k * 0.25,
            Math.sin(a) * (0.3 + k * 0.7),
          );
          dummy.rotation.set(k * 3, a, 0);
          dummy.scale.setScalar(1 - k * 0.7);
          dummy.updateMatrix();
          dust.setMatrixAt(i, dummy.matrix);
        }
        dust.instanceMatrix.needsUpdate = true;
        (dust.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      }
    }

    // The paper sheet: every 10-14 s, lifts off the desk, tumbles over the front edge, falls (2.5 s).
    if (!still) {
      if (sheetT < 0 && time > nextSheet) {
        sheetT = 0;
        sheet.visible = true;
        sheet.position.set(-2.0 + (Math.random() - 0.5) * 0.4, 0.82, -0.7);
        sheetVel.set(1.0 + Math.random() * 0.7, 3.0, 1.9);
        sheetSpin.set(2 + Math.random() * 3, 1 + Math.random() * 2, 2 + Math.random() * 3);
      } else if (sheetT >= 0) {
        sheetT += dt;
        sheetVel.y -= 4.8 * dt;
        sheet.position.addScaledVector(sheetVel, dt);
        sheet.rotation.x += sheetSpin.x * dt;
        sheet.rotation.y += sheetSpin.y * dt;
        sheet.rotation.z += sheetSpin.z * dt;
        if (sheetT > 2.5 || sheet.position.y < -9) {
          sheetT = -1;
          sheet.visible = false;
          nextSheet = time + 10 + Math.random() * 4;
        }
      }
    }

    // Parallax eases (critically damped, about 0.4 s).
    const f = 1 - Math.exp(-dt * 10);
    const tx = still ? 0 : pointer.x;
    const ty = still ? 0 : pointer.y;
    pointer.sx += (tx - pointer.sx) * f;
    pointer.sy += (ty - pointer.sy) * f;
    frameCamera();

    renderer.render(scene, camera);
    frames += 1;
    const now = performance.now();
    if (now - fpsAt >= 1000) {
      stats.fps = Math.round((frames * 1000) / (now - fpsAt));
      frames = 0;
      fpsAt = now;
    }
    stats.calls = renderer.info.render.calls;
    stats.triangles = renderer.info.render.triangles;
    if (!readySent) {
      readySent = true;
      if (process.env.NODE_ENV !== 'production')
        console.info('[lobby] renderer.info', {
          calls: stats.calls,
          triangles: stats.triangles,
          tier: profile.tier,
        });
      opts.onReady?.();
    }
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    if (acc >= 1 / profile.menuFps - 0.002) {
      render(Math.min(0.1, acc));
      acc = 0;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  if (process.env.NODE_ENV !== 'production')
    (window as unknown as { __lobbyDebug?: unknown }).__lobbyDebug = { scene, renderer };
  const off = store.subscribe((s) => {
    settings = s;
    profile = renderProfile(s, deviceFacts());
    stats.tier = profile.tier;
    for (const g of distant) g.visible = profile.tier !== 'low';
    if (renderer.getPixelRatio() !== profile.pixelRatio) renderer.setPixelRatio(profile.pixelRatio);
    if (renderer.shadowMap.enabled !== profile.shadows) {
      renderer.shadowMap.enabled = profile.shadows;
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh)
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(
            (m) => (m.needsUpdate = true),
          );
      });
    }
  });
  // Hidden tab: stop drawing.
  const onVis = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener('visibilitychange', onVis);

  return {
    setCharacter: (id: CharacterId) => {
      if (id !== character) place(id, true);
    },
    setRival: setSpot,
    setFraming: (f: Framing) => {
      framing = f;
    },
    stats,
    dispose: () => {
      cancelAnimationFrame(raf);
      off();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) {
          o.geometry.dispose();
          for (const m of (Array.isArray(o.material)
            ? o.material
            : [o.material]) as (THREE.Material & { map?: THREE.Texture | null })[]) {
            m.map?.dispose();
            m.dispose();
          }
        }
      });
      sky.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
};

export type LobbyScene = ReturnType<typeof startLobbyScene>;
