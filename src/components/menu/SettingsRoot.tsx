'use client';

import { useEffect } from 'react';

import { useSettings } from './useSettings';

/**
 * Page-wide settings that are pure CSS: larger HUD text, colour-blind-friendly colours and reduced motion
 * are attributes on <html> that globals.css reads. Mounted once in the root layout.
 */
export const SettingsRoot = () => {
  const s = useSettings();
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.hud = s.largeHud ? 'large' : 'normal';
    el.dataset.palette = s.colourBlind ? 'cb' : 'default';
    el.dataset.motion = s.reducedMotion ? 'reduced' : 'full';
  }, [s.largeHud, s.colourBlind, s.reducedMotion]);
  return null;
};
