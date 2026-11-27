import { describe, expect, it } from 'vitest';

import { botLevelFor, FINISHED_KEY, hasFinishedMatch, markMatchFinished } from './firstMatch';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('first match', () => {
  it('is easy until a match has been finished, then the menu choice stands', () => {
    expect(botLevelFor('normal', false)).toBe('easy');
    expect(botLevelFor('hard', false)).toBe('easy');
    expect(botLevelFor('normal', true)).toBe('normal');
    expect(botLevelFor('hard', true)).toBe('hard');
  });
  it('remembers a finished match', () => {
    const s = memory();
    expect(hasFinishedMatch(s)).toBe(false);
    markMatchFinished(s);
    expect(s.getItem(FINISHED_KEY)).toBe('1');
    expect(hasFinishedMatch(s)).toBe(true);
  });
  it('survives blocked storage', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(hasFinishedMatch(broken)).toBe(false);
    expect(() => markMatchFinished(broken)).not.toThrow();
    expect(hasFinishedMatch(null)).toBe(false);
  });
});
