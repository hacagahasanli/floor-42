'use client';

import { useEffect, useState } from 'react';

import { doorPortrait, ensureDoorPortraits, onDoorPortraits } from '~/components/vsPortraits';

import { CARD_CREAM, FIGHTER_IDS, cardCrop, fighterView, portraitCrop } from './fighters';

import type { CSSProperties } from 'react';
import type { CharacterId } from '~/game/sim/types';

/**
 * Fighter pictures from the game's own models (the VS-door render, 360x440, transparent), shown on the fighter's accent colour.
 * One render per fighter per session, shared with the VS doors (vsPortraits.ts): HUD, pause, rematch and stats reuse the same
 * image. `useFighterPortraits()` asks for them (all four, current one first) and re-renders when they land; until then the
 * accent colour shows, so nothing jumps.
 */
export const useFighterPortraits = (first?: CharacterId, opts: { eager?: boolean } = {}) => {
  const [, bump] = useState(0);
  useEffect(() => {
    const off = onDoorPortraits(() => bump((n) => n + 1));
    let alive = true;
    const ids = first ? [first, ...FIGHTER_IDS.filter((i) => i !== first)] : [...FIGHTER_IDS];
    const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const later = (fn: () => void) => (opts.eager ? fn() : ric ? ric(fn, { timeout: 4000 }) : window.setTimeout(fn, 1500));
    // One render at a time (current fighter first), the rest in idle time unless `eager`, so no single frame is long.
    const next = () => {
      const id = ids.shift();
      if (id && alive) void ensureDoorPortraits([id]).then(() => alive && later(next));
    };
    next();
    return () => {
      alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return FIGHTER_IDS.every((id) => doorPortrait(id));
};

/** A fighter picture in a `w` x `h` frame. `head` and `ty` pick the crop (see portraitCrop). `shape="circle"` for HUD-style heads. */
export const Portrait = ({
  id,
  w,
  h,
  head = 0.5,
  ty = 0.34,
  circle,
  card,
  className = '',
  style,
}: {
  id: CharacterId;
  w: number;
  h: number;
  /** Head width as a fraction of the frame width. */
  head?: number;
  /** Head centre as a fraction of the frame height. */
  ty?: number;
  circle?: boolean;
  /**
   * F-045, fighter cards on select and menu: cream paper, a 22 % accent burst behind the head, a 4 px accent band along the bottom
   * and the same head height for all four (`head` is then the head HEIGHT as a fraction of the frame height; `ty` is ignored).
   */
  card?: boolean;
  className?: string;
  style?: CSSProperties;
}) => {
  const src = doorPortrait(id);
  const v = fighterView(id);
  if (card) {
    const c = cardCrop(id, w, h, head);
    return (
      <div
        aria-hidden="true"
        className={className}
        data-portrait={src ? 'ready' : 'pending'}
        data-card="cream"
        style={{
          width: w,
          height: h,
          backgroundColor: CARD_CREAM,
          backgroundRepeat: 'no-repeat',
          boxShadow: `inset 0 -4px 0 ${v.accent}`,
          // Head first (on top), then the burst: the accent at 22 % from behind the head, fading out by the card's edges.
          backgroundImage: `${src ? `url(${src}), ` : ''}radial-gradient(circle at ${c.headCentre.x.toFixed(1)}px ${c.headCentre.y.toFixed(1)}px, ${v.accent}38 0%, ${v.accent}38 22%, ${v.accent}00 70%)`,
          ...(src ? { backgroundSize: `${c.backgroundSize}, 100% 100%`, backgroundPosition: `${c.backgroundPosition}, 0 0` } : null),
          ...style,
        }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={className}
      data-portrait={src ? 'ready' : 'pending'}
      style={{
        width: w,
        height: h,
        backgroundColor: v.accent,
        backgroundRepeat: 'no-repeat',
        borderRadius: circle ? '50%' : undefined,
        ...(src ? { backgroundImage: `url(${src})`, ...portraitCrop(id, w, h, head, ty) } : null),
        ...style,
      }}
    />
  );
};
