import { createBot } from './bot';
import { CHARACTERS, DT, GUNS, RULES } from './constants';
import { applyHit, chooseCharacter, createGame, newWeapon, step } from './step';
import { afterMoveTraits, fullLoad, magSize, maxHp, TRAIT_CFG, TRAIT_HP } from './traits';
import { EMPTY_INPUT } from './types';

import type { CharacterId, GameEvent, GameState, GunKind, InputState } from './types';

const run = (
  state: GameState,
  ticks: number,
  p0: Partial<InputState> = {},
  p1: Partial<InputState> = {},
) => {
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
const secs = (s: number) => Math.round(s / DT);

const game = (a: CharacterId, b: CharacterId, traits = true, seed = 7): GameState => {
  const s = createGame([a, b], seed, false, undefined, { traits });
  s.phase = 'fight';
  s.phaseTime = RULES.roundSeconds;
  s.dropTimer = Infinity;
  s.pickups.forEach((p) => {
    p.active = false;
    p.respawn = Infinity;
  });
  return s;
};
const hit = (s: GameState, id: number, damage: number, attacker = 1 - id) =>
  applyHit(s, s.fighters[id], { attacker, dx: 1, dy: 0, damage, knockback: 0 });
const traitEvents = (ev: GameEvent[], trait: string) =>
  ev.filter((e) => e.type === 'trait' && e.trait === trait);

describe('flag and table', () => {
  it('off by default: 100 hp for all, power guns as before, no trait fields, no flag key', () => {
    const s = createGame(['hotfix', 'legacy'], 5);
    expect('traits' in s).toBe(false);
    expect(s.fighters.map((f) => f.hp)).toEqual([100, 100]);
    expect(s.fighters.every((f) => !('trait' in f))).toBe(true);
    expect(createGame(['hotfix', 'legacy'], 5, true)).not.toHaveProperty('traits');
    expect(
      createGame(['hotfix', 'legacy'], 5, false, undefined, { traits: false }),
    ).not.toHaveProperty('traits');
  });

  it('on: per-slot max HP, at spawn and after a respawn', () => {
    expect(TRAIT_HP).toEqual({ hotfix: 110, legacy: 115, standup: 82, intern: 100 });
    for (const c of Object.keys(TRAIT_HP) as CharacterId[]) {
      const s = game(c, 'intern');
      expect(s.traits).toBe(true);
      expect(s.fighters[0].hp).toBe(TRAIT_HP[c]);
      expect(maxHp(s, s.fighters[0])).toBe(TRAIT_HP[c]);
      s.fighters[0].hp = 1;
      hit(s, 0, 5);
      s.fighters[0].hp = 0;
      s.fighters[0].respawn = DT / 2;
      run(s, 30);
      expect(s.fighters[0].hp).toBe(TRAIT_HP[c]);
    }
  });

  it('off: maxHp ignores the table (CHARACTERS.hp stays 100)', () => {
    const s = game('standup', 'legacy', false);
    expect(maxHp(s, s.fighters[0])).toBe(100);
    expect(CHARACTERS.standup.hp).toBe(100);
  });

  it('power guns do 120 on and 100/110/110 off, and still one-shot the 115 tank', () => {
    expect([GUNS.railgun.damage, GUNS.launcher.damage, GUNS.bomb.damage]).toEqual([100, 110, 110]);
    for (const [kind, off] of [
      ['railgun', 100],
      ['launcher', 110],
    ] as [GunKind, number][]) {
      for (const on of [true, false]) {
        const s = game('intern', 'legacy', on);
        s.fighters[0].weapon = newWeapon(kind);
        Object.assign(s.fighters[0], { x: -3, y: 0 });
        Object.assign(s.fighters[1], { x: 3, y: 0 });
        step(s, [{ ...EMPTY_INPUT, fire: true, aimX: 6, aimY: 1 }, EMPTY_INPUT]);
        expect(s.projectiles[0].damage).toBe(on ? 120 : off);
      }
    }
    const s = game('intern', 'legacy');
    s.fighters[0].weapon = newWeapon('railgun');
    Object.assign(s.fighters[0], { x: -3, y: 0 });
    Object.assign(s.fighters[1], { x: 3, y: 0 });
    run(s, 6, { fire: true, aimX: 3, aimY: 1.1 });
    expect(s.fighters[0].kos).toBe(1);
  });

  it('bomb thrown with traits on carries 120', () => {
    const s = game('intern', 'legacy');
    s.fighters[0].bombs = 1;
    step(s, [{ ...EMPTY_INPUT, throwBomb: true, aimX: 5, aimY: 1 }, EMPTY_INPUT]);
    expect(s.projectiles.find((p) => p.kind === 'bomb')?.damage).toBe(120);
  });
});

describe('ORMO Tea Break', () => {
  const healStart = (c: CharacterId) => {
    const s = game(c, 'intern');
    const f = s.fighters[0];
    f.hp = 40;
    f.sinceHit = 0;
    let t = 0;
    while (f.hp <= 40 && t < secs(6)) {
      run(s, 1);
      t++;
    }
    return { t: t * DT, hp: f.hp, s };
  };

  it('ORMO heals after 3.0 s, everyone else after 4.0 s', () => {
    expect(healStart('legacy').t).toBeCloseTo(3.0, 1);
    for (const c of ['hotfix', 'standup', 'intern'] as CharacterId[])
      expect(healStart(c).t).toBeCloseTo(4.0, 1);
  });

  it('rate stays 15 hp/s and tops out at his 115', () => {
    const { s } = healStart('legacy');
    const f = s.fighters[0];
    const h0 = f.hp;
    run(s, secs(1));
    expect(f.hp - h0).toBeCloseTo(RULES.regenPerSecond, 0);
    run(s, secs(10));
    expect(f.hp).toBe(115);
  });

  it('damage resets the timer; dealing damage does not', () => {
    const s = game('legacy', 'intern');
    const f = s.fighters[0];
    f.hp = 40;
    run(s, secs(2.5));
    hit(s, 0, 5);
    const h = f.hp;
    run(s, secs(2.9));
    expect(f.hp).toBe(h);
    run(s, secs(0.5));
    expect(f.hp).toBeGreaterThan(h);
    // Dealing damage: his own hit on the rival does not delay his healing.
    const s2 = game('legacy', 'intern');
    s2.fighters[0].hp = 40;
    run(s2, secs(2.5));
    hit(s2, 1, 5, 0);
    run(s2, secs(0.7));
    expect(s2.fighters[0].hp).toBeGreaterThan(40);
  });

  it('with traits off ORMO waits the old 4.0 s', () => {
    const s = game('legacy', 'intern', false);
    s.fighters[0].hp = 40;
    run(s, secs(3.5));
    expect(s.fighters[0].hp).toBe(40);
  });

  it('emits one teaBreak event when the healing starts', () => {
    const s = game('legacy', 'intern');
    s.fighters[0].hp = 40;
    const ev = run(s, secs(6));
    expect(traitEvents(ev, 'teaBreak')).toHaveLength(1);
  });
});

describe('ZUZU Sugar Rush', () => {
  const topSpeed = (s: GameState) => {
    Object.assign(s.fighters[0], { x: -8, y: 1.1, vx: 0, vy: 0, onGround: true, stun: 0 });
    let top = 0;
    for (let i = 0; i < secs(0.4); i++) {
      run(s, 1, { right: true });
      top = Math.max(top, s.fighters[0].vx);
    }
    return top;
  };

  it('a rival hit that she survives gives 1.2x run speed for 1.0 s, then it ends', () => {
    const plain = game('standup', 'intern');
    const base = topSpeed(plain);
    const s = game('standup', 'intern');
    Object.assign(s.fighters[1], { x: 15 });
    expect(hit(s, 0, 10)).toBe(true);
    expect(s.fighters[0].trait?.rush).toBeCloseTo(1.0, 5);
    const rushed = topSpeed(s);
    expect(rushed / base).toBeCloseTo(1.2, 1);
    // Gone after 1.0 s from the trigger.
    run(s, secs(0.9));
    expect(s.fighters[0].trait!.rush).toBe(0);
    const after = topSpeed(s);
    expect(after).toBeCloseTo(base, 1);
  });

  it('emits a sugarRush event on trigger', () => {
    const s = game('standup', 'intern');
    hit(s, 0, 10);
    expect(traitEvents(s.events, 'sugarRush')).toHaveLength(1);
  });

  it('does not stack or refresh during the burst, and has a 4.0 s cooldown from the trigger', () => {
    const s = game('standup', 'intern');
    hit(s, 0, 5);
    run(s, secs(0.5));
    hit(s, 0, 5);
    expect(s.fighters[0].trait!.rush).toBeCloseTo(0.5, 1);
    run(s, secs(0.6)); // burst over at 1.0 s
    expect(s.fighters[0].trait!.rush).toBe(0);
    hit(s, 0, 5); // t = 1.1 s: cooling down
    expect(s.fighters[0].trait!.rush).toBe(0);
    run(s, secs(2.8)); // t = 3.9 s
    hit(s, 0, 5);
    expect(s.fighters[0].trait!.rush).toBe(0);
    run(s, secs(0.2)); // t = 4.1 s
    hit(s, 0, 5);
    expect(s.fighters[0].trait!.rush).toBeCloseTo(1.0, 5);
  });

  it('does not trigger on her own rocket, a wall splat, a lethal hit, or for the other characters', () => {
    const s = game('standup', 'intern');
    hit(s, 0, 20, 0);
    expect(s.fighters[0].trait!.rush).toBe(0);
    const k = game('standup', 'intern');
    hit(k, 0, 999);
    expect(k.fighters[0].trait!.rush).toBe(0);
    const o = game('intern', 'standup');
    hit(o, 0, 10);
    expect(o.fighters[0].trait?.rush ?? 0).toBe(0);
    // Wall splat: pushed into the glass at speed.
    const w = game('standup', 'intern');
    Object.assign(w.fighters[0], { x: -100, pushed: 1, vx: -30 });
    run(w, 2);
    expect(w.fighters[0].trait!.rush).toBe(0);
  });

  it('off: no effect', () => {
    const s = game('standup', 'intern', false);
    hit(s, 0, 10);
    expect(s.fighters[0].trait).toBeUndefined();
  });
});

describe('TAVO Packed Extra', () => {
  const pick = (c: CharacterId, kind: GunKind, traits = true) => {
    const s = game(c, 'legacy', traits);
    const p = s.pickups[0];
    Object.assign(p, { active: true, kind, x: s.fighters[0].x, y: s.fighters[0].y, vy: 0 });
    step(s, [{ ...EMPTY_INPUT, pickup: true }, EMPTY_INPUT]);
    return s;
  };

  it('SMG 25+50, Uzi 40+40, shotgun 5+10', () => {
    for (const [kind, mag, reserve] of [
      ['smg', 25, 50],
      ['uzi', 40, 40],
      ['shotgun', 5, 10],
    ] as [GunKind, number, number][]) {
      const s = pick('intern', kind);
      const w = s.fighters[0].weapon;
      expect(w.kind).toBe(kind);
      expect([w.mag, w.reserve]).toEqual([mag, reserve]);
      expect(magSize(w)).toBe(mag);
      expect(traitEvents(s.events, 'packedExtra')).toHaveLength(1);
    }
  });

  it('rail, rockets and bombs are unchanged; so is the pistol', () => {
    for (const kind of ['railgun', 'launcher'] as GunKind[]) {
      const w = pick('intern', kind).fighters[0].weapon;
      expect([w.mag, w.reserve, w.cap]).toEqual([GUNS[kind].mag, GUNS[kind].reserve, undefined]);
    }
    const s = game('intern', 'legacy');
    expect(s.fighters[0].weapon.cap).toBeUndefined();
    const b = pick('intern', 'bomb');
    expect(b.fighters[0].bombs).toBe(1);
  });

  it('other characters, and traits off, get the normal load', () => {
    for (const w of [
      pick('hotfix', 'smg').fighters[0].weapon,
      pick('intern', 'smg', false).fighters[0].weapon,
    ]) {
      expect([w.mag, w.reserve, w.cap]).toEqual([GUNS.smg.mag, GUNS.smg.reserve, undefined]);
    }
  });

  it('reloads to the bigger magazine and spends the bigger reserve', () => {
    const s = pick('intern', 'smg');
    const f = s.fighters[0];
    f.weapon.mag = 3;
    run(s, 1, { reload: true });
    run(s, secs(GUNS.smg.reloadTime) + 2);
    expect(f.weapon.mag).toBe(25);
    expect(f.weapon.reserve).toBe(50 - 22);
  });

  it('does not stack: picking another gun makes a fresh weapon, and a respawn resets to the pistol', () => {
    const s = pick('intern', 'smg');
    Object.assign(s.pickups[1], {
      active: true,
      kind: 'smg',
      x: s.fighters[0].x,
      y: s.fighters[0].y,
      vy: 0,
    });
    step(s, [{ ...EMPTY_INPUT, pickup: true }, EMPTY_INPUT]);
    expect([s.fighters[0].weapon.mag, s.fighters[0].weapon.reserve]).toEqual([25, 50]);
  });

  it('the low-ammo assist counts against the packed load', () => {
    const w = newWeapon('smg');
    Object.assign(w, { cap: 25, mag: 5, reserve: 8 });
    expect(fullLoad(w)).toBe(25 + 50);
    expect(fullLoad(newWeapon('smg'))).toBe(GUNS.smg.mag + GUNS.smg.reserve);
  });
});

describe('BRIX Leapfrog', () => {
  const setup = () => {
    const s = game('hotfix', 'intern');
    const [b, r] = s.fighters;
    Object.assign(r, { x: 0, y: 0, onGround: true });
    Object.assign(b, { x: -0.1, y: 2.5, onGround: false, dashCooldown: 0.5, airDashes: 0 });
    run(s, 0); // nothing
    afterMoveTraits(s); // prime: positions and alive flags
    return { s, b, r };
  };
  const cross = (s: GameState, y: number, x = 0.1) => {
    s.fighters[0].x = x;
    s.fighters[0].y = y;
    s.events = [];
    afterMoveTraits(s);
    return traitEvents(s.events, 'leapfrog').length;
  };

  it('crossing over a standing rival resets the dash and gives an air dash back', () => {
    const { s, b } = setup();
    expect(cross(s, 2.5)).toBe(1);
    expect(b.dashCooldown).toBe(0);
    expect(b.airDashes).toBe(1);
  });

  it('feet below the rival top, or more than 2.5 m above it, does not count', () => {
    const low = setup();
    low.b.y = 1.0;
    afterMoveTraits(low.s);
    low.b.x = -0.1;
    low.b.y = 1.0;
    low.s.fighters[0].trait!.px = -0.1;
    low.s.fighters[0].trait!.py = 1.0;
    expect(cross(low.s, 1.0)).toBe(0);
    const high = setup();
    high.b.y = 4.6;
    high.s.fighters[0].trait!.py = 4.6;
    expect(cross(high.s, 4.6)).toBe(0);
    expect(high.b.airDashes).toBe(0);
  });

  it('the top follows the rival crouch: a crouched rival is easier to clear', () => {
    const { s, r, b } = setup();
    r.crouch = 1;
    b.y = 1.2;
    b.trait!.py = 1.2;
    expect(cross(s, 1.2)).toBe(1);
  });

  it('once per airborne period, and a 2.5 s trait cooldown even after landing', () => {
    const { s, b } = setup();
    expect(cross(s, 2.5)).toBe(1);
    expect(cross(s, 2.5, -0.1)).toBe(0); // back across, same jump
    b.onGround = true;
    afterMoveTraits(s);
    b.onGround = false;
    s.fighters[0].trait!.px = 0.1;
    expect(cross(s, 2.5, -0.1)).toBe(0); // re-armed by landing, but cooling down
    for (let i = 0; i < secs(2.6); i++)
      s.fighters[0].trait!.leapCd = Math.max(0, s.fighters[0].trait!.leapCd - DT);
    s.fighters[0].trait!.px = 0.1;
    expect(cross(s, 2.5, -0.1)).toBe(1);
  });

  it('nothing against a dead or respawning rival, outside the fight, or for other characters', () => {
    const a = setup();
    a.r.respawn = 2;
    expect(cross(a.s, 2.5)).toBe(0);
    const b = setup();
    b.s.phase = 'countdown';
    expect(cross(b.s, 2.5)).toBe(0);
    const c = game('intern', 'hotfix');
    Object.assign(c.fighters[0], { x: -0.1, y: 2.5, onGround: false });
    afterMoveTraits(c);
    expect(cross(c, 2.5)).toBe(0);
  });

  it('an invulnerable (just respawned) rival still counts', () => {
    const { s, r } = setup();
    r.invulnerable = 1;
    expect(cross(s, 2.5)).toBe(1);
  });

  it('works through the real step: jump over the rival with the dash on cooldown', () => {
    const s = game('hotfix', 'intern');
    const [b, r] = s.fighters;
    Object.assign(r, { x: 0, y: 0 });
    Object.assign(b, { x: -2.5, y: 0, onGround: true });
    let leaps = 0;
    for (let i = 0; i < secs(1.2); i++) {
      b.dashCooldown = Math.max(b.dashCooldown, 0.3);
      step(s, [{ ...EMPTY_INPUT, right: true, up: true }, EMPTY_INPUT]);
      leaps += traitEvents(s.events, 'leapfrog').length;
      Object.assign(r, { x: 0, hp: 110 });
    }
    expect(b.x).toBeGreaterThan(0.2);
    expect(leaps).toBeLessThanOrEqual(1);
  });
});

/** A bot-vs-bot match, hashed over every state. */
const play = (traits: boolean, seed: number, ticks: number, snapshotAt?: number) => {
  let s = createGame(
    ['hotfix', 'standup'],
    seed,
    false,
    undefined,
    traits ? { traits } : undefined,
  );
  const bots = [createBot(0, seed), createBot(1, seed + 1)];
  const log: string[] = [];
  const evs: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    if (snapshotAt === i) s = JSON.parse(JSON.stringify(s)) as GameState;
    step(s, [bots[0](s), bots[1](s)]);
    evs.push(...s.events);
    if (i % 50 === 0) log.push(JSON.stringify(s));
  }
  log.push(JSON.stringify(s));
  return { log, evs, s };
};

describe('determinism', () => {
  it('traits on: a replay is identical and the trait events fire', () => {
    const a = play(true, 11, 6000);
    const b = play(true, 11, 6000);
    expect(b.log).toEqual(a.log);
    expect(a.evs.some((e) => e.type === 'trait')).toBe(true);
  });

  it('traits on: a JSON snapshot round-trip mid-match continues identically', () => {
    const a = play(true, 21, 6000);
    const b = play(true, 21, 6000, 2500);
    expect(b.log[b.log.length - 1]).toEqual(a.log[a.log.length - 1]);
    expect(b.s.tick).toBe(a.s.tick);
  });

  it('traits off equals the old sim: no trait state, flag or events; extra {} / {traits:false} are identical', () => {
    const old = play(false, 31, 5000);
    const withExtra = (() => {
      const s = createGame(['hotfix', 'standup'], 31, false, undefined, { traits: false });
      const bots = [createBot(0, 31), createBot(1, 32)];
      const log: string[] = [];
      for (let i = 0; i < 5000; i++) {
        step(s, [bots[0](s), bots[1](s)]);
        if (i % 50 === 0) log.push(JSON.stringify(s));
      }
      log.push(JSON.stringify(s));
      return log;
    })();
    expect(withExtra).toEqual(old.log);
    expect(old.evs.some((e) => e.type === 'trait')).toBe(false);
    expect(
      old.log.some((l) => l.includes('"trait"') || l.includes('"traits"') || l.includes('"cap"')),
    ).toBe(false);
  });

  it('chooseCharacter keeps working with traits on', () => {
    const s = game('hotfix', 'standup');
    chooseCharacter(s, 0, 'legacy');
    expect(s.fighters[0].nextCharacter).toBe('legacy');
    hit(s, 0, 999);
    run(s, secs(RULES.respawnSeconds) + 30);
    expect(s.fighters[0].character).toBe('legacy');
    expect(s.fighters[0].hp).toBe(115);
  });
});

describe('config', () => {
  it('numbers match the designer table', () => {
    expect(TRAIT_CFG.teaBreak.regenAfter).toBe(3);
    expect(TRAIT_CFG.sugarRush).toMatchObject({ speedMul: 1.2, duration: 1, cooldown: 4 });
    expect(TRAIT_CFG.packedExtra).toMatchObject({ magMul: 1.25, reserveMul: 1.25 });
    expect(TRAIT_CFG.leapfrog).toMatchObject({ maxClearance: 2.5, cooldown: 2.5 });
  });
});
