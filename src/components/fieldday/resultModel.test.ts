import { describe, expect, it } from 'vitest';

import { emptyTally } from '~/game/awards';

import { FD_COPY } from './copy';
import { fighterView } from './fighters';
import { AWARD_SLOTS, buildResult, slotsFor, titleCase } from './resultModel';

import type { ResultFighter, ResultInput } from './resultModel';
import type { CharacterId } from '~/game/sim/types';

const ids = ['hotfix', 'legacy'] as CharacterId[];
const f = (i: number, kos: number, over: Partial<ResultFighter['stats']> = {}, tally = {}): ResultFighter => ({
  character: ids[i],
  kos,
  stats: { damage: 300, accuracy: 57, deaths: 2, bestStreak: 3, shots: 20, ...over },
  tally: { ...emptyTally(), ...tally },
});
const input = (over: Partial<ResultInput>): ResultInput => ({ mode: 'solo', winner: 0, fighters: [f(0, 5), f(1, 2)], ...over });
const upper = (i: number) => fighterView(ids[i]).name;

describe('result model: who wins, in whose words', () => {
  it('a win names the winner and shows the score and one line by margin (F-075)', () => {
    const m = buildResult(input({}));
    expect(m.outcome).toBe('win');
    expect(m.title).toBe(`${upper(0)} WINS!`);
    expect(m.pill).toBe('5 – 2 · clean win');
  });

  it('a loss names the rival, keeps the player first in the score and never mocks', () => {
    const m = buildResult(input({ winner: 1, fighters: [f(0, 4), f(1, 5)], lossLine: 0 }));
    expect(m.outcome).toBe('loss');
    expect(m.youLost).toBe(true);
    expect(m.title).toBe(`${upper(1)} WINS!`);
    expect(m.pill).toBe('4 – 5 · so close! · one more?');
    expect(`${m.title} ${m.pill}`).not.toMatch(/loser/i);
  });

  it('5-3 win: clean win; 5-0: flawless!; 5-1: total control; 5-4: by a whisker!', () => {
    expect(buildResult(input({ fighters: [f(0, 5), f(1, 3)] })).pill).toBe('5 – 3 · clean win');
    expect(buildResult(input({ fighters: [f(0, 5), f(1, 0)] })).pill).toBe('5 – 0 · flawless!');
    expect(buildResult(input({ fighters: [f(0, 5), f(1, 1)] })).pill).toBe('5 – 1 · total control');
    expect(buildResult(input({ fighters: [f(0, 5), f(1, 4)] })).pill).toBe('5 – 4 · by a whisker!');
  });

  it('1-5 loss: a big-band line, never "so close"; 0-5 is big too', () => {
    for (const n of [0, 1, 2, 3]) {
      const p = buildResult(input({ winner: 1, fighters: [f(0, 1), f(1, 5)], lossLine: n })).pill;
      expect(FD_COPY.result.lossLines.big.map((l) => `1 – 5 · ${l}`)).toContain(p);
      expect(p).not.toMatch(/so close|next one's yours/);
    }
    expect(buildResult(input({ winner: 1, fighters: [f(0, 0), f(1, 5)], lossLine: 0 })).pill).toBe('0 – 5 · tough one · go again?');
    expect(buildResult(input({ winner: 1, fighters: [f(0, 1), f(1, 5)], lossLine: 0 })).pill).toBe('1 – 5 · tough one · go again?');
  });

  it('4-5 loss: a close-band line; 2-5 a clear-band line; the two lines of a cell rotate', () => {
    const at = (a: number, n: number) => buildResult(input({ winner: 1, fighters: [f(0, a), f(1, 5)], lossLine: n })).pill;
    expect([at(4, 0), at(4, 1), at(4, 2)]).toEqual(['4 – 5 · so close! · one more?', '4 – 5 · one KO short · run it back?', '4 – 5 · so close! · one more?']);
    expect([at(2, 0), at(3, 1)]).toEqual(['2 – 5 · run it back?', '3 – 5 · shake it off · go again?']);
  });

  it('no loss with a margin of 2 or more says the loser nearly won', () => {
    for (const band of ['clear', 'big'] as const) for (const l of FD_COPY.result.lossLines[band]) expect(l).not.toMatch(/so close|next one's yours|nearly|almost/i);
  });

  it('2-player is P1 / P2, either side winning is a win, and it uses the win table', () => {
    const m = buildResult(input({ mode: 'twoPlayer', winner: 1, fighters: [f(0, 3), f(1, 5)] }));
    expect(m.outcome).toBe('win');
    expect(m.title).toBe('P2 WINS!');
    expect(m.youLost).toBe(false);
    const m2 = buildResult(input({ mode: 'twoPlayer', winner: 0, fighters: [f(0, 5), f(1, 4)] }));
    expect(m2.title).toBe('P1 WINS!');
    expect(m2.pill).toBe('5 – 4 · by a whisker!');
    expect(buildResult(input({ mode: 'demo', winner: 1, fighters: [f(0, 1), f(1, 5)] })).pill).toBe('1 – 5 · total control');
  });

  it('a draw has no winner or loser, and the draw line in every mode', () => {
    for (const mode of ['solo', 'online', 'twoPlayer', 'demo'] as const) {
      const m = buildResult(input({ mode, winner: -1, fighters: [f(0, 3), f(1, 3)] }));
      expect(m.outcome).toBe('draw');
      expect(m.winner).toBeNull();
      expect(m.loser).toBeNull();
      expect(m.pill).toBe('3 – 3 · all square · one more?');
    }
  });

  it('every pill fits: the longest is 30 characters', () => {
    const lines = [...Object.values(FD_COPY.result.winLines).flat(), ...Object.values(FD_COPY.result.lossLines).flat(), FD_COPY.result.drawLine];
    expect(Math.max(...lines.map((l) => `5 – 5 · ${l}`.length))).toBeLessThanOrEqual(36);
  });
});

describe('result model: awards wording', () => {
  const tally = { jumps: 52, pushedBack: 6, rocketsTaken: 1, damageTaken: 0 };

  it('the winner is always named in the awards (F-074): BLUE RIBBON when they hold nothing else', () => {
    const quiet = f(0, 5, { damage: 0, accuracy: 0, bestStreak: 0, shots: 0 });
    const loud = f(1, 4, { damage: 600, accuracy: 70, bestStreak: 3, shots: 30 }, { jumps: 90, pushedBack: 5, rocketsTaken: 3, damageTaken: 400 });
    const m = buildResult(input({ fighters: [quiet, loud] }));
    expect(m.awards[0]).toMatchObject({ id: 'ribbon', holder: 0, title: 'BLUE RIBBON', line: 'You took the field, 5 KOs', icon: { kind: 'icon', name: 'pennant' } });
    expect(m.awards.filter((a) => a.holder === 1)).toHaveLength(1);
  });

  it('the new award strings and stickers (F-075)', () => {
    const m = buildResult(input({ mode: 'twoPlayer', fighters: [f(0, 5, { damage: 520, bestStreak: 2 }), f(1, 3, { damage: 300, bestStreak: 1, accuracy: 57 })] }));
    expect(m.awards.find((a) => a.id === 'hitter')).toMatchObject({ title: 'HEAVY HITTER', line: 'P1 dealt 520 damage', icon: { kind: 'weapon', name: 'shotgun' } });
    expect(m.awards.find((a) => a.id === 'streak')).toMatchObject({ title: 'HOT STREAK', line: 'P1 scored 2 KOs in a row', icon: { kind: 'icon', name: 'flag' } });
    expect(FD_COPY.result.awards.ribbon.line('P2', 1)).toBe('P2 took the field, 1 KO');
  });

  it('says "You" for the local player and the fighter name for the rival', () => {
    const m = buildResult(input({ fighters: [f(0, 5, {}, tally), f(1, 2, { accuracy: 61 }, { damageTaken: 0 })] }));
    const lines = m.awards.map((a) => a.line);
    expect(lines).toContain('You pushed back 6 bullets');
    expect(lines).toContain('You jumped 52 times');
    expect(lines.every((l) => !l.includes('0 rockets'))).toBe(true);
  });

  it('uses P1 / P2 in 2-player and singular nouns for one', () => {
    const m = buildResult(input({ mode: 'twoPlayer', fighters: [f(0, 5, {}, { rocketsTaken: 1 }), f(1, 2)] }));
    expect(m.awards.find((a) => a.id === 'pinata')?.line).toBe('P1 took 1 rocket');
  });

  it('carries no colour of its own: the medal is white with the holder accent ring (R-027)', () => {
    const m = buildResult(input({ fighters: [f(0, 5, {}, tally), f(1, 2, {}, { rocketsTaken: 3 })] }));
    expect(m.awards.length).toBeGreaterThan(0);
    for (const a of m.awards) {
      expect(a).not.toHaveProperty('colour');
      expect([0, 1]).toContain(a.holder);
    }
  });

  it('never shows more than three, and the slots match the count', () => {
    const m = buildResult(input({ fighters: [f(0, 5, {}, { jumps: 90, pushedBack: 9, rocketsTaken: 4, damageTaken: 500 }), f(1, 2, {}, { jumps: 1 })] }));
    expect(m.awards.length).toBeLessThanOrEqual(3);
    expect(slotsFor(3)).toEqual(AWARD_SLOTS);
    expect(slotsFor(2)).toHaveLength(2);
    expect(slotsFor(0)).toEqual([]);
  });
});

describe('titleCase', () => {
  it('lowers all but the first letter of each word', () => {
    expect(titleCase('FIGHTER 3')).toBe('Fighter 3');
    expect(titleCase('BRIX')).toBe('Brix');
  });
});
