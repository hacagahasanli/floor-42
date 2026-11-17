import * as THREE from 'three';

import { ATTACKS } from '../sim/constants';

import { buildRig, poseRig } from './characters';
import { buildItem, poseHeld } from './items';
import { mat, mesh, PALETTE } from './palette';

import type { AttackKind, CharacterId, ItemKind } from '../sim/types';

/** A turntable for one character: it idles, then shows a move with a weapon. */
const DEMO: { held: ItemKind | null; attack: AttackKind | null }[] = [
  { held: null, attack: null },
  { held: null, attack: 'jab' },
  { held: 'keyboard', attack: 'sweep' },
  { held: null, attack: 'push' },
  { held: 'monitor', attack: 'bash' },
  { held: 'mug', attack: 'splash' },
];

export const startGallery = (canvas: HTMLCanvasElement, id: CharacterId) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.5, 6);
  camera.lookAt(0, 0.95, 0);

  scene.add(new THREE.HemisphereLight(0xe6ecff, 0x8a7a66, 1.4));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
  key.position.set(-3, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff9a5a, 1.2);
  rim.position.set(3, 3, -4);
  scene.add(rim);

  const plinth = mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.2, 10), mat(PALETTE.cream));
  plinth.position.y = -0.1;
  scene.add(plinth);

  const turntable = new THREE.Group();
  scene.add(turntable);
  const rig = buildRig(id);
  turntable.add(rig.root);

  const items: Partial<Record<ItemKind, ReturnType<typeof buildItem>>> = {};
  for (const kind of ['keyboard', 'monitor', 'mug'] as ItemKind[]) {
    const v = buildItem(kind);
    v.root.visible = false;
    scene.add(v.root);
    items[kind] = v;
  }

  let raf = 0;
  let last = performance.now();
  let time = Math.random() * 3;
  let hovered = false;
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    turntable.rotation.y += dt * (hovered ? 0.2 : 0.6);
    const slot = Math.floor(time / 1.6) % DEMO.length;
    const demo = DEMO[slot];
    const t = time % 1.6;
    const duration = demo.attack ? ATTACKS[demo.attack].duration : 1;
    const attack = demo.attack && t > 0.7 && t < 0.7 + duration ? { kind: demo.attack, t: t - 0.7, duration } : null;

    poseRig(rig, {
      dt,
      time,
      vx: 0,
      vy: 0,
      onGround: true,
      facing: 1,
      sideways: false,
      wall: 0,
      dashing: false,
      stunned: false,
      guarding: false,
      held: demo.held,
      attack,
    });
    turntable.updateMatrixWorld(true);

    for (const [kind, v] of Object.entries(items) as [ItemKind, ReturnType<typeof buildItem>][]) {
      v.root.visible = demo.held === kind;
      if (!v.root.visible) continue;
      rig.hand.getWorldPosition(tmpV);
      rig.hand.getWorldQuaternion(tmpQ);
      v.root.position.copy(tmpV);
      v.root.quaternion.copy(tmpQ);
      poseHeld(v, kind);
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    setHovered: (v: boolean) => {
      hovered = v;
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      renderer.dispose();
    },
  };
};
