import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { COPY, healthLine } from '~/game/copy';
import { ROSTER } from '~/game/roster';
import { RULES } from '~/game/sim/constants';
import { TRAIT_HP } from '~/game/sim/traits';

import { GAME_NAME, GAME_NAME_TITLE } from './brand';
import { BUNTING_COLORS } from './Bunting';
import { FD_COPY } from './copy';
import { CONFETTI, confettiAllowed, confettiColors, confettiPlan, seeded } from './confettiRules';
import { WORDMARK_INNER } from './wordmarkArt';
import { cardCrop, fighterView, FIGHTER_IDS, HEAD_ANCHOR, portraitCrop } from './fighters';
import { fitScale, MIN_FIT } from './fit';
import { buntingPennants, stageMetrics } from './geometry';
import { pickNext } from './nav';
import { ICON_NAMES } from './Icon';
import { WORDMARK_ART_ASPECT, WORDMARK_SLOT } from './parts';
import { healthPips, jumpPips, speedPips, statsOf, traitsOf, weightPips } from './stats';

import type { ButtonTone } from './Button';
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
  it('the constant is the one place that says the name: one word, capitals', () => {
    expect(GAME_NAME).toBe('PEWFIELD');
    expect(GAME_NAME_TITLE).toBe('Pewfield');
  });
  it('F-057/F-067: the slot is 420x160 and the art (height-bound, 1200:544) is at least 350 px wide', () => {
    expect(WORDMARK_SLOT).toEqual({ w: 420, h: 160 });
    // F-067 grew the viewBox 520 -> 544 so the burst is not clipped; the CD accepted the ~4 % smaller art (369 -> 353 px).
    expect(WORDMARK_SLOT.h * WORDMARK_ART_ASPECT).toBeGreaterThanOrEqual(350);
    expect(WORDMARK_SLOT.h * WORDMARK_ART_ASPECT).toBeLessThanOrEqual(WORDMARK_SLOT.w);
  });
  it('the boot screen draws the wordmark at 1.25 of the slot', () => {
    const html = readFileSync(resolve(__dirname, '../../../portal/index.html'), 'utf8');
    expect(html).toContain(`#boot .wm{margin:0;height:${WORDMARK_SLOT.h * 1.25}px;`);
  });
  it('the artwork is outlines: no live text and no font to wait for', () => {
    expect(WORDMARK_INNER).not.toMatch(/<text|@font-face|<image/);
    expect(WORDMARK_INNER.length).toBeGreaterThan(1000);
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
  it('trait chips are speed and jumps (the trait is the third chip)', () => {
    expect(traitsOf('hotfix').map((t) => t.text)).toEqual(['FAST', '2× JUMP']);
    expect(traitsOf('standup')[1].text).toBe('3× JUMP');
  });
  it('trait chips carry no tone: they render white (R-027)', () => {
    for (const id of FIGHTER_IDS) for (const t of traitsOf(id)) expect(Object.keys(t)).toEqual(['text']);
  });
});

describe('traits on the menus come from the data (R-026 11.3)', () => {
  it('health pips: 85 -> 2, 100 -> 3, 110 -> 4, 115 -> 5, from TRAIT_HP', () => {
    expect(Object.fromEntries(FIGHTER_IDS.map((id) => [id, statsOf(id).health]))).toEqual({ hotfix: 4, legacy: 5, standup: 2, intern: 3 });
    expect([healthPips(85), healthPips(100), healthPips(110), healthPips(115)]).toEqual([2, 3, 4, 5]);
  });
  it('every fighter view carries its roster trait, icon id and the sim health', () => {
    for (const r of ROSTER) {
      const v = fighterView(r.id);
      expect(v.trait).toEqual({ id: r.traitId, label: r.trait, line: r.traitLine, short: r.traitShort });
      expect(v.hp).toBe(TRAIT_HP[r.id]);
      expect(ICON_NAMES, r.id).toContain(r.traitId);
    }
  });
  it('the star icon is gone and the pennant exists', () => {
    expect(ICON_NAMES).not.toContain('star');
    expect(ICON_NAMES).toContain('pennant');
  });
  it('the CD copy (11.3): long lines, short lines, health line', () => {
    expect(ROSTER.map((r) => r.traitLine)).toEqual([
      "Jump over your rival's head and your dash is ready again.",
      'Starts healing 1 second sooner than anyone else.',
      'Every hit she survives gives her 1 second of extra speed.',
      'Every SMG, Uzi or shotgun he grabs holds 25% more ammo.',
    ]);
    expect(ROSTER.map((r) => r.traitShort)).toEqual(['Jump over your rival: dash is back.', 'Heals after 3 s, not 4.', 'Hit and still up? 1 s of speed.', 'SMG, Uzi, shotgun: 25% more ammo.']);
    expect(healthLine(true)).toBe(`Most fighters have 100 health: Ormo 115, Brix 110, Zuzu 85. A pistol shot point blank takes about half, a rocket takes it all. First to ${RULES.kosToWin} KOs wins.`);
    expect(healthLine(false)).toMatch(/^Everyone has 100 health\./);
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

describe('colour balance (R-027, colour-balance.md sections 3-4)', () => {
  const css = readFileSync(resolve(__dirname, 'fieldday.css'), 'utf8');
  const SUN = '#FFC83D';
  const WHITE = '#FFFFFF';
  it('button tones are sun, white and warn only', () => {
    expectTypeOf<ButtonTone>().toEqualTypeOf<'sun' | 'white' | 'warn'>();
    expect(css).not.toMatch(/fd-t-(tang|teal|sky)\b/);
    expect(css).toMatch(/\.fd-btn\.fd-t-warn\s*\{[^}]*--c: var\(--tang\)/);
  });
  it('tokens: sky and teal are gone, --ok is the dark teal, the track is muted terracotta, --btn2 is the secondary button', () => {
    expect(css).not.toMatch(/--(sky|teal)(-lo)?\s*:/);
    expect(css).toMatch(/--ok: #0e8a74;/);
    expect(css).toMatch(/--track: #c9765c;/);
    expect(css).toMatch(/--track-lane: #f1d9bf;/);
    expect(css).toMatch(/--btn2: #ffffff;/);
    expect(css).toMatch(/--btn2-lo: #d9cfee;/);
  });
  it('the bunting is sun, cream, tang, cream: no fighter hues in decor', () => {
    expect(BUNTING_COLORS).toEqual(['#FFC83D', '#FFF3D6', '#FF7A2F', '#FFF3D6']);
  });
  it('the boot screen bunting uses the same four colours', () => {
    const html = readFileSync(resolve(__dirname, '../../../portal/index.html'), 'utf8');
    expect(html).toContain("c=['#FFC83D','#FFF3D6','#FF7A2F','#FFF3D6']");
    expect(html).not.toMatch(/#22C3A6|#4CB8FF|#FF5D8F/i);
  });
  it('win confetti is sun, white, the winner accent and sun-hi; a draw or both-ready is sun, white and both accents', () => {
    expect(confettiColors(['#E5392F'])).toEqual([SUN, WHITE, '#E5392F', '#FFE38A']);
    expect(confettiColors(['#E5392F', '#F25CB8'])).toEqual([SUN, WHITE, '#E5392F', '#F25CB8']);
    expect(confettiColors()).toEqual([SUN, WHITE, '#FFE38A', WHITE]);
  });
  it('a burst only uses the colours it is given', () => {
    const allowed = confettiColors(['#E5392F']);
    const used = new Set(confettiPlan('cannon', 1280, 720, 3, allowed).map((p) => p.color));
    expect([...used].every((c) => allowed.includes(c))).toBe(true);
    expect(used.has('#E5392F')).toBe(true);
    for (const p of confettiPlan('rain', 1280, 720, 3)) expect(['#FFC83D', '#FFFFFF', '#FFE38A']).toContain(p.color);
  });
  it('stat pips are grape by default and the HUD cooling chip is #d9d3e6 with --gray-ink text and a --gray-lo border', () => {
    expect(css).toMatch(/\.fd-pips i\.fd-on \{\s*background: var\(--c, var\(--grape\)\)/);
    expect(css).toMatch(/\.fd-chip\.fd-cool \{\s*background: #d9d3e6;\s*color: var\(--gray-ink\);\s*border-color: var\(--gray-lo\);/);
  });
});

/** WCAG 2.x contrast ratio of two sRGB hex colours. */
const contrast = (a: string, b: string) => {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('colour balance follow-ups (R-028, colour-balance.md section 8)', () => {
  const css = readFileSync(resolve(__dirname, 'fieldday.css'), 'utf8');
  const hudCss = readFileSync(resolve(__dirname, 'hud/hudTraits.css'), 'utf8');
  const rule = (sel: string) => {
    const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
    expect(m, sel).not.toBeNull();
    return m![1];
  };
  it('8.2: selected tab, segment, toggle ON and slider fill are grape-2 with white, never sun', () => {
    expect(rule(".fd-tab.fd-btn.fd-sel")).toMatch(/--c: var\(--grape-2\);[\s\S]*color: #fff;[\s\S]*text-shadow: none;[\s\S]*box-shadow: inset 0 -5px 0 var\(--grape-deep\);/);
    expect(rule(".fd-tab.fd-btn.fd-sel")).not.toMatch(/0 4px 0/);
    expect(rule(".fd-seg button[aria-checked='true']")).toMatch(/background: var\(--grape-2\);\s*color: #fff;\s*box-shadow: inset 0 -3px 0 var\(--grape-deep\);/);
    expect(rule(".fd-toggle[aria-checked='true']")).toMatch(/background: var\(--grape-2\);/);
    expect(rule('.fd-slider b')).toMatch(/background: var\(--grape-2\);/);
    for (const sel of [".fd-seg button[aria-checked='true']", ".fd-toggle[aria-checked='true']", '.fd-slider b', '.fd-tab.fd-btn.fd-sel']) expect(rule(sel), sel).not.toMatch(/--sun/);
    // sun stays on the listening keycap (a momentary event)
    expect(rule('.fd-kc.fd-listening')).toMatch(/background: var\(--sun\);/);
    expect(css).toMatch(/--grape-2: #5a3596;/);
    expect(contrast('#ffffff', '#5a3596')).toBeCloseTo(8.81, 2);
    expect(contrast('#5a3596', '#b9b3c9')).toBeCloseTo(4.34, 2);
  });
  it('8.2: the Settings panel never asks for a sun tab (only DONE is sun)', () => {
    const src = readFileSync(resolve(__dirname, '../menu/SettingsPanel.tsx'), 'utf8');
    expect(src).not.toMatch(/tone=\{on \? 'sun'/);
    expect(src).toMatch(/className=\{on \? 'fd-tab fd-sel' : 'fd-tab'\}/);
    const suns = src.match(/tone="sun"/g) ?? [];
    const dones = src.match(/tone="sun"[^>]*data-testid="settings-done"/g) ?? [];
    expect(suns.length).toBe(dones.length);
  });
  it('8.3: --gray-ink is the grey text; --gray-lo is never a text colour', () => {
    expect(css).toMatch(/--gray-ink: #5a5274;/);
    expect(rule('.fd-kc.fd-empty')).toMatch(/color: var\(--gray-ink\);/);
    expect(css).not.toMatch(/(^|[^-])color:\s*var\(--gray-lo\)/m);
    expect(contrast('#5a5274', '#d9d3e6')).toBeCloseTo(4.98, 2);
    expect(contrast('#5a5274', '#ffffff')).toBeCloseTo(7.26, 2);
    expect(contrast('#5a5274', '#d9d3e6')).toBeGreaterThanOrEqual(4.5);
  });
  it('8.5: P1 / P2 tags in UI chrome are grape with white text; the HUD strip tag has a white border and no player colour', () => {
    expect(rule('.fd-chip.fd-ptag')).toMatch(/--c: var\(--grape\);\s*color: #fff;/);
    expect(rule('.fd-chip.fd-ptag.fd-on-world')).toMatch(/border: 2px solid #fff;/);
    expect(rule('.fd-chip.fd-rtick')).toMatch(/--c: #fff;\s*color: var\(--grape\);\s*border: 2px solid var\(--grape\);/);
    expect(rule('.fd-chip.fd-rtick.fd-on')).toMatch(/--c: var\(--grape\);\s*color: #fff;/);
    const tag = hudCss.match(/\.fd-tp-tag\s*\{([^}]*)\}/)![1];
    expect(tag).toMatch(/background: var\(--grape\);/);
    expect(tag).toMatch(/color: #fff;/);
    expect(tag).toMatch(/border: 2px solid #fff;/);
    expect(tag).not.toMatch(/var\(--c\)/);
    expect(contrast('#ffffff', '#3b1f6b')).toBeCloseTo(13.17, 2);
    expect(contrast('#ffc83d', '#3b1f6b')).toBeCloseTo(8.52, 2);
  });
  it('8.5: no UI-chrome tag reads the player colours; the in-world tags in render/game.ts still do', () => {
    const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
    const result = read('screens/ResultScreen.tsx');
    expect(result).not.toMatch(/color=\{p\.colours/);
    expect(result).not.toMatch(/colour=\{p\.colours|color: p\.colours/);
    expect(result).not.toMatch(/Chip[^>]*color=\{colourOf/);
    expect(read('hud/TpKeyStrips.tsx')).not.toMatch(/colour[:=?]|'--c'/);
    expect(read('../menu/SettingsPanel.tsx')).not.toMatch(/usePlayerColours/);
    expect(read('../twoPlayer/KeyCard.tsx')).not.toMatch(/usePlayerColours/);
    expect(read('../../game/render/game.ts')).toMatch(/playerColour\(i as 0 \| 1, settings\.colourBlind\)/);
  });
  it('8.6: the on-dark pennant exists and sits on both grape ribbons; the white Credits button keeps the sticker pennant', () => {
    expect(ICON_NAMES).toContain('pennantOnDark');
    const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
    expect(read('screens/HomeScreen.tsx')).toMatch(/<Icon name="pennantOnDark" size=\{24\} \/>.*<Icon name="pennantOnDark" size=\{24\} \/>/);
    expect(read('../menu/Credits.tsx')).toMatch(/<Icon name="pennantOnDark" size=\{30\} \/>/);
    expect(read('../menu/SettingsPanel.tsx')).toMatch(/icon="pennant" data-nav data-testid="settings-credits"/);
  });
  it('8.6: a weapon icon in a medal is 56 x 28 (the inline size agrees with .fd-wide)', () => {
    expect(rule('.fd-res-disc .fd-ic.fd-wide')).toMatch(/width: 56px;\s*height: 28px;/);
    expect(readFileSync(resolve(__dirname, 'screens/ResultScreen.tsx'), 'utf8')).toMatch(/<WeaponIcon name=\{a\.icon\.name\} size=\{28\} className="fd-wide" \/>/);
  });
  it('8.7: the reset confirm says PRESS AGAIN TO RESET', () => {
    expect(FD_COPY.settings.resetConfirm).toBe('PRESS AGAIN TO RESET');
    expect(readFileSync(resolve(__dirname, '../menu/SettingsPanel.tsx'), 'utf8')).not.toMatch(/RESET ALL'\s*:/);
  });
});
