'use client';

import { useEffect, useState } from 'react';

import { ROSTER } from '~/game/roster';

import type { CharacterId } from '~/game/sim/types';

/**
 * Shared by the menu and the online lobby: the saved fighter, fighter accents, the rendered portraits and the stat
 * scale. (The old standalone fighter page that also lived here is gone: /characters is the menu's fighter select.)
 */

export const CHAR_KEY = 'merge-conflict:character';

export const readCharacter = (): CharacterId | null => {
  try {
    const saved = window.localStorage.getItem(CHAR_KEY);
    return saved && ROSTER.some((r) => r.id === saved) ? (saved as CharacterId) : null;
  } catch {
    return null;
  }
};

export const saveCharacter = (id: CharacterId) => {
  try {
    window.localStorage.setItem(CHAR_KEY, id);
  } catch {
    /* no storage */
  }
};

export const accentOf = (id: CharacterId) => ROSTER.find((r) => r.id === id)!.accent;

/** Portraits from the game's own models, rendered once after the page has painted. */
export const usePortraits = () => {
  const [portraits, setPortraits] = useState<Record<CharacterId, string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void import('~/game/render/portraits').then(({ renderPortraits }) => {
          if (!cancelled) setPortraits(renderPortraits(Object.fromEntries(ROSTER.map((r) => [r.id, r.accent])) as Record<CharacterId, string>));
        });
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);
  return portraits;
};

/** The top of each stat bar (the lobby info column draws against these). */
export const STAT_MAX = { speed: 11, weight: 1.4, jump: 17.5, jumps: 2 };
