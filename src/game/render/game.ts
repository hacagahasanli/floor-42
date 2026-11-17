import * as THREE from 'three';

import { createControls } from '../input';
import type { AimMode } from '../input';
import { createSfx } from '../sfx';

import type { VolumeKind } from '../sfx';
import { createBot } from '../sim/bot';
import { ARENA, CHARACTERS, DT, GUNS, PUSH } from '../sim/constants';
import { chooseCharacter, createGame, muzzle, pickupCandidate, step } from '../sim/step';

import { buildArena } from './arena';
import { buildRig, poseRig } from './characters';
import { buildGun } from './guns';
import { createVfx } from './vfx';

import type { Rig } from './characters';
import type { OnlineSession } from '../net/client';
import type { StartMessage } from '../net/protocol';
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
  /** Online: round-trip time to the game server in ms. */
  ping: number | null;
  paused: boolean;
  /** Screen shake and flashes on (false = reduce motion). */
  motion: boolean;
  /** Pause requests: [you, rival]. */
  pauseRequests: [boolean, boolean];
  /** Seconds until you respawn, or null while alive. */
  respawnIn: number | null;
  character: CharacterId;
  nextCharacter: CharacterId | null;
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
  /** Online match: the server owns the game, this client predicts. */
  online?: OnlineSession;
}

const randomSeed = () => (Math.random() * 1e9) | 0;
const TWO_HANDED: Record<GunKind, boolean> = { pistol: false, smg: true, shotgun: true, railgun: true, launcher: true, uzi: false, bomb: false };

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
  const online = opts.online;
  /** Which fighter you are. Offline you are always 0. */
  const me = online?.slot ?? 0;
  let state: GameState = online ? online.state : createGame([opts.player, opts.opponent], randomSeed());
  let bot = createBot(1, randomSeed(), level);
  let demoBot = createBot(0, randomSeed(), level);
  const controls = createControls(canvas);
  let aimMode: AimMode = opts.aimMode ?? 'auto';
  const sfx = createSfx();
  let muted = sfx.muted; // remembered across visits

  const arena = buildArena(scene, state.pickups.length);
  const vfx = createVfx(scene);

  const rigs: Rig[] = state.fighters.map((f) => {
    const rig = buildRig(f.character);
    scene.add(rig.root);
    return rig;
  });
  const rigCharacters = state.fighters.map((f) => f.character);
  /** A fighter respawned as someone else: swap the model. */
  const syncRig = (i: number, character: CharacterId) => {
    if (rigCharacters[i] === character) return;
    scene.remove(rigs[i].root);
    rigs[i].root.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
    rigs[i] = buildRig(character);
    scene.add(rigs[i].root);
    rigCharacters[i] = character;
  };

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

  // "R · SWAP" floating over a gun you can swap for (E works too).
  const promptTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.roundRect(8, 8, 80, 80, 12);
    g.fill();
    g.fillStyle = '#0a0d18';
    g.font = 'bold 56px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('R', 48, 52);
    g.fillStyle = '#ffffff';
    g.font = 'bold 44px sans-serif';
    g.textAlign = 'left';
    g.fillText('SWAP', 104, 52);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const prompt = new THREE.Sprite(new THREE.SpriteMaterial({ map: promptTex, depthTest: false, transparent: true }));
  prompt.scale.set(2.4, 0.9, 1);
  prompt.renderOrder = 10;
  prompt.visible = false;
  scene.add(prompt);

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
  const smooth = state.fighters.map((f) => ({ x: f.x, y: f.y }));

  // ---------- Game feel (see the web-game-feel skill): one tiered feedback() per event.
  const MOTION_KEY = 'merge-conflict:motion';
  let motion = (() => {
    try {
      return window.localStorage.getItem(MOTION_KEY) === '0' ? 0 : 1;
    } catch {
      return 1;
    }
  })();
  type Tier = 'tiny' | 'light' | 'heavy' | 'huge';
  const TIERS: Record<Tier, { trauma: number; flash: number; fov: number }> = {
    tiny: { trauma: 0, flash: 0, fov: 0 },
    light: { trauma: 0.15, flash: 0.06, fov: 0 },
    heavy: { trauma: 0.45, flash: 0.09, fov: 0.6 },
    huge: { trauma: 0.8, flash: 0.12, fov: 2.2 },
  };
  let trauma = 0;
  let fovKick = 0;
  let flash = 0; // screen exposure flash, only for huge moments
  const hitFlash = state.fighters.map(() => 0);
  const feedback = (tier: Tier, target?: number) => {
    const t = TIERS[tier];
    trauma = Math.min(1, trauma + t.trauma * motion);
    fovKick = Math.max(fovKick, t.fov * motion);
    if (target !== undefined && t.flash) hitFlash[target] = Math.max(hitFlash[target], t.flash * (motion ? 1 : 0.5));
    if (tier === 'huge') flash = Math.max(flash, 0.12 * motion);
  };

  // Hit flash: rigs share cached materials, so swap each mesh to one white material and back.
  const WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const setFlash = (rig: Rig, on: boolean) => {
    rig.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (on && !o.userData.orig) {
        o.userData.orig = o.material;
        o.material = WHITE;
      } else if (!on && o.userData.orig) {
        o.material = o.userData.orig;
        o.userData.orig = undefined;
      }
    });
  };

  // Squash and stretch: a critically damped spring on the rig's vertical scale, around the feet.
  const squash = state.fighters.map(() => ({ s: 0, v: 0 }));
  const wasGround = state.fighters.map((f) => f.onGround);
  const lastVy = state.fighters.map(() => 0);
  const kick = (i: number, amount: number) => {
    squash[i].s = amount;
    squash[i].v = 0;
  };

  // Damage numbers: pooled sprites, one cached texture per value.
  const numberTex = new Map<string, THREE.CanvasTexture>();
  const texFor = (text: string, color: string) => {
    const key = `${text}|${color}`;
    let t = numberTex.get(key);
    if (!t) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 128;
      const g = c.getContext('2d')!;
      g.font = 'bold 84px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 12;
      g.strokeStyle = '#0a0d18';
      g.strokeText(text, 128, 64);
      g.fillStyle = color;
      g.fillText(text, 128, 64);
      t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      numberTex.set(key, t);
    }
    return t;
  };
  const numbers = Array.from({ length: 10 }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    sprite.renderOrder = 11;
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, life: 0, x: 0, y: 0, size: 1 };
  });
  let nextNumber = 0;
  const popNumber = (x: number, y: number, damage: number) => {
    const n = numbers[nextNumber++ % numbers.length];
    const big = damage >= 50;
    (n.sprite.material as THREE.SpriteMaterial).map = texFor(`-${Math.round(damage)}`, big ? '#ff3d6e' : '#ffd23f');
    (n.sprite.material as THREE.SpriteMaterial).needsUpdate = true;
    Object.assign(n, { life: 0.7, x: x + (Math.random() - 0.5) * 0.6, y: y + 0.4, size: big ? 1.5 : 1.1 });
    n.sprite.visible = true;
  };
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
        sfx.shot(e.gun, e.x);
        if (e.gun === 'railgun') {
          fireBeam(e.x, e.y, e.angle);
          feedback(e.fighter === me ? 'light' : 'tiny');
        }
        if (e.gun === 'shotgun' && e.fighter === me) feedback('light');
        break;
      case 'hit':
        vfx.burst(e.x, e.y, 4 + Math.round(e.damage / 3), 'spark', { speed: 3 + e.power * 0.3, life: 0.3 });
        if (e.damage > 15) vfx.ring(e.x, e.y, 0xfff1a8, { grow: 5, life: 0.22 });
        feedback(e.damage >= 50 || e.power > 12 ? 'heavy' : 'light', e.fighter);
        if (e.damage >= 1) popNumber(e.x, e.y, e.damage);
        sfx.hit(e.power, e.x);
        break;
      case 'impact':
        vfx.burst(e.x, e.y, 3, 'dust', { speed: 2, up: 1, gravity: 6, life: 0.25, size: 0.7 });
        sfx.impact(e.x);
        break;
      case 'explosion':
        vfx.burst(e.x, e.y, 40, 'hot', { speed: 9, up: 2, life: 0.6, size: 1.6 });
        vfx.burst(e.x, e.y, 24, 'spark', { speed: 6, up: 2, life: 0.5, size: 1.4 });
        vfx.burst(e.x, e.y, 18, 'dust', { speed: 4, up: 1, gravity: -1, life: 1, size: 2.4 });
        vfx.ring(e.x, e.y, 0xffb347, { grow: e.radius * 4, life: 0.35 });
        feedback('huge');
        sfx.explosion(e.x);
        break;
      case 'push':
        vfx.ring(e.x + e.facing * 0.6, e.y, 0xf0c24a, { grow: 7, life: 0.35, facing: e.facing });
        vfx.burst(e.x + e.facing * 0.8, e.y, 10, 'dust', { speed: 4, dirX: e.facing, up: 0.5, gravity: 2, life: 0.35 });
        feedback('light');
        sfx.push(e.x);
        break;
      case 'deflect':
        vfx.burst(e.x, e.y, 8, 'guard', { speed: 4, life: 0.3 });
        sfx.deflect(e.x);
        break;
      case 'wallSplat': {
        const x = e.side < 0 ? ARENA.left : ARENA.right;
        arena.crack(e.side, e.y);
        vfx.burst(x - e.side * 0.2, e.y, 30, 'glass', { speed: 7, dirX: -e.side, life: 0.8, size: 1.3 });
        feedback('heavy');
        sfx.glass(x);
        break;
      }
      case 'ko':
        vfx.burst(e.x, e.y, 40, 'ko', { speed: 9, up: 4, life: 0.9, size: 1.4 });
        vfx.ring(e.x, e.y, 0xf0c24a, { grow: 14, life: 0.5 });
        feedback('huge');
        lastKo = { fighter: e.fighter, at: time };
        sfx.ko(e.x);
        break;
      case 'jump':
        vfx.burst(e.x, e.y + 0.05, e.wallKick ? 10 : 5, e.wallKick ? 'glass' : 'dust', { speed: 2.5, up: 1, gravity: 4, life: 0.35 });
        sfx.jump(e.x);
        break;
      case 'dash':
        vfx.burst(e.x, e.y + 0.4, 8, 'dust', { speed: 2, up: 0.6, gravity: 2, life: 0.3 });
        sfx.dash(e.x);
        break;
      case 'pickup':
        sfx.pickup();
        break;
      case 'reload':
        if (e.fighter === me) sfx.reload();
        break;
      case 'empty':
        sfx.empty();
        break;
      case 'drop':
        vfx.burst(e.x, ARENA.ceiling - 0.3, 12, 'dust', { speed: 2, up: -1, gravity: 3, life: 0.6, size: 1.5 });
        sfx.drop(e.x);
        break;
      case 'rail':
        break;
    }
  };

  // Camera: fixed, far back, the whole office in view.
  const camBase = camera.position.clone();
  const updateCamera = (dt: number) => {
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max((ARENA.right + 1.5) / (tanHalf * camera.aspect), (ARENA.ceiling / 2 + 2) / tanHalf);
    const k = 1 - Math.exp(-3 * dt);
    camBase.x += (0 - camBase.x) * k;
    camBase.y += (ARENA.ceiling / 2 + 0.6 - camBase.y) * k;
    camBase.z += (dist - camBase.z) * k;
    // Trauma shake: amount = trauma², offsets from smooth noise (summed sines), never Math.random().
    const amt = trauma * trauma;
    const n = (f: number, p: number) => Math.sin(time * f + p) * 0.6 + Math.sin(time * f * 2.3 + p) * 0.4;
    camera.position.set(camBase.x + n(23, 1.3) * 0.45 * amt, camBase.y + n(19, 4.1) * 0.32 * amt, camBase.z);
    camera.lookAt(n(23, 1.3) * 0.2 * amt, ARENA.ceiling / 2 + n(19, 4.1) * 0.15 * amt, 0);
    camera.rotateZ(n(17, 2.7) * 0.02 * amt);
    trauma = Math.max(0, trauma - dt * 1.5);
    // A short zoom punch on huge moments.
    const fov = 36 - fovKick;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    fovKick = Math.max(0, fovKick - dt * 6);
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
    if (!raycaster.ray.intersectPlane(plane, aimPoint)) return autoAim(me);
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
      syncRig(i, f.character);
      const rig = rigs[i];
      const out = f.respawn > 0;
      rig.root.visible = !out && !(f.invulnerable > 0 && Math.floor(time * 16) % 2 === 0);
      const shudder = state.hitstop > 0 && f.stun > 0 ? (Math.random() - 0.5) * 0.14 : 0;
      const tx = prevF[i].x + (f.x - prevF[i].x) * alpha;
      const ty = prevF[i].y + (f.y - prevF[i].y) * alpha;
      // Online, the rival's position gets corrected by the server; ease into it instead of snapping.
      const sm = smooth[i];
      if (online && i !== me && Math.hypot(tx - sm.x, ty - sm.y) < 4) {
        const k = 1 - Math.exp(-22 * dt);
        sm.x += (tx - sm.x) * k;
        sm.y += (ty - sm.y) * k;
      } else {
        sm.x = tx;
        sm.y = ty;
      }
      rig.root.position.set(sm.x + shudder, sm.y, 0);
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
      // Squash and stretch from state changes: take-off stretches, a hard landing squashes.
      if (!out) {
        if (wasGround[i] && !f.onGround && f.vy > 5) kick(i, 0.16);
        if (!wasGround[i] && f.onGround && lastVy[i] < -10) {
          kick(i, -0.22);
          sfx.land(f.x);
          vfx.burst(f.x, f.y + 0.05, 6, 'dust', { speed: 2.5, up: 0.8, gravity: 4, life: 0.35 });
        }
      }
      wasGround[i] = f.onGround;
      lastVy[i] = f.vy;
      const sq = squash[i];
      const K = 320;
      sq.v += (-K * sq.s - 2 * Math.sqrt(K) * sq.v) * dt;
      sq.s += sq.v * dt;
      const sy = 1 + sq.s * motion;
      rig.root.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      // Hit flash.
      hitFlash[i] = Math.max(0, hitFlash[i] - dt);
      setFlash(rig, hitFlash[i] > 0 && rig.root.visible);
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

      if (i === me && !opts.demo) {
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

    // Show the swap prompt over the gun you're standing on (with only a pistol it's picked up automatically).
    const self = state.fighters[me];
    const cand = !opts.demo && self.respawn <= 0 && self.weapon.kind !== 'pistol' ? pickupCandidate(state, self) : null;
    const near = cand && cand.kind !== 'bomb' ? cand : null; // bombs are picked up automatically
    prompt.visible = !!near;
    if (near) {
      const bob = 1 + Math.sin(time * 6) * 0.06;
      prompt.position.set(near.x, near.y + 1.6, 0.5);
      prompt.scale.set(2.4 * bob, 0.9 * bob, 1);
    }

    let t = 0;
    let gr = 0;
    for (const p of state.projectiles) {
      const back = 1 - alpha;
      const x = p.x - p.vx * DT * back;
      const y = p.y - p.vy * DT * back;
      if (p.kind === 'grenade' || p.kind === 'bomb') {
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

    for (const n of numbers) {
      if (!n.sprite.visible) continue;
      n.life -= dt;
      if (n.life <= 0) {
        n.sprite.visible = false;
        continue;
      }
      const k = 1 - n.life / 0.7;
      const rise = 1 - (1 - k) * (1 - k); // ease out
      n.sprite.position.set(n.x, n.y + rise * 0.9, 0.6);
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.4);
      n.sprite.scale.set(1.6 * n.size * pop, 0.8 * n.size * pop, 1);
      (n.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, n.life / 0.25);
    }
    arena.update(dt, time);
    vfx.update(dt);
    updateCamera(dt);
    renderer.toneMappingExposure = 1.05 + flash * 3;
    flash = Math.max(0, flash - dt);
    renderer.render(scene, camera);
  };

  const hintFor = (): HudState['hint'] => {
    const self = state.fighters[me];
    if (opts.demo || state.phase !== 'fight' || self.respawn > 0) return [];
    const near = pickupCandidate(state, self);
    if (self.weapon.kind === 'bomb') return [{ key: 'Space', text: 'throw the bomb' }];
    if (near && near.kind !== 'bomb' && self.weapon.kind !== 'pistol') {
      return [{ key: 'R', text: `swap for the ${GUNS[near.kind].name}` }];
    }
    return [];
  };

  let fps = 60;
  let hudTimer = 0;
  const emitHud = () => {
    opts.onHud({
      phase: state.phase,
      time: state.phaseTime,
      // The HUD always shows you first.
      winner: state.winner === null || state.winner < 0 ? state.winner : state.winner === me ? 0 : 1,
      fps: Math.round(fps),
      lastKo: lastKo ? { ...lastKo, fighter: lastKo.fighter === me ? 0 : 1 } : null,
      ping: online ? online.latency : null,
      paused: state.paused,
      motion: motion === 1,
      pauseRequests: online
        ? [online.pauseRequests[me] ?? false, online.pauseRequests[1 - me] ?? false]
        : [state.paused, state.paused],
      respawnIn: state.fighters[me].respawn > 0 ? state.fighters[me].respawn : null,
      character: state.fighters[me].character,
      nextCharacter: state.fighters[me].nextCharacter,
      hint: hintFor(),
      muted,
      aimMode,
      endReason: state.endReason,
      fighters: [state.fighters[me], state.fighters[1 - me]].map((f) => {
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
      const aim = aimMode === 'mouse' ? mouseAim() : autoAim(me);
      if (online) {
        online.tick(controls.read(aim.x, aim.y, aimMode));
        state = online.state;
      } else {
        step(state, [opts.demo ? demoBot(state) : controls.read(aim.x, aim.y, aimMode), bot(state)]);
      }
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
    if (online) {
      online.rematch();
      return;
    }
    state = createGame([opts.player, opts.opponent], randomSeed());
    bot = createBot(1, randomSeed(), level);
    demoBot = createBot(0, randomSeed(), level);
    started = false;
    savePrev();
    lastKo = null;
    emitHud();
  };

  /** Online: the server started a new round (both players asked for a rematch). */
  const serverStart = (msg: StartMessage) => {
    if (!online) return;
    online.restart(msg);
    state = online.state;
    started = false;
    lastKo = null;
    savePrev();
    emitHud();
  };

  // Pause: online both players must agree; against the bot it is instant.
  const requestPause = () => {
    if (online) online.requestPause();
    else state.paused = true;
    emitHud();
  };
  const cancelPause = () => {
    if (online) online.cancelPause();
    emitHud();
  };
  const resume = () => {
    if (online) online.resume();
    else state.paused = false;
    emitHud();
  };
  const pickCharacter = (c: CharacterId) => {
    if (online) online.chooseCharacter(c);
    else chooseCharacter(state, me, c);
    emitHud();
  };

  return {
    restart,
    serverStart,
    requestPause,
    cancelPause,
    toggleMotion: () => {
      motion = motion ? 0 : 1;
      try {
        window.localStorage.setItem(MOTION_KEY, String(motion));
      } catch {
        /* storage unavailable */
      }
      emitHud();
    },
    resume,
    pickCharacter,
    volumes: () => sfx.volumes,
    setVolume: (kind: VolumeKind, value: number) => sfx.setVolume(kind, value),
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
