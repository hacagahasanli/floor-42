'use client';

import { useEffect, useLayoutEffect, useState } from 'react';

import { boxesClash, cornerLayout } from './hudMath';

import type { CornerLayout } from './hudMath';
import type { RefObject } from 'react';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Inline styles the corner group gets while stacked (R-030 3: `flex-direction: column; align-items: flex-end; gap: 6px`). */
export const STACK_STYLE = { flexDirection: 'column', alignItems: 'flex-end', gap: '6px' } as const;

/**
 * Where the corner group in `ref` goes so it never overlaps a visible element matching `selectors` (with `gap` px to spare):
 * 'row', 'stack' or 'hidden' (`cornerLayout`). Both candidate layouts are measured on every render, before paint, by setting
 * them on the element for the measurement and restoring its inline style, so the answer depends only on geometry (no
 * flip-flop between renders, no flash). Re-measured on every render (the HUD re-renders when the strip or hint appears or goes)
 * and on resize. A hidden element keeps its layout box.
 */
export const useCornerLayout = (
  ref: RefObject<HTMLElement | null>,
  selectors: string,
  canStack: boolean,
  gap = 6,
): CornerLayout => {
  const [layout, setLayout] = useState<CornerLayout>('row');
  const [, bump] = useState(0);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      if (layout !== 'row') setLayout('row');
      return;
    }
    const others = [...document.querySelectorAll<HTMLElement>(selectors)].map((o) => o.getBoundingClientRect());
    const clashes = () => {
      const mine = el.getBoundingClientRect();
      return others.some((o) => boxesClash(mine, o, gap));
    };
    const saved = el.getAttribute('style');
    el.style.flexDirection = 'row';
    el.style.alignItems = 'center';
    el.style.gap = '';
    const rowClash = clashes();
    let stackClash = true;
    if (rowClash && canStack) {
      Object.assign(el.style, STACK_STYLE);
      stackClash = clashes();
    }
    if (saved === null) el.removeAttribute('style');
    else el.setAttribute('style', saved);
    const next = cornerLayout(rowClash, stackClash, canStack);
    if (next !== layout) setLayout(next);
  });
  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return layout;
};
