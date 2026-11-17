import { createBot } from './bot';
import { ARENA, CHARACTERS, DT, GUNS, RULES, WALL_SPLAT_DAMAGE } from './constants';
import { chooseCharacter, createGame, newWeapon, step } from './step';
import { EMPTY_INPUT } from './types';

import type { GameEvent, GameState, GunKind, InputState } from './types';

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

/** Skips the countdown, removes guns lying around and the ceiling drops. */
const fighting = (): GameState => {
  const s = createGame(['hotfix', 'legacy']);
  s.phase = 'fight';
  s.phaseTime = RULES.roundSeconds;
  s.dropTimer = Infinity;
  s.pickups.forEach((p) => {
    p.active = false;
    p.respawn = Infinity;
  });
  return s;
};

const place = (s: GameState, id: number, x: number, y = 0) => Object.assign(s.fighters[id], { x, y, vx: 0, vy: 0 });
const arm = (s: GameState, id: number, kind: GunKind) => (s.fighters[id].weapon = newWeapon(kind));
/** Aim at fighter `id`'s chest. */
const at = (s: GameState, id: number) => ({ aimX: s.fighters[id].x, aimY: s.fighters[id].y + 1.1 });

describe('round flow', () => {
  it('ignores input during the countdown, then starts the fight', () => {
    const s = createGame(['hotfix', 'legacy']);
    const x0 = s.fighters[0].x;
    run(s, 30, { right: true });
    expect(s.fighters[0].x).toBe(x0);
    run(s, Math.ceil(RULES.countdownSeconds / DT));
    expect(s.phase).toBe('fight');
  });

  it('ends on time with the KO leader as winner', () => {
    const s = fighting();
    s.fighters[1].kos = 2;
    s.phaseTime = DT / 2;
    run(s, 1);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(1);
  });
});

describe('movement', () => {
  it('lands on a desk and drops through it with Down', () => {
    const s = fighting();
    place(s, 0, -13.5, 2);
    run(s, 30);
    expect(s.fighters[0].onGround).toBe(true);
    expect(s.fighters[0].y).toBeCloseTo(1.1);
    run(s, 1, { down: true });
    run(s, 40);
    expect(s.fighters[0].y).toBe(0);
  });

  it('wall-kicks off the glass', () => {
    const s = fighting();
    place(s, 0, ARENA.left + 1.5, 7.5);
    run(s, 20, { left: true });
    expect(s.fighters[0].wall).toBe(-1);
    run(s, 1, { up: true, left: true });
    expect(s.fighters[0].vx).toBeGreaterThan(5);
    expect(s.fighters[0].vy).toBeGreaterThan(5);
  });

  it('faces where it aims, whichever way it runs', () => {
    const s = fighting();
    place(s, 0, -5);
    run(s, 5, { right: true, aimX: -15, aimY: 1 });
    expect(s.fighters[0].facing).toBe(-1);
    expect(s.fighters[0].vx).toBeGreaterThan(0);
  });
});

describe('guns', () => {
  it('the pistol shoots where you aim and hurts', () => {
    const s = fighting();
    place(s, 0, -8);
    place(s, 1, -2);
    const events = run(s, 30, { fire: true, ...at(s, 1) });
    expect(events.filter((e) => e.type === 'shot').length).toBeGreaterThan(1);
    expect(s.fighters[1].hp).toBeLessThan(CHARACTERS.legacy.hp);
  });

  it('misses when you aim away', () => {
    const s = fighting();
    place(s, 0, -8);
    place(s, 1, -2);
    run(s, 30, { fire: true, aimX: -8, aimY: 9 });
    expect(s.fighters[1].hp).toBe(CHARACTERS.legacy.hp);
  });

  it('furniture stops bullets: a walkway between you is cover', () => {
    const s = fighting();
    const walk = ARENA.platforms.find((p) => p.style === 'walkway')!;
    const mid = (walk.x0 + walk.x1) / 2;
    place(s, 0, mid, 7.5);
    place(s, 1, mid, 0);
    const events = run(s, 12, { fire: true, aimX: mid, aimY: 0 });
    expect(events.some((e) => e.type === 'impact')).toBe(true);
    expect(s.fighters[1].hp).toBe(CHARACTERS.legacy.hp);
  });

  it('reloads on its own when the magazine runs dry', () => {
    const s = fighting();
    place(s, 0, -8);
    s.fighters[0].weapon.mag = 1;
    const events = run(s, 3, { fire: true, aimX: 0, aimY: 9 });
    expect(events.some((e) => e.type === 'reload')).toBe(true);
    run(s, Math.ceil(GUNS.pistol.reloadTime / DT) + 2);
    expect(s.fighters[0].weapon.mag).toBe(GUNS.pistol.mag);
  });

  it('a spent special gun falls back to the pistol', () => {
    const s = fighting();
    place(s, 0, -8);
    arm(s, 0, 'railgun');
    Object.assign(s.fighters[0].weapon, { mag: 1, reserve: 0 });
    run(s, 3, { fire: true, aimX: 0, aimY: 9 });
    expect(s.fighters[0].weapon.kind).toBe('pistol');
  });

  it('two pistol hits drop anyone', () => {
    const s = fighting();
    place(s, 0, -8);
    place(s, 1, -4);
    const events = run(s, 50, { fire: true, ...at(s, 1) });
    expect(events.filter((e) => e.type === 'hit')).toHaveLength(2);
    expect(events.some((e) => e.type === 'ko')).toBe(true);
  });

  it('a shotgun blast up close is a one-shot KO', () => {
    const s = fighting();
    place(s, 0, -5);
    place(s, 1, -3.5);
    arm(s, 0, 'shotgun');
    const events = [...run(s, 1, { fire: true, ...at(s, 1) }), ...run(s, 20)];
    expect(events.some((e) => e.type === 'ko')).toBe(true);
  });

  it('the railgun goes through furniture', () => {
    const s = fighting();
    const walk = ARENA.platforms.find((p) => p.style === 'walkway')!;
    const mid = (walk.x0 + walk.x1) / 2;
    place(s, 0, mid, 7.5);
    place(s, 1, mid, 0);
    arm(s, 0, 'railgun');
    run(s, 6, { fire: true, aimX: mid, aimY: 0.5 });
    expect(s.fighters[0].kos).toBe(1);
  });

  it('a grenade explodes and throws people around, the shooter too', () => {
    const s = fighting();
    place(s, 0, -8);
    place(s, 1, -4);
    arm(s, 0, 'launcher');
    const events = run(s, 40, { fire: true, ...at(s, 1) });
    expect(events.some((e) => e.type === 'explosion')).toBe(true);
    expect(events.some((e) => e.type === 'ko' && e.fighter === 1)).toBe(true);
  });

  it('rockets fly straight and reach across the office', () => {
    const s = fighting();
    place(s, 0, -16);
    place(s, 1, 16);
    arm(s, 0, 'launcher');
    const events = run(s, 120, { fire: true, ...at(s, 1) });
    expect(events.some((e) => e.type === 'ko' && e.fighter === 1)).toBe(true);
  });

  it('walking over a gun with a pistol picks it up', () => {
    const s = createGame(['hotfix', 'legacy']);
    s.phase = 'fight';
    const gun = s.pickups.find((p) => p.active)!;
    place(s, 0, gun.x, gun.y);
    run(s, 2);
    expect(s.fighters[0].weapon.kind).toBe(gun.kind);
    expect(gun.active).toBe(false);
  });

  it('dashing dodges bullets', () => {
    const s = fighting();
    place(s, 0, -10);
    place(s, 1, -6);
    run(s, 1, { fire: true, ...at(s, 1) });
    run(s, 1, {}, { dash: true, left: true });
    run(s, 4);
    expect(s.fighters[1].hp).toBe(CHARACTERS.legacy.hp);
  });
});

describe('Force Push', () => {
  it('shoves into the glass for a wall splat', () => {
    const s = fighting();
    place(s, 0, ARENA.right - 3.5);
    place(s, 1, ARENA.right - 2.1);
    const events = run(s, 40, { push: true, aimX: ARENA.right, aimY: 1 });
    expect(events.some((e) => e.type === 'wallSplat')).toBe(true);
    expect(s.fighters[1].hp).toBeLessThanOrEqual(CHARACTERS.legacy.hp - WALL_SPLAT_DAMAGE);
  });

  it('sends incoming bullets back at the shooter', () => {
    const s = fighting();
    place(s, 0, -10);
    place(s, 1, -4);
    run(s, 1, { fire: true, ...at(s, 1) }, { aimX: -10, aimY: 1 });
    const events = run(s, 30, {}, { push: true, aimX: -10, aimY: 1 });
    expect(events.some((e) => e.type === 'deflect')).toBe(true);
    expect(s.fighters[0].hp).toBeLessThan(CHARACTERS.hotfix.hp);
  });
});

describe('KOs', () => {
  it('a KO scores for the shooter and the fighter respawns with a pistol', () => {
    const s = fighting();
    place(s, 0, -8);
    place(s, 1, -3);
    arm(s, 1, 'smg');
    s.fighters[1].hp = 1;
    const events = run(s, 20, { fire: true, ...at(s, 1) });
    expect(events.some((e) => e.type === 'ko')).toBe(true);
    expect(s.fighters[0].kos).toBe(1);
    run(s, Math.ceil(RULES.respawnSeconds / DT) + 15);
    expect(s.fighters[1].hp).toBe(CHARACTERS.legacy.hp);
    expect(s.fighters[1].weapon.kind).toBe('pistol');
  });
});

describe('spawns and guns', () => {
  it('starts the two fighters far apart, not always in the same spots', () => {
    const starts = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const s = createGame(['hotfix', 'legacy'], seed);
      const [a, b] = s.fighters;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(8);
      starts.add(`${a.x},${a.y}`);
    }
    expect(starts.size).toBeGreaterThan(2);
  });

  it('has exactly one gun per floor at the start', () => {
    const s = createGame(['hotfix', 'legacy'], 3);
    const live = s.pickups.filter((p) => p.active);
    expect(live).toHaveLength(ARENA.gunSpawns.length);
    live.forEach((p, i) => expect(ARENA.gunSpawns[i].spots.some((spot) => spot.x === p.x && spot.y === p.y)).toBe(true));
  });

  it('a taken gun comes back after a while, on the same floor', () => {
    const s = createGame(['hotfix', 'legacy'], 3);
    s.phase = 'fight';
    const gun = s.pickups[0];
    place(s, 0, gun.x, gun.y);
    run(s, 2);
    expect(gun.active).toBe(false);
    run(s, Math.ceil(RULES.gunRespawn / DT) + 2);
    expect(gun.active).toBe(true);
    expect(ARENA.gunSpawns[0].spots.some((spot) => spot.x === gun.x && spot.y === gun.y)).toBe(true);
  });
});

describe('pause and respawn', () => {
  it('nothing moves while paused', () => {
    const s = fighting();
    s.paused = true;
    const x = s.fighters[0].x;
    run(s, 30, { right: true });
    expect(s.fighters[0].x).toBe(x);
  });

  it('you wait 3 seconds after a KO and can come back as someone else', () => {
    const s = fighting();
    place(s, 0, -8);
    place(s, 1, -3);
    s.fighters[1].hp = 1;
    run(s, 20, { fire: true, ...at(s, 1) });
    expect(s.fighters[1].respawn).toBeGreaterThan(2);
    chooseCharacter(s, 1, 'standup');
    run(s, Math.ceil(RULES.respawnSeconds / DT) + 15);
    expect(s.fighters[1].respawn).toBeLessThanOrEqual(0);
    expect(s.fighters[1].character).toBe('standup');
  });
});

describe('bot', () => {
  it('fights: two bots shoot each other and score within a round', () => {
    const s = createGame(['standup', 'intern']);
    const bots = [createBot(0, 1), createBot(1, 2)];
    let hits = 0;
    for (let i = 0; i < 60 * 60 && s.phase !== 'over'; i++) {
      step(s, bots.map((b) => b(s)));
      hits += s.events.filter((e) => e.type === 'hit').length;
    }
    expect(hits).toBeGreaterThan(5);
    expect(s.fighters[0].kos + s.fighters[1].kos).toBeGreaterThan(0);
  });

  it('is deterministic for the same seeds', () => {
    const play = () => {
      const s = createGame(['hotfix', 'legacy'], 5);
      const bots = [createBot(0, 7), createBot(1, 9)];
      for (let i = 0; i < 900; i++) step(s, bots.map((b) => b(s)));
      return s.fighters.map((f) => [f.x, f.y, f.hp]);
    };
    expect(play()).toEqual(play());
  });
});
