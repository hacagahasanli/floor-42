import * as THREE from 'three';

import { createKeyboard } from '../input';
import { createBot } from '../sim/bot';
import { ARENA, ATTACKS, CHARACTERS, DT, ITEMS, PUSH_COOLDOWN } from '../sim/constants';
import { createGame, step } from '../sim/step';

import { buildArena } from './arena';
import { buildRig, poseRig } from './characters';
import { buildItem, poseHeld, poseResting } from './items';
import { createVfx } from './vfx';

import type { Rig } from './characters';
import type { ItemView } from './items';
import type { CharacterId, GameEvent, GameState, Phase } from '../sim/types';

export interface HudFighter {
  name: string;
  character: CharacterId;
  hp: number;
  kos: number;
  push: number; // 0..1 ready
  held: string | null;
  out: boolean;
}

export interface HudState {
  phase: Phase;
  time: number;
  winner: number | null;
  fighters: HudFighter[];
  fps: number;
  lastKo: { fighter: number; at: number } | null;
}

export interface ArenaOptions {
  player: CharacterId;
  opponent: CharacterId;
  onHud: (hud: HudState) => void;
  /** Both sides are bots: attract mode, and handy for recording. */
  demo?: boolean;
}

export const startArena = (canvas: HTMLCanvasElement, opts: ArenaOptions) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  camera.position.set(0, 4.6, 16);

  let state: GameState = createGame([opts.player, opts.opponent]);
  let bot = createBot(1, (Math.random() * 1e9) | 0);
  let demoBot = createBot(0, (Math.random() * 1e9) | 0);
  const keyboard = createKeyboard(window);

  const arena = buildArena(scene, state.items.length);
  const vfx = createVfx(scene);

  const rigs: Rig[] = state.fighters.map((f) => {
    const rig = buildRig(f.character);
    scene.add(rig.root);
    return rig;
  });
  const itemViews: ItemView[] = state.items.map((item) => {
    const v = buildItem(item.kind);
    scene.add(v.root);
    return v;
  });

  // Positions from the previous tick, for render interpolation between fixed ticks.
  const prevF = state.fighters.map((f) => ({ x: f.x, y: f.y }));
  const prevI = state.items.map((i) => ({ x: i.x, y: i.y, rot: i.rot }));
  const savePrev = () => {
    state.fighters.forEach((f, i) => Object.assign(prevF[i], { x: f.x, y: f.y }));
    state.items.forEach((it, i) => Object.assign(prevI[i], { x: it.x, y: it.y, rot: it.rot }));
  };

  let shake = 0;
  let flash = 0;
  let lastKo: HudState['lastKo'] = null;
  let time = 0;

  const handleEvent = (e: GameEvent) => {
    switch (e.type) {
      case 'hit':
        if (e.guarded) {
          vfx.burst(e.x, e.y, 10, 'guard', { speed: 5, life: 0.3 });
        } else {
          vfx.burst(e.x, e.y, 8 + Math.round(e.power), 'spark', { speed: 4 + e.power * 0.4, life: 0.4 });
          vfx.burst(e.x, e.y, 4, 'hot', { speed: 3, life: 0.35 });
        }
        vfx.ring(e.x, e.y, e.guarded ? 0x7ea6e0 : 0xfff1a8, { grow: 4 + e.power * 0.2, life: 0.22 });
        shake = Math.max(shake, Math.min(0.5, e.power * 0.025));
        break;
      case 'splash':
        vfx.burst(e.x, e.y, 26, 'coffee', { speed: 5, up: 4, life: 0.7 });
        break;
      case 'shatter':
        vfx.burst(e.x, e.y, 14, 'glass', { speed: 5, life: 0.6 });
        break;
      case 'push':
        vfx.ring(e.x + e.facing * 0.6, e.y, 0xf0c24a, { grow: 7, life: 0.35, facing: e.facing });
        vfx.burst(e.x + e.facing * 0.8, e.y, 10, 'dust', { speed: 4, dirX: e.facing, up: 0.5, gravity: 2, life: 0.35 });
        break;
      case 'wallSplat': {
        const x = e.side < 0 ? ARENA.left : ARENA.right;
        arena.crack(e.side, e.y);
        vfx.burst(x - e.side * 0.2, e.y, 30, 'glass', { speed: 7, dirX: -e.side, life: 0.8, size: 1.3 });
        shake = 0.7;
        flash = 0.12;
        break;
      }
      case 'ko':
        vfx.burst(e.x, e.y, 40, 'ko', { speed: 9, up: 4, life: 0.9, size: 1.4 });
        vfx.ring(e.x, e.y, 0xf0c24a, { grow: 14, life: 0.5 });
        shake = 0.8;
        flash = 0.18;
        lastKo = { fighter: e.fighter, at: time };
        break;
      case 'jump':
        vfx.burst(e.x, e.y + 0.05, e.wallKick ? 10 : 5, e.wallKick ? 'glass' : 'dust', {
          speed: 2.5,
          up: 1,
          gravity: 4,
          life: 0.35,
        });
        break;
      case 'dash':
        vfx.burst(e.x, e.y + 0.2, 6, 'dust', { speed: 2, up: 0.6, gravity: 2, life: 0.3 });
        break;
      case 'throw': {
        const holderRig = rigs[state.items[e.item].thrownBy ?? 0];
        holderRig.throwT = 0.25;
        break;
      }
      case 'pickup':
        break;
    }
  };

  // Camera follows the midpoint and pulls back as fighters separate.
  const camTarget = new THREE.Vector3(0, 3.4, 0);
  const updateCamera = (dt: number) => {
    const alive = state.fighters.filter((f) => f.respawn <= 0);
    const xs = alive.length ? alive.map((f) => f.x) : [0];
    const ys = alive.length ? alive.map((f) => f.y) : [0];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const midX = Math.max(-3.5, Math.min(3.5, (minX + maxX) / 2));
    const midY = Math.max(...ys) * 0.2 + 3.1;
    const spread = maxX - minX;
    const dist = Math.max(15.5, Math.min(19, 13.5 + spread * 0.3));
    const k = 1 - Math.exp(-4 * dt);
    camTarget.x += (midX - camTarget.x) * k;
    camTarget.y += (midY - camTarget.y) * k;
    camera.position.x += (midX * 0.5 - camera.position.x) * k;
    camera.position.y += (midY + 1.2 - camera.position.y) * k;
    camera.position.z += (dist - camera.position.z) * k;
    const s = shake * shake;
    camera.lookAt(camTarget.x + (Math.random() - 0.5) * s, camTarget.y + (Math.random() - 0.5) * s, 0);
    shake = Math.max(0, shake - dt * 2.5);
  };

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  };

  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const renderFrame = (dt: number, alpha: number) => {
    resize();
    state.fighters.forEach((f, i) => {
      const rig = rigs[i];
      const out = f.respawn > 0;
      rig.root.visible = !out && !(f.invulnerable > 0 && Math.floor(time * 16) % 2 === 0);
      rig.root.position.set(prevF[i].x + (f.x - prevF[i].x) * alpha, prevF[i].y + (f.y - prevF[i].y) * alpha, 0);
      const held = f.held !== null ? state.items[f.held].kind : null;
      poseRig(rig, {
        dt,
        time,
        vx: f.vx,
        vy: f.vy,
        onGround: f.onGround,
        facing: f.facing,
        sideways: true,
        wall: f.wall,
        dashing: f.dashTime > 0,
        stunned: f.stun > 0,
        guarding: f.guarding,
        held,
        attack: f.attack ? { kind: f.attack.kind, t: f.attack.t, duration: ATTACKS[f.attack.kind].duration } : null,
      });
      rig.root.updateMatrixWorld(true);
    });

    state.items.forEach((item, i) => {
      const v = itemViews[i];
      const marker = arena.markers[i];
      v.root.visible = item.active;
      const resting = item.active && item.holder === null && item.thrownBy === null && Math.abs(item.vy) < 0.01;
      marker.visible = resting;
      if (!item.active) return;
      if (item.holder !== null) {
        const rig = rigs[item.holder];
        rig.hand.getWorldPosition(tmpV);
        rig.hand.getWorldQuaternion(tmpQ);
        v.root.position.copy(tmpV);
        v.root.quaternion.copy(tmpQ);
        v.root.visible = rig.root.visible;
        poseHeld(v, item.kind);
        return;
      }
      poseResting(v);
      const x = prevI[i].x + (item.x - prevI[i].x) * alpha;
      const y = prevI[i].y + (item.y - prevI[i].y) * alpha;
      v.root.position.set(x, y + v.halfHeight, item.kind === 'monitor' ? -0.1 : 0.35);
      v.root.rotation.set(0, item.kind === 'keyboard' ? 0.25 : 0, prevI[i].rot + (item.rot - prevI[i].rot) * alpha);
      marker.position.set(x, y + 0.012, 0.3);
    });

    arena.update(dt, time);
    vfx.update(dt);
    updateCamera(dt);
    renderer.toneMappingExposure = 1.05 + flash * 3;
    flash = Math.max(0, flash - dt);
    renderer.render(scene, camera);
  };

  // HUD snapshot, throttled: React does not need 60 updates a second.
  let fps = 60;
  let hudTimer = 0;
  const emitHud = () => {
    opts.onHud({
      phase: state.phase,
      time: state.phaseTime,
      winner: state.winner,
      fps: Math.round(fps),
      lastKo,
      fighters: state.fighters.map((f) => ({
        name: CHARACTERS[f.character].name,
        character: f.character,
        hp: Math.max(0, f.hp),
        kos: f.kos,
        push: 1 - f.pushCooldown / PUSH_COOLDOWN,
        held: f.held !== null ? ITEMS[state.items[f.held].kind].name : null,
        out: f.respawn > 0,
      })),
    });
  };

  let raf = 0;
  let last = performance.now();
  let acc = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    if (dt > 0) fps += (1 / dt - fps) * 0.05;
    acc += dt;
    while (acc >= DT) {
      savePrev();
      step(state, [opts.demo ? demoBot(state) : keyboard.read(), bot(state)]);
      state.events.forEach(handleEvent);
      acc -= DT;
    }
    renderFrame(dt, acc / DT);
    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.1;
      emitHud();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const restart = () => {
    state = createGame([opts.player, opts.opponent]);
    bot = createBot(1, (Math.random() * 1e9) | 0);
    demoBot = createBot(0, (Math.random() * 1e9) | 0);
    savePrev();
    lastKo = null;
    emitHud();
  };

  return {
    restart,
    dispose: () => {
      cancelAnimationFrame(raf);
      keyboard.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.Material & { map?: THREE.Texture | null };
          m.map?.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
    },
  };
};
