/**
 * The bot (docs/systems/smart-bot.md). One entry point for offline play, the menu demo and the server bot:
 * createBot(myId, seed, level) => (state) => InputState.
 *
 * Layers (game-ai skill): perceive (facts) -> decide (utility over goals, every think) -> path (botNav.ts) ->
 * act (per-tick reflexes: aim, trigger, dodge, deflect, splat, leapfrog, duck).
 *
 * Rules: it reads the state and never writes it; every random draw comes from seeded streams, so a match replays
 * exactly from (seeds, inputs); no clock, no Math.random, no browser APIs. The spot scoring of one decision is spread
 * over DECIDE_SLICES ticks so no single call does all of it (server tick budget, plan step 5).
 */
import { graphFor, navInput, newNavMem, surfaceOf, surfaceUnder } from './botNav';
import { arenaOf, baseOf, CHARACTERS, CROUCH, GUNS, isSolid, PHYS, PUSH } from './constants';
import { bodyHeight, clearShot, visibleAim } from './step';
import { maxHp } from './traits';
import { EMPTY_INPUT } from './types';

import type { Surface } from './botNav';
import type { ArenaData } from './constants';
import type { Fighter, GameState, GunKind, InputState } from './types';

/** Small seeded PRNG so a bot is deterministic for a given seed. */
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export type BotLevel = 'easy' | 'normal' | 'hard';

/** Opening seconds of each fight in which the easy bot leaves guns alone (60 ticks a second). */
export const EASY_GUN_GRACE_TICKS = 15 * 60;

/** Difficulty as data (smart-bot.md section 4). Ticks are 1/60 s. */
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
  /** Reflex chances (per threat seen). `duck` is per shot it sees coming. */
  dodge: number;
  deflect: number;
  splat: number;
  duck: number;
  leapfrog: number;
  /**
   * BRIX only: chance per decision to set up a Leapfrog (walk to 3-5 m on his level, run, jump over him). Built, but
   * OFF (0) at every level: measured 0.03-0.24 Leapfrogs per BRIX match at 0.12 (target 1.0) and it cost BRIX about
   * 5 points vs the field at hard (43.8 -> 49.0 % with it off, tools/balance/results/smartbot-impl-roster-*). The
   * close-range reflex Leapfrog (`leapfrog`) stays on.
   */
  leapGoal: number;
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

/**
 * Tuned in tools/balance/smartbot (results in tools/balance/results/smartbot-*.md). The harness may override fields.
 * Normal differs from the spec table (section 4): trigger 0.85 -> 0.95, acquire 15 -> 12, aimMin 0.05 -> 0.04, which
 * brought the office rows (online plays the office) up to the targets without pushing OFFSITE out of them.
 */
export const LEVELS: Record<BotLevel, Level> = {
  easy: { think: 20, thinkJitter: 8, acquire: 24, aim0: 0.24, aimMin: 0.12, aimHalfLife: 2.5, trigger: 0.7, dodge: 0.1, deflect: 0, splat: 0.15, duck: 0.1, leapfrog: 0.03, leapGoal: 0, powerGuns: false, highGround: false, retreat: false, feint: 0, noise: 0.3, mistake: 0.2, aggression: -1, lead: 0, jink: 0.1 },
  normal: { think: 12, thinkJitter: 6, acquire: 12, aim0: 0.16, aimMin: 0.04, aimHalfLife: 1.5, trigger: 0.95, dodge: 0.45, deflect: 0.2, splat: 0.5, duck: 0.3, leapfrog: 0.08, leapGoal: 0, powerGuns: true, highGround: true, retreat: true, feint: 0.08, noise: 0.15, mistake: 0.08, aggression: 0, lead: 0.3, jink: 0.35 },
  hard: { think: 8, thinkJitter: 4, acquire: 10, aim0: 0.09, aimMin: 0.02, aimHalfLife: 1.0, trigger: 0.97, dodge: 0.7, deflect: 0.4, splat: 0.8, duck: 0.45, leapfrog: 0.14, leapGoal: 0, powerGuns: true, highGround: true, retreat: true, feint: 0.12, noise: 0.08, mistake: 0.03, aggression: 0.5, lead: 0.4, jink: 0.5 },
};

/** Preferred distance per gun (m), section 3.4. */
export const BAND: Record<GunKind, [number, number]> = { pistol: [6, 13], smg: [4, 10], uzi: [1.5, 5], shotgun: [0.8, 3.2], railgun: [10, 24], launcher: [6, 14], bomb: [5, 11] };
const GUN_VALUE: Record<GunKind, number> = { pistol: 1, uzi: 2, smg: 2.4, shotgun: 2.2, railgun: 4, launcher: 4, bomb: 0 };
const POWER: readonly GunKind[] = ['railgun', 'launcher'];
const CLOSE: readonly GunKind[] = ['shotgun', 'uzi'];

/** How long one duck lasts (ticks): long enough to let a shot pass, short enough to keep the bot moving. */
const DUCK_TICKS = 18;
/** How long a rival may be out of sight before the bot has to re-acquire him (ticks). */
const MEMORY_TICKS = 30;
/** Press bonus while ZUZU's Sugar Rush runs. */
const RUSH_PRESS = 0.4;
/** The spot scoring of one decision is spread over this many ticks. */
export const DECIDE_SLICES = 3;
/**
 * Weight of high ground in the spot score. The spec has 0.18 for any spot above him; here it counts only where the
 * bot has a shot (a plank between them blocks shots both ways in the sim, so a plank top without a shot is cover, not
 * high ground), and 0.28 keeps the climbing visible.
 */
const HIGH_W = 0.28;
/** A Leapfrog set-up is given up after this long (ticks). */
const LEAP_GOAL_TICKS = 150;

interface Spot {
  x: number;
  y: number;
  s: Surface;
}

/** Apex of a ground jump plus a margin (m). */
const hopHeight = (f: Fighter) => CHARACTERS[f.character].jump ** 2 / (2 * PHYS.gravity) + 0.3;
/** A platform top between 0.3 m and `h` above the fighter's feet, over its body: a hop could land it up there. */
const planeAbove = (A: ArenaData, f: Fighter, h: number) => {
  const hw = CHARACTERS[f.character].width / 2;
  return A.platforms.some((p) => p.y > f.y + 0.3 && p.y < f.y + h && f.x + hw + 0.6 > p.x0 && f.x - hw - 0.6 < p.x1);
};

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

export type GoalKind = 'engage' | 'gun' | 'retreat' | 'press' | 'idle' | 'leap';

interface Goal {
  kind: GoalKind;
  x: number;
  s: Surface;
  pickup?: number;
}

interface Option extends Goal {
  score: number;
}

/** One decision in progress: the gun options are scored at once, the standing spots a slice per tick. */
interface Job {
  options: Option[];
  next: number;
  per: number;
  bestE: { score: number; sp: Spot } | null;
  bestR: { score: number; sp: Spot } | null;
  near: number;
  far: number;
}

/** Read-only view of the bot's mind, for tests and the harness. */
export interface BotView {
  goal: GoalKind | null;
  goalX: number;
  goalY: number;
  /** BRIX is on a Leapfrog run (running at him, jumping over him). */
  leaping: boolean;
}

export type Bot = ((state: GameState) => InputState) & { view: () => BotView };

/**
 * Single-player opponent. It decides every few ticks what it wants (a spot to fight from, a better gun, cover to
 * heal behind, a push on a weak rival, a Leapfrog), walks real platform routes to it, and reacts every tick to what
 * comes at it. Its aim starts loose and tightens while you stay in view; it never knows more than the screen shows.
 */
export const createBot = (myId: number, seed = 42, level: BotLevel = 'normal'): Bot => {
  const L: Level = LEVELS[level];
  const rand = mulberry32(seed);
  const aimRand = mulberry32(seed ^ 0x5bd1e995);
  const reflexRand = mulberry32(seed ^ 0x2c1b3c6d);
  // Personality: drawn once per match so two matches do not look the same (2.13).
  const persona = {
    aggression: (rand() - 0.5) * 2.4 + L.aggression,
    high: 0.6 + rand() * 0.8,
    strafeMin: 18 + Math.floor(rand() * 14),
    feint: L.feint * (0.5 + rand()),
  };
  const mem = newNavMem();
  let last: InputState = { ...EMPTY_INPUT };
  let nextThink = 0;
  let job: Job | null = null;
  let goal: Goal | null = null;
  let goalSince = 0;
  // It reached the goal spot once: strafe around it (+-1.2 m) instead of walking back to it every time.
  let settled = false;
  let fire = false;
  let aimSign = 0;
  let seenSince = -1;
  let strafeDir: -1 | 1 = 1;
  let strafeUntil = 0;
  let feintUntil = -1;
  let crouchUntil = -1;
  let leapUntil = -1;
  let leapDir: -1 | 1 = 1;
  let leapJumped = false;
  let progress = { d: Infinity, t: 0 };
  let banned = { s: -1, until: -1 };
  let reflexCd = 0;
  let jinkAt = -1;
  let lastSeen = -1;
  let jinkAir = false;
  let fightFrom = -1;
  let lastTick = -1;
  // Shots it already rolled the duck die for (one roll per shot).
  let ducked = new Set<number>();
  const graceTicks = level === 'easy' ? EASY_GUN_GRACE_TICKS : 0;

  const chestOf = (f: Fighter) => f.y + bodyHeight(f) * 0.55;
  // Easy, per fighter (traits-balance.md section 10, F-084): an easy ZUZU climbs a little (her air jumps are what she
  // is), an easy ORMO pulls the trigger less (115 HP in an open-field slugfest is worth too much at easy).
  const highGround = (me: Fighter) => L.highGround || (level === 'easy' && me.character === 'standup');
  const highMul = (me: Fighter) => (level === 'easy' && me.character === 'standup' ? 0.6 : 1);
  const trigger = (me: Fighter) => (level === 'easy' && me.character === 'legacy' ? 0.6 : L.trigger);

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
  const travel = (me: Fighter, x: number, y: number) => (Math.abs(x - me.x) + 2 * Math.abs(y - me.y)) / 20;
  const noise = () => (rand() - 0.5) * 2 * L.noise;

  /** Where BRIX starts a Leapfrog run: 4 m from him on the surface he stands on (or hops over), with room to run. */
  const leapSpot = (g: ReturnType<typeof graphFor>, me: Fighter, foe: Fighter): { x: number; s: Surface } | null => {
    const fs = foe.onGround ? surfaceOf(g, foe) : surfaceUnder(g, foe.x, foe.y);
    const side = me.x < foe.x ? -1 : 1;
    const halfW = CHARACTERS[me.character].width / 2;
    const fits = (x: number) => x >= fs.x0 + halfW && x <= fs.x1 - halfW;
    const x = fits(foe.x + side * 4) ? foe.x + side * 4 : fits(foe.x - side * 4) ? foe.x - side * 4 : null;
    return x === null ? null : { x, s: fs };
  };

  /** Start a decision: guns, idle and the Leapfrog set-up now; the standing spots over the next ticks. */
  const beginDecide = (state: GameState, me: Fighter, foe: Fighter): Job => {
    const A = arenaOf(state);
    const g = graphFor(A, me.character);
    const here = me.onGround ? surfaceOf(g, me) : (goal?.s ?? g.surfaces[0]);
    const options: Option[] = [];
    const leaveGuns = graceTicks > 0 && state.tick - fightFrom < graceTicks;

    // Guns (2.4): value gain, minus distance; power guns first when allowed.
    const mineV = gunValue(me, me.weapon.kind) * (0.4 + 0.6 * ammoShare(me));
    if (!leaveGuns)
      for (const p of state.pickups) {
        if (!p.active || p.kind === 'bomb') continue;
        if (!L.powerGuns && POWER.includes(p.kind)) continue;
        const gain = gunValue(me, p.kind) - mineV;
        if (gain <= 0.3) continue;
        const s = surfaceUnder(g, p.x, p.y);
        if (s.id === banned.s && state.tick < banned.until) continue;
        const foeCloser = Math.hypot(foe.x - p.x, foe.y - p.y) < Math.hypot(me.x - p.x, me.y - p.y) - 2 && foe.respawn <= 0;
        // A power gun is a one-shot kill for whoever holds it: worth a long climb, and worth denying him.
        const powerBonus = POWER.includes(p.kind) ? 0.3 : 0;
        const score = 0.25 + gain * 0.28 + powerBonus - travel(me, p.x, p.y) * 0.35 - (foeCloser ? 0.15 : 0) + noise();
        options.push({ kind: 'gun', score, x: p.x, s, pickup: p.id });
      }

    if (foe.respawn > 0) {
      // Rival down: drift toward the middle and reload (see the reload rule below).
      options.push({ kind: 'idle', score: 0.3, x: me.x * 0.7, s: here });
    } else if (
      // BRIX Leapfrog set-up (2.10a): the trait gives the dash back, so it is a way in and a way out. Only when the
      // trait works (offline), it is off cooldown, and he stands on something.
      me.character === 'hotfix' &&
      state.traits &&
      (me.trait?.leapCd ?? 0) <= 0 &&
      Math.abs(foe.x - me.x) < 14 &&
      Math.abs(foe.y - me.y) < 5 &&
      rand() < L.leapGoal * (CLOSE.includes(me.weapon.kind) || me.dashCooldown <= 0 ? 1 : 0.4)
    ) {
      const at = leapSpot(g, me, foe);
      if (at) options.push({ kind: 'leap', score: 1.2, ...at });
    }

    const [near0, far0] = BAND[me.weapon.kind];
    const foeHp01 = foe.hp / maxHp(state, foe);
    const shift = persona.aggression + (foeHp01 < 0.4 ? 1.5 : 0) + (foe.weapon.reload > 0 ? 1 : 0);
    const near = Math.max(0.5, near0 - shift);
    const far = Math.max(near + 1.5, far0 - shift);
    const spots = foe.respawn > 0 ? 0 : spotsFor(A, me.character).length;
    return { options, next: 0, per: Math.ceil(spots / DECIDE_SLICES), bestE: null, bestR: null, near, far };
  };

  /** Score the next slice of standing spots (2.1, 2.2, 2.3, 2.11). */
  const scoreSlice = (state: GameState, me: Fighter, foe: Fighter, j: Job) => {
    if (foe.respawn > 0) return;
    const A = arenaOf(state);
    const all = spotsFor(A, me.character);
    const ranged = me.weapon.kind === 'pistol' || me.weapon.kind === 'smg' || me.weapon.kind === 'railgun' || me.weapon.kind === 'launcher';
    const foeRail = foe.weapon.kind === 'railgun';
    const end = Math.min(all.length, j.next + j.per);
    for (let i = j.next; i < end; i++) {
      const sp = all[i];
      if (sp.s.id === banned.s && state.tick < banned.until) continue;
      const r = Math.hypot(foe.x - sp.x, foe.y - sp.y);
      const fit = r < j.near ? Math.max(0, 1 - (j.near - r) / 4) : r > j.far ? Math.max(0, 1 - (r - j.far) / 8) : 1;
      const hit = canHitFrom(A, me, foe, sp.x, sp.y) ? 1 : 0;
      const exp = exposure(A, me, foe, sp.x, sp.y);
      // High ground is worth it only where it has a shot (a plank between them blocks both ways).
      const high = highGround(me) && ranged && hit ? Math.max(-1, Math.min(1, (sp.y - foe.y) / 4)) * HIGH_W * persona.high * highMul(me) : 0;
      const nearWall = Math.min(sp.x - A.left, A.right - sp.x) < 2.5 && r < 4 ? 0.25 : 0;
      const keep = goal && Math.abs(goal.x - sp.x) < 1.1 && goal.s.id === sp.s.id ? 0.08 : 0;
      const tr = travel(me, sp.x, sp.y);
      const e = 0.3 + fit * 0.35 + hit * 0.3 + (1 - exp) * (foeRail ? 0.25 : 0.12) + high - nearWall - tr * 0.5 + keep;
      if (!j.bestE || e > j.bestE.score) j.bestE = { score: e, sp };
      // Retreat: out of his sight and away from him.
      const rr = (1 - exp) * 0.6 + (Math.min(r, 14) / 14) * 0.3 - tr * 0.4 + keep;
      if (!j.bestR || rr > j.bestR.score) j.bestR = { score: rr, sp };
    }
    j.next = end;
  };

  /** Finish a decision: engage / retreat / press, then pick (the 2nd best with chance `mistake`). */
  const finishDecide = (state: GameState, me: Fighter, foe: Fighter, j: Job) => {
    const g = graphFor(arenaOf(state), me.character);
    const options = j.options;
    if (foe.respawn <= 0) {
      const hp01 = me.hp / maxHp(state, me);
      const foeHp01 = foe.hp / maxHp(state, foe);
      if (j.bestE) options.push({ kind: 'engage', score: 0.45 + j.bestE.score * 0.3 + noise(), x: j.bestE.sp.x, s: j.bestE.sp.s });
      if (j.bestR && L.retreat) {
        // ORMO (Tea Break) heals 1 s sooner: he falls back earlier and comes back sooner.
        const th = me.character === 'legacy' ? 0.6 : 0.42;
        const holding = goal?.kind === 'retreat' && hp01 < 0.9;
        const want = hp01 < th ? 0.55 + (1 - hp01 / th) * 0.5 : holding ? 0.62 : 0;
        const power = POWER.includes(me.weapon.kind) ? 0.3 : 0;
        if (want > 0) options.push({ kind: 'retreat', score: want - power + j.bestR.score * 0.1 + noise(), x: j.bestR.sp.x, s: j.bestR.sp.s });
      }
      // Press: he is weak, reloading, or ZUZU's Sugar Rush is on (2.10b, 2.14).
      const rush = me.character === 'standup' && (me.trait?.rush ?? 0) > 0;
      const pressW = (foeHp01 < 0.35 && hp01 > 0.5 ? 0.35 : 0) + (foe.weapon.reload > 0 ? 0.2 : 0) + (rush ? RUSH_PRESS : 0) + (CLOSE.includes(me.weapon.kind) ? 0.15 : 0);
      if (pressW > 0) {
        const fs = foe.onGround ? surfaceOf(g, foe) : surfaceUnder(g, foe.x, foe.y);
        const side = me.x < foe.x ? -1 : 1;
        options.push({ kind: 'press', score: 0.5 + pressW + noise(), x: foe.x + side * 1.2, s: fs });
      }
      // A hurt BRIX does not run at him for a Leapfrog.
      if (hp01 < 0.42) for (const o of options) if (o.kind === 'leap') o.score = 0;
    }
    options.sort((a, b) => b.score - a.score);
    const pick = options.length > 1 && rand() < L.mistake ? options[1] : options[0];
    if (!pick) return;
    if (!goal || goal.kind !== pick.kind || goal.s.id !== pick.s.id || Math.abs(goal.x - pick.x) > 0.6) {
      progress = { d: Infinity, t: state.tick };
      goalSince = state.tick;
      settled = false;
    }
    goal = { kind: pick.kind, x: pick.x, s: pick.s, pickup: pick.pickup };
    // Feint (2.12): a short step toward him, then back to the plan.
    if (pick.kind === 'engage' && foe.respawn <= 0 && rand() < persona.feint) feintUntil = state.tick + 20;
    fire = rand() < trigger(me);
    if ((pick.kind === 'engage' || pick.kind === 'press') && rand() < L.jink) {
      jinkAt = state.tick + Math.floor(rand() * L.think);
      jinkAir = rand() < 0.4;
    }
    aimSign = (aimRand() - 0.5) * 2;
  };

  /**
   * Duck, like a person: a bullet or pellet on its way that would hit a standing body but pass over a crouched one.
   * One roll per shot, at the level's chance; the next aimed shot still finds it.
   */
  const thinkCrouch = (state: GameState, me: Fighter) => {
    if (!me.onGround || state.tick < crouchUntil) return;
    const c = CHARACTERS[me.character];
    const low = me.y + c.height * CROUCH.height + 0.01;
    const top = me.y + c.height;
    const hw = c.width / 2 + 0.08;
    for (const p of state.projectiles) {
      if (p.owner === myId || (p.kind !== 'bullet' && p.kind !== 'pellet') || p.vx === 0 || ducked.has(p.id)) continue;
      // Where the shot crosses the near and the far side of the body: under the standing head, over the crouch.
      const side = p.vx > 0 ? -1 : 1;
      const tNear = (me.x + side * hw - p.x) / p.vx;
      const tFar = (me.x - side * hw - p.x) / p.vx;
      if (tNear < 0 || tNear > 0.45) continue;
      const y = Math.min(p.y + p.vy * tNear, p.y + p.vy * tFar);
      if (y <= low || y >= top) continue;
      ducked.add(p.id);
      if (reflexRand() < L.duck) {
        crouchUntil = state.tick + DUCK_TICKS;
        return;
      }
    }
    if (ducked.size > 64) ducked = new Set(state.projectiles.map((p) => p.id).filter((id) => ducked.has(id)));
  };

  const bot = (state: GameState): InputState => {
    const me = state.fighters[myId];
    const foe = state.fighters.find((f) => f.id !== myId)!;
    const out: InputState = { ...EMPTY_INPUT, aimX: me.x + me.facing * 5, aimY: me.y + 1 };
    lastTick = state.tick;
    if (state.phase !== 'fight') fightFrom = -1;
    else if (fightFrom < 0) fightFrom = state.tick;
    if (state.phase !== 'fight' || me.respawn > 0) {
      // Build the route graph and the standing spots while waiting (countdown, respawn), one per tick, so the first
      // fighting tick does not pay for them. Both are cached per arena x fighter.
      if (state.tick % 2 === 0) graphFor(arenaOf(state), me.character);
      else spotsFor(arenaOf(state), me.character);
      goal = null;
      job = null;
      seenSince = -1;
      leapUntil = -1;
      last = out;
      return out;
    }
    const A = arenaOf(state);
    const g = graphFor(A, me.character);

    // ---- Decide: a Leapfrog set-up is kept until it is run (or given up); otherwise re-think on the rhythm.
    const leapSetUp = goal?.kind === 'leap' && state.tick - goalSince < LEAP_GOAL_TICKS && foe.respawn <= 0 && (me.trait?.leapCd ?? 0) <= 0;
    if (!job && state.tick >= nextThink && !leapSetUp && state.tick >= leapUntil) {
      job = beginDecide(state, me, foe);
      nextThink = state.tick + L.think + Math.floor(rand() * (L.thinkJitter + 1));
    }
    if (job) {
      scoreSlice(state, me, foe, job);
      if (foe.respawn > 0 || job.next >= spotsFor(A, me.character).length) {
        finishDecide(state, me, foe, job);
        job = null;
      }
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
      if (!foe.onGround) ty += (foe.vy * tf - 0.5 * PHYS.gravity * tf * tf) * L.lead;
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

    // ---- Movement toward the goal, with micro-strafe on arrival (never a statue in the open, 2.11).
    let move: -1 | 0 | 1 = 0;
    const dx = foe.x - me.x;
    const dy = foe.y - me.y;
    const facingFoe = (dx > 0 ? 1 : -1) as 1 | -1;
    // A Leapfrog set-up follows him: the run-up spot moves with him.
    if (goal?.kind === 'leap' && foe.respawn <= 0) {
      const at = leapSpot(g, me, foe);
      if (at) Object.assign(goal, at);
    }
    if (goal) {
      const n = navInput(state, me, g, goal.s, goal.x, mem);
      move = n.move;
      out.up = n.up;
      out.down = n.down;
      const d = Math.abs(goal.x - me.x) + Math.abs(goal.s.y - me.y);
      if (d < progress.d - 0.5) progress = { d, t: state.tick };
      else if (state.tick - progress.t > 120 && !n.arrived) {
        // Stuck guard: ban that surface for 4 s and re-decide.
        banned = { s: goal.s.id, until: state.tick + 240 };
        progress = { d: Infinity, t: state.tick };
        nextThink = state.tick;
        if (goal.kind === 'leap') goal = null;
      }
      if (n.arrived) settled = true;
      const around = !!goal && settled && me.onGround && Math.abs(me.x - goal.x) < 1.4 && Math.abs(me.y - goal.s.y) < 0.1;
      if (goal && (n.arrived || around) && me.onGround && goal.kind !== 'leap') {
        const hw = CHARACTERS[me.character].width / 2;
        const s = goal.s;
        const lo = Math.max(s.x0 + hw, goal.x - 1.2);
        const hi = Math.min(s.x1 - hw, goal.x + 1.2);
        if (state.tick >= strafeUntil) {
          strafeDir = (-strafeDir) as -1 | 1;
          strafeUntil = state.tick + persona.strafeMin + Math.floor(rand() * 20);
          // No room to strafe (a box top): hop in place instead of standing still in the open.
          if (hi - lo < 1.2 && goal.kind !== 'retreat' && !planeAbove(A, me, hopHeight(me))) out.up = true;
        }
        move = strafeDir;
        if (me.x <= lo) move = 1;
        if (me.x >= hi) move = -1;
        if (goal.kind === 'retreat' && exposure(A, me, foe, me.x, me.y) === 0) move = 0; // hidden: hold still and heal
      }
      if (goal && goal.kind === 'gun') {
        const p = state.pickups.find((x) => x.id === goal!.pickup);
        if (p && p.active && Math.abs(p.x - me.x) < 0.9 && Math.abs(p.y - me.y) < 1) out.pickup = true;
        if (!p || !p.active) nextThink = Math.min(nextThink, state.tick + 2);
      }
      // Leapfrog set-up: on his surface, close, and he stands still or comes at her (a rival running away cannot be
      // jumped over): go.
      const foeComing = foe.vx * -facingFoe;
      if (goal && goal.kind === 'leap' && me.onGround && foe.onGround && surfaceOf(g, me).id === surfaceOf(g, foe).id && Math.abs(dx) > 1.8 && Math.abs(dx) < 4.8 && (foeComing > 2 || Math.abs(foe.vx) < 5) && state.tick >= leapUntil) {
        leapUntil = state.tick + 70;
        leapDir = facingFoe;
        leapJumped = false;
        goal = null;
        nextThink = state.tick + 70;
      }
    }
    if (state.tick < feintUntil && me.onGround) move = facingFoe;
    // Jink: hop now and then while trading shots, sometimes with the air jump (2.11).
    // A jink never lands it on the plank above (it would then have to walk back down: it reads as lost).
    if (jinkAt === state.tick && foe.respawn <= 0 && me.onGround && !planeAbove(A, me, hopHeight(me))) out.up = true;
    if (jinkAir && !me.onGround && me.vy < 1 && me.airJumps > 0 && state.tick - jinkAt < 40 && !planeAbove(A, me, hopHeight(me) * 1.8)) {
      out.up = true;
      jinkAir = false;
    }

    // ---- Reflexes (per tick, chance-gated once per threat).
    thinkCrouch(state, me);
    reflexCd = Math.max(0, reflexCd - 1);
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
        // Deflect with Force Push when it is in reach and in front (2.7b).
        const front = Math.sign(threat.x - me.x) === facingFoe && Math.abs(threat.x - me.x) < PUSH.reach + 2.5;
        if (front && me.pushCooldown <= 0 && reflexRand() < L.deflect) {
          out.push = true;
          out.aimX = threat.x;
        } else if ((big || reflexRand() < 0.4) && me.dashCooldown <= 0 && reflexRand() < L.dodge) {
          out.dash = true;
          move = (threat.x < me.x ? 1 : -1) as 1 | -1;
          if (Math.abs(me.x - A.right) < 2 || Math.abs(me.x - A.left) < 2) move = (-move) as 1 | -1;
        } else if (big && reflexRand() < L.dodge) out.up = true;
      }
      // Wall splat (2.7a): he is in push reach with a wall close behind him.
      const wallBehind = dx > 0 ? A.right - foe.x : foe.x - A.left;
      if (foe.respawn <= 0 && Math.abs(dx) < PUSH.reach + 0.6 && Math.abs(dy) < 1.2 && me.pushCooldown <= 0 && foe.invulnerable <= 0) {
        reflexCd = Math.max(reflexCd, 6);
        const chance = wallBehind < 5 ? L.splat : L.splat * 0.35;
        if (reflexRand() < chance) out.push = true;
      }
      // BRIX Leapfrog (2.10a) when the chance comes: close and level, jump over him, then dash away.
      if (me.character === 'hotfix' && state.traits && (me.trait?.leapCd ?? 0) <= 0 && me.hp / maxHp(state, me) >= 0.42 && foe.respawn <= 0 && me.onGround && Math.abs(dx) < 2.8 && Math.abs(dy) < 0.5 && state.tick >= leapUntil + 60 && reflexRand() < L.leapfrog) {
        leapUntil = state.tick + 40;
        leapDir = facingFoe;
        leapJumped = false;
      }
    }
    if (state.tick < leapUntil) {
      // Run at him and take off so the jump's apex (0.39 s for BRIX) comes as she passes over him: her feet clear
      // his head on the way over. Air-jump if she is still low.
      // Nothing else jumps or dashes for her meanwhile (a dodge dash in the air would flatten the arc).
      move = leapDir;
      out.up = false;
      out.dash = false;
      const ahead = Math.sign(foe.x - me.x) === leapDir;
      const closing = (me.vx - foe.vx) * leapDir;
      const tCross = Math.abs(dx) / Math.max(closing, 0.1);
      if (me.onGround) {
        if (leapJumped) leapUntil = state.tick; // landed: done
        // He left her surface before she took off (jumped up, dropped down): call it off.
        else if (!foe.onGround ? foe.y < me.y - 0.5 || foe.y > me.y + 2 : surfaceOf(g, foe).id !== surfaceOf(g, me).id) leapUntil = state.tick;
        else if (ahead && (Math.abs(dx) < 2.9 || (closing > 6 && tCross < 0.3))) {
          out.up = true;
          leapJumped = true;
        }
      } else if (ahead && me.airJumps > 0 && me.vy < 0 && Math.abs(dx) > 0.8 && me.y < foe.y + bodyHeight(foe) + 0.9) out.up = true; // stay up until she is over him
      if (!me.onGround && !ahead && me.dashCooldown <= 0) out.dash = true; // over him: the dash came back
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
    for (const key of ['up', 'down', 'dash', 'push', 'pickup', 'reload', 'throwBomb'] as const) if (out[key] && last[key]) out[key] = false;
    last = out;
    return out;
  };

  return Object.assign(bot, {
    view: (): BotView => ({ goal: goal?.kind ?? null, goalX: goal?.x ?? 0, goalY: goal?.s.y ?? 0, leaping: lastTick < leapUntil }),
  });
};
