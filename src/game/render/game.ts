import * as THREE from 'three';

import { createControls } from '../input';
import type { AimMode } from '../input';
import { createSfx } from '../sfx';
import { createBot } from '../sim/bot';
import { ARENA, CHARACTERS, DT, GUNS, PUSH } from '../sim/constants';
import { createGame, muzzle, pickupCandidate, step } from '../sim/step';

import { buildArena } from './arena';
import { buildRig, poseRig } from './characters';
import { buildGun } from './guns';
import { createVfx } from './vfx';

import type { Rig } from './characters';
import type { GunView } from './guns';
import type { BotLevel } from '../sim/bot';
import type { CharacterId, EndReason, GameEvent, GameState, GunKind, Phase } from '../sim/types';

export interface HudFighter {
  name: string;
  character: CharacterId;
  hp: number;
  maxHp: number;
  kos: number;
  push: number; // 0..1 ready
  gun: string;
  mag: number;
  reserve: number; // Infinity for the pistol
  reloading: number; // 0..1 progress, 0 when not reloading
  out: boolean;
}

export interface HudState {
  phase: Phase;
  time: number;
  winner: number | null;
  fighters: HudFighter[];
  fps: number;
  lastKo: { fighter: number; at: number } | null;
  hint: { key: string; text: string }[];
  muted: boolean;
  aimMode: AimMode;
  endReason: EndReason | null;
}

export interface ArenaOptions {
  player: CharacterId;
  opponent: CharacterId;
  onHud: (hud: HudState) => void;
  /** Both sides are bots: attract mode, and handy for recording. */
  demo?: boolean;
  level?: BotLevel;
  aimMode?: AimMode;
}

const randomSeed = () => (Math.random() * 1e9) | 0;
const TWO_HANDED: Record<GunKind, boolean> = { pistol: false, smg: true, shotgun: true, railgun: true, launcher: true };

export const startArena = (canvas: HTMLCanvasElement, opts: ArenaOptions) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
  camera.position.set(0, ARENA.ceiling / 2, 40);

  const level = opts.level ?? 'normal';
  let state: GameState = createGame([opts.player, opts.opponent], randomSeed());
  let bot = createBot(1, randomSeed(), level);
  let demoBot = createBot(0, randomSeed(), level);
  const controls = createControls(canvas);
  let aimMode: AimMode = opts.aimMode ?? 'auto';
  const sfx = createSfx();
  let muted = false;

  const arena = buildArena(scene, state.pickups.length);
  const vfx = createVfx(scene);

  const rigs: Rig[] = state.fighters.map((f) => {
    const rig = buildRig(f.character);
    scene.add(rig.root);
    return rig;
  });

  // Gun in each fighter's hands, rebuilt when the weapon changes.
  const heldGuns: (GunView | null)[] = state.fighters.map(() => null);
  const gunFor = (i: number, kind: GunKind): GunView => {
    const cur = heldGuns[i];
    if (cur?.kind === kind) return cur;
    if (cur) scene.remove(cur.root);
    const v = buildGun(kind);
    scene.add(v.root);
    heldGuns[i] = v;
    return v;
  };

  // Guns lying around, rebuilt when a drop slot changes kind.
  const pickupViews: (GunView | null)[] = state.pickups.map(() => null);
  const pickupFor = (i: number, kind: GunKind): GunView => {
    const cur = pickupViews[i];
    if (cur?.kind === kind) return cur;
    if (cur) scene.remove(cur.root);
    const v = buildGun(kind);
    v.root.scale.setScalar(1.5);
    scene.add(v.root);
    pickupViews[i] = v;
    return v;
  };

  // Projectiles: pooled tracers and grenades.
  const tracerGeo = new THREE.BoxGeometry(1, 0.06, 0.06);
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  const pelletMat = new THREE.MeshBasicMaterial({ color: 0xffb070 });
  const tracers = Array.from({ length: 80 }, () => {
    const m = new THREE.Mesh(tracerGeo, tracerMat);
    m.visible = false;
    scene.add(m);
    return m;
  });
  const grenades = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ color: 0x2f8f5b, flatShading: true }));
    m.visible = false;
    scene.add(m);
    return m;
  });
  // Railgun beams fade out after the shot.
  const beams = Array.from({ length: 4 }, () => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1, 6),
      new THREE.MeshBasicMaterial({ color: 0x8cc4ff, transparent: true, opacity: 0, depthWrite: false }),
    );
    m.visible = false;
    scene.add(m);
    return { mesh: m, life: 0 };
  });
  let nextBeam = 0;
  // Muzzle flashes.
  const flashes = state.fighters.map(() => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), new THREE.MeshBasicMaterial({ color: 0xfff1a8 }));
    m.visible = false;
    scene.add(m);
    return m;
  });
  // Your aim line.
  const aimLine = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.025, 0.025),
    new THREE.MeshBasicMaterial({ color: 0xff6464, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  scene.add(aimLine);

  const prevF = state.fighters.map((f) => ({ x: f.x, y: f.y }));
  const savePrev = () => state.fighters.forEach((f, i) => Object.assign(prevF[i], { x: f.x, y: f.y }));

  let shake = 0;
  let flash = 0;
  let lastKo: HudState['lastKo'] = null;
  let time = 0;
  let started = false;

  const fireBeam = (x: number, y: number, angle: number) => {
    // Out to the room's edge.
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const tx = dx > 0 ? (ARENA.right - x) / dx : dx < 0 ? (ARENA.left - x) / dx : Infinity;
    const ty = dy > 0 ? (ARENA.ceiling - y) / dy : dy < 0 ? (ARENA.floor - y) / dy : Infinity;
    const len = Math.min(tx, ty);
    const b = beams[nextBeam++ % beams.length];
    b.life = 0.3;
    b.mesh.visible = true;
    b.mesh.scale.set(1, len, 1);
    b.mesh.position.set(x + (dx * len) / 2, y + (dy * len) / 2, 0.1);
    b.mesh.rotation.set(0, 0, angle - Math.PI / 2);
    vfx.burst(x + dx * len, y + dy * len, 14, 'guard', { speed: 5, life: 0.4 });
  };

  const handleEvent = (e: GameEvent) => {
    switch (e.type) {
      case 'shot':
        sfx.shot(e.gun);
        if (e.gun === 'railgun') {
          fireBeam(e.x, e.y, e.angle);
          shake = Math.max(shake, 0.25);
        }
        if (e.gun === 'shotgun') shake = Math.max(shake, 0.15);
        break;
      case 'hit':
        vfx.burst(e.x, e.y, 4 + Math.round(e.damage / 3), 'spark', { speed: 3 + e.power * 0.3, life: 0.3 });
        if (e.damage > 15) vfx.ring(e.x, e.y, 0xfff1a8, { grow: 5, life: 0.22 });
        shake = Math.max(shake, Math.min(0.4, e.power * 0.02));
        sfx.hit(e.power);
        break;
      case 'impact':
        vfx.burst(e.x, e.y, 3, 'dust', { speed: 2, up: 1, gravity: 6, life: 0.25, size: 0.7 });
        sfx.impact();
        break;
      case 'explosion':
        vfx.burst(e.x, e.y, 40, 'hot', { speed: 9, up: 2, life: 0.6, size: 1.6 });
        vfx.burst(e.x, e.y, 24, 'spark', { speed: 6, up: 2, life: 0.5, size: 1.4 });
        vfx.burst(e.x, e.y, 18, 'dust', { speed: 4, up: 1, gravity: -1, life: 1, size: 2.4 });
        vfx.ring(e.x, e.y, 0xffb347, { grow: e.radius * 4, life: 0.35 });
        shake = Math.max(shake, 0.7);
        flash = Math.max(flash, 0.12);
        sfx.explosion();
        break;
      case 'push':
        vfx.ring(e.x + e.facing * 0.6, e.y, 0xf0c24a, { grow: 7, life: 0.35, facing: e.facing });
        vfx.burst(e.x + e.facing * 0.8, e.y, 10, 'dust', { speed: 4, dirX: e.facing, up: 0.5, gravity: 2, life: 0.35 });
        sfx.push();
        break;
      case 'deflect':
        vfx.burst(e.x, e.y, 8, 'guard', { speed: 4, life: 0.3 });
        sfx.deflect();
        break;
      case 'wallSplat': {
        const x = e.side < 0 ? ARENA.left : ARENA.right;
        arena.crack(e.side, e.y);
        vfx.burst(x - e.side * 0.2, e.y, 30, 'glass', { speed: 7, dirX: -e.side, life: 0.8, size: 1.3 });
        shake = 0.7;
        flash = 0.12;
        sfx.glass();
        break;
      }
      case 'ko':
        vfx.burst(e.x, e.y, 40, 'ko', { speed: 9, up: 4, life: 0.9, size: 1.4 });
        vfx.ring(e.x, e.y, 0xf0c24a, { grow: 14, life: 0.5 });
        shake = 0.8;
        flash = 0.18;
        lastKo = { fighter: e.fighter, at: time };
        sfx.ko();
        break;
      case 'jump':
        vfx.burst(e.x, e.y + 0.05, e.wallKick ? 10 : 5, e.wallKick ? 'glass' : 'dust', { speed: 2.5, up: 1, gravity: 4, life: 0.35 });
        sfx.jump();
        break;
      case 'dash':
        vfx.burst(e.x, e.y + 0.4, 8, 'dust', { speed: 2, up: 0.6, gravity: 2, life: 0.3 });
        sfx.dash();
        break;
      case 'pickup':
        sfx.pickup();
        break;
      case 'reload':
        if (e.fighter === 0) sfx.reload();
        break;
      case 'empty':
        sfx.empty();
        break;
      case 'drop':
        vfx.burst(e.x, ARENA.ceiling - 0.3, 12, 'dust', { speed: 2, up: -1, gravity: 3, life: 0.6, size: 1.5 });
        sfx.drop();
        break;
      case 'rail':
        break;
    }
  };

  // Camera: fixed, far back, the whole office in view.
  const updateCamera = (dt: number) => {
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max((ARENA.right + 1.5) / (tanHalf * camera.aspect), (ARENA.ceiling / 2 + 2) / tanHalf);
    const k = 1 - Math.exp(-3 * dt);
    camera.position.x += (0 - camera.position.x) * k;
    camera.position.y += (ARENA.ceiling / 2 + 0.6 - camera.position.y) * k;
    camera.position.z += (dist - camera.position.z) * k;
    const s = shake * shake;
    camera.lookAt((Math.random() - 0.5) * s, ARENA.ceiling / 2 + (Math.random() - 0.5) * s, 0);
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

  // Mouse aim: project the pointer onto the fight plane (z = 0).
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const ndc = new THREE.Vector2();
  const aimPoint = new THREE.Vector3();
  const mouseAim = () => {
    ndc.set(controls.mouse.x, controls.mouse.y);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(plane, aimPoint)) return autoAim(0);
    return { x: aimPoint.x, y: aimPoint.y };
  };

  // Auto-aim: your gun follows the opponent's chest. You only move and shoot.
  const autoAim = (id: number) => {
    const me = state.fighters[id];
    const foe = state.fighters.find((f) => f.id !== id)!;
    if (foe.respawn > 0) return { x: me.x + me.facing * 5, y: me.y + 1.1 };
    return { x: foe.x, y: foe.y + CHARACTERS[foe.character].height * 0.55 };
  };

  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const fwd = new THREE.Vector3();
  const renderFrame = (dt: number, alpha: number) => {
    resize();
    const poseDt = state.hitstop > 0 ? 0 : dt;
    state.fighters.forEach((f, i) => {
      const rig = rigs[i];
      const out = f.respawn > 0;
      rig.root.visible = !out && !(f.invulnerable > 0 && Math.floor(time * 16) % 2 === 0);
      const shudder = state.hitstop > 0 && f.stun > 0 ? (Math.random() - 0.5) * 0.14 : 0;
      rig.root.position.set(prevF[i].x + (f.x - prevF[i].x) * alpha + shudder, prevF[i].y + (f.y - prevF[i].y) * alpha, 0);
      const g = GUNS[f.weapon.kind];
      poseRig(rig, {
        dt: poseDt,
        time,
        vx: f.vx,
        vy: f.vy,
        onGround: f.onGround,
        facing: f.facing,
        aim: f.aim,
        sideways: true,
        wall: f.wall,
        dashing: f.dashTime > 0,
        stunned: f.stun > 0,
        twoHanded: TWO_HANDED[f.weapon.kind],
        sinceShot: f.firing,
        recoil: Math.min(1, 0.3 + g.recoil * 0.1),
        reloading: f.weapon.reload > 0,
        pushing: f.pushTime > 0 ? Math.sin((1 - f.pushTime / PUSH.duration) * Math.PI) : 0,
      });
      rig.root.updateMatrixWorld(true);

      const gun = gunFor(i, f.weapon.kind);
      rig.hand.getWorldPosition(tmpV);
      rig.hand.getWorldQuaternion(tmpQ);
      gun.root.position.copy(tmpV);
      gun.root.quaternion.copy(tmpQ);
      gun.root.visible = rig.root.visible;

      // Muzzle flash at the gun's tip.
      fwd.set(0, 0.05, gun.length).applyQuaternion(tmpQ).add(tmpV);
      const fl = flashes[i];
      fl.visible = rig.root.visible && f.firing < 0.05;
      fl.position.copy(fwd);
      fl.scale.setScalar(f.weapon.kind === 'shotgun' || f.weapon.kind === 'launcher' ? 1.8 : 1);

      if (i === 0 && !opts.demo) {
        const len = 2.2;
        aimLine.visible = rig.root.visible && state.phase === 'fight';
        aimLine.scale.set(len, 1, 1);
        aimLine.position.set(fwd.x + (Math.cos(f.aim) * len) / 2, fwd.y + (Math.sin(f.aim) * len) / 2, fwd.z);
        aimLine.rotation.set(0, 0, f.aim);
      }
    });
    if (opts.demo) aimLine.visible = false;

    state.pickups.forEach((p, i) => {
      const v = pickupFor(i, p.kind);
      const marker = arena.markers[i];
      v.root.visible = p.active;
      marker.visible = p.active && Math.abs(p.vy) < 0.01;
      if (!p.active) return;
      v.root.position.set(p.x, p.y + 0.45 + Math.sin(time * 3 + i) * 0.08, 0.2);
      v.root.rotation.set(0, Math.PI / 2 + Math.sin(time * 1.5 + i) * 0.5, 0);
      marker.position.set(p.x, p.y + 0.012, 0.25);
    });

    let t = 0;
    let gr = 0;
    for (const p of state.projectiles) {
      const back = 1 - alpha;
      const x = p.x - p.vx * DT * back;
      const y = p.y - p.vy * DT * back;
      if (p.kind === 'grenade') {
        const m = grenades[gr++];
        if (!m) continue;
        m.visible = true;
        m.position.set(x, y, 0.1);
        m.rotation.z += dt * 10;
      } else if (p.kind !== 'rail') {
        const m = tracers[t++];
        if (!m) continue;
        m.visible = true;
        m.material = p.kind === 'pellet' ? pelletMat : tracerMat;
        const len = p.kind === 'pellet' ? 0.35 : 0.7;
        const ang = Math.atan2(p.vy, p.vx);
        m.scale.set(len, 1, 1);
        m.position.set(x - (Math.cos(ang) * len) / 2, y - (Math.sin(ang) * len) / 2, 0.1);
        m.rotation.set(0, 0, ang);
      }
    }
    for (; t < tracers.length; t++) tracers[t].visible = false;
    for (; gr < grenades.length; gr++) grenades[gr].visible = false;
    for (const b of beams) {
      b.life = Math.max(0, b.life - dt);
      b.mesh.visible = b.life > 0;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = b.life / 0.3;
      b.mesh.scale.x = b.mesh.scale.z = 0.4 + (b.life / 0.3) * 0.8;
    }

    arena.update(dt, time);
    vfx.update(dt);
    updateCamera(dt);
    renderer.toneMappingExposure = 1.05 + flash * 3;
    flash = Math.max(0, flash - dt);
    renderer.render(scene, camera);
  };

  const hintFor = (): HudState['hint'] => {
    const me = state.fighters[0];
    if (opts.demo || state.phase !== 'fight' || me.respawn > 0) return [];
    const near = pickupCandidate(state, me);
    if (near && me.weapon.kind !== 'pistol') return [{ key: 'E', text: `swap for the ${GUNS[near.kind].name}` }];
    return [];
  };

  let fps = 60;
  let hudTimer = 0;
  const emitHud = () => {
    opts.onHud({
      phase: state.phase,
      time: state.phaseTime,
      winner: state.winner,
      fps: Math.round(fps),
      lastKo,
      hint: hintFor(),
      muted,
      aimMode,
      endReason: state.endReason,
      fighters: state.fighters.map((f) => {
        const g = GUNS[f.weapon.kind];
        return {
          name: CHARACTERS[f.character].name,
          character: f.character,
          hp: Math.max(0, f.hp),
          maxHp: CHARACTERS[f.character].hp,
          kos: f.kos,
          push: 1 - f.pushCooldown / PUSH.cooldown,
          gun: g.name,
          mag: f.weapon.mag,
          reserve: f.weapon.reserve,
          reloading: f.weapon.reload > 0 ? 1 - f.weapon.reload / g.reloadTime : 0,
          out: f.respawn > 0,
        };
      }),
    });
  };

  // Audio may only start after a user gesture.
  const onKey = (e: KeyboardEvent) => {
    sfx.unlock();
    if (e.code === 'KeyM') muted = sfx.toggleMute();
    if (e.code === 'KeyT') aimMode = aimMode === 'auto' ? 'mouse' : 'auto';
  };
  window.addEventListener('keydown', onKey);

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
      const aim = aimMode === 'mouse' ? mouseAim() : autoAim(0);
      step(state, [opts.demo ? demoBot(state) : controls.read(aim.x, aim.y, aimMode), bot(state)]);
      if (!started && state.phase === 'fight') {
        started = true;
        sfx.start();
      }
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
  // Dev-only handle for automated checks.
  if (process.env.NODE_ENV !== 'production') {
    (window as unknown as { __mc?: unknown }).__mc = { state: () => state, muzzle: () => muzzle(state.fighters[0]) };
  }

  const restart = () => {
    state = createGame([opts.player, opts.opponent], randomSeed());
    bot = createBot(1, randomSeed(), level);
    demoBot = createBot(0, randomSeed(), level);
    started = false;
    savePrev();
    lastKo = null;
    emitHud();
  };

  return {
    restart,
    setAimMode: (m: AimMode) => {
      aimMode = m;
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      controls.dispose();
      window.removeEventListener('keydown', onKey);
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
