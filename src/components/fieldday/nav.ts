'use client';

import { useEffect, useRef } from 'react';

import { fdSound } from './sound';

import type { RefObject } from 'react';

/**
 * Directional navigation for Field Day screens. Arrow keys (and a pad's d-pad / stick, which useGamepadNav turns into the same
 * keys) move focus to the nearest `[data-nav]` element in that direction, by geometry, so a 2-column button grid, a card row
 * and a pager all work with one rule. Mark the preferred landing spot with `data-nav-pref` (the selected card, PLAY).
 * An element that handles an arrow itself (a segmented control) calls preventDefault() on that key and is left alone.
 */
export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Pick the best candidate to move from `from` in `dir`. Pure (boxes in, index out), so it is unit-tested.
 * A candidate must lie beyond the edge in that direction; distance along the axis counts once, the sideways offset of the
 * centres counts double (so a straight neighbour beats a nearer diagonal one), and `pref` candidates get a bonus.
 */
export const pickNext = (from: Box, dir: Dir, boxes: { box: Box; pref?: boolean }[], exclude = -1): number => {
  const cx = (b: Box) => (b.left + b.right) / 2;
  const cy = (b: Box) => (b.top + b.bottom) / 2;
  let best = -1;
  let bestScore = Infinity;
  boxes.forEach(({ box, pref }, i) => {
    if (i === exclude) return;
    const vOver = Math.min(box.bottom, from.bottom) - Math.max(box.top, from.top);
    const hOver = Math.min(box.right, from.right) - Math.max(box.left, from.left);
    const minH = Math.min(box.bottom - box.top, from.bottom - from.top);
    const minW = Math.min(box.right - box.left, from.right - from.left);
    // "Beyond" = centre past the origin's centre in that direction, and the two boxes overlap by less than half the smaller one on that axis.
    const beyond =
      dir === 'down' ? cy(box) > cy(from) && vOver < minH / 2
      : dir === 'up' ? cy(box) < cy(from) && vOver < minH / 2
      : dir === 'right' ? cx(box) > cx(from) && hOver < minW / 2
      : cx(box) < cx(from) && hOver < minW / 2;
    if (!beyond) return;
    const along = dir === 'down' || dir === 'up' ? Math.abs(cy(box) - cy(from)) : Math.abs(cx(box) - cx(from));
    const side = dir === 'down' || dir === 'up' ? Math.abs(cx(box) - cx(from)) : Math.abs(cy(box) - cy(from));
    // A preferred spot (the picked card) ignores the sideways offset, so Up from FIGHT! lands on it wherever it is in the row.
    const score = along * 3 + (pref ? 0 : side);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
};

const DIRS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

const visible = (el: HTMLElement) => {
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

export const useSpatialNav = (
  root: RefObject<HTMLElement | null>,
  opts: { active?: boolean; onBack?: () => void; ignorePrevented?: boolean } = {},
) => {
  const { active = true } = opts;
  const ignorePrevented = !!opts.ignorePrevented;
  const back = useRef(opts.onBack);
  back.current = opts.onBack;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = root.current;
      // `ignorePrevented`: a screen over the match (pause, settings) still moves when the game's own key handler claimed the arrow.
      if (!el || (e.defaultPrevented && !ignorePrevented)) return;
      if (e.code === 'Escape' && back.current) {
        e.preventDefault();
        back.current();
        return;
      }
      const dir = DIRS[e.code];
      if (!dir) return;
      const items = [...el.querySelectorAll<HTMLElement>('[data-nav]')].filter(visible);
      if (!items.length) return;
      e.preventDefault();
      const current = items.findIndex((n) => n === document.activeElement || n.contains(document.activeElement));
      let target: HTMLElement | undefined;
      if (current < 0) target = items.find((n) => n.hasAttribute('data-nav-pref')) ?? items[0];
      else {
        const rect = (n: HTMLElement): Box => {
          const r = n.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        };
        const next = pickNext(
          rect(items[current]),
          dir,
          items.map((n) => ({ box: rect(n), pref: n.hasAttribute('data-nav-pref') })),
          current,
        );
        target = next >= 0 ? items[next] : undefined;
      }
      if (target && target !== document.activeElement) {
        target.focus({ preventScroll: true });
        fdSound.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [root, active, ignorePrevented]);
};
