import * as THREE from 'three';

import { mat, mesh, PALETTE } from './palette';

import type { ItemKind } from '../sim/types';

export interface ItemView {
  root: THREE.Group;
  /** Inner group: re-posed between "resting in the world" and "held in a hand". */
  inner: THREE.Group;
  halfHeight: number;
}

/** A screen showing a merge conflict, drawn once into a canvas texture. */
let screenTexture: THREE.CanvasTexture | null = null;
const conflictScreen = () => {
  if (screenTexture || typeof document === 'undefined') return screenTexture;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 80;
  const g = c.getContext('2d')!;
  g.fillStyle = '#14161c';
  g.fillRect(0, 0, 128, 80);
  const rows: [string, number][] = [
    ['#52e08a', 40],
    ['#6a6a78', 70],
    ['#52e08a', 55],
    ['#f0c24a', 90],
    ['#ff6464', 60],
    ['#6a6a78', 80],
    ['#ff6464', 45],
    ['#f0c24a', 90],
  ];
  rows.forEach(([col, w], i) => {
    g.fillStyle = col;
    g.fillRect(8, 6 + i * 9, w, 4);
  });
  screenTexture = new THREE.CanvasTexture(c);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  return screenTexture;
};

export const buildItem = (kind: ItemKind): ItemView => {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  let halfHeight = 0.1;

  if (kind === 'keyboard') {
    halfHeight = 0.05;
    inner.add(mesh(new THREE.BoxGeometry(0.98, 0.07, 0.32), mat(PALETTE.inkSoft)));
    const keys = mesh(new THREE.BoxGeometry(0.9, 0.03, 0.25), mat(PALETTE.lilac));
    keys.position.y = 0.045;
    inner.add(keys);
    const enter = mesh(new THREE.BoxGeometry(0.1, 0.035, 0.1), mat(PALETTE.orange));
    enter.position.set(0.36, 0.05, -0.02);
    inner.add(enter);
    const space = mesh(new THREE.BoxGeometry(0.4, 0.035, 0.06), mat(PALETTE.paper));
    space.position.set(0, 0.05, 0.08);
    inner.add(space);
  } else if (kind === 'mug') {
    halfHeight = 0.09;
    inner.add(mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.18, 9), mat(PALETTE.white)));
    const coffee = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.01, 9), mat(0x4a2c1a), false);
    coffee.position.y = 0.085;
    inner.add(coffee);
    const handle = mesh(new THREE.TorusGeometry(0.05, 0.016, 4, 8), mat(PALETTE.white));
    handle.position.x = 0.11;
    inner.add(handle);
    const band = mesh(new THREE.CylinderGeometry(0.102, 0.1, 0.04, 9), mat(PALETTE.green), false);
    band.position.y = 0.02;
    inner.add(band);
  } else {
    halfHeight = 0.36;
    const frame = mesh(new THREE.BoxGeometry(0.86, 0.52, 0.07), mat(PALETTE.ink));
    frame.position.y = 0.1;
    inner.add(frame);
    const tex = conflictScreen();
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.44),
      new THREE.MeshBasicMaterial({ map: tex ?? undefined, color: tex ? 0xffffff : 0x223344 }),
    );
    screen.position.set(0, 0.1, 0.037);
    inner.add(screen);
    const neck = mesh(new THREE.BoxGeometry(0.06, 0.2, 0.05), mat(PALETTE.stone));
    neck.position.set(0, -0.24, -0.02);
    inner.add(neck);
    const base = mesh(new THREE.BoxGeometry(0.3, 0.03, 0.2), mat(PALETTE.stone));
    base.position.set(0, -0.34, 0);
    inner.add(base);
  }
  return { root, inner, halfHeight };
};

/** How an item sits relative to the hand anchor when held. */
export const poseHeld = (view: ItemView, kind: ItemKind) => {
  const { inner } = view;
  inner.position.set(0, 0, 0);
  inner.rotation.set(0, 0, 0);
  if (kind === 'keyboard') {
    // Gripped at one end, held out like a blade.
    inner.rotation.set(0, Math.PI / 2, Math.PI / 2);
    inner.position.set(0, 0, 0.42);
  } else if (kind === 'monitor') {
    // Screen out, as a shield.
    inner.position.set(0, -0.08, 0.05);
  } else {
    inner.position.set(0, 0.02, 0.02);
  }
};

export const poseResting = (view: ItemView) => {
  view.inner.position.set(0, 0, 0);
  view.inner.rotation.set(0, 0, 0);
};
