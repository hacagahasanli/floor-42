import { EMPTY_INPUT } from '../sim/types';

import type { InputState } from '../sim/types';

// New buttons go on the end: an older peer reads the bits it knows and ignores the rest.
const BUTTONS = ['left', 'right', 'up', 'down', 'dash', 'fire', 'pickup', 'reload', 'push', 'crouch', 'throwBomb'] as const;

/** One tick of input, compact: [clientTick, buttons bitmask, aimX, aimY]. */
export type WireInput = [number, number, number, number];

export const encodeInput = (tick: number, i: InputState): WireInput => {
  let bits = 0;
  BUTTONS.forEach((b, n) => {
    if (i[b]) bits |= 1 << n;
  });
  return [tick, bits, Math.round(i.aimX * 100) / 100, Math.round(i.aimY * 100) / 100];
};

export const decodeInput = (w: WireInput): InputState => {
  const s: InputState = { ...EMPTY_INPUT, aimX: w[2], aimY: w[3] };
  BUTTONS.forEach((b, n) => {
    s[b] = (w[1] & (1 << n)) !== 0;
  });
  return s;
};

/** Presses that happened in skipped inputs survive into the next one. */
export const mergePresses = (into: InputState, from: InputState): InputState => {
  const s = { ...into };
  for (const b of BUTTONS) s[b] = s[b] || from[b];
  return s;
};
