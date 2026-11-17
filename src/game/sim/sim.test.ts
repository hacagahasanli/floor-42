import { createBot } from './bot';
import { ARENA, DT, RULES, WALL_SPLAT_DAMAGE } from './constants';
import { createGame, step } from './step';
import { EMPTY_INPUT } from './types';

import type { GameState, InputState } from './types';

const idle = (): InputState[] => [{ ...EMPTY_INPUT }, { ...EMPTY_INPUT }];

const run = (state: GameState, ticks: number, p0: Partial<InputState> = {}, p1: Partial<InputState> = {}) => {
  const events = [];
  for (let i = 0; i < ticks; i++) {
    step(state, [
      { ...EMPTY_INPUT, ...p0 },
      { ...EMPTY_INPUT, ...p1 },
    ]);
    events.push(...state.events);
  }
  return events;
};

/** Skips the countdown so fighters can act. */
const fighting = (): GameState => {
  const s = createGame(['hotfix', 'legacy']);
  s.phase = 'fight';
  s.phaseTime = RULES.roundSeconds;
  return s;
};

const place = (s: GameState, id: number, x: number, y = 0) => Object.assign(s.fighters[id], { x, y, vx: 0, vy: 0 });

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
    step(s, idle());
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(1);
  });
});

describe('movement', () => {
  it('lands on a desk and drops through it with Down', () => {
    const s = fighting();
    run(s, 30);
    expect(s.fighters[0].y).toBeCloseTo(ARENA.platforms[0].y);
    expect(s.fighters[0].onGround).toBe(true);
    run(s, 1, { down: true });
    run(s, 40);
    expect(s.fighters[0].y).toBe(0);
  });

  it('jumps, then wall-kicks off the glass away from it', () => {
    const s = fighting();
    place(s, 0, ARENA.left + 1.5);
    run(s, 1, { up: true });
    run(s, 20, { left: true });
    expect(s.fighters[0].wall).toBe(-1);
    run(s, 1, { up: true, left: true });
    const f = s.fighters[0];
    expect(f.vx).toBeGreaterThan(5);
    expect(f.vy).toBeGreaterThan(5);
  });

  it('dashes faster than running', () => {
    const s = fighting();
    place(s, 0, -2);
    run(s, 1, { dash: true, right: true });
    expect(s.fighters[0].vx).toBeGreaterThan(15);
  });
});

describe('combat', () => {
  it('a jab damages and knocks back the opponent', () => {
    const s = fighting();
    place(s, 0, 0);
    place(s, 1, 1.2);
    s.fighters[0].facing = 1;
    run(s, 12, { attack: true });
    expect(s.fighters[1].hp).toBeLessThan(RULES.hp);
    expect(s.fighters[1].x).toBeGreaterThan(1.2);
  });

  it('a keyboard sweep reaches further and hits harder than a jab', () => {
    const jab = fighting();
    place(jab, 0, 0);
    place(jab, 1, 2.4);
    run(jab, 30, { attack: true });
    expect(jab.fighters[1].hp).toBe(RULES.hp);

    const sweep = fighting();
    place(sweep, 0, 0);
    place(sweep, 1, 2.4);
    const keyboard = sweep.items.find((i) => i.kind === 'keyboard')!;
    keyboard.holder = 0;
    sweep.fighters[0].held = keyboard.id;
    run(sweep, 30, { attack: true });
    expect(sweep.fighters[1].hp).toBeLessThanOrEqual(RULES.hp - 15);
  });

  it('picks up a mug and throws it: the hit slows the target and the mug breaks', () => {
    const s = fighting();
    const mug = s.items.find((i) => i.kind === 'mug' && i.x < 0)!;
    place(s, 0, mug.x, mug.y);
    s.fighters[0].facing = 1;
    run(s, 1, { grab: true });
    expect(s.fighters[0].held).toBe(mug.id);
    place(s, 1, mug.x + 3.5, mug.y);
    run(s, 1);
    const events = run(s, 40, { grab: true });
    expect(events.some((e) => e.type === 'splash')).toBe(true);
    expect(s.fighters[1].slow).toBeGreaterThan(0);
    expect(mug.active).toBe(false);
  });

  it('a monitor held facing the hit absorbs most damage', () => {
    const s = fighting();
    place(s, 0, 0);
    place(s, 1, 1.4);
    s.fighters[1].facing = -1;
    const monitor = s.items.find((i) => i.kind === 'monitor')!;
    monitor.holder = 1;
    s.fighters[1].held = monitor.id;
    run(s, 12, { attack: true });
    expect(s.fighters[1].hp).toBeGreaterThan(RULES.hp - 6 * 0.5);
  });

  it('Force Push into the glass wall splats for extra damage', () => {
    const s = fighting();
    place(s, 0, ARENA.right - 3);
    place(s, 1, ARENA.right - 1.6);
    s.fighters[0].facing = 1;
    const events = run(s, 30, { push: true });
    expect(events.some((e) => e.type === 'wallSplat')).toBe(true);
    expect(s.fighters[1].hp).toBeLessThanOrEqual(RULES.hp - WALL_SPLAT_DAMAGE);
    expect(s.fighters[0].pushCooldown).toBeGreaterThan(0);
  });

  it('a KO scores for the attacker and the fighter respawns', () => {
    const s = fighting();
    place(s, 0, 0);
    place(s, 1, 1.2);
    s.fighters[1].hp = 1;
    const events = run(s, 12, { attack: true });
    expect(events.some((e) => e.type === 'ko')).toBe(true);
    expect(s.fighters[0].kos).toBe(1);
    run(s, Math.ceil(RULES.respawnSeconds / DT) + 2);
    expect(s.fighters[1].hp).toBe(RULES.hp);
  });

  it('first to the KO target wins the round', () => {
    const s = fighting();
    s.fighters[0].kos = RULES.kosToWin - 1;
    place(s, 0, 0);
    place(s, 1, 1.2);
    s.fighters[1].hp = 1;
    run(s, 12, { attack: true });
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(0);
  });
});

describe('bot', () => {
  it('fights: two bots land hits on each other within a round', () => {
    const s = createGame(['standup', 'intern']);
    const bots = [createBot(0, 1), createBot(1, 2)];
    let hits = 0;
    for (let i = 0; i < 60 * 40 && s.phase !== 'over'; i++) {
      step(s, bots.map((b) => b(s)));
      hits += s.events.filter((e) => e.type === 'hit').length;
    }
    expect(hits).toBeGreaterThan(5);
  });

  it('is deterministic for the same seed', () => {
    const play = () => {
      const s = createGame(['hotfix', 'legacy']);
      const bots = [createBot(0, 7), createBot(1, 9)];
      for (let i = 0; i < 600; i++) step(s, bots.map((b) => b(s)));
      return s.fighters.map((f) => [f.x, f.y, f.hp]);
    };
    expect(play()).toEqual(play());
  });
});
