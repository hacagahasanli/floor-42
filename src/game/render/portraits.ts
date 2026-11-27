import * as THREE from 'three';

import { buildRig, disposeRig, lifeRig, poseShow, poseSide } from './characters';
import { buildGun } from './guns';

import type { CharacterId } from '../sim/types';
import type { ShowPose } from './rosterRigs';

/** What a portrait shows: `ready` is the home-page pose (pistol up); the others are the roster sheets' poses with their props. */
export type PortraitPose = 'ready' | ShowPose;

/**
 * Portraits of the fighters for the home page: each one standing ready with a pistol, lit in
 * their own colour from behind, rendered once offscreen to an image.
 * `opts.pose` picks one of the sheet poses instead (idle, victory, defeat with its story prop, taunt): those are framed
 * to the whole figure and its props, not to the head, so the head anchor in roster.ts only describes `ready`.
 */
export const renderPortraits = (
  accents: Record<CharacterId, string>,
  /** `scale` renders bigger (the VS doors use 2), `only` renders just those fighters. */
  opts: { scale?: number; only?: CharacterId[]; pose?: PortraitPose } = {},
): Record<CharacterId, string> => {
  const W = 360 * (opts.scale ?? 1);
  const H = 440 * (opts.scale ?? 1);
  const pose = opts.pose ?? 'ready';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
  camera.position.set(1.4, 1.55, 3.8);
  camera.lookAt(0, 1.05, 0);
  const out = {} as Record<CharacterId, string>;
  for (const id of (opts.only ?? (Object.keys(accents) as CharacterId[]))) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x30384a, 1.6));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.4);
    key.position.set(2, 4, 3);
    const rim = new THREE.DirectionalLight(new THREE.Color(accents[id]), 2.4);
    rim.position.set(-3, 2, -2);
    scene.add(key, rim);
    const rig = buildRig(id);
    scene.add(rig.root);
    if (pose === 'ready') {
      for (let i = 0; i < 90; i++) {
        const t = i / 60;
        poseSide(rig, {
          dt: 1 / 60, time: t, vx: 0, vy: 0, onGround: true, facing: 1, aim: 0.05, wall: 0, dashing: false,
          stunned: false, gun: 'pistol', sinceShot: 9, reload: null, pushing: 0,
        });
        lifeRig(rig, { dt: 1 / 60, rawDt: 1 / 60, time: t, vx: 0, vy: 0, onGround: true, facing: 1 });
      }
      rig.root.rotation.y = 0.55;
      rig.root.updateMatrixWorld(true);
      const gun = buildGun('pistol').root;
      rig.hand.getWorldPosition(gun.position);
      rig.hand.getWorldQuaternion(gun.quaternion);
      scene.add(gun);
    } else {
      poseShow(rig, pose, 0.4);
      rig.root.rotation.y = pose === 'defeat' ? 0.95 : 0.55;
      rig.root.updateMatrixWorld(true);
      // Frame the whole figure and its props.
      const box = new THREE.Box3().setFromObject(rig.root);
      const size = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      const t = Math.tan((camera.fov * Math.PI) / 360);
      const dist = Math.max(size.y / 2 / t, size.x / 2 / (t * camera.aspect), size.z / 2 / (t * camera.aspect)) * 1.18 + Math.max(size.x, size.z) / 2;
      camera.position.set(c.x + dist * 0.33, c.y + dist * 0.14, c.z + dist * 0.94);
      camera.lookAt(c);
    }
    renderer.render(scene, camera);
    out[id] = renderer.domElement.toDataURL('image/png');
    disposeRig(rig);
  }
  renderer.dispose();
  return out;
};
