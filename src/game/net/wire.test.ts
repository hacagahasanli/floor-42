import { createAuthority } from './authority';
import { maxDiff } from './closeTo';
import { decodeSnapshot, encodeSnapshot, PROTOCOL_VERSION, SNAPSHOT_EVERY_TICKS } from './protocol';
import { snapshotMessage } from './serverSnapshot';
import { compactState, expandState, WIRE_KEYS } from './wire';
import { createGame, step } from '../sim/step';
import { EMPTY_INPUT } from '../sim/types';

import type { GameState } from '../sim/types';

/** A game in the middle of a fight: projectiles, pickups, bombs, shoves, stats all non-trivial. */
const fight = (ticks = 900, seed = 7): GameState => {
  const s = createGame(['hotfix', 'legacy'], seed, true);
  for (let i = 0; i < ticks; i++) {
    step(s, [
      { ...EMPTY_INPUT, fire: i % 7 === 0, right: i % 200 < 100, left: i % 200 >= 100, up: i % 50 === 0, throwBomb: i % 331 === 0, pickup: i % 40 === 0, aimX: 5.123456, aimY: 1.5 },
      { ...EMPTY_INPUT, fire: true, left: i % 300 < 150, right: i % 300 >= 150, push: i % 97 === 0, dash: i % 120 === 0, aimX: -3.3333, aimY: 2 },
    ]);
  }
  return s;
};

describe('compact snapshot (protocol 3)', () => {
  it('lists every field of the state: a field the simulation adds and the wire forgot fails here', () => {
    const s = fight();
    expect(s.projectiles.length).toBeGreaterThan(0);
    const known = (keys: string[], o: object) => Object.keys(o).filter((k) => !keys.includes(k));
    expect(known(WIRE_KEYS.top, s)).toEqual([]);
    for (const f of s.fighters) expect(known(WIRE_KEYS.fighter, f)).toEqual([]);
    for (const p of s.pickups) expect(known(WIRE_KEYS.pickup, p)).toEqual([]);
    for (const p of s.projectiles) expect(known(WIRE_KEYS.projectile, p)).toEqual([]);
    // Local 2-player assist fields are optional and never online, but they must survive too.
    const f = { ...s.fighters[0], pickupHold: 0.25, pickupHoldId: 3 };
    const back = expandState(compactState({ ...s, assist: true, kosToWin: 5, fighters: [f, s.fighters[1]] }));
    expect(back.fighters[0].pickupHoldId).toBe(3);
    expect(back.assist).toBe(true);
    expect(back.kosToWin).toBe(5);
    expect('pickupHold' in back.fighters[1]).toBe(false);
  });

  it('round-trips many states within a centimetre and a millisecond, ids, seed and strings exactly', () => {
    for (const ticks of [0, 30, 300, 901, 2400]) {
      const s = fight(ticks, ticks + 1);
      const back = decodeSnapshot(encodeSnapshot({ ack: [1, 2], inputs: [[1, 0, 0, 0], [2, 0, 0, 0]], state: s })).state;
      expect(maxDiff(back, s)).toBeLessThan(0.006);
      expect(back.seed).toBe(s.seed);
      expect(back.nextId).toBe(s.nextId);
      expect(back.fighters.map((f) => [f.id, f.character, f.weapon.kind, f.weapon.mag, f.kos, f.lastHitBy])).toEqual(s.fighters.map((f) => [f.id, f.character, f.weapon.kind, f.weapon.mag, f.kos, f.lastHitBy]));
      expect(back.fighters[0].weapon.reserve === s.fighters[0].weapon.reserve || Number.isFinite(s.fighters[0].weapon.reserve)).toBe(true);
    }
  });

  it('is stable: a state that has been on the wire comes back identical when sent again', () => {
    const once = expandState(JSON.parse(JSON.stringify(compactState(fight()))));
    const twice = expandState(JSON.parse(JSON.stringify(compactState(once))));
    expect(twice).toEqual(once);
  });

  it('carries Infinity (pistol reserve, gun spawn that never returns) and negative timers', () => {
    const s = fight(100);
    s.pickups[0].respawn = Infinity;
    s.fighters[1].weapon.reload = -0.0167;
    const back = decodeSnapshot(encodeSnapshot({ ack: [0, 0], inputs: [[0, 0, 0, 0], [0, 0, 0, 0]], state: s })).state;
    expect(back.pickups[0].respawn).toBe(Infinity);
    expect(back.fighters[0].weapon.reserve).toBe(Infinity);
    expect(back.fighters[1].weapon.reload).toBeCloseTo(-0.017, 3);
  });

  it('keeps seq, events and each seat\'s next inputs (relative to ack on the wire)', () => {
    const state = fight(50);
    const next: [number[][], number[][]] = [[[10, 5, 1.5, -2], [11, 4, 1.5, -2]], [[7, 0, 0, 0]]];
    const ev = { from: 3, to: 5, e: [[4, { type: 'drop' as const, x: 1 }]] as [number, { type: 'drop'; x: number }][] };
    const back = decodeSnapshot(encodeSnapshot({ seq: 9, ack: [8, 6], inputs: [[8, 1, 0, 0], [6, 2, 0, 0]], state, ev, next: next as never }));
    expect(back.seq).toBe(9);
    expect(back.ev).toEqual(ev);
    expect(back.next).toEqual(next);
    expect(back.ack).toEqual([8, 6]);
  });

  it('still reads the full-state snapshots of an older server or host', () => {
    const state = createGame(['hotfix', 'legacy'], 3, true);
    const legacy = JSON.stringify({ seq: 4, ack: [1, 1], inputs: [[1, 0, 0, 0], [1, 0, 0, 0]], state }, (_k, v) => (v === Infinity ? '__inf' : v));
    const back = decodeSnapshot(legacy);
    expect(back.seq).toBe(4);
    expect(back.state.fighters[0].weapon.reserve).toBe(Infinity);
    expect(back.state).toEqual(state);
  });

  it('is a fraction of the old size and the server sends it every tick', () => {
    expect(PROTOCOL_VERSION).toBe(3);
    expect(SNAPSHOT_EVERY_TICKS).toBe(1);
    const state = fight(900);
    const input = { ack: [5, 5] as [number, number], inputs: [[5, 3, 1, 1], [5, 3, 1, 1]] as never };
    const full = JSON.stringify({ ...input, state }, (_k, v) => (v === Infinity ? '__inf' : v)).length;
    const compact = encodeSnapshot({ ...input, state }).length;
    expect(compact).toBeLessThan(full / 3);
    // A real authority snapshot, as the server sends it, in a fight.
    const auth = createAuthority(createGame(['hotfix', 'legacy'], 7, true), { remote: [true, true] });
    for (let t = 0; t < 400; t++) auth.advance([null, null]);
    const msg = snapshotMessage(auth, 1);
    expect(msg.length).toBeLessThan(1200);
    expect(decodeSnapshot(msg).state.tick).toBeLessThanOrEqual(auth.tick);
  });
});
