import type { Bindings } from '~/game/settings';

/** Pure key-label rules for the how-to screen (unit-tested). */
export const KOS_TEXT = (n: number) => `First to ${n} KOs wins.`;

const isArrow = (c: string) => c.startsWith('Arrow');

/** The 2-player movement group: "WASD" or "ARROWS" when it is the default shape, otherwise the four keys. */
export const moveGroup = (b: { left: string; up: string; down: string; right: string }, label: (c: string) => string): string => {
  const all = [b.up, b.left, b.down, b.right];
  if (all.every(isArrow)) return 'ARROWS';
  const l = all.map((c) => (c ? label(c).toUpperCase() : '—'));
  return l.every((x) => x.length === 1) ? l.join('') : l.join(' ');
};

/** "or the arrow keys" is only true while every direction's second key is an arrow. */
export const arrowNote = (b: Bindings): string | null =>
  (['up', 'left', 'down', 'right'] as const).every((a) => isArrow(b[a][1])) ? 'or the arrow keys' : null;

/** A key cap label: upper case, and "SHIFT" rather than "L-Shift" (the left and right keys are one cap on the strip and the cards). */
export const capLabel = (label: string): string => label.toUpperCase().replace(/^[LR]-(SHIFT|CTRL|ALT)$/, '$1');
