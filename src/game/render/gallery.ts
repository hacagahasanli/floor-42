import * as THREE from 'three';

import { buildRig, poseSide } from './characters';
import { buildGun } from './guns';
import { mat, mesh, PALETTE } from './palette';

import type { GunView } from './guns';
import type { CharacterId, GunKind } from '../sim/types';

/** A turntable for one character, cycling through the guns and aiming around. */
const DEMO: GunKind[] = ['pistol', 'smg', 'shotgun', 'railgun', 'launcher'];

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

  const guns = Object.fromEntries(
    DEMO.map((k) => {
      const v = buildGun(k);
      v.root.visible = false;
      scene.add(v.root);
      return [k, v];
    }),
  ) as Record<GunKind, GunView>;

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
    const kind = DEMO[Math.floor(time / 2) % DEMO.length];
    const sinceShot = (time % 0.6) * 2;

    poseSide(rig, {
      dt, time, vx: 0, vy: 0, onGround: true, facing: 1, aim: 0, wall: 0, dashing: false, stunned: false,
      gun: kind, sinceShot, reload: null, pushing: 0,
    });
    // On the turntable the model faces the viewer; the turntable does the turning.
    rig.root.rotation.y = 0;
    turntable.updateMatrixWorld(true);

    for (const k of DEMO) guns[k].root.visible = k === kind;
    rig.hand.getWorldPosition(tmpV);
    rig.hand.getWorldQuaternion(tmpQ);
    guns[kind].root.position.copy(tmpV);
    guns[kind].root.quaternion.copy(tmpQ);

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
