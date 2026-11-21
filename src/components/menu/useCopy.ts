'use client';

import { useMemo } from 'react';

import { copyFor, resolveVariant } from '~/game/copy';

import { useSettings } from './useSettings';

import type { Copy, CopyVariant } from '~/game/copy';

/** The copy variant the player chose (plain words until they answer, and always on a portal build). */
export const useCopyVariant = (): CopyVariant => resolveVariant(useSettings().audience);

/** Every dev-joke line in the player's chosen variant, live: switching in Settings re-renders at once. */
export const useCopy = (): Copy => {
  const variant = useCopyVariant();
  return useMemo(() => copyFor(variant), [variant]);
};
