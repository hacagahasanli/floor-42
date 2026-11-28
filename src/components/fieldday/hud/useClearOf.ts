'use client';

import { useEffect, useLayoutEffect, useState } from 'react';

import { boxesClash } from './hudMath';

import type { RefObject } from 'react';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * True while the element in `ref` would overlap any visible element matching `selectors` (with `gap` px to spare). Measured
 * after every render (the HUD re-renders a few times a second, so a strip that appears or goes is seen at once) and on resize.
 * The caller hides its element while this is true; a hidden element keeps its layout box, so the answer does not flicker.
 */
export const useClearOf = (ref: RefObject<HTMLElement | null>, selectors: string, gap = 6): boolean => {
  const [clash, setClash] = useState(false);
  const [, bump] = useState(0);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      if (clash) setClash(false);
      return;
    }
    const mine = el.getBoundingClientRect();
    const hit = [...document.querySelectorAll<HTMLElement>(selectors)].some((o) => boxesClash(mine, o.getBoundingClientRect(), gap));
    if (hit !== clash) setClash(hit);
  });
  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return clash;
};
