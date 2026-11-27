'use client';

import { useSyncExternalStore } from 'react';

import { ROSTER } from '~/game/roster';

import type { CharacterId } from '~/game/sim/types';

type Portraits = Record<CharacterId, string>;

/**
 * Portraits for the result screen. They are rendered once, only when the first result screen mounts
 * (never during a match), and shared by the slab and the loser's face.
 */
let cache: Portraits | null = null;
let started = false;
const listeners = new Set<() => void>();

const start = () => {
  if (started) return;
  started = true;
  requestAnimationFrame(() => {
    void import('~/game/render/portraits').then(({ renderPortraits }) => {
      try {
        cache = renderPortraits(
          Object.fromEntries(ROSTER.map((r) => [r.id, r.accent])) as Portraits,
        );
      } catch {
        started = false; // no WebGL context right now: the slab stays a plain colour block
        return;
      }
      listeners.forEach((l) => l());
    });
  });
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  start();
  return () => {
    listeners.delete(l);
  };
};

const usePortrait = (id: CharacterId) =>
  useSyncExternalStore(
    subscribe,
    () => cache?.[id] ?? null,
    () => null,
  );

/** Desktop result: the winner on a slanted slab in their colour (spec aliveness-audit T5). */
export const WinnerSlab = ({ character, colour }: { character: CharacterId; colour: string }) => {
  const src = usePortrait(character);
  return (
    <div className="f42-slab" aria-hidden>
      <div className="f42-slab-in" style={{ background: colour }} />
      {src && <img src={src} alt="" className="f42-slab-img" width={229} height={280} />}
    </div>
  );
};

/** Desktop result: the loser, small and grey beside their name. */
export const LoserFace = ({ character }: { character: CharacterId }) => {
  const src = usePortrait(character);
  return (
    <span className="f42-loser" aria-hidden>
      {src && <img src={src} alt="" width={59} height={72} />}
    </span>
  );
};

/** Narrow result: a 6 px bar in the winner's colour across the top of the stats card. */
export const WinnerBar = ({ colour }: { colour: string }) => (
  <span aria-hidden className="f42-winbar col-span-3" style={{ background: colour }} />
);
