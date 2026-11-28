/**
 * Smart bot PROTOTYPE (docs/systems/smart-bot.md). Same entry point and signature as src/game/sim/bot.ts createBot:
 * createSmartBot(myId, seed, level) => (state) => InputState. Reads the state, never writes it; all randomness from
 * seeded streams, so a match is reproducible from (seeds, inputs) and the server can run it unchanged.
 *
 * Layers (game-ai skill): perceive (facts) -> decide (utility over goals, every think tick) -> path (nav.ts) ->
 * act (per-tick reflexes: aim, trigger, dodge, deflect, splat, leapfrog, duck).
 */
import { arenaOf, baseOf, CHARACTERS, GUNS, isSolid, PUSH } from '../../../src/game/sim/constants';
import { bodyHeight, clearShot, visibleAim } from '../../../src/game/sim/step';
import { maxHp } from '../../../src/game/sim/traits';
import { EMPTY_INPUT } from '../../../src/game/sim/types';
import { graphFor, navInput, newNavMem, surfaceOf } from './nav';

import type { BotLevel } from '../../../src/game/sim/bot';
import type { ArenaData } from '../../../src/game/sim/constants';
import type { Fighter, GameState, GunKind, InputState, Pickup } from '../../../src/game/sim/types';
import type { Surface } from './nav';

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Difficulty as data (doc section 4). Ticks are 1/60 s. */
export interface Level {
  /** Ticks between decisions (+ up to `thinkJitter` random). */
  think: number;
  thinkJitter: number;
  /** Ticks from first seeing a hittable rival (after cover or a respawn) to the first shot. */
  acquire: number;
  /** Aim error (rad): aim0 when the rival is (re)acquired, tightening to aimMin with this half-life (s). */
  aim0: number;
  aimMin: number;
  aimHalfLife: number;
  /** Chance per decision to hold the trigger when it has a shot. */
  trigger: number;
  /** Reflex chances (per threat seen). */
  dodge: number;
  deflect: number;
  splat: number;
  duck: number;
  leapfrog: number;
  /** Behaviour switches. */
  powerGuns: boolean;
  highGround: boolean;
  retreat: boolean;
  feint: number;
  /** Utility noise (added to each score) and the chance to take the 2nd-best goal. */
  noise: number;
  mistake: number;
  /** + walks the range band toward the rival, - away (m). */
  aggression: number;
  /** Share of the target's motion it leads its shots by (0 = aims where he is, 1 = where he will be). */
  lead: number;
  /** Chance per decision to hop while fighting (a moving target is harder to hit). */
  jink: number;
}

export const LEVELS: Record<BotLevel, Level> = {
  easy: { think: 20, thinkJitter: 8, acquire: 24, aim0: 0.24, aimMin: 0.12, aimHalfLife: 2.5, trigger: 0.7, dodge: 0.1, deflect: 0, splat: 0.15, duck: 0.1, leapfrog: 0.03, powerGuns: false, highGround: false, retreat: false, feint: 0, noise: 0.3, mistake: 0.2, aggression: -1, lead: 0, jink: 0.1 },
  normal: { think: 12, thinkJitter: 6, acquire: 15, aim0: 0.16, aimMin: 0.05, aimHalfLife: 1.5, trigger: 0.85, dodge: 0.45, deflect: 0.2, splat: 0.5, duck: 0.3, leapfrog: 0.08, powerGuns: true, highGround: true, retreat: true, feint: 0.08, noise: 0.15, mistake: 0.08, aggression: 0, lead: 0.3, jink: 0.35 },
  hard: { think: 8, thinkJitter: 4, acquire: 10, aim0: 0.09, aimMin: 0.02, aimHalfLife: 1.0, trigger: 0.97, dodge: 0.7, deflect: 0.4, splat: 0.8, duck: 0.45, leapfrog: 0.14, powerGuns: true, highGround: true, retreat: true, feint: 0.12, noise: 0.08, mistake: 0.03, aggression: 0.5, lead: 0.4, jink: 0.5 },
};

/** Overrides for tuning runs (harness only): JSON in env SMART_TUNE, e.g. {"normal":{"aimMin":0.03}}. */
const TUNE: Partial<Record<BotLevel, Partial<Level>>> = JSON.parse(process.env.SMART_TUNE ?? '{}');

/** Preferred distance per gun (m). */
const BAND: Record<GunKind, [number, number]> = { pistol: [6, 13], smg: [4, 10], uzi: [1.5, 5], shotgun: [0.8, 3.2], railgun: [10, 24], launcher: [6, 14], bomb: [5, 11] };
const GUN_VALUE: Record<GunKind, number> = { pistol: 1, uzi: 2, smg: 2.4, shotgun: 2.2, railgun: 4, launcher: 4, bomb: 0 };
const POWER: GunKind[] = ['railgun', 'launcher'];

interface Spot {
  x: number;
  y: number;
  s: Surface;
}

const spotCache = new Map<string, Spot[]>();
/** Standing spots every metre on every surface (not inside a box standing on it). */
const spotsFor = (A: ArenaData, ch: Fighter['character']): Spot[] => {
  const key = `${A.id}|${ch}`;
  const hit = spotCache.get(key);
  if (hit) return hit;
  const g = graphFor(A, ch);
  const halfW = CHARACTERS[ch].width / 2;
  const out: Spot[] = [];
  for (const s of g.surfaces) {
    for (let x = s.x0 + halfW + 0.1; x <= s.x1 - halfW - 0.1 + 1e-9; x += 1) {
      const blocked = A.platforms.some((p) => isSolid(p) && Math.abs(baseOf(p) - s.y) < 0.05 && x > p.x0 - halfW && x < p.x1 + halfW);
      if (!blocked) out.push({ x, y: s.y, s });
    }
    if (s.x1 - s.x0 < 2 * halfW + 1.2) out.push({ x: (s.x0 + s.x1) / 2, y: s.y, s });
  }
  spotCache.set(key, out);
  return out;
};

/** How long a rival may be out of sight before the bot has to re-acquire him (ticks). */
const MEMORY_TICKS = 30;
/** Press bonus while ZUZU's Sugar Rush runs (harness override: env SMART_RUSH). */
const RUSH_PRESS = Number(process.env.SMART_RUSH ?? 0.4);

/** Harness diagnostics: why a visible rival was not shot at. */
export const DEBUG: Record<string, number> = { spot: 0, noTrigger: 0, acquire: 0, reloading: 0 };

type GoalKind = 'engage' | 'gun' | 'retreat' | 'press' | 'idle';

export const createSmartBot = (myId: number, seed = 42, level: BotLevel = 'normal') => {
  const L: Level = { ...LEVELS[level], ...(TUNE[level] ?? {}) };
  const rand = mulberry32(seed);
  const aimRand = mulberry32(seed ^ 0x5bd1e995);
  const reflexRand = mulberry32(seed ^ 0x2c1b3c6d);
  // Personality: drawn once per match so two matches do not look the same (doc 2.13).
  const persona = {
    aggression: (rand() - 0.5) * 2.4 + L.aggression,
    high: 0.6 + rand() * 0.8,
    strafeMin: 18 + Math.floor(rand() * 14),
    feint: L.feint * (0.5 + rand()),
  };
  const mem = newNavMem();
  let last: InputState = { ...EMPTY_INPUT };
  let nextThink = 0;
  let goal: { kind: GoalKind; x: number; s: Surface; pickup?: number } | null = null;
  let fire = false;
  let aimSign = 0;
  let seenSince = -1;
  let strafeDir: -1 | 1 = 1;
  let strafeUntil = 0;
  let feintUntil = -1;
  let crouchUntil = -1;
  let leapUntil = -1;
  let leapDir: -1 | 1 = 1;
  let progress = { d: Infinity, t: 0 };
  let banned = { s: -1, until: -1 };
  let reflexCd = 0;
  let jinkAt = -1;
  let lastSeen = -1;
  let jinkAir = false;
  let fightFrom = -1;
  const graceTicks = level === 'easy' ? 15 * 60 : 0;

  const chestOf = (f: Fighter) => f.y + bodyHeight(f) * 0.55;

  /** How much of `me` standing at (x, y) the rival can hit from where he is now: 0..1 (legs, chest, head). */
  const exposure = (A: ArenaData, me: Fighter, foe: Fighter, x: number, y: number) => {
    const h = CHARACTERS[me.character].height;
    const fy = foe.y + bodyHeight(foe) * 0.62;
    const kind = GUNS[foe.weapon.kind].projectile;
    let n = 0;
    for (const k of [0.25, 0.55, 0.9]) if (clearShot(A, foe.x, fy, x, y + h * k, kind)) n++;
    return n / 3;
  };
  const canHitFrom = (A: ArenaData, me: Fighter, foe: Fighter, x: number, y: number) => {
    const my = y + CHARACTERS[me.character].height * 0.62;
    const kind = GUNS[me.weapon.kind].projectile;
    return clearShot(A, x, my, foe.x, chestOf(foe), kind) || clearShot(A, x, my, foe.x, foe.y + bodyHeight(foe) * 0.9, kind);
  };

  const gunValue = (me: Fighter, k: GunKind) => {
    let v = GUN_VALUE[k];
    // TAVO: Packed Extra makes the automatics and the shotgun worth more to him.
    if (me.character === 'intern' && (k === 'smg' || k === 'uzi' || k === 'shotgun')) v += 0.35;
    return v;
  };
  const ammoShare = (me: Fighter) => {
    const g = GUNS[me.weapon.kind];
    if (!Number.isFinite(g.reserve)) return 1;
    return Math.min(1, (me.weapon.mag + me.weapon.reserve) / (g.mag + g.reserve));
  };

  const decide = (state: GameState, me: Fighter, foe: Fighter) => {
    const A = arenaOf(state);
    const g = graphFor(A, me.character);
    const here = me.onGround ? surfaceOf(g, me) : goal?.s ?? g.surfaces[0];
    const travel = (x: number, y: number) => (Math.abs(x - me.x) + 2 * Math.abs(y - me.y)) / 20;
    const options: { kind: GoalKind; score: number; x: number; s: Surface; pickup?: number }[] = [];
    const hp01 = me.hp / maxHp(state, me);
    const foeHp01 = foe.hp / maxHp(state, foe);
    const leaveGuns = graceTicks > 0 && state.tick - fightFrom < graceTicks;
    const noise = () => (rand() - 0.5) * 2 * L.noise;

    // Guns (2.4): value gain, minus distance; power guns first when allowed.
    const mineV = gunValue(me, me.weapon.kind) * (0.4 + 0.6 * ammoShare(me));
    if (!leaveGuns)
      for (const p of state.pickups as Pickup[]) {
        if (!p.active || p.kind === 'bomb') continue;
        if (!L.powerGuns && POWER.includes(p.kind)) continue;
        const gain = gunValue(me, p.kind) - mineV;
        if (gain <= 0.3) continue;
        const s = g.surfaces.reduce((b, x) => (p.x >= x.x0 - 0.3 && p.x <= x.x1 + 0.3 && Math.abs(x.y - p.y) < 0.3 ? x : b), g.surfaces[0]);
        if (s.id === banned.s && state.tick < banned.until) continue;
        const foeCloser = Math.hypot(foe.x - p.x, foe.y - p.y) < Math.hypot(me.x - p.x, me.y - p.y) - 2 && foe.respawn <= 0;
        // A power gun is a one-shot kill for whoever holds it: worth a long climb, and worth denying him.
        const powerBonus = POWER.includes(p.kind) ? 0.3 : 0;
        const score = 0.25 + gain * 0.28 + powerBonus - travel(p.x, p.y) * 0.35 - (foeCloser ? 0.15 : 0) + noise();
        options.push({ kind: 'gun', score, x: p.x, s, pickup: p.id });
      }

    if (foe.respawn > 0) {
      // Rival down: drift toward the middle and reload (act()).
      options.push({ kind: 'idle', score: 0.3, x: me.x * 0.7, s: here });
    } else {
      // Engage / press / retreat: score every standing spot (2.1, 2.2, 2.3, 2.11).
      const [near0, far0] = BAND[me.weapon.kind];
      const shift = persona.aggression + (foeHp01 < 0.4 ? 1.5 : 0) + (foe.weapon.reload > 0 ? 1 : 0);
      const near = Math.max(0.5, near0 - shift);
      const far = Math.max(near + 1.5, far0 - shift);
      const ranged = me.weapon.kind === 'pistol' || me.weapon.kind === 'smg' || me.weapon.kind === 'railgun' || me.weapon.kind === 'launcher';
      const foeRail = foe.weapon.kind === 'railgun';
      let bestE: { score: number; sp: Spot } | null = null;
      let bestR: { score: number; sp: Spot } | null = null;
      for (const sp of spotsFor(A, me.character)) {
        if (sp.s.id === banned.s && state.tick < banned.until) continue;
        const r = Math.hypot(foe.x - sp.x, foe.y - sp.y);
        const fit = r < near ? Math.max(0, 1 - (near - r) / 4) : r > far ? Math.max(0, 1 - (r - far) / 8) : 1;
        const hit = canHitFrom(A, me, foe, sp.x, sp.y) ? 1 : 0;
        const exp = exposure(A, me, foe, sp.x, sp.y);
        const high = L.highGround && ranged ? Math.max(-1, Math.min(1, (sp.y - foe.y) / 4)) * 0.18 * persona.high : 0;
        const nearWall = Math.min(sp.x - A.left, A.right - sp.x) < 2.5 && r < 4 ? 0.25 : 0;
        const keep = goal && Math.abs(goal.x - sp.x) < 1.1 && goal.s.id === sp.s.id ? 0.08 : 0;
        const tr = travel(sp.x, sp.y);
        const e = 0.3 + fit * 0.35 + hit * 0.3 + (1 - exp) * (foeRail ? 0.25 : 0.12) + high - nearWall - tr * 0.5 + keep;
        if (!bestE || e > bestE.score) bestE = { score: e, sp };
        // Retreat: out of his sight and away from him.
        const rr = (1 - exp) * 0.6 + (Math.min(r, 14) / 14) * 0.3 - tr * 0.4 + keep;
        if (!bestR || rr > bestR.score) bestR = { score: rr, sp };
      }
      if (bestE) options.push({ kind: 'engage', score: 0.45 + bestE.score * 0.3 + noise(), x: bestE.sp.x, s: bestE.sp.s });
      if (bestR && L.retreat) {
        // ORMO (Tea Break) heals 1 s sooner: he falls back earlier and comes back sooner.
        const th = me.character === 'legacy' ? 0.6 : 0.42;
        const holding = goal?.kind === 'retreat' && hp01 < 0.9;
        const want = hp01 < th ? 0.55 + (1 - hp01 / th) * 0.5 : holding ? 0.62 : 0;
        const power = POWER.includes(me.weapon.kind) ? 0.3 : 0;
        if (want > 0) options.push({ kind: 'retreat', score: want - power + bestR.score * 0.1 + noise(), x: bestR.sp.x, s: bestR.sp.s });
      }
      // Press: he is weak, reloading, or ZUZU's Sugar Rush is on (2.10).
      const rush = me.character === 'standup' && (me.trait?.rush ?? 0) > 0;
      const pressW = (foeHp01 < 0.35 && hp01 > 0.5 ? 0.35 : 0) + (foe.weapon.reload > 0 ? 0.2 : 0) + (rush ? RUSH_PRESS : 0) + (me.weapon.kind === 'shotgun' || me.weapon.kind === 'uzi' ? 0.15 : 0);
      if (pressW > 0) {
        const fs = foe.onGround ? surfaceOf(g, foe) : g.surfaces.reduce((b, x) => (foe.x >= x.x0 && foe.x <= x.x1 && x.y <= foe.y + 0.1 && x.y > b.y ? x : b), g.surfaces[0]);
        const side = me.x < foe.x ? -1 : 1;
        options.push({ kind: 'press', score: 0.5 + pressW + noise(), x: foe.x + side * 1.2, s: fs });
      }
    }
    options.sort((a, b) => b.score - a.score);
    const pick = options.length > 1 && rand() < L.mistake ? options[1] : options[0];
    if (!pick) return;
    if (!goal || goal.kind !== pick.kind || goal.s.id !== pick.s.id || Math.abs(goal.x - pick.x) > 0.6) progress = { d: Infinity, t: state.tick };
    goal = { kind: pick.kind, x: pick.x, s: pick.s, pickup: pick.pickup };
    // Feint (2.12): a short step toward him, then back to the plan.
    if (pick.kind === 'engage' && foe.respawn <= 0 && rand() < persona.feint) feintUntil = state.tick + 20;
    fire = rand() < L.trigger;
    if ((pick.kind === 'engage' || pick.kind === 'press') && rand() < L.jink) {
      jinkAt = state.tick + Math.floor(rand() * L.think);
      jinkAir = rand() < 0.4;
    }
    aimSign = (aimRand() - 0.5) * 2;
  };

  return (state: GameState): InputState => {
    const me = state.fighters[myId];
    const foe = state.fighters.find((f) => f.id !== myId)!;
    const out: InputState = { ...EMPTY_INPUT, aimX: me.x + me.facing * 5, aimY: me.y + 1 };
    if (state.phase !== 'fight') fightFrom = -1;
    else if (fightFrom < 0) fightFrom = state.tick;
    if (state.phase !== 'fight' || me.respawn > 0) {
      goal = null;
      seenSince = -1;
      last = out;
      return out;
    }
    const A = arenaOf(state);
    const g = graphFor(A, me.character);
    if (state.tick >= nextThink) {
      decide(state, me, foe);
      nextThink = state.tick + L.think + Math.floor(rand() * (L.thinkJitter + 1));
    }

    // ---- Perception: a hittable spot, the acquire delay, aim that tightens while he stays in sight (2.15).
    const spot = foe.respawn > 0 ? null : visibleAim(state, myId);
    // Memory: a blink behind a plank (< 0.5 s) does not reset the acquire delay or the aim.
    if (spot) {
      if (seenSince < 0) seenSince = state.tick;
      lastSeen = state.tick;
    } else if (seenSince >= 0 && state.tick - lastSeen > MEMORY_TICKS) seenSince = -1;
    const engagedS = seenSince >= 0 ? (state.tick - seenSince) / 60 : 0;
    const err = L.aimMin + (L.aim0 - L.aimMin) * Math.pow(0.5, engagedS / L.aimHalfLife);
    const dist = Math.hypot(foe.x - me.x, chestOf(foe) - me.y);
    if (spot) {
      let tx = spot.x;
      let ty = spot.y;
      // Lead: where he will be when the round gets there (rails are instant). Rockets: at the feet for splash.
      const sp = GUNS[me.weapon.kind].speed;
      const tf = me.weapon.kind === 'railgun' ? 0 : Math.min(0.6, dist / sp);
      tx += foe.vx * tf * L.lead;
      if (!foe.onGround) ty += (foe.vy * tf - 0.5 * 42 * tf * tf) * L.lead;
      if (me.weapon.kind === 'launcher' && foe.onGround) ty = foe.y + 0.25;
      out.aimX = tx;
      out.aimY = ty + aimSign * err * dist;
    } else if (foe.respawn <= 0) {
      // Pre-aim where he will show. The whole arena is on screen for the human too, so his position is known.
      out.aimX = foe.x;
      out.aimY = chestOf(foe);
    }

    // ---- Trigger discipline.
    const k = me.weapon.kind;
    const inReach = k === 'shotgun' ? dist < 8.5 : k === 'uzi' ? dist < 13 : k === 'launcher' ? dist > 3.2 : k === 'railgun' ? engagedS >= L.acquire / 60 + 0.25 : true; // the rail settles its aim first
    out.fire = !!spot && fire && inReach && seenSince >= 0 && state.tick - seenSince >= L.acquire;
    if (spot) {
      DEBUG.spot++;
      if (!fire) DEBUG.noTrigger++;
      else if (!inReach) DEBUG[`reach_${k}`] = (DEBUG[`reach_${k}`] ?? 0) + 1;
      else if (state.tick - seenSince < L.acquire) DEBUG.acquire++;
      if (me.weapon.reload > 0) DEBUG.reloading++;
      DEBUG[`goal_${goal?.kind}`] = (DEBUG[`goal_${goal?.kind}`] ?? 0) + 1;
    }

    // ---- Movement toward the goal, with micro-strafe on arrival (never a statue in the open, 2.13).
    let move: -1 | 0 | 1 = 0;
    if (goal) {
      const n = navInput(state, me, g, goal.s, goal.x, mem);
      move = n.move;
      out.up = n.up;
      out.down = n.down && !last.down;
      const d = Math.abs(goal.x - me.x) + Math.abs(goal.s.y - me.y);
      if (d < progress.d - 0.5) progress = { d, t: state.tick };
      else if (state.tick - progress.t > 120 && !n.arrived) {
        // Stuck guard: ban that surface for 4 s and re-decide.
        banned = { s: goal.s.id, until: state.tick + 240 };
        progress = { d: Infinity, t: state.tick };
        nextThink = state.tick;
      }
      if (n.arrived && me.onGround) {
        if (state.tick >= strafeUntil) {
          strafeDir = (-strafeDir) as -1 | 1;
          strafeUntil = state.tick + persona.strafeMin + Math.floor(rand() * 20);
        }
        const hw = CHARACTERS[me.character].width / 2;
        const s = goal.s;
        const lo = Math.max(s.x0 + hw, goal.x - 1.2);
        const hi = Math.min(s.x1 - hw, goal.x + 1.2);
        move = strafeDir;
        if (me.x <= lo) move = 1;
        if (me.x >= hi) move = -1;
        if (goal.kind === 'retreat' && exposure(A, me, foe, me.x, me.y) === 0) move = 0; // hidden: hold still and heal
      }
      if (goal.kind === 'gun') {
        const p = state.pickups.find((x) => x.id === goal!.pickup);
        if (p && p.active && Math.abs(p.x - me.x) < 0.9 && Math.abs(p.y - me.y) < 1) out.pickup = true;
        if (!p || !p.active) nextThink = Math.min(nextThink, state.tick + 2);
      }
    }
    if (state.tick < feintUntil && me.onGround) move = foe.x > me.x ? 1 : -1;
    // Jink: hop now and then while trading shots, sometimes with the air jump (2.13).
    if (jinkAt === state.tick && foe.respawn <= 0 && me.onGround) out.up = true;
    if (jinkAir && !me.onGround && me.vy < 1 && me.airJumps > 0 && state.tick - jinkAt < 40) {
      out.up = true;
      jinkAir = false;
    }

    // ---- Reflexes (per tick, chance-gated once per threat).
    reflexCd = Math.max(0, reflexCd - 1);
    const facingFoe = (foe.x > me.x ? 1 : -1) as 1 | -1;
    const dx = foe.x - me.x;
    const dy = foe.y - me.y;
    if (reflexCd === 0) {
      // Dodge (2.6): a rocket or bomb heading for me, or a bullet about to hit: dash (or jump) out of the line.
      let threat: { t: number; x: number; kind: string } | null = null;
      for (const p of state.projectiles) {
        if (p.owner === myId) continue;
        const rx = me.x - p.x;
        const ry = me.y + 1 - p.y;
        const vv = p.vx * p.vx + p.vy * p.vy;
        if (vv < 1) continue;
        const t = (rx * p.vx + ry * p.vy) / vv;
        if (t < 0 || t > 0.5) continue;
        const miss = Math.hypot(rx - p.vx * t, ry - p.vy * t);
        const big = p.kind === 'grenade' || p.kind === 'bomb';
        if (miss < (big ? 2.2 : 1.0) && (!threat || t < threat.t)) threat = { t, x: p.x, kind: p.kind };
      }
      if (threat) {
        reflexCd = 18;
        const big = threat.kind === 'grenade' || threat.kind === 'bomb';
        // Deflect with Force Push when it is in reach and in front (2.7).
        const front = Math.sign(threat.x - me.x) === facingFoe && Math.abs(threat.x - me.x) < PUSH.reach + 2.5;
        if (front && me.pushCooldown <= 0 && reflexRand() < L.deflect) {
          out.push = true;
          out.aimX = threat.x;
        } else if ((big || reflexRand() < 0.4) && me.dashCooldown <= 0 && reflexRand() < L.dodge) {
          out.dash = true;
          move = (threat.x < me.x ? 1 : -1) as 1 | -1;
          if (Math.abs(me.x - A.right) < 2 || Math.abs(me.x - A.left) < 2) move = (-move) as 1 | -1;
        } else if (big && reflexRand() < L.dodge) out.up = true;
        else if (!big && me.onGround && reflexRand() < L.duck) crouchUntil = state.tick + 18;
      }
      // Wall splat (2.7): he is in push reach with a wall close behind him.
      const wallBehind = dx > 0 ? A.right - foe.x : foe.x - A.left;
      if (foe.respawn <= 0 && Math.abs(dx) < PUSH.reach + 0.6 && Math.abs(dy) < 1.2 && me.pushCooldown <= 0 && foe.invulnerable <= 0) {
        reflexCd = Math.max(reflexCd, 12);
        const chance = wallBehind < 5 ? L.splat : L.splat * 0.35;
        if (reflexRand() < chance) out.push = true;
      }
      // BRIX Leapfrog (2.10): close and level, jump over him (the trait gives the dash back), then dash away.
      if (me.character === 'hotfix' && foe.respawn <= 0 && me.onGround && Math.abs(dx) < 2.8 && Math.abs(dy) < 0.5 && state.tick >= leapUntil + 60 && reflexRand() < L.leapfrog) {
        leapUntil = state.tick + 40;
        leapDir = facingFoe;
      }
    }
    if (state.tick < leapUntil) {
      move = leapDir;
      out.up = me.onGround || (me.airJumps > 0 && me.vy < 1 && me.y < foe.y + 2.2 && Math.sign(foe.x - me.x) === leapDir);
      if (!me.onGround && me.dashCooldown <= 0 && Math.sign(foe.x - me.x) === -leapDir) out.dash = true;
    }

    // Bomb: lob it when he is in range and roughly level or below.
    if (me.bombs > 0 && foe.respawn <= 0 && Math.abs(dx) > 4 && Math.abs(dx) < 11 && dy < 2 && reflexRand() < 0.05) out.throwBomb = true;
    // Reload when it is safe (he is down or hidden), not in his face (TAVO: Packed Extra, keeps firing longer).
    const cap = me.weapon.cap ?? GUNS[k].mag;
    const lowMag = me.weapon.mag < cap * (me.character === 'intern' ? 0.25 : 0.45);
    if (lowMag && me.weapon.reload <= 0 && (foe.respawn > 0 || (!spot && state.tick - lastSeen > 20)) && level !== 'easy') out.reload = true;

    out.left = move < 0;
    out.right = move > 0;
    out.crouch = state.tick < crouchUntil;
    // A box in the way on this level: hop it.
    if (move !== 0 && me.onGround) {
      const hw = CHARACTERS[me.character].width / 2;
      const ahead = me.x + move * (hw + 0.5);
      if (A.platforms.some((p) => isSolid(p) && me.y < p.y && me.y >= baseOf(p) - 0.05 && ahead > p.x0 && ahead < p.x1)) out.up = true;
    }
    // Edges only: a button must be released between presses (the sim acts on the press).
    for (const key of ['up', 'dash', 'push', 'pickup', 'reload', 'throwBomb'] as const) if (out[key] && last[key]) out[key] = false;
    last = out;
    return out;
  };
};
