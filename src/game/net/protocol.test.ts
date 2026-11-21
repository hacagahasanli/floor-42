import { createGame } from '../sim/step';
import { EMPTY_INPUT } from '../sim/types';

import { isOwnEvent } from './client';
import { decodeInput, decodeSnapshot, encodeInput, encodeSnapshot, isNewer, mergePresses } from './protocol';

describe('wire protocol', () => {
  it('round-trips an input', () => {
    const input = { ...EMPTY_INPUT, right: true, up: true, fire: true, aimX: 3.14159, aimY: -1.5 };
    const back = decodeInput(encodeInput(42, input));
    expect(back).toEqual({ ...input, aimX: 3.14 });
  });

  it('carries the throw-bomb button on its own bit, after the older ones', () => {
    const input = { ...EMPTY_INPUT, crouch: true, throwBomb: true };
    const w = encodeInput(1, input);
    expect(w[1]).toBe((1 << 9) | (1 << 10));
    expect(decodeInput(w).throwBomb).toBe(true);
    expect(mergePresses({ ...EMPTY_INPUT }, input).throwBomb).toBe(true);
  });

  it('keeps a press that happened in a skipped input', () => {
    const merged = mergePresses({ ...EMPTY_INPUT }, { ...EMPTY_INPUT, up: true });
    expect(merged.up).toBe(true);
  });

  it('round-trips a full game state, including Infinity (pistol reserve)', () => {
    const state = createGame(['hotfix', 'legacy'], 7);
    const back = decodeSnapshot(encodeSnapshot({ ack: [1, 2], inputs: [[1, 0, 0, 0], [2, 0, 0, 0]], state }));
    expect(back.state).toEqual(state);
    expect(back.state.fighters[0].weapon.reserve).toBe(Infinity);
  });

  it('uses only a snapshot newer than the last one (the direct line can reorder them)', () => {
    expect(isNewer(5, 4)).toBe(true);
    expect(isNewer(4, 5)).toBe(false);
    expect(isNewer(5, 5)).toBe(false);
    // An older server doesn't number its snapshots: over its ordered line every one is newer.
    expect(isNewer(undefined, 9)).toBe(true);
  });

  it('carries the snapshot number and the event batch', () => {
    const state = createGame(['hotfix', 'legacy'], 7, true);
    const ev = { from: 3, to: 5, e: [[4, { type: 'drop', x: 1 }]] as [number, { type: 'drop'; x: number }][] };
    const back = decodeSnapshot(encodeSnapshot({ seq: 12, ack: [1, 2], inputs: [[1, 0, 0, 0], [2, 0, 0, 0]], state, ev }));
    expect(back.seq).toBe(12);
    expect(back.ev).toEqual(ev);
    expect(back.state.net).toBe(true);
  });
});

describe('who shows which event', () => {
  it('shows your own actions from your prediction and the rival\'s from the authority', () => {
    const me = 1;
    expect(isOwnEvent({ type: 'shot', fighter: 1, gun: 'pistol', x: 0, y: 0, angle: 0 }, me)).toBe(true);
    expect(isOwnEvent({ type: 'shot', fighter: 0, gun: 'pistol', x: 0, y: 0, angle: 0 }, me)).toBe(false);
    // A hit on the rival from your shot is yours; a hit on you is the authority's to show.
    expect(isOwnEvent({ type: 'hit', fighter: 0, by: 1, x: 0, y: 0, power: 1, damage: 10 }, me)).toBe(true);
    expect(isOwnEvent({ type: 'hit', fighter: 1, by: 0, x: 0, y: 0, power: 1, damage: 10 }, me)).toBe(false);
    expect(isOwnEvent({ type: 'explosion', owner: 0, x: 0, y: 0, radius: 2 }, me)).toBe(false);
    expect(isOwnEvent({ type: 'explosion', owner: 1, x: 0, y: 0, radius: 2 }, me)).toBe(true);
    // Knockouts only ever come from the authority: no more predicted kills that never happened.
    expect(isOwnEvent({ type: 'ko', fighter: 0, by: 1, x: 0, y: 0 }, me)).toBe(false);
  });
});
