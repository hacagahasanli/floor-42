import * as THREE from 'three';

import { buildRig, poseSide } from './characters';
import { buildGun } from './guns';

import type { CharacterId } from '../sim/types';

/**
 * Portraits of the fighters for the home page: each one standing ready with a pistol, lit in
 * their own colour from behind, rendered once offscreen to an image.
 */
export const renderPortraits = (accents: Record<CharacterId, string>): Record<CharacterId, string> => {
  const W = 360;
  const H = 440;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
  camera.position.set(1.4, 1.55, 3.8);
  camera.lookAt(0, 1.05, 0);
  const out = {} as Record<CharacterId, string>;
  for (const id of Object.keys(accents) as CharacterId[]) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x30384a, 1.6));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.4);
    key.position.set(2, 4, 3);
    const rim = new THREE.DirectionalLight(new THREE.Color(accents[id]), 2.4);
    rim.position.set(-3, 2, -2);
    scene.add(key, rim);
    const rig = buildRig(id);
    scene.add(rig.root);
    for (let i = 0; i < 90; i++) {
      poseSide(rig, {
        dt: 1 / 60, time: i / 60, vx: 0, vy: 0, onGround: true, facing: 1, aim: 0.05, wall: 0, dashing: false,
        stunned: false, gun: 'pistol', sinceShot: 9, reload: null, pushing: 0,
      });
    }
    rig.root.rotation.y = 0.55;
    rig.root.updateMatrixWorld(true);
    const gun = buildGun('pistol').root;
    rig.hand.getWorldPosition(gun.position);
    rig.hand.getWorldQuaternion(gun.quaternion);
    scene.add(gun);
    renderer.render(scene, camera);
    out[id] = renderer.domElement.toDataURL('image/png');
  }
  renderer.dispose();
  return out;
};
