'use client';

import { useSyncExternalStore } from 'react';

import { DEFAULT_SETTINGS, getSettings } from '~/game/settings';

import type { Settings } from '~/game/settings';

/** The player's settings, live: re-renders when anything in Settings changes. */
export const useSettings = (): Settings =>
  useSyncExternalStore(
    (cb) => getSettings().subscribe(cb),
    () => getSettings().get(),
    () => DEFAULT_SETTINGS,
  );

/**
 * Sound is off: the player muted it OR the portal asked for silence (CrazyGames `muteAudio`, release QA 2026-11-28 item 9).
 * The home Sound button shows this, so a portal mute reads as muted. Server snapshot: not muted.
 */
export const useEffectiveMute = (): boolean =>
  useSyncExternalStore(
    (cb) => getSettings().subscribe(cb),
    () => getSettings().effectiveMute(),
    () => false,
  );
