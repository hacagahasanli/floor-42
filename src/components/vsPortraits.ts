import { ROSTER } from '~/game/roster';

import type { CharacterId } from '~/game/sim/types';

/**
 * Big portraits for the VS doors (R-013 4.4), rendered once per page from the game's own models (portraits.ts, 2x) and
 * kept here, so the doors never wait on a render: the home pre-renders all four in idle time, and a direct load of the
 * arena renders the two it needs. DOM only afterwards (no draw calls while the doors are up).
 */
const cache: Partial<Record<CharacterId, string>> = {};
let chain: Promise<void> = Promise.resolve();

export const doorPortrait = (id: CharacterId) => cache[id];

/** Tell listeners when a portrait has landed in the cache (the Field Day screens re-render on it). */
const listeners = new Set<() => void>();
export const onDoorPortraits = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export const ensureDoorPortraits = (ids: CharacterId[]): Promise<void> => {
  if (ids.every((id) => cache[id])) return Promise.resolve();
  chain = chain.then(async () => {
    const need = [...new Set(ids)].filter((id) => !cache[id]);
    if (!need.length) return;
    try {
      const { renderPortraits } = await import('~/game/render/portraits');
      const accents = Object.fromEntries(ROSTER.map((r) => [r.id, r.accent])) as Record<CharacterId, string>;
      Object.assign(cache, renderPortraits(accents, { scale: 2, only: need }));
      listeners.forEach((l) => l());
    } catch {
      /* no WebGL: the doors show the slabs and names without a face */
    }
  });
  return chain;
};

/** Render all four in idle time, one per slice so no single frame is long (the home calls this once the backdrop is up). */
export const warmDoorPortraits = () => {
  const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  const later = (fn: () => void) => (ric ? ric(fn, { timeout: 4000 }) : window.setTimeout(fn, 1500));
  const ids = ROSTER.map((r) => r.id);
  const next = () => {
    const id = ids.shift();
    if (id) void ensureDoorPortraits([id]).then(() => later(next));
  };
  later(next);
};
