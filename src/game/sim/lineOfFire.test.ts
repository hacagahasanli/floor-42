import { describe, expect, it } from 'vitest';

import { ARENAS, CHARACTERS, RULES } from './constants';
import { autoAimPoint, bodyHeight, createGame, newWeapon, step, visibleAim } from './step';
import { EMPTY_INPUT } from './types';

import type { ArenaId } from './constants';
import type { CharacterId, GameState, GunKind, InputState } from './types';

/**
 * The owner's rule (Reis, playtest 2026-11-28): no shot crosses a walkway, a boardwalk, a platform or a box, from
 * below or from above, with any gun; a shot hits only along a clear line. And auto-aim points at the rival, not
 * straight ahead, when the rival is above or below.
 */

const GUNS_FIRED: GunKind[] = ['pistol', 'smg', 'uzi', 'shotgun', 'railgun', 'launcher'];

const fighting = (arena: ArenaId, chars: [CharacterId, CharacterId]): GameState => {
  const s = createGame(chars, 3, false, undefined, { arena });
  s.phase = 'fight';
  s.phaseTime = RULES.roundSeconds;
  s.dropTimer = Infinity;
  s.pickups.forEach((p) => {
    p.active = false;
    p.respawn = Infinity;
  });
  return s;
};

const pin = (s: GameState, id: number, x: number, y: number) =>
  Object.assign(s.fighters[id], { x, y, vx: 0, vy: 0, onGround: true });

/**
 * Fighter 0 shoots at fighter 1's chest for `ticks`; both are held in place (recoil and knockback would walk them
 * off the walkway) and the target is healed each tick so a KO cannot hide later hits. Returns how many ticks the
 * target lost health.
 */
const shootAt = (
  s: GameState,
  at: { x: number; y: number; crouch?: boolean },
  them: { x: number; y: number; crouch?: boolean },
  gun: GunKind | 'bomb',
  ticks = 90,
) => {
  const foe = s.fighters[1];
  let hits = 0;
  if (gun === 'bomb') s.fighters[0].bombs = 1;
  else s.fighters[0].weapon = newWeapon(gun);
  for (let i = 0; i < ticks; i++) {
    pin(s, 0, at.x, at.y);
    pin(s, 1, them.x, them.y);
    foe.hp = CHARACTERS[foe.character].hp;
    foe.invulnerable = 0;
    const target = { aimX: foe.x, aimY: foe.y + bodyHeight(foe) * 0.55 };
    const p0: InputState = { ...EMPTY_INPUT, ...target, crouch: !!at.crouch, fire: gun !== 'bomb', throwBomb: gun === 'bomb' && i === 12 };
    const p1: InputState = { ...EMPTY_INPUT, crouch: !!them.crouch };
    step(s, [p0, p1]);
    if (foe.hp < CHARACTERS[foe.character].hp || foe.respawn > 0) hits++;
    foe.respawn = 0;
  }
  return hits;
};

/** One walkway per arena with open floor under its middle (no desk, table, boulder or crate in the way). */
const SPANS: { arena: ArenaId; name: string; y: number; above: number; below: number; edge: number; open: number }[] = [
  // OFFSITE boardwalk L (-11.4..-3.4, top 4.0); its crate is at -4.5..-3.4.
  { arena: 'offsite', name: 'OFFSITE boardwalk L', y: ARENAS.offsite.platforms[2].y, above: -7.6, below: -7.2, edge: -10.9, open: -16.5 },
  // FLOOR 42 left walkway (-8.2..-2.6, top 4.4); under it the floor between the desk (-6.2) and the table (-3).
  { arena: 'office', name: 'FLOOR 42 left walkway', y: ARENAS.office.platforms[4].y, above: -4.8, below: -4.6, edge: -7.9, open: -10.6 },
];

describe('the walkways the tests stand on are where the tests think', () => {
  it('OFFSITE boardwalk L and FLOOR 42 left walkway', () => {
    expect(ARENAS.offsite.platforms[2]).toMatchObject({ x0: -11.4, x1: -3.4, y: 4.0, style: 'walkway' });
    expect(ARENAS.office.platforms[4]).toMatchObject({ x0: -8.2, x1: -2.6, y: 4.4, style: 'walkway' });
  });
});

for (const span of SPANS) {
  describe(`${span.name}: no shot crosses it`, () => {
    for (const gun of [...GUNS_FIRED, 'bomb'] as const) {
      for (const crouch of [false, true]) {
        const pose = crouch ? 'crouched' : 'standing';
        it(`${gun}: a ${pose} shooter on it cannot hit the rival on the floor below`, () => {
          const s = fighting(span.arena, ['standup', 'legacy']);
          const hits = shootAt(s, { x: span.above, y: span.y, crouch }, { x: span.below, y: 0 }, gun);
          expect(hits).toBe(0);
        });
        it(`${gun}: a shooter on the floor cannot hit a ${pose} rival on it from below`, () => {
          const s = fighting(span.arena, ['standup', 'legacy']);
          const hits = shootAt(s, { x: span.below, y: 0 }, { x: span.above, y: span.y, crouch }, gun);
          expect(hits).toBe(0);
        });
      }
    }
  });

  describe(`${span.name}: a clear line still hits (control)`, () => {
    for (const gun of GUNS_FIRED) {
      it(`${gun}: from the walkway at a rival on the open floor beyond its end`, () => {
        const s = fighting(span.arena, ['standup', 'legacy']);
        const hits = shootAt(s, { x: span.edge, y: span.y }, { x: span.open, y: 0 }, gun);
        expect(hits).toBeGreaterThan(0);
      });
    }
  });

  describe(`${span.name}: auto-aim`, () => {
    for (const gun of GUNS_FIRED) {
      it(`${gun}: never locks onto a rival hidden under the walkway, standing or crouched`, () => {
        for (const crouch of [0, 1]) {
          const s = fighting(span.arena, ['standup', 'legacy']);
          s.fighters[0].weapon = newWeapon(gun);
          Object.assign(s.fighters[0], { x: span.above, y: span.y, crouch });
          Object.assign(s.fighters[1], { x: span.below, y: 0 });
          expect(visibleAim(s, 0)).toBeNull();
        }
      });

      it(`${gun}: points at the rival below (not straight ahead) when the rival is hidden`, () => {
        const s = fighting(span.arena, ['standup', 'legacy']);
        s.fighters[0].weapon = newWeapon(gun);
        Object.assign(s.fighters[0], { x: span.above, y: span.y, facing: 1 });
        Object.assign(s.fighters[1], { x: span.below, y: 0 });
        const me = s.fighters[0];
        const foe = s.fighters[1];
        const p = autoAimPoint(s, 0);
        const chestY = me.y + bodyHeight(me) * 0.62;
        const angle = Math.atan2(p.y - chestY, p.x - me.x);
        const toFoe = Math.atan2(foe.y + bodyHeight(foe) * 0.55 - chestY, foe.x - me.x);
        expect(Math.abs(angle - toFoe)).toBeLessThan(0.05);
      });

      it(`${gun}: points at the rival above when the rival is hidden on the walkway`, () => {
        const s = fighting(span.arena, ['standup', 'legacy']);
        s.fighters[0].weapon = newWeapon(gun);
        Object.assign(s.fighters[0], { x: span.below, y: 0, facing: -1 });
        Object.assign(s.fighters[1], { x: span.above, y: span.y });
        const me = s.fighters[0];
        const foe = s.fighters[1];
        const p = autoAimPoint(s, 0);
        const chestY = me.y + bodyHeight(me) * 0.62;
        const angle = Math.atan2(p.y - chestY, p.x - me.x);
        const toFoe = Math.atan2(foe.y + bodyHeight(foe) * 0.55 - chestY, foe.x - me.x);
        expect(Math.abs(angle - toFoe)).toBeLessThan(0.05);
      });
    }
  });
}
