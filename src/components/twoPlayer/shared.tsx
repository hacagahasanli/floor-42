'use client';

import { useEffect, useRef, useState } from 'react';

import { useSettings } from '~/components/menu/useSettings';
import { keyLabel } from '~/game/settings';
import { playerColour } from '~/game/twoPlayer';

import type { Player } from '~/game/twoPlayer';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Pieces every local 2-player screen shares: key labels that follow the keyboard layout, the 44 px keycap, the P1 / P2
 * chip and the player colours. Spec: docs/collab/CREATIVE/specifications/local-2p.md.
 */

type LayoutMap = Map<string, string>;
let layoutCache: LayoutMap | null = null;
let layoutAsked = false;

/**
 * The label printed on a key in the player's own layout (navigator.keyboard.getLayoutMap, Chrome and Edge): on AZERTY
 * the P1 cluster reads Z Q S D. Other browsers get the US labels.
 */
export const useKeyLabel = () => {
  const [map, setMap] = useState<LayoutMap | null>(layoutCache);
  useEffect(() => {
    if (layoutCache || layoutAsked) return;
    layoutAsked = true;
    const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<LayoutMap> } })
      .keyboard;
    void kb
      ?.getLayoutMap?.()
      .then((m) => {
        layoutCache = new Map(m);
        setMap(layoutCache);
      })
      .catch(() => undefined);
  }, []);
  return (code: string) => {
    if (!code) return '—';
    const own = map?.get(code);
    if (own && own.trim() && !code.startsWith('Arrow'))
      return own.length === 1 ? own.toUpperCase() : own;
    return keyLabel(code);
  };
};

/** The two player colours for the current colour-blind setting. */
export const usePlayerColours = (): [string, string] => {
  const { colourBlind } = useSettings();
  return [playerColour(0, colourBlind), playerColour(1, colourBlind)];
};

export const playerIndex = (p: Player): 0 | 1 => (p === 'p1' ? 0 : 1);

/** UI-chrome tag colours (R-028, colour-balance.md 8.5): grape and white, never the player colour (that stays in-world). */
export const TAG_GRAPE = '#3b1f6b';

/** The `P1` / `P2` chip: grape fill, white text, 2 px white border (it sits on the dark key card over the match). */
export const PlayerChip = ({ index, className = '' }: { index: 0 | 1; className?: string }) => (
  <span
    className={`inline-flex items-center justify-center px-1.5 font-display text-sm leading-5 ${className}`}
    style={{ background: TAG_GRAPE, color: '#fff', border: '2px solid #fff' }}
    data-testid={`player-chip-${index}`}
  >
    P{index + 1}
  </span>
);

/**
 * The existing keycap look at 44 px; `lit` fills it with sun while the key is held (the key tester: a momentary event, so sun
 * is allowed, colour-balance.md 8.2; it used to be the player colour).
 */
export const BigKeycap = ({
  children,
  lit,
  label,
}: {
  children: ReactNode;
  lit?: boolean;
  label?: string;
}) => (
  <span className="flex flex-col items-center gap-1">
    <kbd
      className="inline-flex h-11 min-w-11 items-center justify-center border border-b-[3px] px-2 font-display text-lg leading-none transition-colors duration-75"
      style={
        {
          borderColor: lit ? '#ffc83d' : 'rgba(230,235,245,0.3)',
          background: lit ? '#ffc83d' : 'rgba(230,235,245,0.1)',
          color: lit ? TAG_GRAPE : '#e6ebf5',
        } as CSSProperties
      }
    >
      {children}
    </kbd>
    {label && <span className="text-[11px] font-semibold text-cream/70">{label}</span>}
  </span>
);

export interface BothPressState {
  /** Shoot as read last frame (null before the first read). */
  prev: [boolean, boolean] | null;
  got: [boolean, boolean];
  fired: boolean;
}
export const BOTH_PRESS_START: BothPressState = { prev: null, got: [false, false], fired: false };

/**
 * One frame of the both-press rule, pure (unit-tested). A tick needs a fresh press (up then down) after the lock: presses
 * during `locked` are read (so a Shoot held through the lock still needs letting go) but never count. `fire` in the result
 * is true on the one frame both ticks are in.
 */
export const stepBothPress = (s: BothPressState, now: [boolean, boolean], locked: boolean): BothPressState & { fire: boolean } => {
  if (!s.prev || locked) return { ...s, prev: now, fire: false };
  const got: [boolean, boolean] = [s.got[0] || (now[0] && !s.prev[0]), s.got[1] || (now[1] && !s.prev[1])];
  const fire = got[0] && got[1] && !s.fired;
  return { prev: now, got, fired: s.fired || fire, fire };
};

/**
 * Both players press Shoot (keys or pads) -> `onBoth`, once. Returns the ready ticks. A Shoot already held when this
 * becomes active needs a fresh press, and nothing counts for `lockMs` after it becomes active (the result screen's input
 * lock, spec section 4 item 5: so Shoot mashed through the final KO cannot skip the result).
 */
export const useBothPress = (
  peek: () => { inputs: [{ fire: boolean }, { fire: boolean }] } | null,
  active: boolean,
  onBoth: () => void,
  lockMs = 0,
): [boolean, boolean] => {
  const [ready, setReady] = useState<[boolean, boolean]>([false, false]);
  const cb = useRef(onBoth);
  cb.current = onBoth;
  useEffect(() => {
    setReady([false, false]);
    if (!active) return;
    let s = BOTH_PRESS_START;
    const since = performance.now();
    let raf = 0;
    const tick = () => {
      const p = peek();
      if (p) {
        const next = stepBothPress(s, [p.inputs[0].fire, p.inputs[1].fire], performance.now() - since < lockMs);
        if (next.got[0] !== s.got[0] || next.got[1] !== s.got[1]) setReady(next.got);
        s = next;
        if (next.fire) cb.current();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, peek, lockMs]);
  return ready;
};
