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
  it('a win names the winner and shows score, accuracy and best streak of the winner', () => {
    const m = buildResult(input({}));
    expect(m.outcome).toBe('win');
    expect(m.title).toBe(`${upper(0)} WINS!`);
    expect(m.pill).toBe('5 – 2 · 57% accuracy · best streak 3');
  });

  it('a loss names the rival, keeps the player first in the score and never mocks', () => {
    const m = buildResult(input({ winner: 1, fighters: [f(0, 4), f(1, 5)], lossLine: 0 }));
    expect(m.outcome).toBe('loss');
    expect(m.youLost).toBe(true);
    expect(m.title).toBe(`${upper(1)} WINS!`);
    expect(m.pill).toBe('4 – 5 · so close! · one more?');
    expect(`${m.title} ${m.pill}`).not.toMatch(/loser/i);
  });

  it('the loss line rotates through the three spec lines', () => {
    const lines = [0, 1, 2, 3].map((n) => buildResult(input({ winner: 1, lossLine: n })).pill.split(' · ').slice(1).join(' · '));
    expect(lines.slice(0, 3)).toEqual([...FD_COPY.result.lossLines]);
    expect(lines[3]).toBe(lines[0]);
  });

  it('2-player is P1 / P2, and either side winning is a win', () => {
    const m = buildResult(input({ mode: 'twoPlayer', winner: 1, fighters: [f(0, 3), f(1, 5)] }));
    expect(m.outcome).toBe('win');
    expect(m.title).toBe('P2 WINS!');
    expect(m.youLost).toBe(false);
  });

  it('a draw has no winner or loser', () => {
    const m = buildResult(input({ winner: -1, drawLine: 'Dead even.', fighters: [f(0, 3), f(1, 3)] }));
    expect(m.outcome).toBe('draw');
    expect(m.winner).toBeNull();
    expect(m.loser).toBeNull();
    expect(m.pill).toBe('3 – 3 · Dead even.');
  });

  it('leaves out accuracy and streak when there are none to brag about', () => {
    const m = buildResult(input({ fighters: [f(0, 5, { shots: 0, accuracy: 0, bestStreak: 0 }), f(1, 2)] }));
    expect(m.pill).toBe('5 – 2');
  });
});

describe('result model: awards wording', () => {
  const tally = { jumps: 52, pushedBack: 6, rocketsTaken: 1, damageTaken: 0 };

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
