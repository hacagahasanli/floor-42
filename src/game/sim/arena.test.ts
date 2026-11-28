import { createBot } from './bot';
import { ARENA, baseOf, CHARACTERS, GUNS, isClosed, isSolid, RULES } from './constants';
import { createGame, newWeapon, step } from './step';
import { EMPTY_INPUT } from './types';

import type { Platform } from './constants';
import type { CharacterId, GameEvent, GameState, InputState } from './types';

// Tests for docs/ARENA.md: what you can stand on, what you pass through, what stops a shot.

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

const fighting = (chars: [CharacterId, CharacterId] = ['hotfix', 'legacy']): GameState => {
  const s = createGame(chars);
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
  Object.assign(s.fighters[id], { x, y, vx: 0, vy: 0, onGround: false });
/** Parks fighter `id` out of the way, in a corner of the floor. */
const park = (s: GameState, id: number) => place(s, id, ARENA.left + 1, 0);

/** The top of a surface at exactly (x, y): the floor or a platform whose top is at y and spans x. */
const surfaceAt = (x: number, y: number) =>
  y === ARENA.floor || ARENA.platforms.some((p) => Math.abs(p.y - y) < 1e-9 && x >= p.x0 && x <= p.x1);

/** Feet on the floor or on a platform top, with the overhang landing allows (half the half-width). */
const standingOnSomething = (x: number, y: number, halfW: number) =>
  Math.abs(y - ARENA.floor) < 1e-6 ||
  ARENA.platforms.some((p) => Math.abs(p.y - y) < 1e-6 && x + halfW * 0.5 >= p.x0 - 1e-6 && x - halfW * 0.5 <= p.x1 + 1e-6);

/** The one-way floor a box stands on (or null for the floor). */
const hostOf = (box: Platform) =>
  baseOf(box) === ARENA.floor
    ? null
    : ARENA.platforms.find((q) => !isSolid(q) && Math.abs(q.y - baseOf(box)) < 1e-9 && box.x0 >= q.x0 && box.x1 <= q.x1)!;

const NEW_STYLES = ['crate', 'metal', 'rack', 'ledge'];
const added = ARENA.platforms.filter((p) => NEW_STYLES.includes(p.style));
const boxes = ARENA.platforms.filter((p) => isSolid(p) && baseOf(p) > ARENA.floor);
const label = (p: Platform) => `${p.style} at ${p.x0}..${p.x1} (top ${p.y})`;

describe('nothing floats: every spawn and gun spot sits on something you can stand on', () => {
  for (const s of ARENA.spawns) {
    it(`spawn (${s.x}, ${s.y})`, () => expect(surfaceAt(s.x, s.y)).toBe(true));
  }
  ARENA.gunSpawns.forEach((g, i) => {
    for (const s of g.spots) {
      it(`gun ${i} at (${s.x}, ${s.y})`, () => expect(surfaceAt(s.x, s.y)).toBe(true));
    }
  });
  it('no spawn or gun spot is inside a box', () => {
    const spots = [...ARENA.spawns, ...ARENA.gunSpawns.flatMap((g) => g.spots)];
    for (const s of spots) {
      for (const b of ARENA.platforms.filter(isSolid)) {
        expect(s.x > b.x0 && s.x < b.x1 && s.y >= baseOf(b) && s.y < b.y).toBe(false);
      }
    }
  });
  it('every box stands on something: the floor, a walkway or a balcony', () => {
    for (const b of boxes) expect(hostOf(b)).toBeTruthy();
  });
});

describe('standing on each new object', () => {
  for (const p of added) {
    for (const char of ['hotfix', 'legacy', 'standup', 'intern'] as const) {
      it(`${char} drops onto the ${label(p)} and stays there`, () => {
        const s = fighting([char, 'legacy']);
        park(s, 1);
        place(s, 0, (p.x0 + p.x1) / 2, p.y + 0.6);
        run(s, 40);
        expect(s.fighters[0].onGround).toBe(true);
        expect(s.fighters[0].y).toBeCloseTo(p.y, 6);
        run(s, 60);
        expect(s.fighters[0].y).toBeCloseTo(p.y, 6);
      });
    }

    it(`Down on the ${label(p)} ${isSolid(p) ? 'does nothing (it is a box)' : 'drops through (a one-way ledge)'}`, () => {
      const s = fighting();
      park(s, 1);
      place(s, 0, (p.x0 + p.x1) / 2, p.y + 0.3);
      run(s, 30);
      run(s, 1, { down: true });
      run(s, 40);
      if (isSolid(p)) expect(s.fighters[0].y).toBeCloseTo(p.y, 6);
      else expect(s.fighters[0].y).toBeLessThan(p.y - 0.5);
    });
  }

  /** Climbs onto `p` from `from` (on the level below or beside it): jump, then jump again near the top. */
  const climb = (char: CharacterId, p: Platform, from: { x: number; y: number }) => {
    const s = fighting([char, 'legacy']);
    park(s, 1);
    place(s, 0, from.x, from.y);
    run(s, 10);
    expect(s.fighters[0].onGround).toBe(true);
    // Steer like a player: towards the middle of the top until over it, jump at once and again near the apex.
    const mid = (p.x0 + p.x1) / 2;
    for (let i = 0; i < 90; i++) {
      const f = s.fighters[0];
      const off = mid - f.x;
      const steer = Math.abs(off) < 0.15 ? {} : off > 0 ? { right: true } : { left: true };
      run(s, 1, { ...steer, up: i === 0 || i === 17 });
    }
    return s.fighters[0];
  };

  for (const b of boxes) {
    const host = hostOf(b)!;
    for (const side of [-1, 1] as const) {
      const room = side < 0 ? b.x0 - host.x0 : host.x1 - b.x1;
      if (room < 1.6) continue;
      for (const char of ['hotfix', 'legacy'] as const) {
        it(`${char} climbs the ${label(b)} from its ${side < 0 ? 'left' : 'right'}`, () => {
          const halfW = CHARACTERS[char].width / 2;
          const x = side < 0 ? b.x0 - halfW - 0.6 : b.x1 + halfW + 0.6;
          const f = climb(char, b, { x, y: host.y });
          expect(f.onGround).toBe(true);
          expect(f.y).toBeCloseTo(b.y, 6);
        });
      }
    }
  }

  for (const p of added.filter((q) => !isSolid(q))) {
    // The level under a ledge: the highest one-way floor below its middle.
    const mid = (p.x0 + p.x1) / 2;
    const under = ARENA.platforms
      .filter((q) => !isSolid(q) && q.y < p.y && mid >= q.x0 && mid <= q.x1)
      .reduce((a, q) => (q.y > a ? q.y : a), ARENA.floor);
    for (const char of ['hotfix', 'legacy'] as const) {
      it(`${char} jumps up through the ${label(p)} from below and lands on it`, () => {
        const f = climb(char, p, { x: mid, y: under });
        expect(f.onGround).toBe(true);
        expect(f.y).toBeCloseTo(p.y, 6);
      });
    }
  }
});

describe('boxes are solid on every side', () => {
  for (const b of boxes) {
    const host = hostOf(b)!;
    for (const side of [-1, 1] as const) {
      const room = side < 0 ? b.x0 - host.x0 : host.x1 - b.x1;
      if (room < 1.6) continue;
      it(`running and dashing into the ${label(b)} from the ${side < 0 ? 'left' : 'right'} stops at its side`, () => {
        const s = fighting();
        park(s, 1);
        const halfW = CHARACTERS.hotfix.width / 2;
        place(s, 0, side < 0 ? b.x0 - halfW - 1 : b.x1 + halfW + 1, host.y);
        run(s, 5);
        const into = side < 0 ? { right: true } : { left: true };
        for (let i = 0; i < 60; i++) {
          run(s, 1, i === 15 ? { ...into, dash: true } : into);
          const f = s.fighters[0];
          expect(f.y).toBeCloseTo(host.y, 6);
          expect(f.x + halfW <= b.x0 + 1e-6 || f.x - halfW >= b.x1 - 1e-6).toBe(true);
        }
      });
    }

    it(`a jump from below stops under the ${label(b)} (no jumping up into it through the floor it stands on)`, () => {
      // Whatever is under the box's middle: the table, a cabinet, or the floor.
      const mid = (b.x0 + b.x1) / 2;
      const below = ARENA.platforms
        .filter((q) => q.y < baseOf(b) && mid >= q.x0 && mid <= q.x1)
        .reduce((a, q) => (q.y > a ? q.y : a), ARENA.floor);
      const s = fighting();
      park(s, 1);
      const c = CHARACTERS.hotfix;
      place(s, 0, mid, below);
      run(s, 5);
      let head = 0;
      run(s, 1, { up: true });
      for (let i = 0; i < 70; i++) {
        run(s, 1, i === 14 ? { up: true } : {});
        head = Math.max(head, s.fighters[0].y + c.height);
      }
      expect(head).toBeLessThanOrEqual(baseOf(b) + 1e-6);
      expect(s.fighters[0].onGround).toBe(true);
      expect(s.fighters[0].y).toBeCloseTo(below, 6);
    });
  }
});

describe('decor is pass-through', () => {
  const walkTo = (from: { x: number; y: number }, toX: number) => {
    const s = fighting();
    park(s, 1);
    if (from.x < ARENA.left + 3) place(s, 1, ARENA.right - 1, 0);
    place(s, 0, from.x, from.y);
    run(s, 5);
    run(s, 150, toX > from.x ? { right: true } : { left: true });
    return s.fighters[0];
  };
  const halfW = CHARACTERS.hotfix.width / 2;

  it('the open floor between the table and the counter (printer, plant, pendant lamps above): end to end', () => {
    const table = ARENA.platforms.find((p) => p.style === 'table')!;
    const counter = ARENA.platforms.find((p) => p.style === 'counter')!;
    expect(walkTo({ x: table.x1 + 1, y: 0 }, counter.x0).x).toBeCloseTo(counter.x0 - halfW, 3);
    expect(walkTo({ x: counter.x0 - 1, y: 0 }, table.x1).x).toBeCloseTo(table.x1 + halfW, 3);
  });

  it('the fridge and the bookshelf stand against the back wall: you walk in front of them to the glass', () => {
    const counter = ARENA.platforms.find((p) => p.style === 'counter')!;
    expect(walkTo({ x: counter.x1 + 0.6, y: 0 }, ARENA.right).x).toBeCloseTo(ARENA.right - halfW, 3);
    const desk = ARENA.platforms.find((p) => p.style === 'desk')!;
    expect(walkTo({ x: desk.x0 - 0.6, y: 0 }, ARENA.left).x).toBeCloseTo(ARENA.left + halfW, 3);
  });

  it('wall monitors, pendant lamps and vents never stop a jump (they hang behind the fight plane)', () => {
    // Under each pendant lamp (x ±5.2, ±1.9) and wall monitor (x ±6, ±12), jump from the level below: full height.
    for (const x of [-5.2, 5.2, -6, 6]) {
      const s = fighting();
      park(s, 1);
      place(s, 0, x, 4.4);
      run(s, 5);
      let top = 0;
      run(s, 1, { up: true });
      for (let i = 0; i < 30; i++) {
        run(s, 1);
        top = Math.max(top, s.fighters[0].y);
      }
      expect(top).toBeGreaterThan(4.4 + 2.5);
    }
  });
});

describe('no standing in air', () => {
  for (const p of ARENA.platforms) {
    for (const side of [-1, 1] as const) {
      it(`just past the ${side < 0 ? 'left' : 'right'} edge of the ${label(p)}, you fall`, () => {
        const s = fighting();
        park(s, 1);
        const halfW = CHARACTERS.hotfix.width / 2;
        const x = side < 0 ? p.x0 - halfW * 0.5 - 0.03 : p.x1 + halfW * 0.5 + 0.03;
        if (x - halfW < ARENA.left || x + halfW > ARENA.right) return;
        place(s, 0, x, p.y + 0.2);
        run(s, 60);
        expect(s.fighters[0].y).toBeLessThan(p.y);
      });
    }
  }

  it('in bot matches, whenever a fighter is on the ground its feet are on the floor or a platform top', () => {
    for (const seed of [3, 11]) {
      const s = createGame(['hotfix', 'legacy'], seed);
      const bots = [createBot(0, seed * 7), createBot(1, seed * 13)];
      // (The tick a fighter respawns, 1.5 m above a spawn point, still carries its old ground flag: skip it.)
      let wasDown = [false, false];
      for (let i = 0; i < 60 * 90 && s.phase !== 'over'; i++) {
        step(s, bots.map((b) => b(s)));
        const down = s.fighters.map((f) => f.respawn > 0);
        const skip = wasDown;
        wasDown = down;
        for (const f of s.fighters) {
          if (!f.onGround || f.respawn > 0 || skip[f.id]) continue;
          expect(standingOnSomething(f.x, f.y, CHARACTERS[f.character].width / 2)).toBe(true);
        }
      }
    }
  });
});

describe('closed boxes stop bullets; rails still go through', () => {
  /** A bullet fired flat at mid-height of the box, from 3 m to its `side`, towards it. */
  const flatShot = (s: GameState, b: Platform, side: -1 | 1, kind: 'bullet' | 'rail' = 'bullet') => {
    const y = (baseOf(b) + b.y) / 2;
    const x = side < 0 ? b.x0 - 3 : b.x1 + 3;
    const gun = kind === 'rail' ? 'railgun' : 'smg';
    const v = -side * GUNS[gun].speed;
    s.projectiles.push({
      id: 99, kind, gun, owner: 1, x, y, ox: x, oy: y,
      vx: v, vy: 0, damage: GUNS[gun].damage, knockback: GUNS[gun].knockback, life: 1, hit: [],
    });
  };
  for (const b of ARENA.platforms.filter(isClosed)) {
    for (const side of [-1, 1] as const) {
      it(`a flat shot into the ${side < 0 ? 'left' : 'right'} side of the ${label(b)} stops at it`, () => {
        const s = fighting();
        park(s, 0);
        park(s, 1);
        flatShot(s, b, side);
        const events = run(s, 20);
        const impact = events.find((e) => e.type === 'impact');
        expect(impact).toBeTruthy();
        expect((impact as { x: number }).x).toBeCloseTo(side < 0 ? b.x0 : b.x1, 1);
      });
    }
    it(`a rail goes straight through the ${label(b)}`, () => {
      const s = fighting();
      park(s, 0);
      park(s, 1);
      flatShot(s, b, -1, 'rail');
      const events = run(s, 3);
      expect(events.some((e) => e.type === 'impact')).toBe(false);
      expect(s.projectiles.some((p) => p.x > b.x1)).toBe(true);
    });
  }

  it('a metal box on the balcony covers the legs of whoever stands behind it, not their head', () => {
    const b = ARENA.platforms.find((p) => p.style === 'metal' && p.x0 < 0)!;
    const s = fighting();
    s.fighters[0].weapon = newWeapon('smg');
    place(s, 0, -16, b.base);
    place(s, 1, b.x1 + 0.9, b.base);
    run(s, 5);
    // At the knees: every round stops at the box.
    run(s, 40, { fire: true, aimX: s.fighters[1].x, aimY: b.base! + 0.4 });
    expect(s.fighters[0].stats.shots).toBeGreaterThan(3);
    expect(s.fighters[1].hp).toBe(CHARACTERS.legacy.hp);
    // Over the top, at the head: it lands.
    run(s, 40, { fire: true, aimX: s.fighters[1].x, aimY: b.base! + 1.7 });
    expect(s.fighters[1].hp).toBeLessThan(CHARACTERS.legacy.hp);
  });

  it('the server rack is full cover on its walkway: a chest-high shot from beside it stops', () => {
    const rack = ARENA.platforms.find((p) => p.style === 'rack')!;
    const s = fighting();
    s.fighters[0].weapon = newWeapon('smg');
    place(s, 0, 7.5, rack.base);
    // Fighter 1 hangs in the air just past the rack's far side, chest at the rack's middle (held there each tick).
    const hold = () => place(s, 1, rack.x0 - 0.8, rack.base! + 0.2);
    hold();
    for (let i = 0; i < 40; i++) {
      hold();
      run(s, 1, { fire: true, aimX: rack.x0 - 0.8, aimY: rack.base! + 1.2 });
    }
    expect(s.fighters[0].stats.shots).toBeGreaterThan(3);
    expect(s.fighters[1].hp).toBe(CHARACTERS.legacy.hp);
  });
});

describe('bots path over the new layout', () => {
  /** A bot (fighter 0) chasing a far, harmless rival: does it get past `pastX` (in the direction of travel)? */
  const chase = (from: { x: number; y: number }, rival: { x: number; y: number }, pastX: number, seed: number, gun?: 'shotgun') => {
    const s = fighting(['hotfix', 'legacy']);
    const bot = createBot(0, seed, 'normal');
    // The smart bot keeps its gun's range instead of running at the rival: a shotgun makes it close in.
    if (gun) s.fighters[0].weapon = newWeapon(gun);
    place(s, 0, from.x, from.y);
    place(s, 1, rival.x, rival.y);
    const dir = rival.x > from.x ? 1 : -1;
    for (let i = 0; i < 60 * 8; i++) {
      Object.assign(s.fighters[1], { x: rival.x, y: rival.y, vx: 0, vy: 0, hp: 100, invulnerable: 1 });
      step(s, [bot(s), { ...EMPTY_INPUT }]);
      const f = s.fighters[0];
      if ((f.x - pastX) * dir > 0) return { ok: true, f };
    }
    return { ok: false, f: s.fighters[0] };
  };

  for (const seed of [1, 2, 3]) {
    it(`gets over the server rack on the right walkway (seed ${seed})`, () => {
      const rack = ARENA.platforms.find((p) => p.style === 'rack')!;
      expect(chase({ x: 6.5, y: 4.4 }, { x: -15, y: 9.4 }, rack.x0, seed).ok).toBe(true);
    });
    it(`gets over the crate on the left walkway (seed ${seed})`, () => {
      const crate = ARENA.platforms.find((p) => p.style === 'crate')!;
      expect(chase({ x: -6.5, y: 4.4 }, { x: 15, y: 9.4 }, crate.x1, seed).ok).toBe(true);
    });
    for (const sign of [-1, 1] as const) {
      it(`gets over the metal box on the ${sign < 0 ? 'left' : 'right'} balcony (seed ${seed})`, () => {
        const b = ARENA.platforms.find((p) => p.style === 'metal' && Math.sign(p.x0) === sign)!;
        const pastX = sign < 0 ? b.x1 : b.x0;
        expect(chase({ x: sign * 15.5, y: 9.4 }, { x: -sign * 15, y: 9.4 }, pastX, seed, 'shotgun').ok).toBe(true);
      });
    }
  }

  it('two bots never get stuck: nobody alive stays in one spot for 5 seconds', () => {
    for (const seed of [1, 4, 9]) {
      const s = createGame(['standup', 'intern'], seed);
      const bots = [createBot(0, seed), createBot(1, seed + 100)];
      const trail: { x: number; y: number; alive: boolean }[][] = [[], []];
      for (let i = 0; i < 60 * 120 && s.phase !== 'over'; i++) {
        step(s, bots.map((b) => b(s)));
        s.fighters.forEach((f, k) => trail[k].push({ x: f.x, y: f.y, alive: s.phase === 'fight' && f.respawn <= 0 }));
      }
      for (const t of trail) {
        for (let i = 0; i + 300 < t.length; i += 30) {
          const w = t.slice(i, i + 300);
          if (!w.every((p) => p.alive)) continue;
          const xs = w.map((p) => p.x);
          const ys = w.map((p) => p.y);
          expect(Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.3);
        }
      }
    }
  });

  it('bots use the new objects: over a few matches they stand on each of them', () => {
    const used = new Set<string>();
    // 14 matches: bots that duck shots play each match out differently, and the right metal box needed more.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
      const s = createGame(['hotfix', 'legacy'], seed);
      const bots = [createBot(0, seed * 3), createBot(1, seed * 5)];
      for (let i = 0; i < 60 * 150 && s.phase !== 'over'; i++) {
        step(s, bots.map((b) => b(s)));
        for (const f of s.fighters) {
          if (!f.onGround) continue;
          for (const p of added) if (Math.abs(f.y - p.y) < 1e-6 && f.x >= p.x0 - 0.3 && f.x <= p.x1 + 0.3) used.add(label(p));
        }
      }
    }
    expect([...used].sort()).toEqual(added.map(label).sort());
  });
});
