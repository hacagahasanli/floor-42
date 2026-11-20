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
