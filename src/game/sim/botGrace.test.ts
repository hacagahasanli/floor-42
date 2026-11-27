import { describe, expect, it } from 'vitest';

import { createBot, EASY_GUN_GRACE_TICKS } from './bot';
import { DT, OFFLINE_COUNTDOWN_SECONDS, RULES } from './constants';
import { createGame, step } from './step';
import { EMPTY_INPUT } from './types';

import type { BotLevel } from './bot';

/** Bot (fighter 1) against a player who stands still; how many seeds end the grace window with the bot holding a better gun. */
const armedAfterGrace = (level: BotLevel, seeds = 40) => {
  let armed = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const s = createGame(['hotfix', 'legacy'], seed, false, undefined, level === 'easy' ? { gunGrace: { fighter: 1, ticks: EASY_GUN_GRACE_TICKS } } : undefined);
    const bot = createBot(1, seed, level);
    let fightTicks = 0;
    for (let i = 0; i < 6000 && fightTicks < EASY_GUN_GRACE_TICKS - 30; i++) {
      step(s, [EMPTY_INPUT, bot(s)]);
      if (s.phase === 'fight') fightTicks++;
      if (s.phase === 'over') break;
    }
    if (s.fighters[1].weapon.kind !== 'pistol') armed++;
  }
  return armed;
};

describe('easy bot gun grace (playtest 2026-11-27)', () => {
  it('the easy bot fights the opening seconds with the pistol', () => {
    expect(armedAfterGrace('easy')).toBe(0);
  });

  it('a normal bot still goes for guns', () => {
    expect(armedAfterGrace('normal')).toBeGreaterThan(armedAfterGrace('easy'));
  });
});

describe('gun grace stays off unless asked for', () => {
  it('createGame without the option has no grace (online and 2-player unchanged)', () => {
    expect(createGame(['hotfix', 'legacy'], 1).gunGrace).toBeUndefined();
  });
});

const run = (s: ReturnType<typeof createGame>, n: number) => {
  for (let i = 0; i < n; i++) step(s, [EMPTY_INPUT, EMPTY_INPUT]);
};

describe('countdown length (R-013: offline only)', () => {
  it('createGame without the option keeps the shared 3.6 s (online and the server unchanged)', () => {
    expect(createGame(['hotfix', 'legacy'], 1).phaseTime).toBe(RULES.countdownSeconds);
    expect(createGame(['hotfix', 'legacy'], 1, true).phaseTime).toBe(3.6);
    expect(createGame(['hotfix', 'legacy'], 1, false, undefined, { gunGrace: { fighter: 1, ticks: 10 } }).phaseTime).toBe(3.6);
  });

  it('the offline option counts down 2 s, then the fight starts', () => {
    const s = createGame(['hotfix', 'legacy'], 1, false, undefined, { countdownSeconds: OFFLINE_COUNTDOWN_SECONDS });
    expect(s.phaseTime).toBe(2);
    run(s, Math.ceil(2 / DT) + 1);
    expect(s.phase).toBe('fight');
  });
});
