'use client';

import { createSfx } from '~/game/sfx';
import { getSettings } from '~/game/settings';

import type { Sfx } from '~/game/sfx';

/**
 * The menu's own small sound engine (focus ticks, confirm, back), on the same audio context as the game and
 * following Settings > Audio live. Created on first use, after a click or key press has unlocked audio.
 */
let sfx: Sfx | null = null;
const get = () => {
  if (typeof window === 'undefined') return null;
  if (sfx) return sfx;
  const store = getSettings();
  sfx = createSfx({ volumes: store.get().audio, muted: store.effectiveMute() });
  store.subscribe((s) => sfx?.apply(s.audio, store.effectiveMute()));
  return sfx;
};

let lastTick = 0;
export const menuSound = {
  tick: () => {
    const now = performance.now();
    if (now - lastTick < 40) return;
    lastTick = now;
    const s = get();
    s?.unlock();
    s?.tick();
  },
  confirm: () => {
    const s = get();
    s?.unlock();
    s?.confirm();
  },
  back: () => {
    const s = get();
    s?.unlock();
    s?.back();
  },
};
