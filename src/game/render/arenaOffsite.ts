/**
 * Arena 2, OFFSITE: a bright desert canyon (docs/collab/CREATIVE/levels/arena-2.md). Render only: the collision data
 * is OFFSITE in sim/constants.ts, and every drawn box here is built from those platforms so the two cannot drift.
 *
 * Rules this file keeps (spec sections 3, 5 and 6):
 *  - the palette below is the whole palette; walkable tops are the lightest face of their object and carry a lip;
 *  - three lights (hemisphere, sun with the shadow, warm rim), no point lights, exposure 0.95;
 *  - sky and backdrop are unlit and not tone-mapped, so the hex values reach the screen as written;
 *  - every static mesh goes through mergeStatic, the backdrop layers are one merged mesh;
 *  - the ambient life (section 5.6) is one wind driving a flag, cloud shadows, heat shimmer, blowing sand, two
 *    vultures, a tumbleweed and the bomb parachutes, all behind the fight plane, no allocation per frame.
 */
import * as THREE from 'three';

import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { baseOf, OFFSITE } from '../sim/constants';

import { canvasTexture, mergeStatic } from './arena';
import { createWind } from './offsiteWind';
import { mat, mesh } from './palette';

import type { GameEvent, Pickup } from '../sim/types';
import type { ArenaView } from './arena';
import type { ArenaBuildOptions } from './arenaView';

/** The OFFSITE palette (section 3.2) and nothing else. */
export const OFFSITE_PALETTE = {
  skyTop: 0x6fbbe3,
  skyLow: 0x98cde8,
  sun: 0xfff6dc,
  mesaFar: 0xe3bc9c,
  mesaMid: 0xd49a78,
  dune: 0xebc790,
  sand: 0xefcf98,
  sandRipple: 0xe6c288,
  sandEdge: 0xc9a070,
  cliffLit: 0xd6a47c,
  cliffShade: 0xa86d50,
  cliffStrata: 0xe8c29a,
  rockTop: 0xe6b884,
  rockSide: 0xb97c57,
  rockLip: 0xf6d9aa,
  plankTop: 0xb8966b,
  plankSide: 0x6e5440,
  plankLip: 0xe8cf9e,
  timber: 0x7a5c43,
  rope: 0xd9c7a0,
  crate: 0x8a6a4a,
  ink: 0x1b1f2e,
  canvas: 0xf3ede0,
  cactus: 0x7d9466,
  gold: 0xffc93c,
  crack: 0x7a4a32,
  dust: 0xf0d6a8,
  fog: 0xe6cfb2,
} as const;
const P = OFFSITE_PALETTE;

const { left: L, right: R, ceiling: H } = OFFSITE;
const W = R - L;

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const put = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => {
  o.position.set(x, y, z);
  return o;
};

/** Seeded so the decor is the same on every load. */
const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ---------- Sizes shared by the pieces. ----------
/** Planks span z -1.0 .. 0.15: the supports stand behind their back edge and never pierce a walking surface. */
const PLANK_Z0 = -1.0;
const PLANK_Z1 = 0.15;
const PLANK_D = PLANK_Z1 - PLANK_Z0;
const PLANK_CZ = (PLANK_Z0 + PLANK_Z1) / 2;
const PLANK_T = 0.22;
const BACK_Z = -1.1;
/** A crate or a boulder in the fight plane. */
const CRATE_D = 1.1;
const CRATE_Z = -0.45;
const BOULDER_D = 1.9;
const BOULDER_Z = -0.35;
const GROUND_Y = -0.4;
/** The near dune band's crest (m above the ground) at x, shared by the dune mesh and the tumbleweed's path. */
const DUNE_Z = -25;
const duneCrest = (x: number) => 1.4 + 0.7 * Math.sin(x * 0.17 + 1) + 0.45 * Math.sin(x * 0.41 + 2.3) + 0.2 * Math.sin(x * 0.9);

// ---------- Static fight-plane pieces (merged per material). ----------

const rippleTexture = () =>
  canvasTexture(256, 64, (g) => {
    g.fillStyle = '#efcf98';
    g.fillRect(0, 0, 256, 64);
    const r = rng(11);
    g.strokeStyle = '#e6c288';
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const y = r() * 64;
      const x = r() * 256;
      const len = 40 + r() * 90;
      g.globalAlpha = 0.55 + r() * 0.35;
      g.lineWidth = 1.5 + r() * 2.5;
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(x + len * 0.3, y - 2.5, x + len * 0.7, y + 2.5, x + len, y);
      g.stroke();
      if (x + len > 256) {
        g.beginPath();
        g.moveTo(x - 256, y);
        g.bezierCurveTo(x - 256 + len * 0.3, y - 2.5, x - 256 + len * 0.7, y + 2.5, x - 256 + len, y);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  });

/** A boulder: solid from the floor to its top (a 'desk' in the rules). Drawn box = collision box, no overhang. */
const boulder = (x0: number, x1: number, y: number) => {
  const g = new THREE.Group();
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const sideH = y - 0.05;
  g.add(put(mesh(box(w, sideH, BOULDER_D), mat(P.rockSide)), cx, sideH / 2, BOULDER_Z));
  // The top: the lightest face, flat exactly at y; a pale lip along the front edge.
  g.add(put(mesh(box(w, 0.05, BOULDER_D), mat(P.rockTop)), cx, y - 0.025, BOULDER_Z));
  g.add(put(mesh(box(w, 0.06, 0.1), mat(P.rockLip), false), cx, y - 0.03, BOULDER_Z + BOULDER_D / 2 - 0.05));
  // A facet below the lip so it reads as stone: a darker chip on the front face, never above the top.
  g.add(put(mesh(box(w * 0.45, sideH * 0.5, 0.06), mat(P.cliffShade), false), cx - w * 0.18, sideH * 0.4, BOULDER_Z + BOULDER_D / 2 + 0.02));
  g.add(put(mesh(box(w * 0.3, sideH * 0.28, 0.06), mat(P.cliffShade), false), cx + w * 0.28, sideH * 0.62, BOULDER_Z + BOULDER_D / 2 + 0.02));
  return g;
};

/** A one-way plank (boardwalk, lookout, deck, roof): 0.22 m thick, light top and lip, dark sides, rope on the back. */
const plank = (x0: number, x1: number, y: number) => {
  const g = new THREE.Group();
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  g.add(put(mesh(box(w, PLANK_T - 0.045, PLANK_D), mat(P.plankSide)), cx, y - 0.045 - (PLANK_T - 0.045) / 2, PLANK_CZ));
  g.add(put(mesh(box(w, 0.04, PLANK_D), mat(P.plankTop)), cx, y - 0.025, PLANK_CZ));
  g.add(put(mesh(box(w, 0.045, 0.06), mat(P.plankLip), false), cx, y - 0.0225, PLANK_Z1 - 0.03));
  // Rope rail on the back edge only: two strands, 0.9 m high, on thin timber stanchions.
  const n = Math.max(2, Math.round(w / 2.6) + 1);
  for (let i = 0; i < n; i++) {
    const sx = x0 + 0.1 + ((w - 0.2) * i) / (n - 1);
    g.add(put(mesh(box(0.06, 0.9 + PLANK_T, 0.06), mat(P.timber), false), sx, y - PLANK_T + (0.9 + PLANK_T) / 2, BACK_Z + 0.02));
  }
  for (const h of [0.45, 0.9]) g.add(put(mesh(box(w - 0.1, 0.03, 0.03), mat(P.rope), false), cx, y + h, BACK_Z - 0.01));
  return g;
};

/** A supply crate on a boardwalk (closed box): the crate colour with ink straps, a pale lid you stand on. */
const crate = (x0: number, x1: number, y: number, base: number) => {
  const g = new THREE.Group();
  const w = x1 - x0;
  const h = y - base;
  const cx = (x0 + x1) / 2;
  g.add(put(mesh(box(w, h - 0.05, CRATE_D), mat(P.crate)), cx, base + (h - 0.05) / 2, CRATE_Z));
  g.add(put(mesh(box(w, 0.05, CRATE_D), mat(P.plankTop)), cx, y - 0.025, CRATE_Z));
  g.add(put(mesh(box(w, 0.045, 0.06), mat(P.plankLip), false), cx, y - 0.0225, CRATE_Z + CRATE_D / 2 - 0.03));
  const f = CRATE_Z + CRATE_D / 2 + 0.01;
  for (const sx of [x0 + 0.17, x1 - 0.17]) g.add(put(mesh(box(0.1, h - 0.05, 0.03), mat(P.ink), false), sx, base + (h - 0.05) / 2, f));
  g.add(put(mesh(box(w, 0.1, 0.03), mat(P.ink), false), cx, base + (h - 0.05) * 0.5, f));
  return g;
};

const post = (x: number, y0: number, y1: number, z: number) => put(mesh(box(0.18, y1 - y0, 0.18), mat(P.timber)), x, (y0 + y1) / 2, z);

const brace = (x0: number, y0: number, x1: number, y1: number, z: number) => {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const m = mesh(box(0.18, len, 0.18), mat(P.timber));
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
  m.rotation.z = Math.atan2(x1 - x0, y1 - y0) * -1;
  return m;
};

/** The canyon walls: three stacked low-poly boxes per side, the inner face exactly at x = +-18, broken edges in z. */
const cliffs = (side: -1 | 1) => {
  const g = new THREE.Group();
  const bands: [number, number, number][] = [
    [0, 4.6, 3.0],
    [4.6, 9.2, 2.4],
    [9.2, 15, 1.8],
  ];
  bands.forEach(([y0, y1, t], i) => {
    const h = y1 - y0;
    const depth = 5.5;
    const cz = -1.75 + (i % 2 ? 0.3 : -0.3);
    const x = side * 18;
    g.add(put(mesh(box(t - 0.06, h, depth), mat(P.cliffShade)), x + side * (0.06 + (t - 0.06) / 2), y0 + h / 2, cz));
    // The face toward the arena, sunlit, and a lit cap.
    g.add(put(mesh(box(0.06, h, depth), mat(P.cliffLit)), x + side * 0.03, y0 + h / 2, cz));
    g.add(put(mesh(box(t, 0.05, depth), mat(P.cliffLit), false), x + side * (t / 2), y1 + 0.025, cz));
  });
  // Strata: a thin band on the face at y 3.5, 7.0 and 10.5 (0.1 m).
  for (const y of [3.5, 7, 10.5]) g.add(put(mesh(box(0.04, 0.1, 5.7), mat(P.cliffStrata), false), side * 17.98, y, -1.75));
  return g;
};

const cactus = (x: number, z: number, h: number) => {
  const g = new THREE.Group();
  const m = mat(P.cactus);
  const r = 0.2 * Math.min(1.15, 0.7 + h * 0.15);
  g.add(put(mesh(new THREE.CylinderGeometry(r * 0.85, r, h, 7), m), 0, h / 2, 0));
  g.add(put(mesh(new THREE.SphereGeometry(r * 0.85, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), m), 0, h, 0));
  if (h > 1.5) {
    for (const s of [-1, 1]) {
      const ay = h * (s < 0 ? 0.52 : 0.68);
      const reach = r * 2.4;
      g.add(put(mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, reach, 6).rotateZ(Math.PI / 2), m), s * reach * 0.5, ay, 0));
      const up = h * 0.22;
      g.add(put(mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, up, 6), m), s * reach, ay + up / 2, 0));
    }
  }
  return put(g, x, 0, z);
};

const pebble = (x: number, z: number, s: number, color: number, seed: number) => {
  const r = rng(seed);
  const m = mesh(new THREE.IcosahedronGeometry(1, 0), mat(color), false);
  m.scale.set(s * (0.9 + r() * 0.5), s * (0.55 + r() * 0.3), s * (0.8 + r() * 0.5));
  m.rotation.y = r() * 3;
  return put(m, x, s * 0.3, z);
};

// ---------- Backdrop: one merged mesh with vertex colours, heat shimmer and cloud shadows in the material. ----------

interface BackdropUniforms {
  uTime: { value: number };
  uC0: { value: number };
  uC1: { value: number };
  /** 1 on high, 0 on low or once the governor cut it. */
  uShim: { value: number };
}

const tessFoot = (w: number, d: number) => new THREE.BoxGeometry(w, 2, d, 1, 4, 1);

const buildBackdrop = (high: boolean) => {
  const geos: THREE.BufferGeometry[] = [];
  const addBox = (cx: number, y0: number, y1: number, z: number, w: number, d: number, hex: number, shim: number, cloud: number) => {
    const color = new THREE.Color(hex);
    const part = (g: THREE.BufferGeometry, baseY: number) => {
      const ng = g.toNonIndexed();
      const pos = ng.getAttribute('position');
      const n = pos.count;
      const col = new Float32Array(n * 3);
      const sh = new Float32Array(n);
      const cl = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        col[i * 3] = color.r;
        col[i * 3 + 1] = color.g;
        col[i * 3 + 2] = color.b;
        sh[i] = shim * Math.max(0, 1 - (pos.getY(i) - baseY) / 2);
        cl[i] = cloud;
      }
      ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
      ng.setAttribute('aShim', new THREE.BufferAttribute(sh, 1));
      ng.setAttribute('aCloud', new THREE.BufferAttribute(cl, 1));
      geos.push(ng);
    };
    const foot = Math.min(2, y1 - y0);
    part(tessFoot(w, d).scale(1, foot / 2, 1).translate(cx, y0 + foot / 2, z), y0);
    if (y1 - y0 > foot) part(box(w, y1 - y0 - foot, d).translate(cx, y0 + foot + (y1 - y0 - foot) / 2, z), y0);
  };
  // Far mesas (z -140): flat-topped terraces, flat mesa.far, hazed by the fog. Feet on the far ground.
  const far: [number, number, number, number][] = [
    // x, width, top, upper-step width (0 = none)
    [-92, 62, 12.4, 30],
    [-30, 36, 8.6, 0],
    [26, 54, 14.4, 26],
    [88, 46, 10.4, 20],
    [150, 50, 12.0, 0],
    [-150, 44, 9.6, 0],
  ];
  for (const [x, w, top, upper] of far) {
    const stepY = upper ? top - 3.2 : top;
    addBox(x, GROUND_Y, stepY, -140, w, 24, P.mesaFar, 0.6, 1);
    if (upper) addBox(x + 2, stepY, top, -140, upper, 22, P.mesaFar, 0, 1);
  }
  // Mid buttes (z -70): one in the left third, one in the right third; the centre third stays sky.
  const mid: [number, number, number, number][] = [
    [-37, 22, 11, 11],
    [39, 24, 10.2, 12],
  ];
  for (const [x, w, top, upper] of mid) {
    addBox(x, GROUND_Y, top - 3.6, -70, w, 14, P.mesaMid, 0.35, 1);
    addBox(x + 1, top - 3.6, top, -70, upper, 12, P.mesaMid, 0, 1);
  }
  // The far desert floor under everything, from the back of the playing floor to past the far mesas.
  {
    const color = new THREE.Color(P.mesaFar);
    const g = new THREE.PlaneGeometry(900, 180).rotateX(-Math.PI / 2).translate(0, GROUND_Y - 0.05, -95).toNonIndexed();
    const n = g.getAttribute('position').count;
    g.setAttribute('color', new THREE.BufferAttribute(Float32Array.from({ length: n * 3 }, (_, i) => [color.r, color.g, color.b][i % 3]), 3));
    g.setAttribute('aShim', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aCloud', new THREE.BufferAttribute(new Float32Array(n), 1));
    geos.push(g);
  }
  // Near dunes (z -25): a soft rolling band, a heightfield of three rows.
  {
    const color = new THREE.Color(P.dune);
    const rows: [number, number][] = [
      [-19, 0.55],
      [DUNE_Z, 1],
      [-31, 0.8],
    ];
    const xs: number[] = [];
    for (let x = -100; x <= 100; x += 2) xs.push(x);
    const pos: number[] = [];
    for (let r = 0; r < rows.length - 1; r++) {
      for (let i = 0; i < xs.length - 1; i++) {
        const v = (ri: number, xi: number) => [xs[xi], GROUND_Y + duneCrest(xs[xi]) * rows[ri][1], rows[ri][0]];
        const a = v(r, i);
        const b = v(r, i + 1);
        const c = v(r + 1, i + 1);
        const d = v(r + 1, i);
        pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    // The front rows and the back rows fall away to the ground at the band's edges: close them with skirts.
    for (const [rz, ri] of [[rows[0][0], 0] as const, [rows[2][0], 2] as const]) {
      const sk: number[] = [];
      for (let i = 0; i < xs.length - 1; i++) {
        const y0 = GROUND_Y + duneCrest(xs[i]) * rows[ri][1];
        const y1 = GROUND_Y + duneCrest(xs[i + 1]) * rows[ri][1];
        sk.push(xs[i], GROUND_Y, rz, xs[i + 1], GROUND_Y, rz, xs[i + 1], y1, rz, xs[i], GROUND_Y, rz, xs[i + 1], y1, rz, xs[i], y0, rz);
      }
      const gs = new THREE.BufferGeometry();
      gs.setAttribute('position', new THREE.Float32BufferAttribute(sk, 3));
      geos.push(finishLayer(gs, color, 0.15));
    }
    geos.push(finishLayer(g, color, 0.15));
  }
  const merged = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  const uniforms: BackdropUniforms = { uTime: { value: 0 }, uC0: { value: -120 }, uC1: { value: -10 }, uShim: { value: high ? 1 : 0 } };
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aShim;\nattribute float aCloud;\nuniform float uTime;\nuniform float uShim;\nvarying float vWx;\nvarying float vCloud;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  transformed.x += uShim * aShim * sin(6.2831853 * 0.6 * uTime + 1.7 * transformed.y + 0.3 * transformed.x);\n  vWx = transformed.x;\n  vCloud = aCloud;',
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uC0;\nuniform float uC1;\nvarying float vWx;\nvarying float vCloud;')
      .replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\n  float cs0 = (vWx - uC0) / 12.0;\n  float cs1 = (vWx - uC1) / 12.0;\n  float shade = min(1.0, exp(-0.5 * cs0 * cs0) + exp(-0.5 * cs1 * cs1)) * 0.15 * vCloud;\n  gl_FragColor.rgb *= 1.0 - shade;',
      );
  };
  const m = new THREE.Mesh(merged, material);
  m.frustumCulled = false;
  return { mesh: m, uniforms };
};

const finishLayer = (g: THREE.BufferGeometry, color: THREE.Color, shim: number) => {
  const n = g.getAttribute('position').count;
  const pos = g.getAttribute('position');
  const col = new Float32Array(n * 3);
  const sh = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    col[i * 3] = color.r;
    col[i * 3 + 1] = color.g;
    col[i * 3 + 2] = color.b;
    sh[i] = shim * Math.max(0, 1 - (pos.getY(i) - GROUND_Y) / 2);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aShim', new THREE.BufferAttribute(sh, 1));
  g.setAttribute('aCloud', new THREE.BufferAttribute(new Float32Array(n), 1));
  // Merging needs the same attributes everywhere.
  const ng = g;
  if (!ng.getAttribute('normal')) ng.computeVertexNormals();
  if (!ng.getAttribute('uv')) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return ng;
};

// ---------- Water tower (the landmark, z -30). ----------
const buildWaterTower = (x: number, z: number) => {
  const g = new THREE.Group();
  const legH = 7.2;
  const legs = mat(P.timber);
  for (const lx of [-1.5, 1.5]) for (const lz of [-0.9, 0.9]) g.add(put(mesh(box(0.28, legH, 0.28), legs, false), lx, GROUND_Y + legH / 2, lz));
  for (const y of [2.2, 4.6]) {
    g.add(put(mesh(box(3.3, 0.14, 0.14), legs, false), 0, y, 0.9));
    g.add(put(mesh(box(3.3, 0.14, 0.14), legs, false), 0, y, -0.9));
  }
  for (const [a, b] of [[-1.5, 1.5], [1.5, -1.5]] as const) {
    const len = Math.hypot(3, 2.4);
    const d = mesh(box(0.12, len, 0.12), legs, false);
    d.position.set(0, 3.4, 0.9);
    d.rotation.z = Math.atan2(b - a, 2.4) * -1;
    g.add(d);
  }
  g.add(put(mesh(box(3.6, 0.3, 2.4), legs, false), 0, GROUND_Y + legH + 0.15, 0));
  const tankY = GROUND_Y + legH + 0.3;
  g.add(put(mesh(new THREE.CylinderGeometry(1.7, 1.7, 2.6, 14), mat(P.canvas), false), 0, tankY + 1.3, 0));
  g.add(put(mesh(new THREE.ConeGeometry(1.9, 0.9, 14), mat(P.timber), false), 0, tankY + 2.6 + 0.45, 0));
  for (const y of [0.55, 2.05]) g.add(put(mesh(new THREE.CylinderGeometry(1.74, 1.74, 0.1, 14), mat(P.timber), false), 0, tankY + y, 0));
  g.position.set(x, 0, z);
  // The company's joke: "42" in gold on the tank. Redrawn once the display font has loaded.
  const draw = (gc: CanvasRenderingContext2D) => {
    gc.clearRect(0, 0, 256, 128);
    gc.font = "400 110px Bungee, Impact, 'Arial Black', sans-serif";
    gc.textAlign = 'center';
    gc.textBaseline = 'middle';
    gc.fillStyle = '#ffc93c';
    gc.fillText('42', 128, 70);
  };
  const tex = canvasTexture(256, 128, draw);
  const canvas = tex.image as HTMLCanvasElement;
  void document.fonts?.load?.("110px Bungee").then(() => {
    draw(canvas.getContext('2d')!);
    tex.needsUpdate = true;
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.35), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
  label.position.set(x, tankY + 1.3, z + 1.74);
  return { group: g, label };
};

// ---------- The sky and the sun. ----------
const buildSky = () => {
  const sky = canvasTexture(4, 256, (g) => {
    // The plane is 220 m tall (y -10..210) and the gradient only fills its lower third: sky.low at the horizon (the
    // foot of the far mesas), sky.top from about y 60 up, so the whole top of the frame is exactly sky.top (A3).
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#6fbbe3');
    grad.addColorStop(0.68, '#6fbbe3');
    grad.addColorStop(1, '#98cde8');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  });
  sky.wrapS = sky.wrapT = THREE.ClampToEdgeWrapping;
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(600, 220), new THREE.MeshBasicMaterial({ map: sky, fog: false, toneMapped: false, depthWrite: false }));
  skyPlane.position.set(0, 100, -160);
  skyPlane.renderOrder = -2;
  // The sun: a solid disc with a soft halo, upper left, in front of the sky and behind the mesas.
  const halo = canvasTexture(256, 256, (g) => {
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,246,220,1)');
    grad.addColorStop(0.28, 'rgba(255,246,220,1)');
    grad.addColorStop(0.31, 'rgba(255,246,220,0.55)');
    grad.addColorStop(0.55, 'rgba(255,246,220,0.22)');
    grad.addColorStop(1, 'rgba(255,246,220,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ map: halo, transparent: true, fog: false, toneMapped: false, depthWrite: false }));
  sun.position.set(-76, 44, -158);
  sun.renderOrder = -1;
  return [skyPlane, sun];
};

// ---------- The crack on the cliff (recoloured: rock lines on transparent). ----------
const crackTexture = () =>
  canvasTexture(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.strokeStyle = '#7a4a32';
    g.lineCap = 'round';
    const r = rng(1234);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + r() * 0.4;
      let x = 128;
      let y = 128;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += Math.cos(a + (r() - 0.5) * 0.7) * (16 + r() * 14);
        y += Math.sin(a + (r() - 0.5) * 0.7) * (16 + r() * 14);
        g.lineTo(x, y);
        g.lineWidth = Math.max(1.5, 4 - s * 0.6);
      }
      g.stroke();
    }
    g.lineWidth = 2;
    for (const rad of [28, 56]) {
      g.beginPath();
      g.arc(128, 128, rad + r() * 6, 0, Math.PI * 2);
      g.stroke();
    }
  });

// ---------- Ambient pools (section 5.6). ----------
const POOL = 40;

/** The vulture: a flat low-poly V (body diamond and two two-bone wings). Wing tips lift by iLift, in the shader. */
const vultureGeometry = () => {
  const pos: number[] = [];
  const wing: number[] = [];
  const tri = (a: number[], b: number[], c: number[], wa: number, wb: number, wc: number) => {
    pos.push(...a, ...b, ...c);
    wing.push(wa, wb, wc);
  };
  for (const s of [-1, 1]) {
    const L0 = [0, 0, 0.22];
    const T0 = [0, 0, -0.25];
    const L1 = [s * 0.5, 0.06, 0.16];
    const T1 = [s * 0.5, 0.06, -0.22];
    const L2 = [s * 1.0, 0.12, 0.08];
    const T2 = [s * 1.0, 0.12, -0.1];
    tri(L0, T0, T1, 0, 0, 0.5);
    tri(L0, T1, L1, 0, 0.5, 0.5);
    tri(L1, T1, T2, 0.5, 0.5, 1);
    tri(L1, T2, L2, 0.5, 1, 1);
  }
  // Head and tail.
  tri([-0.07, 0, 0.22], [0.07, 0, 0.22], [0, -0.02, 0.5], 0, 0, 0);
  tri([-0.1, 0, -0.25], [0.1, 0, -0.25], [0, 0, -0.55], 0, 0, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  return g;
};

const tumbleweedGeometry = () => {
  // Three crossed rings plus a fourth on the diagonal: a bush that still reads at 22 px against the dune.
  const rings = [0, 1, 2, 3].map((i) => {
    const g = new THREE.TorusGeometry(0.45, 0.06, 4, 10);
    if (i === 1) g.rotateY(Math.PI / 2);
    if (i === 2) g.rotateX(Math.PI / 2);
    if (i === 3) g.rotateY(Math.PI / 4);
    return g;
  });
  const merged = mergeGeometries(rings)!;
  rings.forEach((g) => g.dispose());
  return merged;
};

/** The bomb's parachute: a canvas dome with one gold stripe and four cords, one vertex-coloured mesh. */
const chuteGeometry = () => {
  const dome = new THREE.SphereGeometry(0.3, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
  const pos = dome.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const canvas = new THREE.Color(P.canvas);
  const gold = new THREE.Color(P.gold);
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const a = (Math.atan2(cz, cx) + Math.PI * 2) % (Math.PI * 2);
    const stripe = a < Math.PI / 4;
    for (let k = 0; k < 3; k++) {
      const c = stripe ? gold : canvas;
      col[(i + k) * 3] = c.r;
      col[(i + k) * 3 + 1] = c.g;
      col[(i + k) * 3 + 2] = c.b;
    }
  }
  dome.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const parts: THREE.BufferGeometry[] = [dome];
  const rope = new THREE.Color(P.rope);
  for (const [dx, dz] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]] as const) {
    const len = Math.hypot(0.3, 0.55);
    const g = new THREE.BoxGeometry(0.012, len, 0.012).toNonIndexed();
    g.translate(0, -len / 2, 0);
    g.rotateZ(dx === 0 ? 0 : Math.atan2(dx, 0.55) * 1);
    g.rotateX(dz === 0 ? 0 : -Math.atan2(dz, 0.55));
    g.translate(dx, 0, dz);
    const n = g.getAttribute('position').count;
    g.setAttribute('color', new THREE.BufferAttribute(Float32Array.from({ length: n * 3 }, (_, i) => [rope.r, rope.g, rope.b][i % 3]), 3));
    parts.push(g);
  }
  for (const g of parts) {
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
  }
  const merged = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return merged;
};

export const buildOffsite = (scene: THREE.Scene, itemCount: number, opts: ArenaBuildOptions = {}): ArenaView => {
  const high = (opts.tier ?? 'high') !== 'low';
  let reduced = !!opts.reducedMotion;

  scene.background = new THREE.Color(P.skyLow);
  scene.fog = new THREE.Fog(P.fog, 70, 220);

  // Light (5.1): a hemisphere, the sun with the shadow, and a warm back rim. No point lights.
  scene.add(new THREE.HemisphereLight(0xd8eefa, 0xe8c391, 1.2));
  const key = new THREE.DirectionalLight(0xfff0d4, 2.0);
  key.position.set(-12, 26, 14);
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
  const rim = new THREE.DirectionalLight(0xffc9a0, 0.5);
  rim.position.set(8, 4, -18);
  scene.add(rim);

  for (const o of buildSky()) scene.add(o);
  const backdrop = buildBackdrop(high);
  scene.add(backdrop.mesh);

  // Ground (5.2): the floor box exactly as the office, sand with ripples, a sand.edge lip, cliff.shade below it.
  const ripples = rippleTexture();
  ripples.wrapS = ripples.wrapT = THREE.RepeatWrapping;
  ripples.repeat.set(W / 4, 1.6);
  // A3: a lit spot of the floor must read #efcf98 on screen. ACES flattens the warm light, so the floor is not tone
  // mapped and its albedo is scaled to the measured light (hemisphere + sun + rim); shadows keep their ratio.
  const floor = new THREE.Mesh(
    box(W + 1.2, 0.5, 6.6),
    new THREE.MeshStandardMaterial({ map: ripples, color: new THREE.Color(1.35, 1.385, 1.56), roughness: 1, metalness: 0, toneMapped: false }),
  );
  floor.position.set(0, -0.25, -0.5);
  floor.receiveShadow = true;
  scene.add(floor);

  const fixed = new THREE.Group();
  fixed.add(put(mesh(box(W + 1.2, 0.1, 0.1), mat(P.sandEdge), false), 0, -0.02, 2.8));
  fixed.add(put(mesh(box(W + 10, 14, 0.6), mat(P.cliffShade), false), 0, -7.5, 2.6));

  // Fight-plane pieces, built from the collision data.
  const planks: { x0: number; x1: number; y: number }[] = [];
  for (const p of OFFSITE.platforms) {
    if (p.style === 'desk') fixed.add(boulder(p.x0, p.x1, p.y));
    else if (p.style === 'crate') fixed.add(crate(p.x0, p.x1, p.y, baseOf(p)));
    else {
      fixed.add(plank(p.x0, p.x1, p.y));
      planks.push({ x0: p.x0, x1: p.x1, y: p.y });
    }
  }
  // Supports, all timber, behind the fighters: posts under the boardwalks, a brace under each lookout, the tower.
  for (const x of [-9.5, -5.5, 5.5, 9.5]) fixed.add(post(x, 0, 4.0 - PLANK_T, BACK_Z));
  for (const s of [-1, 1]) fixed.add(brace(s * 17.9, 5.6, s * 13.2, 7.7, BACK_Z));
  for (const x of [-2.2, 2.2]) for (const z of [BACK_Z, -1.4]) fixed.add(post(x, 0, 10.4 - PLANK_T, z));
  // The flag's pole (the flag itself is dynamic).
  fixed.add(put(mesh(box(0.08, 2.2, 0.08), mat(P.timber), false), 0, 10.4 + 1.1, -1.3));

  for (const s of [-1, 1] as const) fixed.add(cliffs(s));
  for (const [x, z, h] of [[-16.2, -2.6, 3.0], [-6.5, -5.0, 1.8], [9.6, -3.4, 2.4]] as const) fixed.add(cactus(x, z, h));
  // Pebbles: two clusters per cliff foot and one per boulder, on the floor behind the fight plane.
  let ps = 5;
  for (const [cx, n] of [[-16, 3], [-14.2, 2], [16, 3], [14.2, 2], [-13.4, 2], [13.4, 2]] as const) {
    const r = rng(ps++ * 17);
    for (let i = 0; i < n; i++) fixed.add(pebble(cx + (r() - 0.5) * 1.4, -2 + r() * 1.5, 0.08 + r() * 0.12, i % 2 ? P.sandEdge : P.rockSide, ps * 7 + i));
  }
  const water = buildWaterTower(8.5, -30);
  fixed.add(water.group);
  for (const m of mergeStatic(fixed)) scene.add(m);
  scene.add(water.label);
  scene.add(fixed);
  // Shadows: the sun's shadow map covers the fight; the far backdrop and the ambient layers never cast or receive.

  // Wall splat decals: the existing crack system, recoloured.
  const crackTex = crackTexture();
  const cracks: { mesh: THREE.Mesh; life: number }[] = [];
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 3; i++) {
      const crack = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 2.4),
        new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      );
      crack.rotation.y = Math.PI / 2;
      crack.position.set(side * 17.96, 0, 0.6);
      crack.userData.side = side;
      crack.visible = false;
      scene.add(crack);
      cracks.push({ mesh: crack, life: 0 });
    }
  }

  // Pulsing floor markers under items you can pick up (same as the office).
  const markers: THREE.Mesh[] = [];
  for (let i = 0; i < itemCount; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.42, 20),
      new THREE.MeshBasicMaterial({ color: P.gold, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
    markers.push(ring);
  }

  // ---------- Ambient life ----------
  const wind = createWind(opts.seed ?? 1);
  const ambRand = mulberry32((opts.seed ?? 1) ^ 0x0ff517e);
  // Detail levels the governor cuts, in order: 1 the sand pool, 2 the vultures and the tumbleweed (not the final-KO
  // gag), 3 the shimmer. The low tier starts with all of them cut but the flag, the cloud shadows and the chutes.
  let detail = high ? 0 : 3;
  let now = 0;

  // 1. The tower flag: a gold 0.9 x 0.45 m cloth streaming to +x, driven by the wind (CPU, 26 vertices).
  const FLAG_W = 0.9;
  const FLAG_H = 0.45;
  const FLAG_X = 12;
  const FLAG_Y = 3;
  const flagGeo = new THREE.PlaneGeometry(FLAG_W, FLAG_H, FLAG_X, FLAG_Y);
  const flagPos = flagGeo.getAttribute('position') as THREE.BufferAttribute;
  const flagU = new Float32Array(flagPos.count);
  const flagV = new Float32Array(flagPos.count);
  for (let i = 0; i < flagPos.count; i++) {
    flagU[i] = flagPos.getX(i) / FLAG_W + 0.5;
    flagV[i] = 0.5 - flagPos.getY(i) / FLAG_H;
  }
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshBasicMaterial({ color: P.gold, side: THREE.DoubleSide, toneMapped: false }));
  flag.frustumCulled = false;
  scene.add(flag);
  const FLAG_TOP = 10.4 + 2.2;
  let flagPhase = 0;
  const updateFlag = (dt: number, w: number) => {
    const f = 1 + 1.4 * w;
    flagPhase += Math.PI * 2 * f * dt;
    const amp = 0.05 + 0.1 * w;
    const droop = ((25 - Math.max(0, Math.min(1, (w - 0.25) / 0.75)) * 20) * Math.PI) / 180;
    const cd = Math.cos(droop);
    const sd = Math.sin(droop);
    for (let i = 0; i < flagPos.count; i++) {
      const u = flagU[i];
      const v = flagV[i];
      const wave = Math.sin(flagPhase - 6 * u + v * 1.5) * amp * u;
      flagPos.setXYZ(i, 0.04 + u * FLAG_W * cd, FLAG_TOP - 0.05 - v * FLAG_H - u * FLAG_W * sd + wave, -1.3 + wave * 0.5);
    }
    flagPos.needsUpdate = true;
  };

  // 4. Blowing sand: one shared pool of 40 camera-facing quads (streamers, skitter, the explosion sift).
  const sandGeo = new THREE.PlaneGeometry(1, 1);
  const sandAlpha = new THREE.InstancedBufferAttribute(new Float32Array(POOL), 1);
  sandGeo.setAttribute('iAlpha', sandAlpha);
  const sandMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false });
  sandMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float iAlpha;\nvarying float vIA;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  vIA = iAlpha;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vIA;').replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  gl_FragColor.a *= vIA;');
  };
  const sand = new THREE.InstancedMesh(sandGeo, sandMat, POOL);
  sand.name = 'ambient:sand';
  sand.frustumCulled = false;
  sand.visible = false;
  sand.renderOrder = 1;
  scene.add(sand);
  const sx = new Float32Array(POOL);
  const sy = new Float32Array(POOL);
  const sz = new Float32Array(POOL);
  const svx = new Float32Array(POOL);
  const svy = new Float32Array(POOL);
  const slife = new Float32Array(POOL);
  const smax = new Float32Array(POOL);
  const sw0 = new Float32Array(POOL);
  const sw1 = new Float32Array(POOL);
  const sh0 = new Float32Array(POOL);
  const sh1 = new Float32Array(POOL);
  const sa0 = new Float32Array(POOL);
  let sandNext = 0;
  const colDust = new THREE.Color(P.dust);
  const colEdge = new THREE.Color(P.sandEdge);
  for (let i = 0; i < POOL; i++) {
    sand.setColorAt(i, colDust);
    sand.setMatrixAt(i, ZERO);
  }
  const spawnSand = (x: number, y: number, z: number, vx: number, vy: number, life: number, w0: number, w1: number, h0: number, h1: number, a0: number, c: THREE.Color) => {
    const i = sandNext++ % POOL;
    sx[i] = x;
    sy[i] = y;
    sz[i] = z;
    svx[i] = vx;
    svy[i] = vy;
    slife[i] = smax[i] = life;
    sw0[i] = w0;
    sw1[i] = w1;
    sh0[i] = h0;
    sh1[i] = h1;
    sa0[i] = a0;
    sand.setColorAt(i, c);
    if (sand.instanceColor) sand.instanceColor.needsUpdate = true;
  };
  const streamer = (side: -1 | 1) =>
    spawnSand(side * (18 + ambRand() * 3), 14.8 + ambRand() * 0.4, -2.4, 4, 0.6, 1.4, 0.5, 1.6, 0.5 / 3, 1.6 / 3, 0.45, colDust);
  const skitter = () => spawnSand(L + ambRand() * W, 0.05 + ambRand() * 0.3, -2.4, 6, 0, 0.9, 1.2, 1.2, 0.15, 0.15, 0.3, colDust);
  let accL = 0;
  let accR = 0;
  let accS = 0;
  const m4 = new THREE.Matrix4();
  const updateSand = (dt: number, w: number) => {
    if (detail < 1) {
      if (w > 0.4) {
        accL += 10 * (w - 0.4) * dt;
        accR += 10 * (w - 0.4) * dt;
      }
      if (w > 0.5) accS += 6 * w * dt;
      while (accL >= 1) {
        accL -= 1;
        streamer(-1);
      }
      while (accR >= 1) {
        accR -= 1;
        streamer(1);
      }
      while (accS >= 1) {
        accS -= 1;
        skitter();
      }
    }
    let live = 0;
    for (let i = 0; i < POOL; i++) {
      if (slife[i] <= 0) continue;
      slife[i] -= dt;
      if (slife[i] <= 0 || detail >= 1) {
        slife[i] = 0;
        sandAlpha.setX(i, 0);
        sand.setMatrixAt(i, ZERO);
        continue;
      }
      live++;
      const k = 1 - slife[i] / smax[i];
      sx[i] += svx[i] * dt;
      sy[i] += svy[i] * dt;
      const wi = sw0[i] + (sw1[i] - sw0[i]) * k;
      const hi = sh0[i] + (sh1[i] - sh0[i]) * k;
      m4.makeScale(wi, hi, 1).setPosition(sx[i], sy[i], sz[i]);
      sand.setMatrixAt(i, m4);
      sandAlpha.setX(i, sa0[i] * (1 - k));
    }
    sand.visible = live > 0;
    sand.instanceMatrix.needsUpdate = true;
    sandAlpha.needsUpdate = true;
  };

  // Rock chips: three pebbles on a wall splat, four down the cliff on a blast.
  const PEBBLES = 10;
  const pebbles = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({ color: P.sandEdge, toneMapped: false }), PEBBLES);
  pebbles.name = 'ambient:pebbles';
  pebbles.frustumCulled = false;
  pebbles.visible = false;
  scene.add(pebbles);
  const px = new Float32Array(PEBBLES);
  const py = new Float32Array(PEBBLES);
  const pz = new Float32Array(PEBBLES);
  const pvx = new Float32Array(PEBBLES);
  const pvy = new Float32Array(PEBBLES);
  const pspin = new Float32Array(PEBBLES);
  const plife = new Float32Array(PEBBLES);
  let pebbleNext = 0;
  for (let i = 0; i < PEBBLES; i++) pebbles.setMatrixAt(i, ZERO);
  const dropPebble = (x: number, y: number, side: -1 | 1) => {
    const i = pebbleNext++ % PEBBLES;
    px[i] = x;
    py[i] = y;
    pz[i] = -0.9 + ambRand() * 1.2;
    pvx[i] = -side * (0.6 + ambRand() * 1.6);
    pvy[i] = 1 + ambRand() * 2;
    pspin[i] = (ambRand() - 0.5) * 14;
    plife[i] = 0.9;
  };
  const dummy = new THREE.Object3D();
  const updatePebbles = (dt: number) => {
    let live = 0;
    for (let i = 0; i < PEBBLES; i++) {
      if (plife[i] <= 0) continue;
      plife[i] -= dt;
      if (plife[i] <= 0) {
        pebbles.setMatrixAt(i, ZERO);
        continue;
      }
      live++;
      pvy[i] -= 18 * dt;
      px[i] += pvx[i] * dt;
      py[i] += pvy[i] * dt;
      if (py[i] < 0.08) {
        py[i] = 0.08;
        pvy[i] *= -0.25;
        pvx[i] *= 0.5;
      }
      dummy.position.set(px[i], py[i], pz[i]);
      dummy.rotation.set(pspin[i] * plife[i], pspin[i] * 0.7 * plife[i], 0);
      dummy.scale.setScalar(Math.min(1, plife[i] * 3));
      dummy.updateMatrix();
      pebbles.setMatrixAt(i, dummy.matrix);
    }
    pebbles.visible = live > 0;
    pebbles.instanceMatrix.needsUpdate = true;
  };

  // 5. Two vultures far back, circling the upper left; they scatter on a rocket or a rail shot.
  const vGeo = vultureGeometry();
  const iLift = new THREE.InstancedBufferAttribute(new Float32Array(2), 1);
  vGeo.setAttribute('iLift', iLift);
  const vMat = new THREE.MeshBasicMaterial({ color: P.plankSide, side: THREE.DoubleSide });
  vMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWing;\nattribute float iLift;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.y += iLift * aWing;');
  };
  const vultures = new THREE.InstancedMesh(vGeo, vMat, 2);
  vultures.name = 'ambient:vultures';
  vultures.frustumCulled = false;
  vultures.visible = detail < 2;
  scene.add(vultures);
  const VC = { x: -28, y: 22, z: -60 };
  const vRadius = [5.0, 6.5];
  const vPhase = [0, (140 * Math.PI) / 180];
  const vFlapAt = [2 + ambRand() * 3, 5 + ambRand() * 3];
  let scatterAt = -1e9;
  let scatterCool = -1e9;
  const FLEE = 2.5;
  const BACK = 12;
  const scatterVultures = () => {
    if (detail >= 2 || reduced || now - scatterCool < 20) return;
    scatterCool = now;
    scatterAt = now;
  };
  const vObj = new THREE.Object3D();
  const updateVultures = () => {
    vultures.visible = detail < 2;
    if (detail >= 2) return;
    const t = now;
    const since = t - scatterAt;
    for (let i = 0; i < 2; i++) {
      const th = ((Math.PI * 2) / 16) * t + vPhase[i];
      const r = vRadius[i];
      let x = VC.x + Math.cos(th) * r;
      let y = VC.y + Math.sin(th * 2 + i) * 0.5;
      const z = VC.z + Math.sin(th) * r;
      let vx = -Math.sin(th);
      const vz = Math.cos(th);
      let lift = 0;
      let bank = (15 * Math.PI) / 180;
      // Glide, with three flaps at 2 Hz once every 5-8 s.
      if (t >= vFlapAt[i]) {
        const u = t - vFlapAt[i];
        if (u < 1.5) lift = Math.sin(u * Math.PI * 2 * 2) * 0.35;
        else vFlapAt[i] = t + 5 + ambRand() * 3;
      }
      if (since >= 0 && since < BACK) {
        // Scatter: 4 Hz flaps, climb 6 m and fly out toward -x at 6 m/s until out of frame, then glide back at 8-12 s.
        let ox: number;
        let oy: number;
        if (since < 8) {
          ox = -6 * since;
          oy = 6 * Math.min(1, since / FLEE);
        } else {
          const k = (since - 8) / (BACK - 8);
          const e = 1 - (1 - k) * (1 - k);
          ox = -48 * (1 - e);
          oy = 6 * (1 - e);
        }
        x += ox;
        y += oy;
        vx = -1;
        lift = since < 8 ? Math.sin(since * Math.PI * 2 * 4) * 0.45 : lift;
        bank = 0;
      }
      const vzz = since >= 0 && since < BACK ? 0 : vz;
      vObj.position.set(x, y, z);
      vObj.rotation.set(0, Math.atan2(vx, vzz), 0);
      vObj.rotateZ(i === 0 ? bank : -bank);
      vObj.updateMatrix();
      vultures.setMatrixAt(i, vObj.matrix);
      iLift.setX(i, lift);
    }
    vultures.instanceMatrix.needsUpdate = true;
    iLift.needsUpdate = true;
  };

  // 6. The tumbleweed: rolls along the near dune crest (z -25), on a gust now and then, and in the final-KO gag.
  const tumble = new THREE.Mesh(tumbleweedGeometry(), new THREE.MeshBasicMaterial({ color: P.timber, toneMapped: false }));
  tumble.name = 'ambient:tumbleweed';
  tumble.visible = false;
  tumble.frustumCulled = false;
  scene.add(tumble);
  let tumbleOn = false;
  let tumbleX = 0;
  let tumbleV = 3.5;
  let tumbleT = 0;
  let tumbleScale = 1;
  let tumbleLast = -1e9;
  let gagAt = -1;
  let gagX = 0;
  const startTumble = (x: number, v: number, scaleIn = false) => {
    tumbleOn = true;
    tumbleX = x;
    tumbleV = v;
    tumbleT = 0;
    tumbleScale = scaleIn ? 0 : 1;
    tumbleLast = now;
  };
  const updateTumble = (dt: number) => {
    if (gagAt >= 0 && now >= gagAt) {
      gagAt = -1;
      startTumble(gagX - 4, 5, true);
    }
    if (!tumbleOn) {
      tumble.visible = false;
      return;
    }
    tumbleT += dt;
    tumbleX += tumbleV * dt;
    tumbleScale = Math.min(1, tumbleScale + dt * 5);
    if (tumbleX > 44) {
      tumbleOn = false;
      tumble.visible = false;
      return;
    }
    const hop = Math.abs(Math.sin((Math.PI * tumbleT) / 1.1)) * 0.4;
    tumble.visible = true;
    tumble.position.set(tumbleX, GROUND_Y + duneCrest(tumbleX) + 0.45 + hop, DUNE_Z);
    tumble.rotation.z = -(tumbleV * tumbleT) / 0.45;
    tumble.rotation.y = 0.5;
    tumble.scale.setScalar(tumbleScale);
  };

  // 7. Bomb parachutes: a canvas dome over each falling drop; it tilts and wobbles in the wind, the bomb stays on the sim's x.
  const chuteGeo = chuteGeometry();
  const chutes = [0, 1].map(() => {
    const m = new THREE.Mesh(chuteGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, toneMapped: false }));
    m.name = 'ambient:chute';
    m.visible = false;
    m.frustumCulled = false;
    scene.add(m);
    return { mesh: m, alive: false, fade: 0 };
  });
  let wobbleT = 0;

  // The crack decals and the markers.
  let nextCrack = 0;
  const cracksBySide = { '-1': cracks.filter((c) => c.mesh.userData.side === -1), '1': cracks.filter((c) => c.mesh.userData.side === 1) };
  const crack = (side: -1 | 1, y: number) => {
    const candidates = cracksBySide[side === -1 ? '-1' : '1'];
    const c = candidates[nextCrack++ % candidates.length];
    c.life = 5;
    c.mesh.visible = true;
    c.mesh.position.y = y;
    c.mesh.position.z = -0.5 + ((nextCrack * 1.7) % 3) - 1.5;
    c.mesh.rotation.x = nextCrack;
    // Three pebbles fall away from the crack.
    for (let i = 0; i < 3; i++) dropPebble(side * 17.9, y + ambRand() * 0.6, side);
  };

  // Reactions to the sim's events (render only).
  const sift = (x: number) => {
    for (const p of planks) {
      if (x < p.x0 - 5 || x > p.x1 + 5) continue;
      const near = Math.max(p.x0 + 0.2, Math.min(p.x1 - 0.2, x));
      for (let k = -1; k <= 1; k++) {
        const sxk = Math.max(p.x0 + 0.1, Math.min(p.x1 - 0.1, near + k * 0.9 + (ambRand() - 0.5) * 0.3));
        spawnSand(sxk, p.y - PLANK_T, -1.2, 0, -2.14, 0.7, 0.06, 0.06, 0.8, 0.8, 0.55, colEdge);
      }
    }
  };
  const react = (e: GameEvent) => {
    switch (e.type) {
      case 'explosion':
        wind.kick(now, reduced);
        if (detail < 1) sift(e.x);
        if (detail < 1 && Math.abs(e.x) > 11) {
          const side = e.x < 0 ? -1 : 1;
          for (let i = 0; i < 4; i++) dropPebble(side * 17.9, 9 + ambRand() * 2, side);
        }
        scatterVultures();
        break;
      case 'shot':
        if (e.gun === 'launcher' || e.gun === 'railgun') scatterVultures();
        break;
      case 'rail':
        scatterVultures();
        break;
      case 'wallSplat':
        if (detail < 1) for (let i = 0; i < 6; i++) streamer(e.side);
        break;
      case 'ko':
        wind.kick(now, reduced);
        break;
      default:
        break;
    }
  };

  let lastW = 0.25;
  return {
    markers,
    whiteboard: [],
    exposure: 0.95,
    wall: 'rock',
    wind: () => lastW,
    vfxColors: { dust: P.dust, glass: P.sandEdge },
    crack,
    react,
    finale: (x: number) => {
      // The arena's second joke: a tumbleweed crosses behind the winner during the slow-motion and the KNOCKOUT band.
      gagAt = now + 0.15;
      gagX = x;
    },
    lighten: () => {
      detail = Math.min(3, detail + 1);
      backdrop.uniforms.uShim.value = detail >= 3 ? 0 : 1;
    },
    setReducedMotion: (on: boolean) => {
      reduced = on;
    },
    syncPickups: (pickups: readonly Pickup[]) => {
      let k = 0;
      for (const p of pickups) {
        if (p.spawn !== null) continue;
        const c = chutes[k++];
        if (!c) break;
        const falling = p.active && p.vy < -0.05;
        if (falling) {
          c.alive = true;
          c.fade = 0.3;
          c.mesh.visible = true;
          (c.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
          c.mesh.position.set(p.x, p.y + 0.45 + 0.62, 0.05);
          c.mesh.rotation.z = -((6 * Math.PI) / 180) * lastW + Math.sin(Math.PI * 2 * 0.8 * wobbleT + k) * 0.05;
        } else if (c.alive) {
          // The bomb landed: the chute lets go and fades in 0.3 s where it hung.
          c.alive = false;
        }
      }
    },
    update: (dt, time) => {
      now = time;
      wobbleT = time;
      const w = wind.update(time, reduced);
      lastW = w;
      backdrop.uniforms.uTime.value = time;
      backdrop.uniforms.uC0.value = ((-120 + 2 * time + 120) % 240) - 120;
      backdrop.uniforms.uC1.value = ((-120 + 2 * time + 110 + 120) % 240) - 120;
      updateFlag(dt, w);
      updateSand(dt, w);
      updatePebbles(dt);
      updateVultures();
      updateTumble(dt);
      if (wind.out.gust && !reduced && detail < 2 && !tumbleOn && now - tumbleLast > 30 && ambRand() < 0.4) startTumble(-42, 3.5);
      for (const c of chutes) {
        if (!c.alive && c.mesh.visible) {
          c.fade -= dt;
          (c.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, c.fade / 0.3);
          if (c.fade <= 0) c.mesh.visible = false;
        }
      }
      for (const c of cracks) {
        c.life = Math.max(0, c.life - dt);
        (c.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, c.life / 1.5) * 0.9;
        if (c.life <= 0) c.mesh.visible = false;
      }
      const s = 1 + Math.sin(time * 5) * 0.12;
      for (const m of markers) m.scale.set(s, s, s);
    },
  };
};

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

