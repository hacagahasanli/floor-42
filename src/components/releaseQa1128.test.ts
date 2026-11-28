/**
 * Release QA 2026-11-28 (docs/release-qa/2026-11-28-crazygames.md): online parked, corner pills vs key strip, the 2-player
 * result lock, OFL texts for every shipped font, Enter on home, audio only after a gesture.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { boxesClash } from '~/components/fieldday/hud/hudMath';
import { enterStartsPlay } from '~/components/fieldday/screens/HomeScreen';
import { INPUT_AT_MS } from '~/components/fieldday/screens/ResultScreen';
import { BOTH_PRESS_START, stepBothPress } from '~/components/twoPlayer/shared';
import { mayOpenAudio } from '~/game/sfx';
import { ONLINE_ENABLED, onlineOffered } from '~/lib/features';

import type { BothPressState } from '~/components/twoPlayer/shared';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('online is parked behind one flag', () => {
  it('is off, and the portal never offers it even when it is on', () => {
    expect(ONLINE_ENABLED).toBe(false);
    expect(onlineOffered(false)).toBe(false);
    expect(onlineOffered(true)).toBe(false);
    expect(onlineOffered(false, true)).toBe(true);
    expect(onlineOffered(true, true)).toBe(false);
  });
  it('the home ONLINE button and /play read the flag', () => {
    expect(read('src/components/menu/MainMenu.tsx')).toMatch(/onOnline=\{onlineOffered\(PORTAL\) \? \(\) => navigate\('\/play'\) : undefined\}/);
    const play = read('src/app/play/page.tsx');
    expect(play).toMatch(/if \(!ONLINE_ENABLED\) return <MainMenu \/>;/);
    // No browser API at module level in the page (the server renders it): the 2026-11-28 /play 500 was a module-level Path2D.
    expect(play).not.toMatch(/\b(window|document|navigator|Path2D)\b/);
  });
});

describe('corner pills vs the bottom strip (QA item 1)', () => {
  // Measured shapes at 821x462: the strip's right end ran under the AIM pill.
  const pills = { left: 580, top: 425, right: 811, bottom: 452 };
  it('overlap and near-touch clash, apart does not', () => {
    expect(boxesClash(pills, { left: 150, top: 420, right: 670, bottom: 452 })).toBe(true);
    expect(boxesClash(pills, { left: 150, top: 420, right: 576, bottom: 452 }, 6)).toBe(true);
    expect(boxesClash(pills, { left: 150, top: 420, right: 570, bottom: 452 }, 6)).toBe(false);
    expect(boxesClash(pills, { left: 150, top: 300, right: 700, bottom: 410 }, 6)).toBe(false);
  });
  it('an empty box (display none) never clashes', () => {
    expect(boxesClash(pills, { left: 0, top: 0, right: 0, bottom: 0 })).toBe(false);
    expect(boxesClash({ left: 600, top: 430, right: 600, bottom: 430 }, pills)).toBe(false);
  });
});

describe('2-player result: Shoot+Shoot rematch has the result input lock (QA item 3)', () => {
  const run = (frames: [boolean, boolean][], lockedFrames: number) => {
    let s: BothPressState = BOTH_PRESS_START;
    let fired = 0;
    frames.forEach((f, i) => {
      const n = stepBothPress(s, f, i < lockedFrames);
      if (n.fire) fired += 1;
      s = n;
    });
    return { s, fired };
  };
  it('uses the spec 0.6 s', () => expect(INPUT_AT_MS).toBe(600));
  it('presses mashed during the lock never count', () => {
    const mash: [boolean, boolean][] = [];
    for (let i = 0; i < 40; i++) mash.push([i % 2 === 0, i % 2 === 1]);
    expect(run(mash, 40)).toMatchObject({ fired: 0, s: { got: [false, false] } });
  });
  it('a Shoot held through the end of the lock needs letting go', () => {
    const r = run([[true, true], [true, true], [true, true], [true, true]], 2);
    expect(r.fired).toBe(0);
    expect(r.s.got).toEqual([false, false]);
  });
  it('fresh presses after the lock rematch once', () => {
    const r = run([[true, true], [false, false], [true, false], [true, false], [false, true], [true, true], [false, false], [true, true]], 2);
    expect(r.fired).toBe(1);
  });
  it('without a lock it behaves as before (first read only primes)', () => {
    expect(run([[false, false], [true, true]], 0).fired).toBe(1);
    expect(run([[true, true], [true, true]], 0).fired).toBe(0);
  });
});

describe('every shipped font has its OFL text (QA item 5)', () => {
  const licences = readdirSync(resolve(root, 'public/licenses'));
  const has = (family: string) => licences.some((f) => f.toLowerCase().replace(/[^a-z0-9]/g, '').includes(family));
  const familyOf = (file: string) =>
    file
      .replace(/\.woff2?$|\.ttf$|\.otf$/, '')
      .replace(/[-_](\d{3}|regular|bold|italic)$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  it('portal and Field Day font files', () => {
    const files = [
      ...readdirSync(resolve(root, 'portal/public/fonts')),
      ...readdirSync(resolve(root, 'src/components/fieldday/fonts')),
    ].filter((f) => /\.(woff2?|ttf|otf)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(has(familyOf(f)), `${f} -> ${familyOf(f)}`).toBe(true);
  });
  it('next/font families on the site', () => {
    const layout = read('src/app/layout.tsx');
    const fams = [...(layout.match(/import \{([^}]+)\} from 'next\/font\/google'/)?.[1] ?? '').split(',')].map((s) => s.trim()).filter(Boolean);
    expect(fams.length).toBeGreaterThan(0);
    for (const f of fams) expect(has(f.toLowerCase().replace(/[^a-z0-9]/g, '')), f).toBe(true);
  });
  it('the texts are the SIL OFL 1.1 with a copyright line', () => {
    for (const f of licences) {
      const t = read(`public/licenses/${f}`);
      expect(t).toMatch(/^\uFEFF?Copyright/);
      expect(t).toContain('SIL OPEN FONT LICENSE Version 1.1');
      expect(t).not.toContain('\r');
    }
    expect(existsSync(resolve(root, 'public/licenses/OFL-Bungee.txt'))).toBe(true);
    expect(existsSync(resolve(root, 'public/licenses/OFL-ChakraPetch.txt'))).toBe(true);
  });
});

describe('home: Enter with nothing focused starts PLAY (QA item 8)', () => {
  const body = { tag: 'body' } as unknown as Element;
  const button = { tag: 'button' } as unknown as Element;
  it('from BODY or no focus', () => {
    expect(enterStartsPlay('Enter', body, body)).toBe(true);
    expect(enterStartsPlay('NumpadEnter', null, body)).toBe(true);
  });
  it('not when a button has focus (it keeps its own Enter), not for other keys', () => {
    expect(enterStartsPlay('Enter', button, body)).toBe(false);
    expect(enterStartsPlay('Space', body, body)).toBe(false);
  });
});

describe('audio: no context before a user gesture (QA item 10)', () => {
  it('needs our own gesture flag or the browser saying the page was activated', () => {
    expect(mayOpenAudio(false, { hasBeenActive: false })).toBe(false);
    expect(mayOpenAudio(false, null)).toBe(false);
    expect(mayOpenAudio(false, undefined)).toBe(false);
    expect(mayOpenAudio(true, { hasBeenActive: false })).toBe(true);
    expect(mayOpenAudio(false, { hasBeenActive: true })).toBe(true);
  });
  it('openContext asks mayOpenAudio and the early listener ignores synthetic keys', () => {
    const src = read('src/game/sfx.ts');
    expect(src).toMatch(/if \(!mayOpenAudio\(gestured,/);
    expect(src).toMatch(/if \(!e\.isTrusted\) return;/);
  });
});
