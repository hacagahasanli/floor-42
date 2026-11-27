import { ARENA, baseOf, CHARACTERS, CROUCH, isSolid } from './constants';
import { bodyHeight, visibleAim } from './step';
import { EMPTY_INPUT } from './types';

import type { GameState, GunKind, InputState } from './types';

/** Small seeded PRNG so a bot is deterministic for a given seed. */
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export type BotLevel = 'easy' | 'normal' | 'hard';

/** `crouch`: the chance to duck a shot it sees coming. */
const LEVELS: Record<BotLevel, { reaction: number; aimError: number; trigger: number; dodge: number; crouch: number }> = {
  easy: { reaction: 16, aimError: 0.22, trigger: 0.45, dodge: 0.05, crouch: 0.15 },
  normal: { reaction: 10, aimError: 0.12, trigger: 0.7, dodge: 0.15, crouch: 0.3 },
  hard: { reaction: 6, aimError: 0.05, trigger: 0.9, dodge: 0.3, crouch: 0.45 },
};

/** How long one duck lasts (ticks): long enough to let a shot pass, short enough to keep the bot moving. */
const DUCK_TICKS = 18;
/** Opening seconds of each fight in which the easy bot leaves guns alone (60 ticks a second). */
export const EASY_GUN_GRACE_TICKS = 15 * 60;

/** Preferred distance to the target for each gun. */
const RANGE: Record<GunKind, [number, number]> = {
  pistol: [8, 15],
  smg: [6, 11],
  shotgun: [1.5, 3.5],
  railgun: [12, 24],
  launcher: [9, 16],
  uzi: [2, 5],
  bomb: [5, 11], // not held any more (bombs have their own slot); kept so the table covers every GunKind
};

type Press = 'up' | 'down' | 'dash' | 'pickup' | 'push' | 'reload' | 'throwBomb';

interface Plan {
  move: -1 | 0 | 1;
  presses: Press[];
  fire: boolean;
  aimErr: number;
}

/**
 * Single-player opponent. It re-thinks every few ticks (a human-like reaction
 * delay), aims at your chest with an error that depends on the level, and keeps
 * the distance its gun likes.
 */
export const createBot = (myId: number, seed = 42, level: BotLevel = 'normal') => {
  const rand = mulberry32(seed);
  // Crouch decisions draw from their own stream, so the rest of the bot's choices stay as they were.
  const crouchRand = mulberry32(seed ^ 0x5bd1e995);
  const cfg = LEVELS[level];
  let plan: Plan = { move: 0, presses: [], fire: false, aimErr: 0 };
  let last: InputState = { ...EMPTY_INPUT };
  let crouchUntil = -1;
  // Easy bot: no detours to guns in the opening seconds of a fight (playtest 2026-11-27: a new player met a rocket
  // launcher two seconds in). The sim's gunGrace option stops it taking one it walks over.
  const gunGraceTicks = level === 'easy' ? EASY_GUN_GRACE_TICKS : 0;
  let fightFrom = -1;

  /**
   * Crouch now and then, like a person: duck a bullet or pellet on its way that would hit a standing body but
   * pass over a crouched one. The chance depends on the level, and the next aimed shot still finds it.
   */
  const thinkCrouch = (state: GameState) => {
    const me = state.fighters[myId];
    if (state.phase !== 'fight' || me.respawn > 0 || !me.onGround || state.tick < crouchUntil) return;
    const c = CHARACTERS[me.character];
    const low = me.y + c.height * CROUCH.height + 0.01;
    const top = me.y + c.height;
    const hw = c.width / 2 + 0.08;
    // Where the shot crosses the near and the far side of the body: under the standing head, over the crouch.
    const incoming = state.projectiles.some((p) => {
      if (p.owner === myId || (p.kind !== 'bullet' && p.kind !== 'pellet') || p.vx === 0) return false;
      const side = p.vx > 0 ? -1 : 1;
      const tNear = (me.x + side * hw - p.x) / p.vx;
      const tFar = (me.x - side * hw - p.x) / p.vx;
      if (tNear < 0 || tNear > 0.45) return false;
      const y = Math.min(p.y + p.vy * tNear, p.y + p.vy * tFar);
      return y > low && y < top;
    });
    if (incoming && crouchRand() < cfg.crouch) crouchUntil = state.tick + DUCK_TICKS;
  };

  const think = (state: GameState): Plan => {
    const me = state.fighters[myId];
    const foe = state.fighters.find((f) => f.id !== myId)!;
    const presses: Press[] = [];
    let move: -1 | 0 | 1 = 0;
    const aimErr = (rand() - 0.5) * 2 * cfg.aimError;
    if (state.phase !== 'fight') fightFrom = -1;
    else if (fightFrom < 0) fightFrom = state.tick;
    if (state.phase !== 'fight' || me.respawn > 0) return { move, presses, fire: false, aimErr };
    const leaveGuns = gunGraceTicks > 0 && state.tick - fightFrom < gunGraceTicks;

    const dx = foe.x - me.x;
    const dy = foe.y - me.y;
    const dist = Math.abs(dx);
    const toFoe = (dx < 0 ? -1 : 1) as -1 | 1;

    // A carried bomb goes at a rival who is in lobbing range (no random draw: the rest of the plan is unchanged).
    if (me.bombs > 0 && foe.respawn <= 0 && dist >= 3.5 && dist <= 13) presses.push('throwBomb');

    // Only a pistol: a better gun nearby is worth a detour.
    if (me.weapon.kind === 'pistol' && !leaveGuns) {
      const gun = state.pickups
        // The easy bot never goes out of its way for the power weapons (playtest: it closed matches with rockets).
        .filter((p) => p.active && Math.abs(p.y - me.y) < 3.5 && !(level === 'easy' && (p.kind === 'launcher' || p.kind === 'railgun')))
        .sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x))[0];
      if (gun && Math.abs(gun.x - me.x) < 9) {
        move = gun.x < me.x ? -1 : 1;
        if (gun.y > me.y + 0.8 && rand() < 0.6) presses.push('up');
        if (gun.y < me.y - 0.5 && me.onGround) presses.push('down');
        return { move, presses, fire: foe.respawn <= 0 && rand() < cfg.trigger, aimErr };
      }
    }

    if (foe.respawn > 0) {
      if (me.weapon.mag < 3) presses.push('reload');
      return { move: (me.x < 0 ? 1 : -1) as -1 | 1, presses, fire: false, aimErr };
    }

    // Keep the distance the gun likes: back off when they close in, drift in when too far,
    // otherwise hold position and strafe a little. Wounded bots play even further back.
    const [near, far] = RANGE[me.weapon.kind];
    const wounded = me.hp <= 50 ? 3 : 0;
    if (dist < near + wounded) {
      move = (-toFoe) as -1 | 1;
      if (me.wall !== 0 || Math.abs(me.x) > 16) presses.push('up'); // cornered: get over them
    } else if (dist > far + wounded) {
      move = rand() < 0.7 ? toFoe : 0;
    } else {
      const r = rand();
      move = r < 0.25 ? -1 : r < 0.5 ? 1 : 0;
    }

    if (dist < 2.4 && me.pushCooldown <= 0 && Math.abs(dy) < 1.2 && rand() < 0.5) presses.push('push');
    if (foe.firing < 0.2 && me.dashCooldown <= 0 && rand() < cfg.dodge) presses.push('dash');
    if (dy > 1.2 && rand() < 0.6) presses.push('up');
    if (dy < -1.2 && me.onGround && me.y > 0.1 && rand() < 0.6) presses.push('down');
    if (me.wall !== 0 && rand() < 0.5) presses.push('up');
    if (rand() < 0.06) presses.push('up');
    const fire = rand() < cfg.trigger;
    // Hidden behind a desk or a box: close in (the hop below takes it over the cover) instead of holding back.
    if (!visibleAim(state, myId)) move = toFoe;

    return { move, presses, fire, aimErr };
  };

  return (state: GameState): InputState => {
    if (state.tick % cfg.reaction === 0) {
      plan = think(state);
      thinkCrouch(state);
    }
    const me = state.fighters[myId];
    const foe = state.fighters.find((f) => f.id !== myId)!;
    // Track the target every tick (lower when it crouches, the head over a desk); the error is fixed per decision,
    // like a shaky hand. A rival fully hidden behind cover is not shot at: the rounds would only hit the desk.
    const spot = foe.respawn > 0 ? null : visibleAim(state, myId);
    const tx = foe.x;
    const ty = spot ? spot.y : foe.y + bodyHeight(foe) * 0.55;
    const d = Math.hypot(tx - me.x, ty - me.y);
    const out: InputState = {
      ...EMPTY_INPUT,
      left: plan.move < 0,
      right: plan.move > 0,
      fire: plan.fire && spot !== null,
      aimX: tx,
      aimY: ty + plan.aimErr * d,
      crouch: state.tick < crouchUntil,
    };
    for (const p of plan.presses) out[p] = !last[p];
    // A desk, the table, the counter or a box in the way on your level: hop onto it instead of running
    // into its side, and jump again near the top of the hop if it is taller than one jump.
    if (plan.move !== 0 && !last.up) {
      const halfW = CHARACTERS[me.character].width / 2;
      const ahead = me.x + plan.move * (halfW + 0.5);
      const blocked = ARENA.platforms.some(
        (p) => isSolid(p) && me.y < p.y && me.y >= baseOf(p) - 0.05 && ahead > p.x0 && ahead < p.x1,
      );
      if (blocked && (me.onGround || (me.airJumps > 0 && me.vy < 1))) out.up = true;
    }
    last = out;
    return out;
  };
};
