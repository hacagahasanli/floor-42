/**
 * R-030 (docs/collab/CREATIVE/ui/direction-b/r030-2p-polish.md): F-070 2P key card in Field Day, F-071 the 2P Shoot+Shoot
 * rematch opens when REMATCH is on screen, F-072 AIM / SHAKE pills stack before they hide.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FD_COPY } from '~/components/fieldday/copy';
import { boxesClash, cornerLayout } from '~/components/fieldday/hud/hudMath';
import { INPUT_AT_MS, SHOOT_REMATCH_AT_MS } from '~/components/fieldday/screens/ResultScreen';
import { BOTH_READY_HOLD_MS } from '~/components/twoPlayer/KeyCard';
import { BOTH_PRESS_START, shootRematchLocked, stepBothPress } from '~/components/twoPlayer/shared';

import type { BothPressState } from '~/components/twoPlayer/shared';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

/**
 * Drives the both-press rule at 60 fps through a result screen: `choiceAt` is when the result reports its buttons are up
 * (2.2 s, or a skip time), `press(t)` gives both players' Shoot at time t. Returns the time of the rematch, or null.
 */
const rematchAt = (press: (t: number) => [boolean, boolean], choiceAt: number, until = 6000): number | null => {
  let s: BothPressState = BOTH_PRESS_START;
  for (let t = 0; t <= until; t += 1000 / 60) {
    const n = stepBothPress(s, press(t), shootRematchLocked(t, t >= choiceAt, INPUT_AT_MS));
    s = n;
    if (n.fire) return t;
  }
  return null;
};
/** Both players mash Shoot (down 50 ms, up 50 ms, P2 offset 30 ms) from the final KO until `stop`. */
const mash = (stop: number) => (t: number): [boolean, boolean] => [t < stop && t % 100 < 50, t < stop && (t + 30) % 100 < 50];

describe('F-071: 2P Shoot+Shoot rematch timing', () => {
  it('opens at the choice beat (2.2 s), never before 0.6 s', () => {
    expect(SHOOT_REMATCH_AT_MS).toBe(2200);
    expect(INPUT_AT_MS).toBe(600);
    expect(shootRematchLocked(900, false, INPUT_AT_MS)).toBe(true); // QA s8: used to leave at ~0.86 s
    expect(shootRematchLocked(2199, false, INPUT_AT_MS)).toBe(true);
    expect(shootRematchLocked(2300, true, INPUT_AT_MS)).toBe(false);
    // Skipped (Enter / Space) at 0.3 s: the buttons are up, the 0.6 s floor still holds.
    expect(shootRematchLocked(300, true, INPUT_AT_MS)).toBe(true);
    expect(shootRematchLocked(600, true, INPUT_AT_MS)).toBe(false);
  });
  it('Shoot mashed through the final KO does not rematch before 2.2 s', () => {
    const t = rematchAt(mash(6000), SHOOT_REMATCH_AT_MS);
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThanOrEqual(SHOOT_REMATCH_AT_MS);
  });
  it('after an Enter skip at 1.0 s, a mash rematches from then on', () => {
    const t = rematchAt(mash(6000), 1000);
    expect(t!).toBeGreaterThanOrEqual(1000);
    expect(t!).toBeLessThan(SHOOT_REMATCH_AT_MS);
  });
  it('mash for 3 s, stop, then one press each: the rematch fires on that press', () => {
    // Mashing past 2.2 s would fire at the lock; this is the "mash through the lock window, stop, press once" case.
    const pressAt = 3500;
    const once = (t: number): [boolean, boolean] => {
      const m = mash(2000)(t);
      const p = t >= pressAt && t < pressAt + 80;
      return [m[0] || p, m[1] || p];
    };
    const t = rematchAt(once, SHOOT_REMATCH_AT_MS);
    expect(t!).toBeGreaterThanOrEqual(pressAt);
    expect(t!).toBeLessThan(pressAt + 20);
  });
  it('a Shoot held down while the lock opens needs a fresh press', () => {
    const held = (t: number): [boolean, boolean] => [t < 3000 || (t >= 3200 && t < 3300), t < 3000 || (t >= 3200 && t < 3300)];
    const t = rematchAt(held, SHOOT_REMATCH_AT_MS);
    expect(t!).toBeGreaterThanOrEqual(3200);
  });
  it('the result screen reports choiceUp and ArenaGame gates the 2P rematch on it', () => {
    const res = read('src/components/fieldday/screens/ResultScreen.tsx');
    expect(res).toMatch(/const choiceUp = step >= 5;/);
    expect(res).toMatch(/if \(choiceUp\) choiceRef\.current\?\.\(\);/);
    const game = read('src/components/ArenaGame.tsx');
    expect(game).toMatch(/useBothPress\(peek2P, tp && resultUp, \(\) => rematch\(\), INPUT_AT_MS, choiceUp\)/);
    expect(game).toMatch(/onChoiceUp=\{onChoiceUp\}/);
  });
});

describe('F-072: AIM / SHAKE pills stack before they hide', () => {
  it('row when clear, stack when the row clashes, hidden only when the stack clashes too', () => {
    expect(cornerLayout(false, false, true)).toBe('row');
    expect(cornerLayout(false, true, true)).toBe('row');
    expect(cornerLayout(true, false, true)).toBe('stack');
    expect(cornerLayout(true, true, true)).toBe('hidden');
    // Touch and 2P layouts never stack (unchanged: row or hidden).
    expect(cornerLayout(true, false, false)).toBe('hidden');
    expect(cornerLayout(false, false, false)).toBe('row');
  });
  it('the spec numbers at 800x450: the row clashes with the strip, the column clears it', () => {
    // r030-2p-polish.md section 3: strip right edge 621, row pills from 589, stacked column 684-788 x 380-438. The strip's
    // vertical band is [Estimate] the bottom row (412-440).
    const strip = { left: 180, top: 412, right: 621, bottom: 440 };
    const row = { left: 589, top: 411, right: 788, bottom: 438 };
    const stack = { left: 684, top: 380, right: 788, bottom: 438 };
    const layout = cornerLayout(boxesClash(row, strip, 6), boxesClash(stack, strip, 6), true);
    expect(layout).toBe('stack');
  });
  it('ArenaGame stacks on desktop 1P only and keeps hide as the fallback', () => {
    const game = read('src/components/ArenaGame.tsx');
    expect(game).toMatch(/useCornerLayout\(\s*cornerRef,[\s\S]*?!tp && !touch,\s*\)/);
    expect(game).toMatch(/cornerMode === 'stack' \? STACK_STYLE/);
    const hook = read('src/components/fieldday/hud/useClearOf.ts');
    expect(hook).toMatch(/flexDirection: 'column', alignItems: 'flex-end', gap: '6px'/);
  });
});

describe('F-070: the 2P key card is Field Day', () => {
  const card = read('src/components/twoPlayer/KeyCard.tsx');
  const shared = read('src/components/twoPlayer/shared.tsx');
  const bigKeycap = shared.slice(shared.indexOf('export const BigKeycap'), shared.indexOf('export interface BothPressState'));
  it('no old-theme tokens or player colours left in the card or BigKeycap', () => {
    for (const bad of ['bg-ink', 'text-cream', 'panel-cut', 'PlayerChip', '#e6ebf5', 'PLAYER_COLOURS', 'playerColour']) {
      expect(card).not.toContain(bad);
      expect(bigKeycap).not.toContain(bad);
    }
    expect(card).toMatch(/<Stage>/);
    expect(card).toMatch(/fd-veil/);
  });
  it('keeps the testids the flow and tests rely on', () => {
    for (const id of ['data-testid="key-card"', 'data-testid={`key-half-${player}`}', 'data-testid={`ready-${index}`}', 'data-ready={ready}'])
      expect(card).toContain(id);
  });
  it('copy is the spec 1.2 strings', () => {
    const c = FD_COPY.keyCard;
    expect(c.titleStart).toBe('BOTH PRESS SHOOT TO FIGHT');
    expect(c.titleView).toBe('2 PLAYER KEYS');
    expect(c.hint).toBe('Shoot is the key next to your hand. Push is next to that. Dash is the far one.');
    expect(c.tester).toBe('Hold your keys. They light up.');
    expect(`${c.warnLead}${c.warnPath}${c.warnEnd}`).toBe(
      "A key stays dark? Your keyboard can't take that combo. Change it in Settings → Controls → 2 Player.",
    );
    expect(c.ready).toBe('READY!');
  });
  it('holds 250 ms after both are ready', () => expect(BOTH_READY_HOLD_MS).toBe(250));
});

describe('release QA item 9: the home Sound button shows the portal mute', () => {
  it('effective mute follows the portal and notifies subscribers', async () => {
    const { createSettingsStore } = await import('~/game/settings');
    const store = createSettingsStore(null);
    let calls = 0;
    store.subscribe(() => (calls += 1));
    expect(store.effectiveMute()).toBe(false);
    store.setExternalMute(true);
    expect(store.effectiveMute()).toBe(true);
    expect(calls).toBe(1);
    store.setExternalMute(false);
    expect(store.effectiveMute()).toBe(false);
  });
  it('MainMenu feeds the button the effective mute, not only the player mute', () => {
    const menu = read('src/components/menu/MainMenu.tsx');
    expect(menu).toMatch(/const soundOff = useEffectiveMute\(\);/);
    expect(menu).toMatch(/muted=\{soundOff\}/);
  });
});
