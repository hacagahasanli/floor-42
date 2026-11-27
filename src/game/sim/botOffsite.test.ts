import { describe, expect, it } from 'vitest';

import { createBot } from './bot';
import { OFFSITE } from './constants';
import { createGame, step } from './step';
import { EMPTY_INPUT } from './types';

import type { BotLevel } from './bot';
import type { CharacterId } from './types';

// Acceptance criterion A7 (arena-2.md): the bot, which does not path-find, is never stuck on one spot for more than
// 8 s on OFFSITE, including under the lookouts, the boulders and the tower when its rival camps above it.

const MAX_STUCK_S = 8;
const CHARS: CharacterId[] = ['hotfix', 'legacy', 'standup', 'intern'];

/** Longest stretch (s) a living fighter stayed inside a 1 m x 0.6 m box during the fight. */
const watch = () => {
  const anchor = { x: 0, y: 0, t: -1 };
  let longest = 0;
  return {
    longest: () => longest,
    sample: (t: number, x: number, y: number, active: boolean) => {
      if (!active || anchor.t < 0 || Math.abs(x - anchor.x) > 1 || Math.abs(y - anchor.y) > 0.6) {
        Object.assign(anchor, { x, y, t });
        return;
      }
      longest = Math.max(longest, (t - anchor.t) / 60);
    },
  };
};

describe('bot on OFFSITE (A7)', () => {
  it('two bots, 24 seeds, every level: nobody sits on one spot for 8 s', () => {
    let worst = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const level = (['easy', 'normal', 'hard'] as BotLevel[])[seed % 3];
      const s = createGame([CHARS[seed % 4], CHARS[(seed * 3 + 1) % 4]], seed * 7919, false, undefined, { countdownSeconds: 2, arena: 'offsite' });
      const bots = [createBot(0, seed, level), createBot(1, seed + 100, level)];
      const w = [watch(), watch()];
      for (let t = 0; t < 60 * 180 && s.phase !== 'over'; t++) {
        step(s, [bots[0](s), bots[1](s)]);
        s.fighters.forEach((f, i) => w[i].sample(t, f.x, f.y, f.respawn <= 0 && s.phase === 'fight'));
      }
      worst = Math.max(worst, w[0].longest(), w[1].longest());
    }
    expect(worst).toBeLessThan(MAX_STUCK_S);
  });

  it('a rival camping on a lookout, the roof, the deck or a boardwalk does not pin the bot to the floor under it', () => {
    const camps = [{ x: -16, y: 7.8 }, { x: 16, y: 7.8 }, { x: 0, y: 10.4 }, { x: 0, y: 7 }, { x: -7.5, y: 4 }, { x: -13.4, y: 1.4 }];
    let worst = 0;
    for (const camper of camps) {
      for (const start of OFFSITE.spawns.slice(0, 4)) {
        for (const [level, character] of [['hard', 'legacy'], ['easy', 'legacy'], ['normal', 'intern']] as [BotLevel, CharacterId][]) {
          const s = createGame([character, 'hotfix'], 3, false, undefined, { countdownSeconds: 0.1, arena: 'offsite' });
          s.phase = 'fight';
          s.phaseTime = 999;
          Object.assign(s.fighters[0], { x: start.x, y: start.y });
          const bot = createBot(0, 5, level);
          const w = watch();
          for (let t = 0; t < 60 * 30; t++) {
            // The camper is a statue the bot cannot hurt, and the bot cannot die: only its movement is under test.
            Object.assign(s.fighters[1], { x: camper.x, y: camper.y, vx: 0, vy: 0, hp: 1000 });
            s.fighters[0].hp = 1000;
            step(s, [bot(s), EMPTY_INPUT]);
            w.sample(t, s.fighters[0].x, s.fighters[0].y, true);
          }
          worst = Math.max(worst, w.longest());
        }
      }
    }
    expect(worst).toBeLessThan(MAX_STUCK_S);
  });
});
