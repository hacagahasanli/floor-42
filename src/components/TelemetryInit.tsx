'use client';

import { useEffect } from 'react';

import { GAME_VERSION } from '~/lib/studio';
import { init, track } from '~/lib/telemetry';

/**
 * Starts anonymous visit counting on our own site, and only when NEXT_PUBLIC_STATS_URL is set (so local builds never send)
 * and this is not a portal build (NEXT_PUBLIC_PORTAL=1). The portal check is written out here, not read from a shared flag, so
 * the bundler removes the stats address from a portal build altogether (a test builds both and looks for it).
 * Rendered first in the root layout, so counting has begun before any screen reports.
 */
const STATS_URL = process.env.NEXT_PUBLIC_PORTAL === '1' ? undefined : process.env.NEXT_PUBLIC_STATS_URL;

export const TelemetryInit = () => {
  useEffect(() => {
    if (!STATS_URL) return;
    init({ endpoint: STATS_URL, game: 'floor-42', build: process.env.NEXT_PUBLIC_BUILD || GAME_VERSION });
    // Loading starts with the first line of the page's own code; useMenuTelemetry / useRoundTelemetry end it.
    track('load_start');
  }, []);
  return null;
};
