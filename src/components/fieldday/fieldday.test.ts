import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { COPY } from '~/game/copy';
import { ROSTER } from '~/game/roster';

import { GAME_NAME, wordmarkParts } from './brand';
import { CONFETTI, confettiAllowed, confettiPlan, seeded } from './confettiRules';
import { cardCrop, fighterView, FIGHTER_IDS, HEAD_ANCHOR, portraitCrop } from './fighters';
import { fitScale, MIN_FIT } from './fit';
import { buntingPennants, stageMetrics } from './geometry';
import { pickNext } from './nav';
import { jumpPips, speedPips, statsOf, traitsOf, weightPips } from './stats';

import type { Box } from './nav';

const box = (left: number, top: number, w: number, h: number): Box => ({ left, top, right: left + w, bottom: top + h });

describe('stage scale (spec 2.1)', () => {
  it('is 1 at 1280x720 and 1.5 at 1920x1080', () => {
    expect(stageMetrics(1280, 720)).toEqual({ s: 1, w: 1280, h: 720 });
    expect(stageMetrics(1920, 1080).s).toBe(1.5);
  });
  it('a wider window adds stage width, a taller one adds stage height, and the scale is the smaller ratio', () => {
    const wide = stageMetrics(2560, 1080);
    expect(wide.s).toBe(1.5);
    expect(wide.w).toBeCloseTo(2560 / 1.5);
    expect(wide.h).toBe(720);
    const tall = stageMetrics(1280, 1024);
    expect(tall.s).toBe(1);
    expect(tall.h).toBe(1024);
  });
});

describe('auto-fit (spec 3.1)', () => {
  it('leaves a name that fits alone, shrinks a wide one, and never goes below 0.6', () => {
    expect(fitScale(346, 420)).toBe(1);
    expect(fitScale(840, 420)).toBe(MIN_FIT);
    expect(fitScale(600, 420)).toBeCloseTo(0.7);
    expect(fitScale(2000, 420)).toBe(MIN_FIT);
  });
  it('ignores unusable numbers', () => {
    expect(fitScale(0, 420)).toBe(1);
    expect(fitScale(500, 0)).toBe(1);
    expect(fitScale(NaN, 420)).toBe(1);
  });
});

describe('wordmark slot (R-023)', () => {
  it('splits the game name into a white word and a sun word', () => {
    expect(wordmarkParts('FLOOR 42')).toEqual(['FLOOR', '42']);
    expect(wordmarkParts('BIG BAD FIELD')).toEqual(['BIG BAD', 'FIELD']);
  });
  it('a one-word name uses only the big sun style', () => {
    expect(wordmarkParts('FIELD')).toEqual(['FIELD']);
  });
  it('the constant is the one place that says the name', () => {
    expect(GAME_NAME).toBe('FLOOR 42');
  });
});

describe('pips map the four current fighters to the CD table (spec 3, b03)', () => {
  const want = { hotfix: [4, 4, 2], legacy: [1, 2, 5], standup: [5, 5, 1], intern: [3, 3, 3] } as const;
  for (const id of FIGHTER_IDS) {
    it(id, () => {
      const s = statsOf(id);
      expect([s.speed, s.jump, s.weight]).toEqual(want[id]);
    });
  }
  it('pips stay inside 1..5 for out-of-range stats', () => {
    expect(speedPips(0)).toBe(1);
    expect(speedPips(99)).toBe(5);
    expect(jumpPips(99, 5)).toBe(5);
    expect(weightPips(9)).toBe(5);
  });
  it('trait chips are speed, jumps, weight', () => {
    expect(traitsOf('hotfix').map((t) => t.text)).toEqual(['FAST', '2× JUMP', 'MID WEIGHT']);
    expect(traitsOf('standup')[1].text).toBe('3× JUMP');
  });
});

describe('fighter view comes from the roster and copy, in the plain voice', () => {
  it('names and accents are the roster entries; roles are the regular-voice roles', () => {
    for (const r of ROSTER) {
      const v = fighterView(r.id);
      expect(v.name).toBe(r.name.toUpperCase());
      expect(v.accent).toBe(r.accent);
      expect(v.role).toBe(COPY.fighters[r.id].role.toUpperCase());
    }
  });
  it('has a head anchor for every fighter and frames the head where asked', () => {
    for (const id of FIGHTER_IDS) {
      expect(HEAD_ANCHOR[id].w).toBeGreaterThan(0);
      const c = portraitCrop(id, 200, 200, 0.5, 0.3);
      // The head is half the frame wide: the image is head-width-fraction times larger than 0.5 x frame.
      expect(parseFloat(c.backgroundSize)).toBeCloseTo((200 * 0.5) / HEAD_ANCHOR[id].w, 0);
    }
  });
});

describe('fighter card framing (F-045)', () => {
  it('the same head height for all four and the figure top 8 % below the card top', () => {
    for (const [w, h] of [[218, 196], [244, 246], [200, 280]]) {
      const cs = FIGHTER_IDS.map((id) => cardCrop(id, w, h, 0.3));
      for (const c of cs) {
        expect(c.headHeight).toBeCloseTo(h * 0.3, 1);
        expect(c.headCentre.x).toBe(w / 2);
      }
      // top of figure = 8 % of the frame (head top itself is at or below it)
      for (const c of cs) expect(c.headTop).toBeGreaterThanOrEqual(h * 0.08 - 0.5);
    }
  });
});

describe('confetti rules (spec 3 b12-b14, 5, bug 23)', () => {
  it('only for a win, a KO pop and 2P both-ready', () => {
    expect(confettiAllowed({ kind: 'cannon', outcome: 'win', reduced: false })).toBe(true);
    expect(confettiAllowed({ kind: 'rain', outcome: 'win', reduced: false })).toBe(true);
    expect(confettiAllowed({ kind: 'puff', reduced: false })).toBe(true);
    expect(confettiAllowed({ kind: 'ready', reduced: false })).toBe(true);
  });
  it('never on a loss, never a cannon or rain off the result, never with Reduced motion', () => {
    expect(confettiAllowed({ kind: 'cannon', outcome: 'loss', reduced: false })).toBe(false);
    expect(confettiAllowed({ kind: 'puff', outcome: 'loss', reduced: false })).toBe(false);
    expect(confettiAllowed({ kind: 'cannon', reduced: false })).toBe(false);
    expect(confettiAllowed({ kind: 'rain', reduced: false })).toBe(false);
    for (const kind of ['cannon', 'rain', 'puff', 'ready'] as const) expect(confettiAllowed({ kind, outcome: 'win', reduced: true })).toBe(false);
  });
  it('piece counts and lives match the spec: cannon 34 for 2.6-4.4 s, rain thins to 14 and stops at 8 s, puff 6', () => {
    expect(confettiPlan('cannon', 1280, 720, 3)).toHaveLength(34);
    expect(confettiPlan('rain', 1280, 720, 3)).toHaveLength(14);
    expect(confettiPlan('puff', 110, 80, 3)).toHaveLength(6);
    expect(CONFETTI.rain.stopAt).toBe(8);
    for (const p of confettiPlan('cannon', 1280, 720, 9)) {
      expect(p.dur).toBeGreaterThanOrEqual(2.6);
      expect(p.dur).toBeLessThanOrEqual(4.4);
    }
  });
  it('the cannon fires from both lower corners, inward and up', () => {
    const pieces = confettiPlan('cannon', 1280, 720, 5);
    const left = pieces.filter((p) => p.x < 100);
    const right = pieces.filter((p) => p.x > 1100);
    expect(left.length + right.length).toBe(34);
    expect(left.every((p) => p.dx > 0 && p.peak < 0)).toBe(true);
    expect(right.every((p) => p.dx < 0 && p.peak < 0)).toBe(true);
  });
  it('a burst is reproducible from its seed', () => {
    expect(confettiPlan('ready', 1280, 720, 42)).toEqual(confettiPlan('ready', 1280, 720, 42));
    expect(seeded(7)()).toBe(seeded(7)());
  });
});

describe('bunting (spec 5)', () => {
  it('holds 24 pennants per 1280 px and more on a wider stage, never fewer than one', () => {
    expect(buntingPennants(1300)).toHaveLength(24);
    expect(buntingPennants(2000).length).toBeGreaterThan(24);
    expect(buntingPennants(10).length).toBe(1);
  });
  it('the string sags in the middle and is at its top at the ends', () => {
    const p = buntingPennants(1300);
    const mid = p[Math.floor(p.length / 2)];
    expect(mid.y).toBeGreaterThan(p[0].y);
    expect(mid.y).toBeGreaterThan(p[p.length - 1].y);
  });
});

describe('directional navigation', () => {
  // The home grid: PLAY full width, then 2 columns, then gear + how-to.
  const play = box(56, 244, 372, 96);
  const twoP = box(56, 400, 179, 68);
  const online = box(249, 400, 179, 68);
  const fighter = box(56, 486, 179, 68);
  const arena = box(249, 486, 179, 68);
  const all = [play, twoP, online, fighter, arena].map((b) => ({ box: b }));
  it('moves to the straight neighbour', () => {
    expect(pickNext(twoP, 'right', all, 1)).toBe(2);
    expect(pickNext(twoP, 'down', all, 1)).toBe(3);
    expect(pickNext(arena, 'up', all, 4)).toBe(2);
    expect(pickNext(online, 'left', all, 2)).toBe(1);
  });
  it('returns -1 at an edge', () => {
    expect(pickNext(play, 'up', all, 0)).toBe(-1);
    expect(pickNext(twoP, 'left', all, 1)).toBe(-1);
  });
  it('does not treat a box in the same row as above or below', () => {
    expect(pickNext(twoP, 'down', [{ box: twoP }, { box: online }], 0)).toBe(-1);
  });
  it('prefers the marked landing spot (the picked card) when moving into a row of cards', () => {
    const cards = [0, 1, 2, 3].map((i) => box(150 + i * 252, 146, 226, 356));
    const fight = box(540, 572, 290, 84);
    const list = [...cards.map((b, i) => ({ box: b, pref: i === 3 })), { box: fight }];
    expect(pickNext(fight, 'up', list, 4)).toBe(3);
  });
});

describe('boot screen tips (portal/index.html)', () => {
  const html = readFileSync(resolve(__dirname, '../../../portal/index.html'), 'utf8');
  const m = html.match(/var tips=\[(.*?)\],ti=/s);
  const tips = m ? [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1]) : [];
  it('are lines of the real tips table, so they stay true to the game', () => {
    expect(tips.length).toBeGreaterThanOrEqual(3);
    for (const t of tips) expect(COPY.tips).toContain(t);
  });
  it('the boot screen has the placeholders the build fills from the constants (wordmark, studio, title)', () => {
    expect(html).toContain('<!--FD_WORDMARK-->');
    expect(html).toContain('<!--FD_STUDIO-->');
    expect(html).toContain('%GAME_TITLE%');
  });
});

describe('no developer copy on the Field Day screens', () => {
  const dir = resolve(__dirname);
  const files = ['copy.ts', 'screens/HomeScreen.tsx', 'screens/FighterSelect.tsx', 'screens/TwoPlayerScreen.tsx'];
  const banned = /\b(merge|commit|bug|code review|HR|deadline|email|standup|hotfix|legacy|intern)\b/i;
  it('the strings of the screens carry none of the spec section 7 words', () => {
    for (const f of files) {
      const text = readFileSync(resolve(dir, f), 'utf8')
        // Drop comments and import lines: only strings that can reach the screen matter.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/^import .*$/gm, '');
      const hit = text.match(banned);
      expect(hit?.[0], f).toBeUndefined();
    }
  });
});
