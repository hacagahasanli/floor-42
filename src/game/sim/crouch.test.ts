import { describe, expect, it } from 'vitest';

import { createAuthority } from '../net/authority';
import { decodeInput, decodeSnapshot, encodeInput, encodeSnapshot, mergePresses } from '../net/protocol';
import { BALANCED_GUNS, CROUCHED_HALF_HEIGHT, ttk } from './balance';
import { createBot } from './bot';
import { CHARACTERS, CROUCH, DT, GUNS, PUSH, RULES } from './constants';
import { bodyHeight, createGame, muzzle, newWeapon, step } from './step';
import { EMPTY_INPUT } from './types';

import type { GameState, GunKind, InputState } from './types';

/** In the fight, no guns lying around, no ceiling drops. */
const fighting = (chars: [Parameters<typeof createGame>[0][0], Parameters<typeof createGame>[0][1]] = ['hotfix', 'legacy']) => {
  const s = createGame(chars, 3);
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
  for (let i = 0; i < ticks; i++) step(s, [{ ...EMPTY_INPUT, ...p0 }, { ...EMPTY_INPUT, ...p1 }]);
};

/** Ticks until fighter 0's crouch reaches `target`, holding `input`. */
const ticksTo = (s: GameState, target: number, input: Partial<InputState>) => {
  for (let i = 1; i <= 60; i++) {
    run(s, 1, input);
    if (s.fighters[0].crouch === target) return i;
  }
  return Infinity;
};

describe('crouch: body and timing', () => {
  it('drops the hitbox to CROUCH.height of the body in about 0.1 s, and stands back up as fast', () => {
    const s = fighting();
    place(s, 0, 5);
    const h = CHARACTERS.hotfix.height;
    expect(bodyHeight(s.fighters[0])).toBe(h);
    const down = ticksTo(s, 1, { down: true });
    expect(down * DT).toBeGreaterThanOrEqual(0.08);
    expect(down * DT).toBeLessThanOrEqual(0.12);
    expect(bodyHeight(s.fighters[0])).toBeCloseTo(h * CROUCH.height);
    expect(CROUCH.height * h).toBeLessThan(0.55 * h);
    const up = ticksTo(s, 0, {});
    expect(up * DT).toBeLessThanOrEqual(0.12);
    expect(bodyHeight(s.fighters[0])).toBe(h);
  });

  it('walks slower while crouched', () => {
    const s = fighting();
    place(s, 0, 3.6);
    run(s, 30, { right: true, down: true });
    const max = CHARACTERS.hotfix.speed * GUNS.pistol.carry;
    expect(s.fighters[0].vx).toBeCloseTo(max * CROUCH.speed);
    expect(s.fighters[0].vx).toBeLessThan(max);
  });

  it('shoots from a lower muzzle while crouched', () => {
    const s = fighting();
    place(s, 0, 5);
    const standing = muzzle(s.fighters[0]).y;
    run(s, 10, { down: true, aimX: 10, aimY: 1 });
    expect(muzzle(s.fighters[0]).y).toBeLessThan(standing - 0.4);
  });
});

describe('crouch: ducking shots', () => {
  /** A bullet flying flat from x = 0 at height y towards fighter 1. */
  const bullet = (s: GameState, y: number) =>
    s.projectiles.push({ id: 999, kind: 'bullet', gun: 'pistol', ox: 0, oy: y, owner: 0, x: 4, y, vx: 30, vy: 0, damage: 50, knockback: 4, life: 1, hit: [] });

  for (const crouched of [false, true]) {
    it(`a flat shot at standing chest height ${crouched ? 'passes over a crouched' : 'hits a standing'} fighter`, () => {
      const s = fighting();
      place(s, 0, -5.5);
      place(s, 1, 7);
      if (crouched) run(s, 10, {}, { down: true });
      const t = s.fighters[1];
      // A same-sized shooter's chest: where every flat shot leaves from (62 % of a standing body).
      bullet(s, t.y + CHARACTERS[t.character].height * 0.62);
      run(s, 20, {}, { down: crouched });
      expect(t.hp < 100).toBe(!crouched);
    });
  }

  it("a rail aimed at a standing chest (auto-aim's 55 %) passes over the crouch; aimed at the crouch it kills", () => {
    const s = fighting(['hotfix', 'intern']);
    place(s, 0, 4);
    place(s, 1, 8.5);
    s.fighters[0].weapon = newWeapon('railgun');
    run(s, 10, { aimX: 8.5, aimY: 1 }, { down: true });
    const t = s.fighters[1];
    const standingChest = t.y + CHARACTERS.intern.height * 0.55;
    run(s, 1, { fire: true, aimX: t.x, aimY: standingChest }, { down: true });
    run(s, 10, { aimX: t.x, aimY: standingChest }, { down: true });
    expect(t.hp).toBe(100);
    run(s, 90, { aimX: t.x, aimY: standingChest }, { down: true });
    run(s, 1, { fire: true, aimX: t.x, aimY: t.y + bodyHeight(t) * 0.55 }, { down: true });
    run(s, 5, {}, { down: true });
    expect(t.respawn).toBeGreaterThan(0);
  });
});

describe('crouch: the Down key and drop-through', () => {
  it('Down on a walkway still drops you through it, without crouching', () => {
    const s = fighting();
    place(s, 0, -5.4, 4.4);
    run(s, 1, { down: true });
    expect(s.fighters[0].crouch).toBe(0);
    run(s, 20, { down: true });
    expect(s.fighters[0].y).toBeLessThan(4.4);
    expect(s.fighters[0].crouch).toBe(0);
  });

  it('the Crouch key crouches on a walkway and does not drop you', () => {
    const s = fighting();
    place(s, 0, -5.4, 4.4);
    run(s, 20, { crouch: true });
    expect(s.fighters[0].y).toBe(4.4);
    expect(s.fighters[0].crouch).toBe(1);
    // Down there still drops you, crouched or not.
    run(s, 20, { crouch: true, down: true });
    expect(s.fighters[0].y).toBeLessThan(4.4);
  });

  it('Down crouches on the floor, on a desk and on a box', () => {
    for (const [x, y] of [
      [5, 0],
      [-13.5, 1.1],
      [-3.15, 5.4],
    ]) {
      const s = fighting();
      place(s, 0, x, y);
      run(s, 20, { down: true });
      expect(s.fighters[0].y).toBe(y);
      expect(s.fighters[0].crouch).toBe(1);
    }
  });

  it('does nothing in the air (Down is still the fast fall), and a jump stands you up', () => {
    const s = fighting();
    place(s, 0, 5);
    run(s, 10, { down: true });
    run(s, 1, { down: true, up: true });
    expect(s.fighters[0].onGround).toBe(false);
    run(s, 8, { down: true });
    expect(s.fighters[0].crouch).toBe(0);
  });

  it('a dash stands you up while it lasts; Force Push works crouched', () => {
    const s = fighting();
    place(s, 0, 4);
    place(s, 1, 5.2);
    run(s, 10, { down: true, aimX: 5.2, aimY: 1 });
    run(s, 1, { down: true, dash: true, aimX: 9, aimY: 1 });
    run(s, 6, { down: true, aimX: 9, aimY: 1 });
    expect(s.fighters[0].crouch).toBe(0);
    run(s, 30, { down: true, aimX: 99, aimY: 1 });
    expect(s.fighters[0].crouch).toBe(1);
    // Crouched, push the rival standing next to you.
    place(s, 1, s.fighters[0].x + 1.2);
    run(s, 1, { down: true, push: true, aimX: s.fighters[1].x, aimY: 1 });
    run(s, Math.ceil(PUSH.duration / DT), { down: true, aimX: s.fighters[1].x, aimY: 1 });
    expect(s.fighters[1].hp).toBeLessThan(100);
  });
});

describe('crouch: balance (nobody is untouchable)', () => {
  it('close up crouching changes nothing; the pistol, rail and rockets ignore it at any range', () => {
    for (const k of BALANCED_GUNS) expect(ttk(k, 3, RULES.hp, CROUCHED_HALF_HEIGHT)).toEqual(ttk(k, 3));
    for (const k of ['pistol', 'railgun', 'launcher'] as const)
      for (const r of [3, 10, 20]) expect(ttk(k, r, RULES.hp, CROUCHED_HALF_HEIGHT)).toEqual(ttk(k, r));
    // Sprayers lose some shots on the smaller target across a room, but still kill.
    for (const k of ['smg', 'uzi'] as const) {
      const c = ttk(k, 10, RULES.hp, CROUCHED_HALF_HEIGHT).seconds;
      expect(c).toBeLessThan(ttk(k, 10).seconds * 2.5);
    }
  });

  const knockOutCrouched = (gun: GunKind, distance: number) => {
    const s = fighting(['hotfix', 'intern']);
    const x0 = gun === 'shotgun' ? 4 : -5.5;
    place(s, 0, x0);
    place(s, 1, x0 + distance);
    s.fighters[0].weapon = newWeapon(gun);
    for (let i = 0; i < 60 * 8; i++) {
      const t = s.fighters[1];
      if (t.respawn > 0) return true;
      // Out of ammo means back to the pistol: that would not be this gun's kill.
      if (s.fighters[0].weapon.kind !== gun) return false;
      // Aim that follows the crouch, like auto-aim and the bot.
      run(s, 1, { fire: true, aimX: t.x, aimY: t.y + bodyHeight(t) * 0.55 }, { down: true, crouch: true });
    }
    return false;
  };

  for (const gun of BALANCED_GUNS) {
    it(`the ${GUNS[gun].name} knocks out a crouched fighter it aims at`, () => {
      // Each at a range it is meant for: the shotgun and the Uzi are close-range guns.
      expect(knockOutCrouched(gun, gun === 'shotgun' ? 3 : gun === 'uzi' ? 5 : 10)).toBe(true);
    });
  }

  it('shotgun pellets aimed at a standing chest still catch a crouched fighter up close', () => {
    let hit = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = fighting(['hotfix', 'intern']);
      s.seed = seed;
      place(s, 0, 4);
      place(s, 1, 6);
      s.fighters[0].weapon = newWeapon('shotgun');
      run(s, 10, {}, { down: true });
      run(s, 1, { fire: true, aimX: 6, aimY: CHARACTERS.intern.height * 0.55 }, { down: true });
      run(s, 20, {}, { down: true });
      if (s.fighters[1].hp < 100) hit++;
    }
    expect(hit).toBeGreaterThan(0);
  });

  it('a rocket into the floor and a bomb next to a crouched fighter still hurt (splash)', () => {
    for (const gun of ['launcher', 'bomb'] as const) {
      const s = fighting(['hotfix', 'intern']);
      place(s, 0, 4);
      place(s, 1, 8.5);
      s.fighters[0].weapon = newWeapon(gun);
      run(s, 10, {}, { down: true });
      run(s, 1, { fire: true, aimX: 7.8, aimY: 0 }, { down: true });
      run(s, 90, {}, { down: true });
      expect(s.fighters[1].hp).toBeLessThan(100);
    }
  });
});

describe('crouch: determinism and the network', () => {
  const script = (n: number): InputState => ({
    ...EMPTY_INPUT,
    right: n % 90 < 45,
    left: n % 90 >= 45,
    down: n % 70 < 25,
    crouch: n % 110 > 80,
    up: n % 53 === 0,
    fire: n % 4 === 0,
    aimX: 0,
    aimY: 1,
  });

  it('the same inputs give the same game, crouching included', () => {
    let crouched = 0;
    const play = () => {
      const s = fighting();
      for (let n = 0; n < 900; n++) {
        step(s, [script(n), script(n + 33)]);
        crouched += s.fighters.filter((f) => f.crouch > 0).length;
      }
      return JSON.stringify(s);
    };
    expect(play()).toBe(play());
    expect(crouched).toBeGreaterThan(0);
  });

  it('carries the crouch button in an input and keeps a crouch press from a skipped input', () => {
    const i = { ...EMPTY_INPUT, crouch: true, right: true, aimX: 1, aimY: 2 };
    expect(decodeInput(encodeInput(7, i))).toEqual(i);
    expect(decodeInput(encodeInput(7, { ...EMPTY_INPUT, down: true })).crouch).toBe(false);
    expect(mergePresses({ ...EMPTY_INPUT }, { ...EMPTY_INPUT, crouch: true }).crouch).toBe(true);
  });

  it('a remote crouch reaches the authority, its snapshot and a replay of it', () => {
    const start = fighting();
    place(start, 1, 7);
    const auth = createAuthority(start, { remote: [false, true] });
    for (let t = 1; t <= 30; t++) {
      auth.receive(1, [encodeInput(t, { ...EMPTY_INPUT, crouch: true, aimX: 0, aimY: 1 })]);
      auth.advance([{ ...EMPTY_INPUT, aimX: 9, aimY: 1 }, null]);
    }
    expect(auth.state.fighters[1].crouch).toBe(1);
    const back = decodeSnapshot(encodeSnapshot({ ack: [0, 0], inputs: [[0, 0, 0, 0], [0, 0, 0, 0]], state: auth.state }));
    expect(back.state.fighters[1].crouch).toBe(1);
    // The client replays from the snapshot with the same input and lands on the same state.
    const replay = structuredClone(back.state);
    const live = structuredClone(auth.state);
    for (let n = 0; n < 20; n++) {
      const inputs = [{ ...EMPTY_INPUT, aimX: 9, aimY: 1 }, { ...EMPTY_INPUT, crouch: n < 10, aimX: 0, aimY: 1 }];
      step(replay, inputs);
      step(live, inputs);
    }
    expect(replay).toEqual(live);
    expect(live.fighters[1].crouch).toBe(0);
  });

  it('a snapshot from an older game without the crouch field still steps (no NaN)', () => {
    const s = fighting();
    place(s, 0, 5);
    delete (s.fighters[0] as Partial<(typeof s.fighters)[0]>).crouch;
    run(s, 10, { down: true, right: true });
    expect(Number.isFinite(s.fighters[0].x)).toBe(true);
    expect(s.fighters[0].crouch).toBe(1);
  });
});

describe('crouch: bots', () => {
  it('a bot ducks a shot it sees coming, sometimes (more often on hard), not always', () => {
    const ducks = (level: 'easy' | 'normal' | 'hard') => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const s = fighting();
        place(s, 0, -5.5);
        place(s, 1, 7);
        const bot = createBot(1, seed, level);
        let crouched = false;
        for (let i = 0; i < 24; i++) {
          // A flat shot at head height every few ticks, flying at the bot.
          if (i % 6 === 0)
            s.projectiles.push({ id: 900 + i, kind: 'bullet', gun: 'pistol', ox: -4, oy: 1.75, owner: 0, x: -4, y: 1.75, vx: 30, vy: 0, damage: 0, knockback: 0, life: 1, hit: [] });
          const b = bot(s);
          step(s, [{ ...EMPTY_INPUT }, { ...b, fire: false, left: false, right: false, up: false, dash: false, push: false, down: false }]);
          if (s.fighters[1].crouch > 0) crouched = true;
        }
        if (crouched) n++;
      }
      return n;
    };
    const easy = ducks('easy');
    const hard = ducks('hard');
    expect(hard).toBeGreaterThan(0);
    expect(hard).toBeLessThan(40);
    expect(hard).toBeGreaterThan(easy);
  });

  it('bots crouch now and then in a match, stay beatable and still score', () => {
    let crouchTicks = 0;
    let ticks = 0;
    let kos = 0;
    for (const seed of [1, 2, 3, 4]) {
      const s = createGame(['hotfix', 'legacy'], seed);
      const bots = [createBot(0, seed * 3, 'hard'), createBot(1, seed * 5, 'hard')];
      for (let i = 0; i < 60 * 150 && s.phase !== 'over'; i++) {
        step(s, bots.map((b) => b(s)));
        for (const f of s.fighters) {
          ticks++;
          if (f.crouch > 0) crouchTicks++;
        }
      }
      kos += s.fighters[0].kos + s.fighters[1].kos;
    }
    expect(crouchTicks).toBeGreaterThan(0);
    expect(crouchTicks / ticks).toBeLessThan(0.05);
    expect(kos).toBeGreaterThan(8);
  });

  it('the bot aims at the crouched body, not over it', () => {
    const s = fighting();
    place(s, 0, -5.5);
    place(s, 1, 7);
    run(s, 10, {}, { down: true });
    const bot = createBot(0, 1, 'hard');
    const out = bot(s);
    const t = s.fighters[1];
    expect(out.aimY).toBeCloseTo(t.y + bodyHeight(t) * 0.55);
    expect(out.aimY).toBeLessThan(t.y + bodyHeight(t));
  });
});
