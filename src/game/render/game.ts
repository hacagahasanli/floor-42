import * as THREE from 'three';

import { createControls, createControls2P, isTouchDevice } from '../input';
import { playerColour } from '../twoPlayer';

import type { Button } from '../input';
import type { AimMode } from '../input';
import { createSfx } from '../sfx';
import { getSettings, primaryLabel } from '../settings';

import type { Settings } from '../settings';
import { createBot, EASY_GUN_GRACE_TICKS } from '../sim/bot';
import { arenaOf, ASSIST, CHARACTERS, DEFAULT_ARENA, DT, GUNS, OFFLINE_COUNTDOWN_SECONDS, PUSH, PHYS, RULES } from '../sim/constants';
import { chooseCharacter, createGame, muzzle, pickupCandidate, step, visibleAim } from '../sim/step';

import { buildArenaFor } from './arenaView';
import { buildRig, cancelWinner, CHARACTER_FX, disposeRig, lifeRig, poseDeath, poseSide, setCharacterFx, setRimStrength, startFlinch, startLanding, startShot, startTakeoff, startWinner, stepSpring } from './characters';
import { buildGun } from './guns';
import { deviceFacts, renderProfile } from './quality';
import { createGovernor, MAX_STEPS_PER_FRAME, stepDown } from './governor';
import { createVfx } from './vfx';
import { DESKTOP_CAM, finaleHolding, finaleScale, followTarget, followWeight, koBeatWeight, nextFollowTime, PHONE_CAM } from './cameraMath';

import type { Rig } from './characters';
import type { NetStatus, OnlineSession, Presentation } from '../net/client';
import type { StartMessage } from '../net/protocol';
import type { GunView } from './guns';
import type { ArenaId } from '../sim/constants';
import type { BotLevel } from '../sim/bot';
import type { CharacterId, EndReason, GameEvent, GameState, GunKind, Phase } from '../sim/types';

export interface HudFighter {
  name: string;
  character: CharacterId;
  hp: number;
  maxHp: number;
  /** Health is coming back right now (shown as a green shimmer on the bar). */
  healing: boolean;
  kos: number;
  push: number; // 0..1 ready
  dash: number; // 0..1 ready
  stats: { damage: number; accuracy: number; deaths: number; bestStreak: number };
  gun: string;
  mag: number;
  reserve: number; // Infinity for the pistol
  reloading: number; // 0..1 progress, 0 when not reloading
  /** Bombs carried (0 or 1), thrown with the Throw bomb key. */
  bombs: number;
  out: boolean;
}

export interface HudState {
  phase: Phase;
  /** KOs needed to win this match (5, or 3/5/7 in local 2-player). */
  kosToWin: number;
  time: number;
  winner: number | null;
  fighters: HudFighter[];
  fps: number;
  lastKo: { fighter: number; at: number } | null;
  hint: { key: string; text: string }[];
  muted: boolean;
  aimMode: AimMode;
  /** Online: how the match is connected (direct / turn / relay / server), ping, and whether it is unstable. */
  net: NetStatus | null;
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
  /** Offline match-winning KO: the slow-motion and hold are running and the result card waits (the KNOCKOUT band shows). */
  finale: boolean;
}

export interface ArenaOptions {
  player: CharacterId;
  opponent: CharacterId;
  onHud: (hud: HudState) => void;
  /** Both sides are bots: attract mode, and handy for recording. */
  demo?: boolean;
  level?: BotLevel;
  /** Which arena offline matches are played in (default DEFAULT_ARENA). Online is always the office. */
  arena?: ArenaId;
  aimMode?: AimMode;
  /** Online match: the server owns the game, this client predicts. */
  online?: OnlineSession;
  /** A backdrop (the home page): no sound, no keyboard. */
  backdrop?: boolean;
  /**
   * Local 2-player on one keyboard (spec local-2p.md): no bot, both fighters read their own keys and pads, auto-aim
   * for both, automatic pick up and reload, the fixed full-office camera, P1/P2 tags and rings, shake capped at 0.6.
   */
  twoPlayer?: { kosToWin: number };
  /** Start with the clock held (the 2-player key card): nothing moves until `setHold(false)`. */
  hold?: boolean;
  /** Local 2-player: a player pressed Start on their pad (pause). */
  onPadPause?: (player: 0 | 1) => void;
  /** Local 2-player on a touch-only device: a pad went away mid-match (someone has no controls now). */
  onPadLost?: () => void;
  /** The GPU dropped the WebGL context and it did not come back within a few seconds. */
  onContextLost?: () => void;
}

const randomSeed = () => (Math.random() * 1e9) | 0;

export const startArena = (canvas: HTMLCanvasElement, opts: ArenaOptions) => {
  const touch = isTouchDevice();
  const store = getSettings();
  let settings: Settings = store.get();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // The quality tier (Settings > Graphics) sets the pixel ratio and shadows; phones default to a lower ratio.
  const profile0 = renderProfile(settings, deviceFacts());
  renderer.setPixelRatio(profile0.pixelRatio);
  renderer.shadowMap.enabled = profile0.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft was removed in r187 (it already fell back to PCF)
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // Online play is always the office (the protocol carries no arena); offline uses the pick or the default.
  const arenaId: ArenaId = opts.online ? 'office' : (opts.arena ?? DEFAULT_ARENA);
  const A = arenaOf({ arena: arenaId });
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
  camera.position.set(0, A.ceiling / 2, 40);

  const level = opts.level ?? 'normal';
  const online = opts.online;
  const tp = online || opts.demo ? undefined : opts.twoPlayer;
  // Against the easy bot the bot cannot take guns in the opening seconds (sim gunGrace, offline only).
  const grace = !online && !tp && !opts.demo && (opts.level ?? 'normal') === 'easy';
  const newGame = () =>
    createGame(
      [opts.player, opts.opponent],
      randomSeed(),
      false,
      tp ? { kosToWin: tp.kosToWin, assist: true } : undefined,
      // Offline only (never `online`): the shorter countdown is opt-in, so the shared sim default stays 3.6 s.
      { ...(grace ? { gunGrace: { fighter: 1, ticks: EASY_GUN_GRACE_TICKS } } : {}), countdownSeconds: OFFLINE_COUNTDOWN_SECONDS, arena: arenaId },
    );
  let hold = !!opts.hold;
  let padsSeen = 0;
  /** Which fighter you are. Offline you are always 0. */
  const me = online?.slot ?? 0;
  let state: GameState = online ? online.state : newGame();
  let bot = createBot(1, randomSeed(), level);
  let demoBot = createBot(0, randomSeed(), level);
  // In 2-player the 1-player keys and the mouse stay silent (Space, Shift, R, F... do nothing there).
  const controls = createControls(canvas, !opts.backdrop && !tp, settings.bindings);
  const controls2 = tp ? createControls2P(settings.bindings2p, !opts.backdrop) : null;
  let aimMode: AimMode = touch || tp ? 'auto' : (opts.aimMode ?? settings.aimMode);
  const sfx = createSfx({ volumes: settings.audio, muted: store.effectiveMute() });
  let muted = store.effectiveMute();

  const arena = buildArenaFor(arenaId, scene, state.pickups.length, { tier: profile0.tier, seed: state.seed, reducedMotion: settings.reducedMotion });
  const vfx = createVfx(scene);
  if (arena.vfxColors) vfx.setColors(arena.vfxColors);

  /**
   * A soft fill light that rides in front of each fighter: they stand out from the room.
   * Every light lives in the scene for the whole match and is never hidden, only dimmed: three.js
   * recompiles every lit material when the number of visible lights changes, which froze the game
   * for 100+ ms (far more on phones) the moment a fighter was knocked out or the first rocket flew.
   */
  const FILL = 5;
  const fillLights = state.fighters.map(() => {
    const l = new THREE.PointLight(0xfff4e6, FILL, 4.5, 1.6);
    scene.add(l);
    return l;
  });
  // Weight pass effects by tier: the low tier builds plain materials (no rim) and no dust puffs; the governor can
  // switch the rest off later (CHARACTER_FX.lite).
  setCharacterFx(profile0.tier);
  CHARACTER_FX.lite = false;
  setRimStrength(0.8); // arena strength (menu, showcase and lobby close-ups use 0.35)
  vfx.setPuffs(profile0.tier !== 'low');
  const rigs: Rig[] = state.fighters.map((f) => {
    const rig = buildRig(f.character);
    scene.add(rig.root);
    return rig;
  });
  const rigCharacters = state.fighters.map((f) => f.character);

  // Contact shadows: one soft blob per fighter on whatever is under them (floor, desk, walkway). It fades and
  // widens with height, so a jump reads against the room. Two draw calls, no shadow map: it works on every tier.
  const blobTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, 'rgba(0,0,0,0.9)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.45)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobs = state.fighters.map(() => {
    const m = new THREE.Mesh(
      blobGeo,
      new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    m.visible = false;
    m.renderOrder = 1;
    scene.add(m);
    return m;
  });
  /** A fighter respawned as someone else: swap the model. */
  const syncRig = (i: number, character: CharacterId) => {
    if (rigCharacters[i] === character) return;
    scene.remove(rigs[i].root);
    disposeRig(rigs[i]);
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

  // A small keycap (the Pick up key, F by default) beside a gun you can swap for. No button, no words.
  const keycapCanvas = document.createElement('canvas');
  keycapCanvas.width = 128;
  keycapCanvas.height = 64;
  const keycapTex = new THREE.CanvasTexture(keycapCanvas);
  keycapTex.colorSpace = THREE.SRGBColorSpace;
  const drawKeycap = (label: string) => {
    const g = keycapCanvas.getContext('2d')!;
    g.clearRect(0, 0, 128, 64);
    g.font = 'bold 34px sans-serif';
    const w = Math.min(120, Math.max(48, g.measureText(label).width + 22));
    g.fillStyle = 'rgba(10,13,24,0.7)';
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(64 - w / 2, 8, w, 48, 9);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, 64, 33);
    keycapTex.needsUpdate = true;
  };
  drawKeycap(primaryLabel(settings.bindings, 'pickup'));
  const prompt = new THREE.Sprite(new THREE.SpriteMaterial({ map: keycapTex, depthTest: false, transparent: true }));
  prompt.scale.set(0.8, 0.4, 1);
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
  /**
   * The launcher's rocket, seen side-on: an olive body with a yellow band, a red nose, fins, a
   * flickering flame and an orange light out of the back, smoke left behind. Built along +x.
   */
  const rockets = Array.from({ length: 6 }, () => {
    const g = new THREE.Group();
    const std = (c: number) => new THREE.MeshStandardMaterial({ color: c, flatShading: true });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.62, 10).rotateZ(Math.PI / 2), std(0x5a6a3a));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.06, 10).rotateZ(Math.PI / 2), std(0xe9c46a));
    band.position.x = 0.16;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 10).rotateZ(-Math.PI / 2), std(0xc0392b));
    nose.position.x = 0.43;
    g.add(body, band, nose);
    for (let k = 0; k < 4; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.02), std(0x3a4428));
      fin.position.set(-0.26, Math.cos((k * Math.PI) / 2) * 0.11, Math.sin((k * Math.PI) / 2) * 0.11);
      fin.rotation.x = (k * Math.PI) / 2;
      g.add(fin);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.42, 8).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9 }));
    flame.position.x = -0.52;
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 8).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
    core.position.x = -0.43;
    g.add(flame, core);
    g.userData.flame = flame;
    // The engine glow: in the scene, never hidden (see FILL above), dark while the rocket is unused.
    const light = new THREE.PointLight(0xff9a3c, 0, 5);
    scene.add(light);
    g.userData.light = light;
    g.scale.setScalar(1.5); // big enough to read across the whole office
    g.visible = false;
    scene.add(g);
    return g;
  });
  let smokeClock = 0;
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

  // ---------- Local 2-player marks (spec 4.2): a P1/P2 tag over each head, a thin ground ring under the feet in the
  // player colour, and the 0.5 s swap ring that fills while standing on a floor gun. Four quads plus two swap rings.
  const tagCanvases = [0, 1].map(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 36;
    return c;
  });
  const tagTex = tagCanvases.map((c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  const tags = tagTex.map((map) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, transparent: true }));
    sp.renderOrder = 10;
    sp.visible = false;
    scene.add(sp);
    return sp;
  });
  const RING_TILT = -Math.PI / 2 + 0.38;
  const ringMats = [0, 1].map(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  const rings = ringMats.map((m) => {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.62, 40), m);
    // The camera looks at the office almost side-on: a ring flat on the floor would be a 2 px line, so it leans
    // toward the camera a little and reads as an ellipse round the feet.
    r.rotation.x = RING_TILT;
    r.scale.set(1.25, 1, 1);
    r.renderOrder = 2;
    r.visible = false;
    scene.add(r);
    return r;
  });
  const SWAP_SEGMENTS = 32;
  const swapMats = [0, 1].map(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  const swapRings = swapMats.map((m) => {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.84, SWAP_SEGMENTS, 1, Math.PI / 2), m);
    r.rotation.x = RING_TILT;
    r.scale.set(1.25, 1, 1);
    r.renderOrder = 3;
    r.visible = false;
    scene.add(r);
    return r;
  });
  const recolourMarks = () => {
    [0, 1].forEach((i) => {
      const colour = playerColour(i as 0 | 1, settings.colourBlind);
      const c = tagCanvases[i];
      const g = c.getContext('2d');
      if (g) {
        g.clearRect(0, 0, c.width, c.height);
        g.fillStyle = colour;
        g.beginPath();
        g.roundRect?.(2, 2, c.width - 4, c.height - 4, 6);
        if (!g.roundRect) g.rect(2, 2, c.width - 4, c.height - 4);
        g.fill();
        g.fillStyle = '#0a0d18';
        g.font = 'bold 24px "Chakra Petch", system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(`P${i + 1}`, c.width / 2, c.height / 2 + 1);
      }
      tagTex[i].needsUpdate = true;
      ringMats[i].color.set(colour);
      swapMats[i].color.set(colour);
    });
  };
  if (tp) recolourMarks();
  const drawPlayerMarks = (st: GameState) => {
    // World units per CSS pixel at the fight plane, so the tag keeps its 12 px text at any window size.
    const h = canvas.clientHeight || 1;
    const wpp = (2 * Math.abs(camera.position.z) * Math.tan((camera.fov * Math.PI) / 360)) / h;
    st.fighters.forEach((f, i) => {
      if (i > 1) return;
      const rig = rigs[i];
      const alive = f.respawn <= 0;
      const x = rig.root.position.x;
      const y = rig.root.position.y;
      tags[i].visible = alive;
      rings[i].visible = alive && f.onGround;
      tags[i].scale.set(32 * wpp, 18 * wpp, 1);
      tags[i].position.set(x, y + CHARACTERS[f.character].height + (8 + 9) * wpp, 0.6);
      rings[i].position.set(x, y + 0.02, 0);
      const hold = (f.pickupHold ?? 0) / ASSIST.swapHold;
      const sw = swapRings[i];
      sw.visible = alive && hold > 0;
      if (sw.visible) {
        sw.position.set(x, y + 0.03, 0);
        sw.geometry.setDrawRange(0, 6 * Math.max(1, Math.round(SWAP_SEGMENTS * Math.min(1, hold))));
      }
    });
  };

  // ---------- Game feel (see the web-game-feel skill): one tiered feedback() per event.
  // Camera shake and flashes: Settings > Camera, and off whenever reduced motion is on.
  const motionOf = (s: Settings) => (s.shake && !s.reducedMotion ? 1 : 0);
  let motion = motionOf(settings);
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
    // 2-player: one player's hit must not blind the other (spec 4.2).
    trauma = Math.min(tp ? 0.6 : 1, trauma + t.trauma * motion);
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

  // Squash, stretch, knee bend and flinch live in rig.life (characters.ts); here only the state changes that start them.
  const wasGround = state.fighters.map((f) => f.onGround);
  const lastVy = state.fighters.map(() => 0);
  const dashPuffAt = state.fighters.map(() => 0);
  /** Weight pass: how much of the squash, stretch and flinch plays. Shake OFF / reduced motion soften it, not remove it. */
  const weight = () => (motion ? 1 : 0.4);
  /** A hit tilts the fighter away from the shot: from the attacker if known, else from the blow's point. */
  const flinchFrom = (e: Extract<GameEvent, { type: 'hit' }>) => {
    const target = state.fighters[e.fighter];
    const rig = rigs[e.fighter];
    if (!target || !rig) return;
    const srcX = e.by !== undefined && e.by !== e.fighter && state.fighters[e.by] ? state.fighters[e.by].x : e.x;
    const d = srcX - target.x;
    // Heavy hits (damage >= 50, a big knock: point-blank shotgun, rocket, railgun) lean 1.5x as far.
    const heavy = e.damage >= 50 || e.power > 12;
    startFlinch(rig, d === 0 ? -target.facing : Math.sign(d), weight() * (heavy ? 1.5 : 1));
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
  // Pickup callouts: two pooled sprites (one per fighter), textures drawn once at start.
  const CALLOUT_GOLD = '#ffd23f';
  const CALLOUT_NAMES: Partial<Record<GunKind, string>> = { smg: 'SMG', shotgun: 'SHOTGUN', uzi: 'UZI', launcher: 'ROCKETS', railgun: 'RAILGUN', bomb: 'BOMB' };
  const calloutTex = new Map<GunKind, THREE.CanvasTexture>();
  for (const kind of Object.keys(CALLOUT_NAMES) as GunKind[]) {
    const big = kind === 'railgun' || kind === 'launcher';
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    // Drawn at 2x so it stays crisp: 22 px text (28 px for the big two) on screen.
    g.font = `400 ${(big ? 28 : 22) * 2}px Bungee, Impact, sans-serif`;
    c.width = Math.ceil(g.measureText(CALLOUT_NAMES[kind]!).width) + 16;
    c.height = (big ? 28 : 22) * 2 + 24;
    g.font = `400 ${(big ? 28 : 22) * 2}px Bungee, Impact, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 6; // 3 px outside the letters on screen
    g.strokeStyle = '#0a0d18';
    g.strokeText(CALLOUT_NAMES[kind]!, c.width / 2, c.height / 2);
    g.fillStyle = CALLOUT_GOLD;
    g.fillText(CALLOUT_NAMES[kind]!, c.width / 2, c.height / 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    calloutTex.set(kind, t);
  }
  const callouts = state.fighters.map(() => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: calloutTex.get('smg')!, transparent: true, depthTest: false }));
    sprite.renderOrder = 12;
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, life: 0 };
  });
  const CALLOUT_LIFE = 0.9;
  const popCallout = (fighter: number, gun: GunKind) => {
    const tex = calloutTex.get(gun);
    const c = callouts[fighter];
    if (!tex || !c) return;
    (c.sprite.material as THREE.SpriteMaterial).map = tex;
    c.life = CALLOUT_LIFE;
    c.sprite.visible = true;
  };
  let lastKo: HudState['lastKo'] = null;
  let time = 0;
  // Final-KO slow-motion (offline only): pending until the hit-stop is over, then `finaleT0` is the real time it began.
  let finalePending = false;
  let finaleT0 = -1;
  let finaleWasHolding = false;
  const finaleSince = () => (finaleT0 >= 0 ? time - finaleT0 : -1);
  let started = false;

  const fireBeam = (x: number, y: number, angle: number) => {
    // Out to the room's edge.
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const tx = dx > 0 ? (A.right - x) / dx : dx < 0 ? (A.left - x) / dx : Infinity;
    const ty = dy > 0 ? (A.ceiling - y) / dy : dy < 0 ? (A.floor - y) / dy : Infinity;
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
    arena.react?.(e);
    switch (e.type) {
      case 'shot':
        if (rigs[e.fighter]) startShot(rigs[e.fighter], e.gun);
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
        flinchFrom(e);
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
        const x = e.side < 0 ? A.left : A.right;
        arena.crack(e.side, e.y);
        if (arena.wall === 'rock') {
          // A sandstone cliff: dust (8-12 puffs, plus chips on the low tier, which has no puffs), pebbles from crack(), no glass.
          vfx.burst(x - e.side * 0.2, e.y, 10, 'dust', { speed: 4, dirX: -e.side, up: 1, gravity: 5, life: 0.5, size: 1.6 });
          vfx.puff(x - e.side * 0.6, e.y - 0.6, -e.side, 10, 1.8, 0.6);
          feedback('heavy');
          sfx.land(x);
          sfx.impact(x);
        } else {
          vfx.burst(x - e.side * 0.2, e.y, 30, 'glass', { speed: 7, dirX: -e.side, life: 0.8, size: 1.3 });
          feedback('heavy');
          sfx.glass(x);
        }
        break;
      }
      case 'ko':
        downAt[e.fighter] = time;
        downY[e.fighter] = e.y - 1;
        vfx.burst(e.x, e.y, 40, 'ko', { speed: 9, up: 4, life: 0.9, size: 1.4 });
        vfx.ring(e.x, e.y, 0xf0c24a, { grow: 14, life: 0.5 });
        // OFFSITE: a dust cloud where the fighter lies (14 puffs, size 1.6, spread 0.8; none on the low tier, as today).
        if (arena.wall === 'rock') vfx.puff(e.x, downY[e.fighter], 0, 14, 1.6, 0.8);
        feedback('huge');
        lastKo = { fighter: e.fighter, at: time };
        if (!online && !tp) {
          koAt = time;
          koX = e.x;
          koY = e.y;
          if (state.phase === 'over' && state.endReason === 'kos') finalePending = true;
        }
        // The winner's pose (0.9 s) plays through the final-KO beat, offline and online (visual only).
        if (state.phase === 'over' && state.endReason === 'kos') {
          state.fighters.forEach((_, i) => {
            if (i !== e.fighter && state.winner !== -1 && rigs[i]) startWinner(rigs[i]);
          });
        }
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
        popCallout(e.fighter, e.gun);
        break;
      case 'reload':
        // Yours loud and centred-ish, the rival's quieter: you hear them reloading.
        sfx.reload(state.fighters[e.fighter].x, e.fighter === me ? 0.7 : 0.45);
        break;
      case 'empty':
        sfx.empty();
        break;
      case 'drop':
        // The office's bombs fall out of a ceiling vent; OFFSITE has open sky (the parachute appears by itself).
        if (arena.wall === 'glass') vfx.burst(e.x, A.ceiling - 0.3, 12, 'dust', { speed: 2, up: -1, gravity: 3, life: 0.6, size: 1.5 });
        sfx.drop(e.x);
        break;
      case 'rail':
        break;
    }
  };

  // Camera: fixed, far back, the whole office in view. On phones the office fits inside the
  // screen minus `insets` (CSS px: the touch controls' side strips and the HUD on top), so no
  // fighter is ever hidden behind a button; the city outside fills the strips.
  let insets = { left: 0, right: 0, top: 0, bottom: 0 };
  const camBase = camera.position.clone();
  const camGoal = { x: 0, y: 0, z: 0 };
  let followT = 0;
  /** Dev handle only (never set in production): hold the wide establishing view, for captures. */
  let devWide = false;
  // Knockout beat (offline only): where and when the last KO happened.
  let koAt = -99;
  let koX = 0;
  let koY = 0;
  const updateCamera = (dt: number) => {
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const fw = Math.max(0.3, (w - insets.left - insets.right) / w);
    const fh = Math.max(0.3, (h - insets.top - insets.bottom) / h);
    const dist = Math.max((A.right + 1.5) / (tanHalf * camera.aspect * fw), (A.ceiling / 2 + 2) / (tanHalf * fh));
    const ox = (insets.right - insets.left) / 2;
    const oy = (insets.bottom - insets.top) / 2;
    if (ox || oy) camera.setViewOffset(w, h, ox, oy, w, h);
    else if (camera.view) camera.clearViewOffset();
    let tx = 0;
    let ty = A.ceiling / 2 + 0.6;
    let tz = dist;
    let kxy = 3;
    let kz = 3;
    // Phones always follow. Desktop follows too, except in local 2-player (both need the whole floor)
    // and on the menu backdrop. Desktop holds the wide establishing view through the countdown, then leans in.
    if (!tp && !devWide && (touch || !opts.backdrop)) {
      const rig = touch ? PHONE_CAM : DESKTOP_CAM;
      if (!touch) followT = nextFollowTime(followT, state.phase === 'countdown', dt);
      const w = touch ? 1 : followWeight(followT);
      const [a, b] = smooth;
      followTarget(
        {
          ax: a.x, ay: a.y, bx: b.x, by: b.y, tanHalf, aspect: camera.aspect, fw, fh, dist,
          floor: A.floor, ceiling: A.ceiling, halfWidth: A.right + 1.5, rig,
          beat: online ? 0 : koBeatWeight(time - koAt), beatX: koX, beatY: koY,
        },
        camGoal,
      );
      tx = camGoal.x * w;
      ty += (camGoal.y - ty) * w;
      tz = dist + (camGoal.z - dist) * w;
      kxy = rig.kxy;
      kz = rig.kz;
    }
    const kp = 1 - Math.exp(-kxy * dt);
    const kd = 1 - Math.exp(-kz * dt);
    camBase.x += (tx - camBase.x) * kp;
    camBase.y += (ty - camBase.y) * kp;
    camBase.z += (tz - camBase.z) * kd;
    // Trauma shake: amount = trauma², offsets from smooth noise (summed sines), never Math.random().
    const amt = trauma * trauma;
    const n = (f: number, p: number) => Math.sin(time * f + p) * 0.6 + Math.sin(time * f * 2.3 + p) * 0.4;
    camera.position.set(camBase.x + n(23, 1.3) * 0.45 * amt, camBase.y + n(19, 4.1) * 0.32 * amt, camBase.z);
    camera.lookAt(camBase.x + n(23, 1.3) * 0.2 * amt, camBase.y - 0.6 + n(19, 4.1) * 0.15 * amt, 0);
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

  // Auto-aim: your gun follows the opponent's chest (lower when they crouch), or the part of them that shows
  // over a desk. Fully hidden behind cover, it does not lock on and points ahead. You only move and shoot.
  const autoAim = (id: number) => {
    const me = state.fighters[id];
    const foe = state.fighters.find((f) => f.id !== id)!;
    const spot = foe.respawn > 0 ? null : visibleAim(state, id);
    return spot ?? { x: me.x + me.facing * 5, y: me.y + 1.1 };
  };

  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const downAt: number[] = [];
  const downY: number[] = [];
  /** The top of whatever is under x at or below y: a platform or the floor. */
  const groundBelow = (x: number, y: number) =>
    A.platforms.reduce((best, p) => (x >= p.x0 && x <= p.x1 && p.y <= y + 0.01 && p.y > best ? p.y : best), A.floor);
  const fwd = new THREE.Vector3();
  /**
   * Online clients draw two clocks: your own fighter and shots from your prediction (instant), the
   * rival, the rival's shots and the authority's verdicts (health, knockouts) from the timeline.
   */
  let pres: Presentation | null = null;
  const viewState = (): GameState => {
    const v = pres?.view;
    if (!online || !v) return state;
    const fighters = state.fighters.map((f, i) => {
      const t = v.fighters[i];
      if (!t) return f;
      if (i !== me) return t;
      // Knocked out on the timeline: lie where you fell. Alive there: your own movement, its verdicts.
      if (t.respawn > 0) return t;
      return { ...f, hp: t.hp, kos: t.kos, respawn: t.respawn, invulnerable: t.invulnerable, stats: t.stats, nextCharacter: f.nextCharacter };
    });
    const projectiles = [...state.projectiles.filter((p) => p.owner === me), ...v.projectiles.filter((p) => p.owner !== me)];
    return { ...state, fighters, projectiles };
  };
  const renderFrame = (dt: number, alpha: number, state: GameState) => {
    resize();
    const timelineView = !!pres?.view;
    const poseDt = state.hitstop > 0 ? 0 : dt;
    state.fighters.forEach((f, i) => {
      syncRig(i, f.character);
      const rig = rigs[i];
      const out = f.respawn > 0;
      // Knocked out: the body falls to the floor or the platform below and lies there until the
      // respawn (the last half second it fades out).
      const down = out && downAt[i] !== undefined;
      rig.root.visible = (down && f.respawn > 0.35) || (!out && !(f.invulnerable > 0 && Math.floor(time * 16) % 2 === 0));
      const shudder = state.hitstop > 0 && f.stun > 0 ? (Math.random() - 0.5) * 0.14 : 0;
      let tx = prevF[i].x + (f.x - prevF[i].x) * alpha;
      let ty = prevF[i].y + (f.y - prevF[i].y) * alpha;
      if (timelineView && i !== me) {
        // Already smooth: interpolated from the authority's snapshots.
        tx = f.x;
        ty = f.y;
      } else if (timelineView && pres) {
        // Your corrections are eased out, not snapped.
        tx += pres.correction.x;
        ty += pres.correction.y;
      }
      // The host sees the guest corrected when late inputs land: ease into it instead of snapping.
      const sm = smooth[i];
      if (online && !timelineView && i !== me && Math.hypot(tx - sm.x, ty - sm.y) < 4) {
        const k = 1 - Math.exp(-22 * dt);
        sm.x += (tx - sm.x) * k;
        sm.y += (ty - sm.y) * k;
      } else {
        sm.x = tx;
        sm.y = ty;
      }
      rig.root.position.set(sm.x + shudder, sm.y, 0);
      const g = GUNS[f.weapon.kind];
      if (down) {
        const t = time - downAt[i];
        const floorY = groundBelow(f.x, downY[i]);
        rig.root.position.set(f.x, Math.max(floorY, downY[i] - 0.5 * 30 * t * t), 0);
        poseDeath(rig, t, i);
        rig.root.rotation.y = rig.turn;
        rig.root.updateMatrixWorld(true);
        gunFor(i, f.weapon.kind).root.visible = false;
        flashes[i].visible = false;
        blobs[i].visible = false;
        if (i === me) aimLine.visible = false;
        return;
      }
      // State changes that start the one-shot effects (before the pose, so the knee bend starts on the same frame).
      rig.life.k = weight();
      if (!out) {
        const air = !wasGround[i] && !f.onGround && f.vy > 5 && lastVy[i] < f.vy - 6;
        if (wasGround[i] && !f.onGround && f.vy > 5) startTakeoff(rig);
        else if (air) startTakeoff(rig, true);
        if (!wasGround[i] && f.onGround && lastVy[i] < -4) {
          const hard = Math.min(1, (-lastVy[i] - 4) / 12);
          startLanding(rig, hard);
          if (lastVy[i] < -10) {
            sfx.land(f.x);
            vfx.burst(f.x, f.y + 0.05, 6, 'dust', { speed: 2.5, up: 0.8, gravity: 4, life: 0.35 });
          }
          // Dust: 16 puffs at full speed (min 4), spread 1.4 x the fighter's width.
          if (lastVy[i] < -7) vfx.puff(f.x, f.y, 0, Math.max(4, Math.round(16 * hard)), 1.8 * (0.8 + hard * 0.5), CHARACTERS[f.character].width * 0.7);
        }
        // Dash trail: 3 puffs every 60 ms behind the feet for the whole dash.
        if (f.dashTime > 0) {
          if (time - dashPuffAt[i] >= 0.06) {
            dashPuffAt[i] = time;
            vfx.puff(f.x, f.y, f.facing, 3, 1.8 * 0.6, 0.25);
          }
        }
        // A winner who touches the controls drops the pose.
        if (rig.life.winT > 0.12 && rig.life.winT < 0.9 && (Math.abs(f.vx) > 3 || f.vy > 3)) cancelWinner(rig);
      }
      wasGround[i] = f.onGround;
      lastVy[i] = f.vy;
      poseSide(rig, {
        dt: poseDt,
        time,
        vx: f.vx,
        vy: f.vy,
        onGround: f.onGround,
        facing: f.facing,
        aim: f.aim,
        wall: f.wall,
        dashing: f.dashTime > 0,
        stunned: f.stun > 0,
        gun: f.weapon.kind,
        sinceShot: f.firing,
        reload: f.weapon.reload > 0 ? 1 - f.weapon.reload / g.reloadTime : null,
        pushing: f.pushTime > 0 ? Math.sin((1 - f.pushTime / PUSH.duration) * Math.PI) : 0,
        crouch: f.crouch ?? 0,
      });
      lifeRig(rig, {
        dt: poseDt, rawDt: dt, time, vx: f.vx, vy: f.vy, onGround: f.onGround, dashing: f.dashTime > 0, facing: f.facing,
      });
      rig.root.scale.set(rig.life.sx, rig.life.sy, rig.life.sx);
      if (rig.life.events & 1) {
        rig.life.events &= ~1;
        vfx.puff(f.x, f.y, -rig.life.turnDir, 3, 1.8 * 0.7, 0.3);
      }
      // Contact shadow under the feet, projected to what is below, faint and wide while airborne.
      const blob = blobs[i];
      const gy = groundBelow(f.x, f.y);
      const hAir = Math.max(0, sm.y - gy);
      const fade = Math.max(0, 1 - hAir / 6);
      blob.visible = rig.root.visible && fade > 0.02;
      blob.position.set(sm.x, gy + 0.03, 0);
      const bw = CHARACTERS[f.character].width * 1.5 * (1 + hAir * 0.12);
      blob.scale.set(bw, 1, bw * 0.6);
      (blob.material as THREE.MeshBasicMaterial).opacity = 0.55 * fade;
      // Hit flash.
      hitFlash[i] = Math.max(0, hitFlash[i] - dt);
      setFlash(rig, hitFlash[i] > 0 && rig.root.visible);
      rig.root.updateMatrixWorld(true);

      const gun = gunFor(i, f.weapon.kind);
      rig.hand.getWorldPosition(tmpV);
      rig.hand.getWorldQuaternion(tmpQ);
      gun.root.position.copy(tmpV);
      gun.root.quaternion.copy(tmpQ);
      gun.root.visible = rig.root.visible && !rig.life.hideGun;

      // Muzzle flash at the gun's tip.
      fwd.set(0, 0.05, gun.length).applyQuaternion(tmpQ).add(tmpV);
      const fl = flashes[i];
      // Heavy guns (shotgun, rocket, railgun) show a bigger white flash for 60 ms; the rest keep 50 ms.
      const heavyGun = f.weapon.kind === 'shotgun' || f.weapon.kind === 'launcher' || f.weapon.kind === 'railgun';
      fl.visible = rig.root.visible && !rig.life.hideGun && f.firing < (heavyGun ? 0.06 : 0.05);
      fl.position.copy(fwd);
      fl.scale.setScalar(heavyGun ? 2.2 : 1);
      (fl.material as THREE.MeshBasicMaterial).color.setHex(heavyGun ? 0xffffff : 0xfff1a8);

      if (i === me && !opts.demo && !tp) {
        const len = 2.2;
        aimLine.visible = rig.root.visible && state.phase === 'fight';
        aimLine.scale.set(len, 1, 1);
        aimLine.position.set(fwd.x + (Math.cos(f.aim) * len) / 2, fwd.y + (Math.sin(f.aim) * len) / 2, fwd.z);
        aimLine.rotation.set(0, 0, f.aim);
      }
    });
    if (opts.demo || tp) aimLine.visible = false;
    if (tp) drawPlayerMarks(state);
    rigs.forEach((rig, i) => {
      const l = fillLights[i];
      l.position.set(rig.root.position.x, rig.root.position.y + 1.4, 1.6);
      l.intensity = rig.root.visible ? FILL : 0;
    });

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

    arena.syncPickups?.(state.pickups);

    // The keycap beside the gun you're standing on (with only a pistol it's picked up automatically).
    // Phones have the Swap button instead.
    const self = state.fighters[me];
    const cand = !opts.demo && !touch && !tp && self.respawn <= 0 && self.weapon.kind !== 'pistol' ? pickupCandidate(state, self) : null;
    const near = cand && cand.kind !== 'bomb' ? cand : null; // bombs are picked up automatically
    prompt.visible = !!near && settings.showKeyHints;
    if (near) prompt.position.set(near.x, near.y + 1.15, 0.5);

    let t = 0;
    let gr = 0;
    let rk = 0;
    smokeClock += dt;
    const smokeTick = smokeClock > 0.03;
    if (smokeTick) smokeClock = 0;
    for (const p of state.projectiles) {
      const back = 1 - alpha;
      const x = p.x - p.vx * DT * back;
      const y = p.y - p.vy * DT * back;
      if (p.kind === 'grenade') {
        // The launcher's rocket: nose along the flight, flame flickering, a smoke trail.
        const m = rockets[rk++];
        if (!m) continue;
        m.visible = true;
        m.position.set(x, y, 0.1);
        m.rotation.set(Math.sin(time * 20) * 0.3, 0, Math.atan2(p.vy, p.vx));
        (m.userData.flame as THREE.Mesh).scale.set(0.8 + Math.random() * 0.5, 1, 1);
        const glow = m.userData.light as THREE.PointLight;
        const ra = Math.atan2(p.vy, p.vx);
        glow.position.set(x - Math.cos(ra) * 0.75, y - Math.sin(ra) * 0.75, 0.1);
        glow.intensity = 2.5;
        if (smokeTick) {
          const a = Math.atan2(p.vy, p.vx);
          vfx.burst(x - Math.cos(a) * 0.6, y - Math.sin(a) * 0.6, 1, 'dust', { speed: 0.5, up: 0.4, gravity: -0.4, life: 0.8, size: 0.9 });
        }
      } else if (p.kind === 'bomb') {
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
    for (; rk < rockets.length; rk++) {
      rockets[rk].visible = false;
      (rockets[rk].userData.light as THREE.PointLight).intensity = 0;
    }
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
    // Pickup callouts ride above the fighter, 18 px up over their life, fading out over the last 0.3 s.
    const wpp = (2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360)) / (canvas.clientHeight || 1);
    callouts.forEach((c, i) => {
      if (!c.sprite.visible) return;
      c.life -= dt;
      if (c.life <= 0) {
        c.sprite.visible = false;
        return;
      }
      const k = 1 - c.life / CALLOUT_LIFE;
      const img = (c.sprite.material as THREE.SpriteMaterial).map!.image as HTMLCanvasElement;
      const p = rigs[i].root.position;
      c.sprite.position.set(p.x, p.y + CHARACTERS[state.fighters[i].character].height + 0.9 + 18 * k * wpp, 0.8);
      c.sprite.scale.set((img.width / 2) * wpp, (img.height / 2) * wpp, 1);
      (c.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, c.life / 0.3);
    });
    arena.update(dt, time);
    vfx.update(dt);
    updateCamera(dt);
    renderer.toneMappingExposure = arena.exposure + flash * 3;
    flash = Math.max(0, flash - dt);
    renderer.render(scene, camera);
  };

  const hintFor = (): HudState['hint'] => {
    const self = state.fighters[me];
    if (opts.demo || tp || state.phase !== 'fight' || self.respawn > 0) return [];
    if (self.bombs > 0) return [{ key: touch ? 'Bomb' : primaryLabel(settings.bindings, 'throwBomb'), text: 'throw the bomb' }];
    return [];
  };

  let fps = 60;
  let hudTimer = 0;
  const emitHud = () => {
    const state = viewState();
    // The final KO's slow-motion and hold keep the match on screen: the result card waits.
    const hold = state.phase === 'over' && finaleHolding(finalePending, finaleSince());
    opts.onHud({
      phase: hold ? 'fight' : state.phase,
      kosToWin: state.kosToWin ?? RULES.kosToWin,
      time: state.phaseTime,
      // The HUD always shows you first.
      winner: state.winner === null || state.winner < 0 ? state.winner : state.winner === me ? 0 : 1,
      fps: Math.round(fps),
      lastKo: lastKo ? { ...lastKo, fighter: lastKo.fighter === me ? 0 : 1 } : null,
      net: online ? online.status : null,
      paused: state.paused,
      motion: motion === 1,
      pauseRequests: online
        ? [online.pauseRequests[me] ?? false, online.pauseRequests[1 - me] ?? false]
        : [state.paused, state.paused],
      respawnIn: !hold && state.fighters[me].respawn > 0 ? state.fighters[me].respawn : null,
      character: state.fighters[me].character,
      nextCharacter: state.fighters[me].nextCharacter,
      hint: hintFor(),
      muted,
      aimMode,
      endReason: state.endReason,
      finale: hold,
      fighters: [state.fighters[me], state.fighters[1 - me]].map((f) => {
        const g = GUNS[f.weapon.kind];
        return {
          name: CHARACTERS[f.character].name,
          character: f.character,
          hp: Math.max(0, f.hp),
          maxHp: CHARACTERS[f.character].hp,
          healing: f.respawn <= 0 && f.hp > 0 && f.hp < CHARACTERS[f.character].hp && (f.sinceHit ?? 0) >= RULES.regenAfter,
          kos: f.kos,
          push: 1 - f.pushCooldown / PUSH.cooldown,
          dash: 1 - f.dashCooldown / PHYS.dashCooldown,
          // An older server may not send stats yet: show zeros rather than break.
          stats: {
            damage: Math.round(f.stats?.damage ?? 0),
            accuracy: f.stats && f.stats.shots > 0 ? Math.round((f.stats.hits / f.stats.shots) * 100) : 0,
            deaths: f.stats?.deaths ?? 0,
            bestStreak: f.stats?.bestStreak ?? 0,
          },
          gun: g.name,
          mag: f.weapon.mag,
          reserve: f.weapon.reserve,
          reloading: f.weapon.reload > 0 ? 1 - f.weapon.reload / g.reloadTime : 0,
          bombs: f.bombs ?? 0,
          out: f.respawn > 0,
        };
      }),
    });
  };

  // Audio may only start after a user gesture.
  const onKey = (e: KeyboardEvent) => {
    if (opts.backdrop) return;
    sfx.unlock();
    // In 2-player M is P2's sit key, not mute (mute stays in Pause > Settings).
    if (e.code === 'KeyM' && !tp) store.setAudio({ muted: !settings.audio.muted });
    if (e.code === 'KeyT' && !touch && !tp) store.set({ aimMode: aimMode === 'auto' ? 'mouse' : 'auto' });
  };
  window.addEventListener('keydown', onKey);
  // On phones audio starts with the first touch.
  const onFirstTouch = () => {
    if (!opts.backdrop) sfx.unlock();
  };
  window.addEventListener('pointerdown', onFirstTouch);

  let raf = 0;
  let last = performance.now();
  let acc = 0;
  // Auto quality: watch real frame times and step down (pixel ratio, then shadows) on a slow machine.
  const governor = createGovernor();
  const setShadows = (on: boolean) => {
    if (renderer.shadowMap.enabled === on) return;
    renderer.shadowMap.enabled = on;
    // Shadow use is compiled into each material's shader: rebuild them once.
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
    });
  };
  const govern = (frameMs: number) => {
    if (settings.quality !== 'auto' || !governor.sample(frameMs)) return;
    const next = stepDown({ pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled });
    if (!next) return;
    if (next.pixelRatio !== renderer.getPixelRatio()) renderer.setPixelRatio(next.pixelRatio);
    // Shadows off recompiles every shader (a freeze on a weak GPU): wait for a pause in the fight.
    if (!next.shadows) shadowsOffPending = true;
    // The weight pass's extras go first: no dust, no hanging parts, no rim (no recompile, a uniform).
    CHARACTER_FX.lite = true;
    vfx.setPuffs(false);
    setRimStrength(0);
    arena.lighten?.();
  };
  let shadowsOffPending = false;
  // three.js keeps the scene through a context loss and rebuilds on restore; if the GPU never gives the
  // context back the canvas stays black, so tell the page after a few seconds.
  let lostTimer = 0;
  const onLost = () => {
    lostTimer = window.setTimeout(() => opts.onContextLost?.(), 3000);
  };
  const onRestored = () => {
    window.clearTimeout(lostTimer);
    governor.reset();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  const frame = (now: number) => {
    const rawMs = now - last;
    const dt = Math.min(0.1, rawMs / 1000);
    last = now;
    if (!document.hidden) govern(rawMs);
    if (shadowsOffPending && state.phase !== 'fight') {
      shadowsOffPending = false;
      setShadows(false);
      governor.reset();
    }
    time += dt;
    if (dt > 0) fps += (1 / dt - fps) * 0.05;
    if (finalePending && state.hitstop === 0) {
      finalePending = false;
      finaleT0 = time;
      // OFFSITE's joke: a tumbleweed crosses behind the winner.
      const w = state.winner !== null && state.winner >= 0 ? state.fighters[state.winner] : null;
      arena.finale?.(w ? w.x : koX);
    }
    acc += dt * finaleScale(finaleSince());
    // The 2-player key card holds the clock: the office renders, nothing moves.
    if (hold) acc = 0;
    // Offline a slow frame may not snowball into ever more sim steps: play slower, never freeze.
    // Online the clock follows the server, so every step runs.
    if (!online && acc > DT * MAX_STEPS_PER_FRAME) acc = DT * MAX_STEPS_PER_FRAME;
    if (controls2) {
      const who = controls2.takeStart();
      if (who !== null) opts.onPadPause?.(who);
      if (touch) {
        const n = controls2.padCount();
        if (n < padsSeen) opts.onPadLost?.();
        padsSeen = n;
      }
    }
    while (acc >= DT) {
      savePrev();
      const aim = aimMode === 'mouse' ? mouseAim() : autoAim(me);
      let events: GameEvent[];
      if (controls2) {
        const [a, b] = controls2.read();
        const aimA = autoAim(0);
        const aimB = autoAim(1);
        step(state, [
          { ...a, aimX: aimA.x, aimY: aimA.y },
          { ...b, aimX: aimB.x, aimY: aimB.y },
        ]);
        events = state.events;
      } else if (online) {
        events = online.tick(controls.read(aim.x, aim.y, aimMode));
        state = online.state;
      } else {
        step(state, [opts.demo ? demoBot(state) : controls.read(aim.x, aim.y, aimMode), bot(state)]);
        events = state.events;
      }
      if (!started && state.phase === 'fight') {
        started = true;
        sfx.start();
      }
      events.forEach(handleEvent);
      acc -= DT;
    }
    if (online?.present) {
      pres = online.present(dt * 1000);
      pres.events.forEach(handleEvent);
    }
    renderFrame(dt, acc / DT, viewState());
    // The result card appears the moment the slow-motion and the hold end.
    const holding = finaleHolding(finalePending, finaleSince());
    if (finaleWasHolding && !holding) hudTimer = 0;
    finaleWasHolding = holding;
    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.1;
      emitHud();
    }
    raf = requestAnimationFrame(frame);
  };
  // Compile every shader the match can need now, before the first frame, instead of on the first
  // gunshot, rocket, hit flash or knockout mid-fight (each new program stalls the GPU process, a
  // visible freeze on phones): show every pooled object once, plus every gun and fighter model,
  // compile, then put things back.
  const prewarm = () => {
    const extra = new THREE.Group();
    (Object.keys(GUNS) as GunKind[]).forEach((k) => extra.add(buildGun(k).root));
    const warmRigs = (Object.keys(CHARACTERS) as CharacterId[]).map((c) => buildRig(c));
    warmRigs.forEach((r) => extra.add(r.root));
    extra.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), WHITE));
    scene.add(extra);
    const numberMat = numbers[0].sprite.material as THREE.SpriteMaterial;
    numberMat.map = texFor('-50', '#ff3d6e');
    numberMat.needsUpdate = true;
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    try {
      renderer.compile(scene, camera);
    } finally {
      hidden.forEach((o) => (o.visible = false));
      scene.remove(extra);
      warmRigs.forEach(disposeRig);
      extra.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
    }
  };
  prewarm();

  // Settings change while the game runs (pause menu): apply at once.
  const applySettings = (s: Settings) => {
    const prev = settings;
    settings = s;
    const p = renderProfile(s, deviceFacts());
    if (renderer.getPixelRatio() !== p.pixelRatio) renderer.setPixelRatio(p.pixelRatio);
    setShadows(p.shadows);
    governor.reset();
    motion = motionOf(s);
    arena.setReducedMotion?.(s.reducedMotion);
    muted = store.effectiveMute();
    sfx.apply(s.audio, muted);
    if (prev.bindings !== s.bindings) {
      controls.setBindings(s.bindings);
      drawKeycap(primaryLabel(s.bindings, 'pickup'));
    }
    if (!touch && !tp) aimMode = s.aimMode;
    if (controls2 && prev.bindings2p !== s.bindings2p) controls2.setBindings(s.bindings2p);
    if (tp && prev.colourBlind !== s.colourBlind) recolourMarks();
    emitHud();
  };
  const offSettings = store.subscribe(applySettings);
  if (!opts.backdrop) sfx.warm();
  raf = requestAnimationFrame(frame);
  // Dev-only handle for automated checks.
  if (process.env.NODE_ENV !== 'production') {
    (window as unknown as { __mc?: unknown }).__mc = { wide: (on: boolean) => (devWide = on), arenaId, arena, vfx, emit: (e: GameEvent) => handleEvent(e), scene, camera, cam: () => ({ z: camera.position.z, fov: camera.fov }), state: () => state, me, renderer, view: () => smooth, rigs, net: () => online && { ...online.status, tl: (online as unknown as { timeline?: unknown }).timeline }, muzzle: () => muzzle(state.fighters[0]) };
  }

  const restart = () => {
    if (online) {
      online.rematch();
      return;
    }
    state = newGame();
    bot = createBot(1, randomSeed(), level);
    demoBot = createBot(0, randomSeed(), level);
    started = false;
    savePrev();
    lastKo = null;
    finalePending = false;
    finaleT0 = -1;
    koAt = -99;
    callouts.forEach((c) => (c.sprite.visible = false));
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
    toggleMotion: () => store.set({ shake: !settings.shake, reducedMotion: settings.shake ? settings.reducedMotion : false }),
    resume,
    pickCharacter,
    /** Keep the office clear of screen edges covered by controls (CSS px). */
    setInsets: (i: { left: number; right: number; top: number; bottom: number }) => {
      insets = i;
      if (!i.left && !i.right && !i.top && !i.bottom) camera.clearViewOffset();
    },
    /** Touch controls press and release buttons through here. */
    touch: (b: Button, on: boolean) => {
      sfx.unlock();
      controls.setTouch(b, on);
    },
    setAimMode: (m: AimMode) => store.set({ aimMode: m }),
    /** Local 2-player: the keys held and both fighters' buttons, for the key card and the rematch ticks. */
    peek2P: () => controls2?.peek() ?? null,
    /** Hold the clock (the 2-player key card) or let the match run. */
    setHold: (on: boolean) => {
      hold = on;
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(lostTimer);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      offSettings();
      controls.dispose();
      controls2?.dispose();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onFirstTouch);
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
