'use client';

/**
 * Anonymous usage events for the menu and the arena. They read what the screens already know and never change play. When
 * counting is off (no stats address, a portal build, a privacy switch) `init` never ran and every `track` returns at once.
 */
import { useEffect, useRef } from 'react';

import { loadDone, track } from '~/lib/telemetry';

import type { HudState } from '~/game/render/game';

/** A menu screen is on and ready (portraits drawn): loading is over and the menu was seen. Once per page load. */
export const useMenuTelemetry = (ready: boolean): void => {
  const sent = useRef(false);
  useEffect(() => {
    if (!ready || sent.current) return;
    sent.current = true;
    loadDone();
    track('menu_view');
  }, [ready]);
};

const ROUNDS_KEY = 'nb_rounds';

/** Matches started in this tab's visit. The arena is a separate page, so the count rides in sessionStorage. */
const nextRoundNumber = (): number => {
  try {
    const n = Number(window.sessionStorage.getItem(ROUNDS_KEY)) + 1;
    window.sessionStorage.setItem(ROUNDS_KEY, String(n));
    return n;
  } catch {
    return 1;
  }
};

interface Open {
  mode: 'bot' | 'online' | 'local2p';
}

/** The arena: loading ends with the first frame; a match runs from the end of the countdown to the result card. */
/** `twoPlayer`: a local 2-player round is its own mode (`local2p`); win / lose then read from P1's side. */
export const useRoundTelemetry = (hud: HudState | null, o: { demo: boolean; online: boolean; twoPlayer?: boolean }): void => {
  const open = useRef<Open | null>(null);
  const hudRef = useRef(hud);
  hudRef.current = hud;
  const startedAt = useRef(0);

  const end = (result: 'win' | 'lose' | 'quit' | 'timeout') => {
    const r = open.current;
    if (!r) return;
    open.current = null;
    const h = hudRef.current;
    track('round_end', {
      mode: r.mode,
      result,
      dur_s: Math.max(0, Math.round(((performance.now() - startedAt.current) / 1000) * 10) / 10),
      ...(result !== 'quit' && h ? { kos: h.fighters[0].kos, kos_against: h.fighters[1].kos } : {}),
      max_level: 0,
    });
  };

  // The first frame of the office is on screen (a direct visit to the arena never saw the menu).
  const seen = !!hud;
  useEffect(() => {
    if (seen && !o.demo) loadDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen]);

  const phase = hud?.phase ?? null;
  useEffect(() => {
    if (o.demo) return;
    if (phase === 'fight' && !open.current) {
      open.current = { mode: o.online ? 'online' : o.twoPlayer ? 'local2p' : 'bot' };
      startedAt.current = performance.now();
      track('round_start', { mode: open.current.mode, character: hudRef.current?.character, n_in_session: nextRoundNumber() });
    }
    if (phase === 'over') {
      const w = hudRef.current?.winner;
      end(w === 0 ? 'win' : w === 1 ? 'lose' : 'timeout');
    }
    // A rematch goes back to the countdown without a result: that ends the old match as a quit.
    if (phase === 'countdown' && open.current) end('quit');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Leaving mid-match is a quit.
  useEffect(() => () => end('quit'), []); // eslint-disable-line react-hooks/exhaustive-deps
};
