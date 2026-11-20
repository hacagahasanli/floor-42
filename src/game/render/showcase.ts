import * as THREE from 'three';

import { getSettings } from '../settings';
import { ARENA, GUNS } from '../sim/constants';

import { buildArena } from './arena';
import { buildRig, poseSide } from './characters';
import { buildGun } from './guns';
import { deviceFacts, renderProfile } from './quality';

import type { Settings } from '../settings';
import type { CharacterId, GunKind } from '../sim/types';
import type { GunView } from './guns';
import type { Rig } from './characters';

/**
 * The main menu's backdrop: the real office on floor 42 at dusk, with the fighter you picked standing on the
 * floor, idling, glancing around and now and then checking a gun. A slow cinematic camera drifts around them.
 * Changing fighter drops the new one in from above with a squash on landing.
 *
 * Cheap on the low tier: pixel ratio 1 or less, no shadows, 30 fps; with reduced motion the camera holds still.
 * Set `still` to render a handful of frames and stop (the lowest-cost fallback).
 */

/** Where the fighter stands: right of centre, so the menu column on the left never covers them. */
const SPOT = { x: 3.2, y: ARENA.floor };
const SHOW_GUNS: GunKind[] = ['pistol', 'smg', 'shotgun', 'railgun'];

export const startShowcase = (canvas: HTMLCanvasElement, first: CharacterId, opts: { still?: boolean; onReady?: () => void } = {}) => {
  const store = getSettings();
  let settings: Settings = store.get();
  let profile = renderProfile(settings, deviceFacts());

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: profile.tier !== 'low', powerPreference: 'high-performance' });
  renderer.setPixelRatio(profile.pixelRatio);
  renderer.shadowMap.enabled = profile.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
  const arena = buildArena(scene, 0);
  // Behind the menu the left of the room sits under the menu column: no whiteboard text bleeding through it.
  for (const o of arena.whiteboard) o.visible = false;

  // A warm key from the front and a coloured rim in the fighter's accent, so they pop off the room.
  const spot = new THREE.SpotLight(0xfff1dc, 60, 30, 0.5, 0.6, 1.4);
  spot.position.set(SPOT.x - 3, 9, 8);
  spot.target.position.set(SPOT.x, 1, 0);
  scene.add(spot, spot.target);
  const rim = new THREE.PointLight(0xffffff, 18, 9, 1.6);
  rim.position.set(SPOT.x + 1.6, 2.8, -1.8);
  scene.add(rim);
  // A glowing disc on the carpet under the fighter.
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(SPOT.x, SPOT.y + 0.02, 0);
  scene.add(glow);

  const guns = Object.fromEntries(
    SHOW_GUNS.map((k) => {
      const v = buildGun(k);
      v.root.visible = false;
      scene.add(v.root);
      return [k, v];
    }),
  ) as Record<GunKind, GunView>;

  let rig: Rig | null = null;
  let character = first;
  let drop = 0; // height above the floor while dropping in
  let dropV = 0;
  const squash = { s: 0, v: 0 };
  const accentOf: Record<CharacterId, number> = { hotfix: 0xff6a3d, legacy: 0x3ddc84, standup: 0x3ec5ff, intern: 0xffd23f };

  const place = (id: CharacterId, animate: boolean) => {
    if (rig) {
      scene.remove(rig.root);
      rig.root.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
    }
    rig = buildRig(id);
    rig.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    scene.add(rig.root);
    character = id;
    rim.color.setHex(accentOf[id]);
    (glow.material as THREE.MeshBasicMaterial).color.setHex(accentOf[id]);
    drop = animate && !settings.reducedMotion ? 3.2 : 0;
    dropV = 0;
  };
  place(first, false);

  let time = 0;
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let framesLeft = opts.still ? 8 : Infinity;
  let readySent = false;
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const look = new THREE.Vector3();

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const pr = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  };

  const render = (dt: number) => {
    time += dt;
    resize();
    arena.update(dt, time);
    if (!rig) return;

    // Drop in, land with a squash.
    if (drop > 0) {
      dropV -= 30 * dt;
      drop = Math.max(0, drop + dropV * dt);
      if (drop === 0) squash.v = -6;
    }
    const K = 260;
    squash.v += (-K * squash.s - 2 * Math.sqrt(K) * 0.55 * squash.v) * dt;
    squash.s += squash.v * dt;

    // Idle: face the camera three-quarters, glance left and right, and every few seconds check a gun with a dry-fire.
    const cycle = time % 6;
    const gun = SHOW_GUNS[Math.floor(time / 6) % SHOW_GUNS.length];
    const aim = cycle > 3.4 && cycle < 5 ? 0.35 + Math.sin(time * 1.3) * 0.1 : -0.55 + Math.sin(time * 0.7) * 0.08;
    const facing: 1 | -1 = -1;
    poseSide(rig, {
      dt,
      time,
      vx: 0,
      vy: drop > 0 ? dropV : 0,
      onGround: drop === 0,
      facing,
      aim: Math.PI - aim,
      wall: 0,
      dashing: false,
      stunned: false,
      gun,
      sinceShot: cycle > 4.2 && cycle < 4.25 ? 0 : 1,
      reload: cycle > 0.4 && cycle < 1.4 ? (cycle - 0.4) / GUNS[gun].reloadTime : null,
      pushing: 0,
    });
    // Turn a little more toward the camera than in a fight.
    rig.root.rotation.y = rig.turn * 0.55 + Math.sin(time * 0.4) * 0.12;
    rig.root.position.set(SPOT.x, SPOT.y + drop, 0);
    const sy = 1 + squash.s * 0.18;
    rig.root.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    rig.root.updateMatrixWorld(true);
    for (const k of SHOW_GUNS) guns[k].root.visible = k === gun;
    rig.hand.getWorldPosition(tmpV);
    rig.hand.getWorldQuaternion(tmpQ);
    guns[gun].root.position.copy(tmpV);
    guns[gun].root.quaternion.copy(tmpQ);
    (glow.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(time * 2) * 0.05;

    // Cinematic camera: a slow arc in front of the fighter, a gentle rise and fall, always framing them right of centre.
    const still = settings.reducedMotion;
    const t = still ? 0 : time;
    // A phone held upright frames the fighter high and centred, above the menu sheet at the bottom.
    const portrait = canvas.clientWidth < canvas.clientHeight;
    const ang = Math.sin(t * 0.09) * (portrait ? 0.25 : 0.42) - 0.12;
    const dist = portrait ? 9.5 + Math.sin(t * 0.13) * 0.5 : 8.6 + Math.sin(t * 0.13) * 0.8;
    camera.position.set(SPOT.x - (portrait ? 0 : 1.8) + Math.sin(ang) * dist, (portrait ? 2.6 : 2.3) + Math.sin(t * 0.17) * 0.35, Math.cos(ang) * dist);
    look.set(SPOT.x - (portrait ? 0 : 2.4), portrait ? 0.4 : 1.6, 0);
    camera.lookAt(look);

    renderer.render(scene, camera);
    if (!readySent) {
      readySent = true;
      opts.onReady?.();
    }
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    const step = 1 / profile.menuFps;
    if (acc >= step - 0.002) {
      render(Math.min(0.1, acc));
      acc = 0;
      framesLeft -= 1;
    }
    if (framesLeft > 0) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const off = store.subscribe((s) => {
    settings = s;
    profile = renderProfile(s, deviceFacts());
    if (renderer.getPixelRatio() !== profile.pixelRatio) renderer.setPixelRatio(profile.pixelRatio);
    if (renderer.shadowMap.enabled !== profile.shadows) {
      renderer.shadowMap.enabled = profile.shadows;
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
      });
    }
  });

  // Hidden tab: stop drawing.
  const onVis = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && framesLeft > 0) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener('visibilitychange', onVis);

  return {
    setCharacter: (id: CharacterId) => {
      if (id === character) return;
      place(id, true);
      if (opts.still) {
        framesLeft = 40;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
      }
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      off();
      document.removeEventListener('visibilitychange', onVis);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.Material & { map?: THREE.Texture | null };
          m.map?.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
};
