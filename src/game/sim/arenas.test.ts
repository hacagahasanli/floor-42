import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { ARENA, arenaOf, ARENAS, DEFAULT_ARENA, isArenaId, menuSpotX, OFFSITE } from './constants';
import { createBot } from './bot';
import { createGame, step } from './step';

import type { CharacterId } from './types';

// The arena is data carried in the state (R-016 / arena-2.md). The office must stay byte for byte what it was.

describe('the office is unchanged', () => {
  it('keeps its data (a fingerprint of platforms, spawns, gun spawns, bounds and drops, taken before the refactor)', () => {
    const { platforms, spawns, left, right, floor, ceiling, dropEvery, dropSlots, dropKinds } = ARENA;
    const gun = ARENA.gunSpawns.map((g) => ({ spots: g.spots, kinds: g.kinds, respawn: g.respawn }));
    const h = createHash('sha256').update(JSON.stringify({ platforms, spawns, gun, left, right, floor, ceiling, dropEvery, dropSlots, dropKinds })).digest('hex');
    expect(h.slice(0, 16)).toBe(OFFICE_DATA_HASH);
  });

  it('menuSpotX is per-arena data and the office value is still the end of the table + 2.2', () => {
    const table = ARENA.platforms.find((p) => p.style === 'table')!;
    expect(menuSpotX()).toBeCloseTo(table.x1 + 2.2, 9);
    expect(menuSpotX(ARENA)).toBe(ARENA.menuSpotX);
    expect(menuSpotX(OFFSITE)).toBe(5.2);
  });

  it('plays six seeded bot-vs-bot minutes exactly as recorded (golden hashes: a9d0683, re-recorded for the line-of-fire rule)', () => {
    expect(runAll()).toEqual(GOLDEN);
  });

  it('a default game carries no arena field, so online states and snapshots are the old shape', () => {
    const s = createGame(['hotfix', 'legacy'], 5);
    expect('arena' in s).toBe(false);
    expect(Object.keys(JSON.parse(JSON.stringify(s)))).not.toContain('arena');
    expect(arenaOf(s)).toBe(ARENA);
    const online = createGame(['hotfix', 'legacy'], 5, true);
    expect('arena' in online).toBe(false);
  });
});

describe('arena selection', () => {
  it('createGame sets the arena only for a non-office one, and every system reads it', () => {
    const o = createGame(['hotfix', 'legacy'], 5, false, undefined, { arena: 'offsite' });
    expect(o.arena).toBe('offsite');
    expect(arenaOf(o)).toBe(OFFSITE);
    expect('arena' in createGame(['hotfix', 'legacy'], 5, false, undefined, { arena: 'office' })).toBe(false);
    // Pickups: one per gun spawn plus the drop slots, and every gun spot comes from the offsite table.
    expect(o.pickups.filter((p) => p.spawn !== null)).toHaveLength(OFFSITE.gunSpawns.length);
    // (the power entry has firstAt: it starts empty and is checked in offsite.test.ts A10)
    o.pickups.filter((p) => p.spawn !== null && p.active).forEach((p) => expect(OFFSITE.gunSpawns[p.spawn!].spots.some((s) => s.x === p.x && s.y === p.y)).toBe(true));
    // Fighters start on offsite spawns.
    for (const f of o.fighters) expect(OFFSITE.spawns.some((s) => s.x === f.x && s.y === f.y)).toBe(true);
  });

  it('the registry has both arenas and the default is a known one', () => {
    expect(Object.keys(ARENAS).sort()).toEqual(['office', 'offsite']);
    expect(isArenaId(DEFAULT_ARENA)).toBe(true);
    expect(isArenaId('nope')).toBe(false);
  });

  it('physics follow the arena: the same spot is a boulder on offsite and open air in the office', () => {
    // Drop a fighter at x -13.4 from y 3: on offsite they land on the boulder (top 1.4); in the office, on the desk at 1.1.
    for (const [arena, top] of [['offsite', 1.4], ['office', 1.1]] as const) {
      const s = createGame(['hotfix', 'legacy'], 1, false, undefined, { arena });
      s.phase = 'fight';
      s.fighters[1].respawn = 1e9;
      Object.assign(s.fighters[0], { x: -13.4, y: 3, vy: 0, onGround: false });
      for (let i = 0; i < 90; i++) step(s, [{ ...EMPTY(), aimX: 0, aimY: 0 }, EMPTY()]);
      expect(s.fighters[0].y).toBeCloseTo(top, 6);
    }
  });

  it('offsite is deterministic for a seed, and different from the office', () => {
    const a = runOne(7, 'offsite');
    expect(runOne(7, 'offsite')).toBe(a);
    expect(runOne(7, 'office')).not.toBe(a);
  });
});

const EMPTY = () => ({
  left: false, right: false, up: false, down: false, crouch: false, dash: false, fire: false, pickup: false, reload: false, push: false, throwBomb: false, aimX: 0, aimY: 0,
});

const CHARS: CharacterId[] = ['hotfix', 'legacy', 'standup', 'intern'];
const SEEDS = [1, 7, 42, 99, 12345, 777777];

const runOne = (seed: number, arena?: 'office' | 'offsite') => {
  const s = createGame([CHARS[seed % 4], CHARS[(seed + 1) % 4]], seed, false, undefined, { countdownSeconds: 2, ...(arena ? { arena } : {}) });
  const b0 = createBot(0, seed, 'hard');
  const b1 = createBot(1, seed + 1, 'normal');
  const h = createHash('sha256');
  for (let t = 0; t < 60 * 60; t++) {
    step(s, [b0(s), b1(s)]);
    if (t % 15 === 0) h.update(JSON.stringify([s.fighters.map((f) => [f.x, f.y, f.hp, f.kos]), s.pickups.map((p) => [p.x, p.y, p.active, p.kind]), s.events]));
  }
  return `${seed} ${h.digest('hex').slice(0, 16)} ${JSON.stringify(s).length} ${'arena' in s}`;
};
const runAll = () => SEEDS.map((seed) => runOne(seed));

// Recorded by running this same script on a worktree of a9d0683 (before the arena id existed), then re-recorded on
// aim-fix (2026-11-28) for the owner's line-of-fire rule: no round, rail or blast crosses a walkway or a box, and a
// round no longer starts past the floor a fighter crouches on. The a9d0683 values still held at a469582 (checked);
// the script here, run on a469582, reproduces them, so only the rule change moved them.
const GOLDEN = [
  '1 e62d39e35a4e1500 2663 false',
  '7 63da78e94cc50eee 2617 false',
  '42 e2d541ab43a4e751 2688 false',
  '99 90d8d5f7adac93fe 2679 false',
  '12345 8e05e5992ac458a0 2692 false',
  '777777 e1d9979eaedfa3fa 2588 false',
];
const OFFICE_DATA_HASH = '880350b04eaab173';
