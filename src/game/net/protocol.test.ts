import { createGame } from '../sim/step';
import { EMPTY_INPUT } from '../sim/types';

import { decodeInput, decodeSnapshot, encodeInput, encodeSnapshot, mergePresses } from './protocol';

describe('wire protocol', () => {
  it('round-trips an input', () => {
    const input = { ...EMPTY_INPUT, right: true, up: true, fire: true, aimX: 3.14159, aimY: -1.5 };
    const back = decodeInput(encodeInput(42, input));
    expect(back).toEqual({ ...input, aimX: 3.14 });
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
});
