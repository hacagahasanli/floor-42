import { decodeInput, encodeInput } from './protocol-input';

import type { Fighter, GameState, Pickup, Projectile } from '../sim/types';

/**
 * Compact form of a GameState for the wire (protocol version 3).
 *
 * The state is a few dozen named floats per fighter; as JSON that is 2.6 KB idle and up to 7.9 KB
 * in a fight. Here every object becomes a row of numbers in a fixed column order, and floats are
 * rounded to a fixed step. The column tables below are the format: a test fails when the
 * simulation grows a field that is not listed, so the wire cannot silently lose state.
 *
 * Steps (error at most half a step): positions, velocities, health and damage 0.01 (a centimetre);
 * angles and timers 0.001 (a millisecond is 0.06 of a tick). Integers, ids, the random seed and
 * strings travel exactly. Infinity (the pistol's reserve, a gun that never respawns) is a code.
 * Rounding is idempotent: expanding and compacting again changes nothing, so a state that has been
 * on the wire stays on the wire as it is.
 */

type Kind = 'e' | 'b' | 'p' | 'in' | number; // exact | boolean | passthrough with Infinity | input | scale
interface Col {
  k: string;
  t: Kind;
  /** May be absent on the object (written as null, left out again when read). */
  o?: boolean;
}

const INF = 2147483647;

const FIGHTER: Col[] = [
  { k: 'id', t: 'e' },
  { k: 'character', t: 'e' },
  { k: 'x', t: 100 },
  { k: 'y', t: 100 },
  { k: 'vx', t: 100 },
  { k: 'vy', t: 100 },
  { k: 'facing', t: 'e' },
  { k: 'aim', t: 1000 },
  { k: 'aimTx', t: 100 },
  { k: 'aimTy', t: 100 },
  { k: 'onGround', t: 'b' },
  { k: 'wall', t: 'e' },
  { k: 'airJumps', t: 'e' },
  { k: 'airDashes', t: 'e' },
  { k: 'dashTime', t: 1000 },
  { k: 'dashCooldown', t: 1000 },
  { k: 'dropTime', t: 1000 },
  { k: 'crouch', t: 1000 },
  { k: 'hp', t: 100 },
  { k: 'kos', t: 'e' },
  { k: 'stun', t: 1000 },
  { k: 'pushCooldown', t: 1000 },
  { k: 'pushTime', t: 1000 },
  { k: 'pushHit', t: 'e' },
  { k: 'pushed', t: 1000 },
  { k: 'respawn', t: 1000 },
  { k: 'invulnerable', t: 1000 },
  { k: 'sinceHit', t: 100 },
  { k: 'bombs', t: 'e' },
  { k: 'nextCharacter', t: 'e' },
  { k: 'firing', t: 1000 },
  { k: 'lastHitBy', t: 'e' },
  { k: 'weapon.kind', t: 'e' },
  { k: 'weapon.mag', t: 'e' },
  { k: 'weapon.reserve', t: 'p' },
  { k: 'weapon.cooldown', t: 1000 },
  { k: 'weapon.reload', t: 1000 },
  { k: 'stats.damage', t: 100 },
  { k: 'stats.shots', t: 'e' },
  { k: 'stats.hits', t: 'e' },
  { k: 'stats.deaths', t: 'e' },
  { k: 'stats.streak', t: 'e' },
  { k: 'stats.bestStreak', t: 'e' },
  { k: 'prev', t: 'in' },
  { k: 'pickupHold', t: 1000, o: true },
  { k: 'pickupHoldId', t: 'e', o: true },
];

const PICKUP: Col[] = [
  { k: 'id', t: 'e' },
  { k: 'kind', t: 'e' },
  { k: 'x', t: 100 },
  { k: 'y', t: 100 },
  { k: 'vy', t: 100 },
  { k: 'active', t: 'b' },
  { k: 'respawn', t: 1000 },
  { k: 'spawn', t: 'e' },
];

const PROJECTILE: Col[] = [
  { k: 'id', t: 'e' },
  { k: 'kind', t: 'e' },
  { k: 'gun', t: 'e' },
  { k: 'ox', t: 100 },
  { k: 'oy', t: 100 },
  { k: 'owner', t: 'e' },
  { k: 'x', t: 100 },
  { k: 'y', t: 100 },
  { k: 'vx', t: 100 },
  { k: 'vy', t: 100 },
  { k: 'damage', t: 100 },
  { k: 'knockback', t: 100 },
  { k: 'life', t: 1000 },
  { k: 'hit', t: 'e' },
];

/** The fields of GameState itself; the lists (fighters, pickups, projectiles) follow separately. */
const TOP: Col[] = [
  { k: 'tick', t: 'e' },
  { k: 'phase', t: 'e' },
  { k: 'phaseTime', t: 1000 },
  { k: 'winner', t: 'e' },
  { k: 'endReason', t: 'e' },
  { k: 'paused', t: 'b' },
  { k: 'hitstop', t: 1000 },
  { k: 'net', t: 'b', o: true },
  { k: 'kosToWin', t: 'e', o: true },
  { k: 'assist', t: 'b', o: true },
  { k: 'seed', t: 'e' },
  { k: 'dropTimer', t: 1000 },
  { k: 'nextId', t: 'e' },
];

/** Every key the compact form covers, for the test that guards against a forgotten field. */
export const WIRE_KEYS = {
  fighter: FIGHTER.map((c) => c.k.split('.')[0]),
  pickup: PICKUP.map((c) => c.k),
  projectile: PROJECTILE.map((c) => c.k),
  top: [...TOP.map((c) => c.k), 'fighters', 'pickups', 'projectiles', 'events'],
};

const get = (o: object, path: string): unknown => {
  let v: unknown = o;
  for (const p of path.split('.')) v = (v as Record<string, unknown>)[p];
  return v;
};
const set = (o: object, path: string, val: unknown) => {
  const parts = path.split('.');
  let cur = o as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) cur = (cur[parts[i]] ??= {}) as Record<string, unknown>;
  cur[parts[parts.length - 1]] = val;
};

const enc = (v: unknown, t: Kind): unknown => {
  if (t === 'e') return v;
  if (t === 'b') return v === undefined ? null : v ? 1 : 0;
  if (t === 'in') return encodeInputRow(v as never);
  if (typeof v !== 'number') return v; // null or absent
  if (v === Infinity) return INF;
  if (v === -Infinity) return -INF;
  return t === 'p' ? v : Math.round(v * t);
};
const dec = (v: unknown, t: Kind): unknown => {
  if (t === 'e') return v;
  if (t === 'b') return v === null ? undefined : v === 1;
  if (t === 'in') return decodeInputRow(v as never);
  if (typeof v !== 'number') return v;
  if (v >= INF) return Infinity;
  if (v <= -INF) return -Infinity;
  return t === 'p' ? v : v / t;
};

const row = (o: object, cols: Col[]): unknown[] =>
  cols.map((c) => {
    const v = get(o, c.k);
    return v === undefined ? null : enc(v, c.t);
  });
const unrow = <T>(r: unknown[], cols: Col[]): T => {
  const o = {} as T;
  cols.forEach((c, i) => {
    const v = r[i];
    if (c.o && (v === null || v === undefined)) return;
    set(o as object, c.k, dec(v, c.t));
  });
  return o;
};

// The previous input of a fighter: the buttons as bits and the aim, as in the input messages.
const encodeInputRow = (i: Fighter['prev']) => encodeInput(0, i).slice(1);
const decodeInputRow = (r: number[]) => decodeInput([0, r[0], r[1], r[2]]);

export type WireState = [unknown[], unknown[][], unknown[][], unknown[][], unknown[]];

export const compactState = (s: GameState): WireState => [
  row(s, TOP),
  s.fighters.map((f) => row(f, FIGHTER)),
  s.pickups.map((p) => row(p, PICKUP)),
  s.projectiles.map((p) => row(p, PROJECTILE)),
  s.events,
];

export const expandState = (w: WireState): GameState => {
  const s = unrow<GameState>(w[0], TOP);
  s.fighters = w[1].map((r) => unrow<Fighter>(r, FIGHTER));
  s.pickups = w[2].map((r) => unrow<Pickup>(r, PICKUP));
  s.projectiles = w[3].map((r) => unrow<Projectile>(r, PROJECTILE));
  s.events = w[4] as GameState['events'];
  return s;
};
