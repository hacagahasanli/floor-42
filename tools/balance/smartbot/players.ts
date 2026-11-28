/**
 * Scripted test players for bot difficulty acceptance (docs/systems/smart-bot.md section 5).
 * Each one uses AUTO-AIM, exactly like a keyboard player on the default setting (game.ts autoAim: the gun follows the
 * rival's chest, or the part showing over cover; fully hidden, it points ahead). Same signature as createBot.
 *
 * - masher:  the 2026-11-28 playtest masher. Alternates A/D every ~1.1 s, taps Space (fire) every 140 ms, W every ~0.4 s.
 *            Never picks a gun on purpose (walking over one with the pistol takes it, as for anyone).
 * - strafer: holds fire whenever the rival shows, strafes back and forth at 5-12 m, jumps after a rival above,
 *            reloads when the rival is down. A player who has learned "move and shoot".
 * - decent:  a scripted good player: 200 ms decisions, gun-aware range, walks (with platform routes) to better guns and
 *            the power gun, dashes away from rockets, Force Push when the rival is in reach, throws bombs, falls back
 *            to heal when hurt. Perfect auto-aim, no aim error. [Assumption] stands in for "a decent human".
 */
import { arenaOf, baseOf, CHARACTERS, GUNS, isSolid } from '../../../src/game/sim/constants';
import { visibleAim } from '../../../src/game/sim/step';
import { EMPTY_INPUT } from '../../../src/game/sim/types';
import { graphFor, navInput, newNavMem, surfaceUnder } from '../../../src/game/sim/botNav';

import type { GameState, GunKind, InputState } from '../../../src/game/sim/types';

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export type Brain = (s: GameState) => InputState;

const autoAim = (s: GameState, id: number) => {
  const me = s.fighters[id];
  const foe = s.fighters[1 - id];
  const spot = foe.respawn > 0 ? null : visibleAim(s, id);
  return { spot, x: spot ? spot.x : me.x + me.facing * 5, y: spot ? spot.y : me.y + 1.1 };
};

/** The keyboard masher from docs/playtest/2026-11-28-old-vs-new.md. */
export const createMasher = (id: number, seed: number): Brain => {
  const rand = mulberry32(seed);
  let dir: -1 | 1 = rand() < 0.5 ? -1 : 1;
  let nextSwap = 66;
  let nextJump = 24;
  let lastUp = false;
  return (s) => {
    const a = autoAim(s, id);
    if (s.tick >= nextSwap) {
      dir = (-dir) as -1 | 1;
      nextSwap = s.tick + 60 + Math.floor(rand() * 13); // ~1.1 s
    }
    let up = false;
    if (s.tick >= nextJump) {
      up = !lastUp;
      nextJump = s.tick + 21 + Math.floor(rand() * 6); // ~0.4 s
    }
    lastUp = up;
    // Space tapped every 140 ms, held ~60 ms per tap.
    const fire = s.tick % 8 < 4;
    return { ...EMPTY_INPUT, left: dir < 0, right: dir > 0, up, fire, aimX: a.x, aimY: a.y };
  };
};

/** Move-and-shoot player: holds fire on sight, strafes at mid range. */
export const createStrafer = (id: number, seed: number): Brain => {
  const rand = mulberry32(seed);
  let dir: -1 | 1 = 1;
  let until = 0;
  let last: InputState = { ...EMPTY_INPUT };
  return (s) => {
    const me = s.fighters[id];
    const foe = s.fighters[1 - id];
    const a = autoAim(s, id);
    const out: InputState = { ...EMPTY_INPUT, aimX: a.x, aimY: a.y };
    if (s.phase !== 'fight' || me.respawn > 0) return (last = out);
    const dx = foe.x - me.x;
    const dist = Math.abs(dx);
    if (s.tick >= until) {
      until = s.tick + 30 + Math.floor(rand() * 40);
      if (foe.respawn > 0) dir = rand() < 0.5 ? -1 : 1;
      else if (dist > 12) dir = dx > 0 ? 1 : -1;
      else if (dist < 5) dir = dx > 0 ? -1 : 1;
      else dir = rand() < 0.5 ? -1 : 1;
    }
    if (me.wall !== 0) dir = (-me.wall) as -1 | 1;
    out.left = dir < 0;
    out.right = dir > 0;
    out.fire = a.spot !== null;
    const wantUp = (foe.y > me.y + 1.5 && rand() < 0.08) || rand() < 0.01;
    out.up = wantUp && !last.up;
    if (foe.y < me.y - 1.5 && me.onGround && rand() < 0.03) out.down = true;
    if (foe.respawn > 0 && me.weapon.mag < GUNS[me.weapon.kind].mag / 2) out.reload = !last.reload;
    // Hop a box in the way instead of running into it.
    if (!last.up && me.onGround) {
      const ahead = me.x + dir * (CHARACTERS[me.character].width / 2 + 0.5);
      if (arenaOf(s).platforms.some((p) => isSolid(p) && me.y < p.y && me.y >= baseOf(p) - 0.05 && ahead > p.x0 && ahead < p.x1)) out.up = true;
    }
    return (last = out);
  };
};

const GUN_VALUE: Record<GunKind, number> = { pistol: 1, uzi: 2, smg: 2.4, shotgun: 2.1, railgun: 4, launcher: 4, bomb: 0 };
const BAND: Record<GunKind, [number, number]> = { pistol: [5, 12], smg: [4, 10], uzi: [1.5, 5], shotgun: [1, 3.5], railgun: [10, 22], launcher: [6, 14], bomb: [5, 11] };

/** A scripted good player (see header). */
export const createDecent = (id: number, seed: number): Brain => {
  const rand = mulberry32(seed);
  const mem = newNavMem();
  let last: InputState = { ...EMPTY_INPUT };
  let goal = { x: 0, y: 0 };
  let strafe: -1 | 1 = 1;
  return (s) => {
    const me = s.fighters[id];
    const foe = s.fighters[1 - id];
    const a = autoAim(s, id);
    const out: InputState = { ...EMPTY_INPUT, aimX: a.x, aimY: a.y };
    if (s.phase !== 'fight' || me.respawn > 0) return (last = out);
    const A = arenaOf(s);
    const g = graphFor(A, me.character);
    const dist = Math.abs(foe.x - me.x);
    if (s.tick % 12 === 0) {
      // Decide every 200 ms: a better gun within reach, else the gun's range band; fall back when hurt.
      const mine = GUN_VALUE[me.weapon.kind];
      const best = s.pickups
        .filter((p) => p.active && p.kind !== 'bomb' && GUN_VALUE[p.kind] > mine + 0.5)
        .map((p) => ({ p, v: GUN_VALUE[p.kind] - Math.hypot(p.x - me.x, p.y - me.y) * 0.12 }))
        .sort((x, y) => y.v - x.v)[0];
      const hurt = me.hp < 45 && foe.respawn <= 0;
      if (best && best.v > mine) goal = { x: best.p.x, y: best.p.y };
      else if (foe.respawn > 0) goal = { x: me.x, y: me.y };
      else if (hurt) goal = { x: foe.x < 0 ? A.right - 3 : A.left + 3, y: 0 };
      else {
        const [near, far] = BAND[me.weapon.kind];
        if (rand() < 0.4) strafe = (-strafe) as -1 | 1;
        const side = me.x < foe.x ? -1 : 1;
        const want = dist < near ? foe.x + side * near : dist > far ? foe.x + side * far : me.x + strafe * 1.5;
        goal = { x: Math.min(Math.max(want, A.left + 1), A.right - 1), y: foe.y };
      }
    }
    const surf = surfaceUnder(g, goal.x, goal.y + 0.05);
    const n = navInput(s, me, g, surf, goal.x, mem);
    out.left = n.move < 0;
    out.right = n.move > 0;
    out.up = n.up && !last.up;
    out.down = n.down && !last.down;
    out.fire = a.spot !== null && !(me.weapon.kind === 'shotgun' && dist > 6);
    const on = s.pickups.some((p) => p.active && Math.abs(p.x - me.x) < 0.9 && Math.abs(p.y - me.y) < 1 && GUN_VALUE[p.kind] > GUN_VALUE[me.weapon.kind]);
    if (on) out.pickup = !last.pickup;
    // Dash out of a rocket's path; push when the rival is in reach.
    const rocket = s.projectiles.some((p) => p.owner !== id && (p.kind === 'grenade' || p.kind === 'bomb') && Math.hypot(p.x - me.x, p.y - me.y) < 4.5);
    if (rocket && me.dashCooldown <= 0) out.dash = !last.dash;
    if (dist < 2.6 && Math.abs(foe.y - me.y) < 1.2 && me.pushCooldown <= 0 && foe.respawn <= 0) out.push = !last.push;
    if (me.bombs > 0 && dist > 4 && dist < 12 && foe.respawn <= 0) out.throwBomb = !last.throwBomb;
    if (foe.respawn > 0 && me.weapon.mag < GUNS[me.weapon.kind].mag) out.reload = !last.reload;
    if (n.move !== 0 && !last.up && me.onGround) {
      const ahead = me.x + n.move * (CHARACTERS[me.character].width / 2 + 0.5);
      if (A.platforms.some((p) => isSolid(p) && me.y < p.y && me.y >= baseOf(p) - 0.05 && ahead > p.x0 && ahead < p.x1)) out.up = true;
    }
    return (last = out);
  };
};
