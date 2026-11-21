import { describe, expect, it } from 'vitest';

import { ARENA, CHARACTERS, RULES } from './constants';
import { createBot } from './bot';
import { bodyHeight, createGame, newWeapon, step, visibleAim } from './step';
import { EMPTY_INPUT } from './types';

import type { GameEvent, GameState, GunKind, InputState } from './types';

/** In the fight, no guns lying around, no ceiling drops. */
const fighting = (chars: Parameters<typeof createGame>[0] = ['hotfix', 'legacy'], seed = 3): GameState => {
  const s = createGame(chars, seed);
  s.phase = 'fight';
  s.phaseTime = RULES.roundSeconds;
  s.dropTimer = Infinity;
  s.pickups.forEach((p) => {
    p.active = false;
    p.respawn = Infinity;
  });
  return s;
};

const place = (s: GameState, id: number, x: number, y = 0) =>
  Object.assign(s.fighters[id], { x, y, vx: 0, vy: 0, onGround: true, invulnerable: 0 });

const run = (s: GameState, ticks: number, p0: Partial<InputState> = {}, p1: Partial<InputState> = {}) => {
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    step(s, [{ ...EMPTY_INPUT, ...p0 }, { ...EMPTY_INPUT, ...p1 }]);
    events.push(...s.events);
  }
  return events;
};

const desk = ARENA.platforms.find((p) => p.style === 'desk' && p.x0 > -10)!; // -9.6..-6.2, top 1.1

/**
 * The rival (1) hides on the floor just left of the right-hand desk; the shooter (0) stands on the open floor
 * right of it, between the desk and the meeting table. Every flat shot between them goes through the desk.
 */
const behindDesk = (gun: GunKind, crouch: boolean, chars: Parameters<typeof createGame>[0] = ['hotfix', 'legacy']) => {
  const s = fighting(chars);
  place(s, 0, desk.x1 + 1.6);
  place(s, 1, desk.x0 - 0.9);
  s.fighters[0].weapon = newWeapon(gun);
  // Let the crouch settle before the first shot.
  run(s, 10, {}, { crouch });
  return s;
};

describe('desks are cover: a shot through a desk stops at it', () => {
  for (const gun of ['pistol', 'smg', 'shotgun', 'uzi', 'railgun'] as GunKind[]) {
    it(`${gun}: a fighter crouched behind a desk is not hit, aimed at their crouched chest`, () => {
      const s = behindDesk(gun, true);
      const foe = s.fighters[1];
      expect(bodyHeight(foe)).toBeLessThan(desk.y);
      const aim = { aimX: foe.x, aimY: foe.y + bodyHeight(foe) * 0.55 };
      const events = run(s, 90, { fire: true, ...aim }, { crouch: true });
      expect(events.filter((e) => e.type === 'shot').length).toBeGreaterThan(0);
      expect(s.fighters[1].hp).toBe(CHARACTERS.legacy.hp);
      expect(s.fighters[0].kos).toBe(0);
    });
  }
});

describe('every solid floor prop hides a crouched fighter', () => {
  // The crouched rival on one side, the shooter on the open floor on the other, both clear of other furniture.
  const props = [
    { name: 'the left desk', target: -16.6, shooter: -10.6 },
    { name: 'the right desk', target: -10.5, shooter: -4.6 },
    { name: 'the meeting table', target: -3.9, shooter: 3.9 },
    { name: 'the kitchen counter', target: 14.5, shooter: 8.2 },
  ];
  for (const p of props) {
    it(`${p.name}: pistol and shotgun shots at the crouched chest stop at it`, () => {
      for (const gun of ['pistol', 'shotgun'] as GunKind[]) {
        const s = fighting();
        place(s, 0, p.shooter);
        place(s, 1, p.target);
        s.fighters[0].weapon = newWeapon(gun);
        run(s, 10, {}, { crouch: true });
        const foe = s.fighters[1];
        const events = run(s, 60, { fire: true, aimX: foe.x, aimY: foe.y + bodyHeight(foe) * 0.55 }, { crouch: true });
        expect(events.some((e) => e.type === 'impact')).toBe(true);
        expect(s.fighters[1].hp).toBe(CHARACTERS.legacy.hp);
      }
    });
  }
});

describe('standing tall behind a desk', () => {
  it('the upper body above the desk top can still be hit', () => {
    const s = behindDesk('pistol', false);
    const foe = s.fighters[1];
    expect(bodyHeight(foe)).toBeGreaterThan(desk.y + 0.5);
    run(s, 30, { fire: true, aimX: foe.x, aimY: foe.y + 1.6 });
    expect(s.fighters[1].hp).toBeLessThan(CHARACTERS.legacy.hp);
  });

  it('shots at the legs and belly below the desk top stop at the desk', () => {
    const s = behindDesk('smg', false);
    const foe = s.fighters[1];
    const events = run(s, 60, { fire: true, aimX: foe.x, aimY: foe.y + 0.6 });
    expect(events.some((e) => e.type === 'impact')).toBe(true);
    expect(s.fighters[1].hp).toBe(CHARACTERS.legacy.hp);
  });

  it('from on top of the desk, a fighter crouched beside it is not covered', () => {
    const s = fighting();
    place(s, 0, desk.x0 + 0.6, desk.y);
    place(s, 1, desk.x0 - 0.9);
    run(s, 10, {}, { crouch: true });
    const foe = s.fighters[1];
    expect(visibleAim(s, 0)).not.toBeNull();
    run(s, 40, { fire: true, aimX: foe.x, aimY: foe.y + bodyHeight(foe) * 0.55 }, { crouch: true });
    expect(s.fighters[1].hp).toBeLessThan(CHARACTERS.legacy.hp);
  });
});

describe('explosives and desks', () => {
  it('a rocket fired into a desk explodes at its side, not on the fighter behind it', () => {
    const s = behindDesk('launcher', true);
    const foe = s.fighters[1];
    const events = run(s, 40, { fire: true, aimX: foe.x, aimY: foe.y + bodyHeight(foe) * 0.55 }, { crouch: true });
    const boom = events.find((e) => e.type === 'explosion') as { x: number } | undefined;
    expect(boom).toBeTruthy();
    expect(boom!.x).toBeCloseTo(desk.x1, 1);
  });
});

describe('auto-aim and the bot see cover', () => {
  it('auto-aim does not lock onto a fighter crouched fully behind a desk', () => {
    const s = behindDesk('pistol', true);
    expect(visibleAim(s, 0)).toBeNull();
  });

  it('auto-aim goes for what shows over the desk when they stand, and the chest in the open', () => {
    const s = behindDesk('pistol', false);
    const spot = visibleAim(s, 0)!;
    expect(spot).not.toBeNull();
    expect(spot.y).toBeGreaterThan(desk.y);
    const open = fighting();
    place(open, 0, 3.6);
    place(open, 1, 8.4);
    const foe = open.fighters[1];
    expect(visibleAim(open, 0)!.y).toBeCloseTo(foe.y + bodyHeight(foe) * 0.55);
  });

  it('a rail aimed by auto-aim at a standing fighter behind a desk kills over it', () => {
    const s = behindDesk('railgun', false);
    const spot = visibleAim(s, 0)!;
    run(s, 6, { fire: true, aimX: spot.x, aimY: spot.y });
    expect(s.fighters[0].kos).toBe(1);
  });

  it('the bot holds fire at a rival hidden behind a desk and does not hurt them', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const s = behindDesk('smg', true);
      const bot = createBot(0, 7, level);
      for (let i = 0; i < 120; i++) {
        const hidden = visibleAim(s, 0) === null;
        const out = bot(s);
        if (hidden) expect(out.fire).toBe(false);
        // Hold the bot in place so the rival stays hidden for the whole check.
        step(s, [{ ...out, left: false, right: false, up: false, dash: false, push: false }, { ...EMPTY_INPUT, crouch: true }]);
        place(s, 0, desk.x1 + 1.6);
      }
      expect(s.fighters[1].hp).toBe(CHARACTERS.legacy.hp);
    }
  });

  it('the bot shoots the upper body of a rival standing behind a desk', () => {
    const s = behindDesk('smg', false);
    const bot = createBot(0, 7, 'hard');
    for (let i = 0; i < 180; i++) {
      const out = bot(s);
      step(s, [{ ...out, left: false, right: false, up: false, dash: false, push: false }, { ...EMPTY_INPUT }]);
      place(s, 0, desk.x1 + 1.6);
      place(s, 1, desk.x0 - 0.9);
    }
    expect(s.fighters[1].hp).toBeLessThan(CHARACTERS.legacy.hp);
  });

  it('a hidden rival makes the bot close in and hop the desk instead of shooting it', () => {
    const s = behindDesk('smg', true);
    const bot = createBot(0, 7, 'normal');
    let seen = false;
    for (let i = 0; i < 90 && !seen; i++) {
      const out = bot(s);
      if (visibleAim(s, 0) === null) expect(out.fire).toBe(false);
      else seen = true;
      step(s, [out, { ...EMPTY_INPUT, crouch: true }]);
    }
    expect(seen).toBe(true);
    expect(s.fighters[0].y).toBeGreaterThan(0.5); // off the floor, on its way over the desk
  });
});

describe('cover is deterministic (online stays in sync)', () => {
  const play = () => {
    const s = behindDesk('shotgun', true);
    const a = createBot(0, 11, 'hard');
    const b = createBot(1, 12, 'hard');
    for (let i = 0; i < 600; i++) step(s, [a(s), b(s)]);
    return JSON.stringify(s);
  };
  it('the same bots behind the same desks replay the same game', () => {
    expect(play()).toBe(play());
  });

  it('a shotgun spray into a desk stops the same way twice', () => {
    const once = () => {
      const s = behindDesk('shotgun', true);
      const foe = s.fighters[1];
      const events = run(s, 60, { fire: true, aimX: foe.x, aimY: foe.y + 0.4 }, { crouch: true });
      return JSON.stringify(events.filter((e) => e.type === 'impact'));
    };
    expect(once()).toBe(once());
  });
});
