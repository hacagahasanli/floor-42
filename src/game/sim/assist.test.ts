import { describe, expect, it } from 'vitest';

import { ASSIST, DT, GUNS, PUSH, RULES } from './constants';
import { applyHit, createGame, lowAmmo, newWeapon, step } from './step';
import { EMPTY_INPUT } from './types';

import type { GameEvent, GameState, GunKind, InputState, Pickup } from './types';

/** Local 2-player assists (spec local-2p.md section 2): automatic pick up and reload, bomb on Push, first to N. */

const run = (state: GameState, ticks: number, p0: Partial<InputState> = {}, p1: Partial<InputState> = {}) => {
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    step(state, [
      { ...EMPTY_INPUT, ...p0 },
      { ...EMPTY_INPUT, ...p1 },
    ]);
    events.push(...state.events);
  }
  return events;
};

const fighting = (assist = true, kosToWin = 5): GameState => {
  const s = createGame(['hotfix', 'legacy'], 7, false, assist ? { kosToWin, assist: true } : undefined);
  s.phase = 'fight';
  s.phaseTime = RULES.roundSeconds;
  s.dropTimer = Infinity;
  s.pickups.forEach((p) => {
    p.active = false;
    p.respawn = Infinity;
  });
  // Far apart on the floor, facing away: nobody hits anybody by accident.
  Object.assign(s.fighters[0], { x: -10, y: 0, vx: 0, vy: 0, facing: -1 });
  Object.assign(s.fighters[1], { x: 10, y: 0, vx: 0, vy: 0, facing: 1 });
  return s;
};

/** A floor gun of `kind` under fighter 0's feet. */
const gunUnder = (s: GameState, kind: GunKind): Pickup => {
  const p = s.pickups.find((q) => q.spawn === null)!;
  Object.assign(p, { kind, x: s.fighters[0].x, y: s.fighters[0].y, vy: 0, active: true });
  return p;
};
const ticks = (seconds: number) => Math.round(seconds / DT);

describe('2-player auto pick up', () => {
  it('with the pistol, walking over a gun takes it at once', () => {
    const s = fighting();
    const p = gunUnder(s, 'shotgun');
    run(s, 1);
    expect(s.fighters[0].weapon.kind).toBe('shotgun');
    expect(p.active).toBe(false);
  });

  it('with a nearly empty gun (under 25 % of mag + reserve), it takes the new one at once', () => {
    const s = fighting();
    s.fighters[0].weapon = { ...newWeapon('smg'), mag: 5, reserve: 9 }; // 14 of 60
    expect(lowAmmo(s.fighters[0].weapon)).toBe(true);
    gunUnder(s, 'shotgun');
    run(s, 1);
    expect(s.fighters[0].weapon.kind).toBe('shotgun');
  });

  it('with a loaded gun, it swaps only after standing on it for 0.5 s', () => {
    const s = fighting();
    s.fighters[0].weapon = newWeapon('smg');
    const p = gunUnder(s, 'shotgun');
    run(s, ticks(ASSIST.swapHold) - 2);
    expect(s.fighters[0].weapon.kind).toBe('smg');
    expect(s.fighters[0].pickupHold).toBeGreaterThan(0.4);
    run(s, 3);
    expect(s.fighters[0].weapon.kind).toBe('shotgun');
    expect(p.active).toBe(false);
    expect(s.fighters[0].pickupHold).toBe(0);
  });

  it('stepping off the gun cancels the wait', () => {
    const s = fighting();
    s.fighters[0].weapon = newWeapon('smg');
    const p = gunUnder(s, 'shotgun');
    run(s, ticks(0.3));
    p.x += 6; // the fighter is no longer on it
    run(s, 1);
    expect(s.fighters[0].pickupHold).toBe(0);
    p.x -= 6;
    run(s, ticks(0.3));
    expect(s.fighters[0].weapon.kind).toBe('smg');
  });

  it('never needs the Pick up key, and a bomb still goes in its own slot', () => {
    const s = fighting();
    s.fighters[0].weapon = newWeapon('smg');
    gunUnder(s, 'bomb');
    run(s, 1);
    expect(s.fighters[0].bombs).toBe(1);
    expect(s.fighters[0].weapon.kind).toBe('smg');
  });

  it('is off vs the bot and online: a loaded gun stays without the Pick up key', () => {
    const s = fighting(false);
    s.fighters[0].weapon = newWeapon('smg');
    gunUnder(s, 'shotgun');
    run(s, ticks(2));
    expect(s.fighters[0].weapon.kind).toBe('smg');
    expect(s.fighters[0].pickupHold).toBeUndefined();
  });
});

describe('2-player auto reload', () => {
  it('a part-empty magazine reloads itself after 1.2 s without shooting', () => {
    const s = fighting();
    s.fighters[0].weapon = { ...newWeapon('smg'), mag: 10 };
    s.fighters[0].firing = 0;
    run(s, ticks(ASSIST.reloadIdle) - 3);
    expect(s.fighters[0].weapon.reload).toBe(0);
    const events = run(s, 4);
    expect(events.some((e) => e.type === 'reload' && e.fighter === 0)).toBe(true);
    run(s, ticks(GUNS.smg.reloadTime) + 1);
    expect(s.fighters[0].weapon.mag).toBe(GUNS.smg.mag);
  });

  it('a full magazine or an empty reserve never starts one', () => {
    const s = fighting();
    s.fighters[0].weapon = { ...newWeapon('smg'), mag: 10, reserve: 0 };
    s.fighters[1].weapon = newWeapon('smg');
    run(s, ticks(2));
    expect(s.fighters[0].weapon.reload).toBe(0);
    expect(s.fighters[1].weapon.reload).toBe(0);
  });

  it('is off outside 2-player', () => {
    const s = fighting(false);
    s.fighters[0].weapon = { ...newWeapon('smg'), mag: 10 };
    run(s, ticks(2));
    expect(s.fighters[0].weapon.mag).toBe(10);
  });
});

describe('2-player bomb on Push', () => {
  it('with a bomb, Push throws it instead of pushing', () => {
    const s = fighting();
    s.fighters[0].bombs = 1;
    const events = run(s, 1, { push: true, aimX: -4, aimY: 1 });
    expect(s.fighters[0].bombs).toBe(0);
    expect(events.some((e) => e.type === 'shot' && e.gun === 'bomb')).toBe(true);
    expect(events.some((e) => e.type === 'push')).toBe(false);
    expect(s.fighters[0].pushCooldown).toBe(0);
  });

  it('Push comes back the moment the bomb is gone', () => {
    const s = fighting();
    s.fighters[0].bombs = 1;
    run(s, 1, { push: true, aimX: -4, aimY: 1 });
    run(s, 1);
    const events = run(s, 1, { push: true });
    expect(events.some((e) => e.type === 'push' && e.fighter === 0)).toBe(true);
    expect(s.fighters[0].pushCooldown).toBeGreaterThan(PUSH.cooldown - 0.1);
  });

  it('outside 2-player Push still pushes while a bomb is carried', () => {
    const s = fighting(false);
    s.fighters[0].bombs = 1;
    const events = run(s, 1, { push: true });
    expect(s.fighters[0].bombs).toBe(1);
    expect(events.some((e) => e.type === 'push')).toBe(true);
  });
});

describe('first to N', () => {
  it('ends at the chosen KO count', () => {
    const s = fighting(true, 3);
    s.fighters[0].kos = 2;
    s.fighters[1].invulnerable = 0;
    applyHit(s, s.fighters[1], { attacker: 0, dx: 1, dy: 0, damage: 999, knockback: 0 });
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(0);
    expect(s.fighters[0].kos).toBe(3);
  });

  it('defaults to the normal rule without a 2-player setting', () => {
    const s = fighting(false);
    expect(s.kosToWin).toBeUndefined();
    expect(s.assist).toBeUndefined();
  });
});
