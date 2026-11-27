/**
 * In-arena effects of the four signature traits (spec 11.2). One pooled set of small pieces (wheel sparks, steam, sugar, pack
 * sparks) plus one merged speed-line mesh per fighter (one draw call each, only while Sugar Rush runs). Nothing is allocated after
 * `createTraitVfx`; the colours are the fighter's accent, foam white or the speed-line rim. `low` (low tier or the governor stepping
 * down) halves the sparks, drops the repeating steam and the sugar to 3 pieces, as the spec's low-tier column says.
 */
import * as THREE from 'three';

import { lineStretch } from './traitFx';

import type { Vfx } from './vfx';

const POOL = 56;
const FOAM = 0xf4f6fa;
const GOLD = 0xffc83d;
const RIM = 0xffc4e6;
const GRAPE = 0x3b1f6b;

type Mode = 'ballistic' | 'steam' | 'seek';
interface Piece {
  mesh: THREE.Mesh;
  mode: Mode;
  life: number;
  max: number;
  vx: number;
  vy: number;
  gravity: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  phase: number;
  size: number;
}

/** Six quads in one geometry: three rim-coloured lines and the three grape underlines under them (merged: one draw call). */
const buildLinesGeometry = () => {
  const heights = [1.55, 1.0, 0.4]; // head, chest, knee (m above the feet)
  const pos: number[] = [];
  const col: number[] = [];
  const rim = new THREE.Color(RIM);
  const ink = new THREE.Color(GRAPE);
  const quad = (x0: number, y0: number, x1: number, y1: number, c: THREE.Color, z: number) => {
    pos.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z);
    for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
  };
  for (const y of heights) {
    quad(-0.3, y - 0.015 - 0.02, 0.3, y - 0.02, ink, 0);
    quad(-0.3, y - 0.02, 0.3, y + 0.02, rim, 0.001);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
};

export const createTraitVfx = (scene: THREE.Scene, vfx: Vfx, accents: readonly number[], reducedRef: () => boolean) => {
  const geo = new THREE.IcosahedronGeometry(0.09, 0);
  const foam = new THREE.MeshBasicMaterial({ color: FOAM, transparent: true, opacity: 0.9, depthWrite: false });
  const accentMats = accents.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false }));
  const pool: Piece[] = [];
  for (let i = 0; i < POOL; i++) {
    const mesh = new THREE.Mesh(geo, foam);
    mesh.visible = false;
    mesh.renderOrder = 9;
    scene.add(mesh);
    pool.push({ mesh, mode: 'ballistic', life: 0, max: 1, vx: 0, vy: 0, gravity: 0, x0: 0, y0: 0, x1: 0, y1: 0, phase: 0, size: 1 });
  }
  let next = 0;
  let low = false;
  const take = (mode: Mode, mat: THREE.Material, life: number, size: number) => {
    const p = pool[next++ % POOL];
    p.mode = mode;
    p.life = p.max = life;
    p.size = size;
    p.mesh.material = mat;
    p.mesh.visible = true;
    return p;
  };

  const lineGeo = buildLinesGeometry();
  const lines = accents.map(() => {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(lineGeo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    scene.add(mesh);
    return mesh;
  });

  /** Leapfrog: one gold ring flat to the camera at her feet (0.3 to 1.1 m in 250 ms) and wheel sparks fanning down and back. */
  const leapfrog = (fighter: number, x: number, y: number, facing: number) => {
    const reduced = reducedRef();
    vfx.ring(x, y + 0.05, GOLD, { life: 0.25, r0: 0.3, r1: reduced ? 0.7 : 1.1 });
    const n = low || reduced ? 4 : 8;
    for (let i = 0; i < n; i++) {
      const p = take('ballistic', accentMats[fighter] ?? foam, 0.3, 1.6);
      // A fan from straight down (-90 deg) round to straight back (180 / 0 deg, away from her facing).
      const a = -Math.PI / 2 - (i / (n - 1)) * 1.1;
      const s = 3 + (i % 3);
      p.vx = -facing * Math.abs(Math.cos(a)) * s - facing * 0.8;
      p.vy = Math.sin(a) * s * 0.8;
      p.gravity = 4;
      p.mesh.position.set(x - facing * 0.15, y + 0.1, 0.25);
      p.mesh.scale.setScalar(0.01);
    }
  };

  /** Tea Break: three steam puffs rise 0.8 m from the hip thermos over 0.9 s with a sideways wobble (low tier: three foam bits). */
  const steam = (x: number, y: number, facing: number, count = 3) => {
    if (low) {
      vfx.burst(x - facing * 0.3, y + 0.9, 3, 'foam', { speed: 1.2, up: 1.2, gravity: 0.5, life: 0.7, size: 1.1 });
      return;
    }
    const reduced = reducedRef();
    for (let i = 0; i < count; i++) {
      const p = take('steam', foam, 0.9, 2.6);
      p.x0 = x - facing * 0.3;
      p.y0 = y + 0.85 + i * 0.12;
      p.phase = i * 2.1 + x;
      p.vy = reduced ? 0 : 0.8 / 0.9;
      p.vx = -i * 0.1; // a start delay for the 2nd and 3rd puff (negative = not yet)
      p.life = p.max = 0.9 + i * 0.1;
      p.mesh.position.set(p.x0, p.y0, 0.3);
      p.mesh.scale.setScalar(0.01);
    }
  };

  /** Sugar Rush: six sugar pieces pop up and out from her head, gravity on (low tier: three). */
  const sugar = (x: number, y: number, height: number) => {
    const n = low ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const p = take('ballistic', foam, 0.5, 1.9);
      const side = i % 2 ? 1 : -1;
      p.vx = side * (1.2 + Math.random() * 1.4);
      p.vy = 3 + Math.random() * 2;
      p.gravity = 12;
      p.mesh.position.set(x, y + height * 0.95, 0.3);
      p.mesh.scale.setScalar(0.01);
    }
  };

  /** Packed Extra: five sparks fly from the pack to the gun hand over 0.2 s. */
  const pack = (fighter: number, x: number, y: number, facing: number, height: number) => {
    const n = reducedRef() ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const p = take('seek', accentMats[fighter] ?? foam, 0.2, 1.6);
      p.x0 = x - facing * 0.35;
      p.y0 = y + height * 0.62 + (i - 2) * 0.05;
      p.x1 = x + facing * 0.55;
      p.y1 = y + height * 0.55 + (i - 2) * 0.03;
      p.phase = i * 0.18;
      p.mesh.position.set(p.x0, p.y0, 0.35);
      p.mesh.scale.setScalar(0.01);
    }
  };

  /** Speed lines behind a Sugar Rush fighter for the burst: stretch with speed, fade over the last 0.2 s. `left` is the burst time left. */
  const speedLines = (fighter: number, on: boolean, x: number, y: number, facing: number, vx: number, left: number) => {
    const m = lines[fighter];
    if (!on) {
      if (m.visible) m.visible = false;
      return;
    }
    const k = reducedRef() ? 1 : lineStretch(vx);
    m.visible = true;
    m.scale.set(k, 1, 1);
    m.position.set(x - facing * (0.35 + 0.3 * k), y, 0.15);
    (m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, left / 0.2);
  };

  const update = (dt: number) => {
    for (const p of pool) {
      if (!p.mesh.visible) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      const k = 1 - p.life / p.max;
      if (p.mode === 'ballistic') {
        p.vy -= p.gravity * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.scale.setScalar(p.size * Math.min(1, k * 8) * (1 - k * 0.5));
      } else if (p.mode === 'steam') {
        if (p.vx < 0) {
          // Waiting for its start delay.
          p.vx += dt;
          p.life += dt;
          p.mesh.scale.setScalar(0.01);
          continue;
        }
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.x = p.x0 + Math.sin(p.phase + k * 9) * 0.08;
        p.mesh.scale.setScalar(p.size * (0.8 + k * 1.2) * Math.sin(Math.min(1, k * 1.1) * Math.PI));
      } else {
        const t = Math.max(0, Math.min(1, (k * p.max - p.phase * 0.2) / (p.max * 0.75)));
        p.mesh.position.x = p.x0 + (p.x1 - p.x0) * t;
        p.mesh.position.y = p.y0 + (p.y1 - p.y0) * t;
        p.mesh.scale.setScalar(p.size * (1 - k * 0.4));
      }
    }
  };

  const clear = () => {
    for (const p of pool) p.mesh.visible = false;
    for (const m of lines) m.visible = false;
  };

  return {
    leapfrog,
    steam,
    sugar,
    pack,
    speedLines,
    update,
    clear,
    setLow: (on: boolean) => (low = on),
    dispose: () => {
      geo.dispose();
      lineGeo.dispose();
      foam.dispose();
      accentMats.forEach((m) => m.dispose());
      lines.forEach((m) => (m.material as THREE.Material).dispose());
    },
  };
};

export type TraitVfx = ReturnType<typeof createTraitVfx>;
