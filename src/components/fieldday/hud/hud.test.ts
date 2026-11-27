import { describe, expect, it } from 'vitest';

import { PHYS, PUSH, RULES } from '~/game/sim/constants';

import { arrowNote, moveGroup } from '../screens/howToKeys';

import { ammoText, clock, dashLeft, GUN_ICON, GUN_NOUN, healthSegments, pushLeft, respawnFraction } from './hudMath';

import { DEFAULT_BINDINGS } from '~/game/settings';
import { DEFAULT_BINDINGS_2P } from '~/game/twoPlayer';

describe('health segments (b06)', () => {
  it('100 HP is five segments of 20', () => {
    expect(healthSegments(100, 100)).toEqual([1, 1, 1, 1, 1]);
    expect(healthSegments(0, 100)).toEqual([0, 0, 0, 0, 0]);
  });
  it('a partial segment is clipped, the rest are empty', () => {
    const s = healthSegments(71, 100);
    expect(s.slice(0, 3)).toEqual([1, 1, 1]);
    expect(s[3]).toBeCloseTo(0.55);
    expect(s[4]).toBe(0);
  });
  it('a character with other HP gets other segments, each still 20 HP-ish', () => {
    expect(healthSegments(120, 120)).toHaveLength(6);
    expect(healthSegments(10, 60)).toHaveLength(3);
    expect(healthSegments(500, 500)).toHaveLength(8);
  });
  it('never below zero or above one', () => {
    for (const v of healthSegments(-5, 100).concat(healthSegments(999, 100))) expect(v >= 0 && v <= 1).toBe(true);
  });
});

describe('timer, chips and the respawn ring', () => {
  it('formats m:ss and rounds up', () => {
    expect(clock(150)).toBe('2:30');
    expect(clock(145.2)).toBe('2:26');
    expect(clock(9)).toBe('0:09');
    expect(clock(-3)).toBe('0:00');
  });
  it('cooldown chips count seconds left from the 0..1 ready value', () => {
    expect(dashLeft(1)).toBe(0);
    expect(dashLeft(0)).toBe(PHYS.dashCooldown);
    expect(dashLeft(0.8)).toBe(1);
    expect(pushLeft(0)).toBe(Math.ceil(PUSH.cooldown));
    expect(pushLeft(1)).toBe(0);
  });
  it('the ring drains over the respawn time', () => {
    expect(respawnFraction(RULES.respawnSeconds)).toBe(1);
    expect(respawnFraction(RULES.respawnSeconds / 2)).toBeCloseTo(0.5);
    expect(respawnFraction(0)).toBe(0);
    expect(respawnFraction(99)).toBe(1);
  });
  it('the pistol shows infinity, a finite gun shows the rounds and the reserve', () => {
    expect(ammoText(8, Infinity)).toEqual({ main: '∞', reserve: null });
    expect(ammoText(18, 40)).toEqual({ main: '18', reserve: '+40' });
  });
  it('every gun has a noun for the KO line and an icon (bombs have none)', () => {
    for (const k of Object.keys(GUN_NOUN) as (keyof typeof GUN_NOUN)[]) expect(GUN_NOUN[k].length).toBeGreaterThan(0);
    expect(GUN_ICON.launcher).toBe('rocket');
    expect(GUN_ICON.bomb).toBeNull();
    expect(GUN_NOUN.launcher).toBe('ROCKET');
  });
});

describe('how to play reads the current bindings', () => {
  const label = (c: string) => c.replace(/^Key/, '').replace(/^Arrow/, '');
  it('default 2-player groups read WASD and ARROWS', () => {
    expect(moveGroup(DEFAULT_BINDINGS_2P.p1, label)).toBe('WASD');
    expect(moveGroup(DEFAULT_BINDINGS_2P.p2, label)).toBe('ARROWS');
  });
  it('a rebound group lists its keys', () => {
    expect(moveGroup({ left: 'KeyJ', up: 'KeyI', down: 'KeyK', right: 'KeyL' }, label)).toBe('IJKL');
  });
  it('"or the arrow keys" is only said while it is true', () => {
    expect(arrowNote(DEFAULT_BINDINGS)).toBe('or the arrow keys');
    expect(arrowNote({ ...DEFAULT_BINDINGS, up: ['KeyW', ''] })).toBeNull();
  });
});
