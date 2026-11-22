'use client';

import { useEffect, useRef, useState } from 'react';

import { useSettings } from '~/components/menu/useSettings';
import { keyLabel } from '~/game/settings';
import { playerColour } from '~/game/twoPlayer';

import type { Action2P, Bindings2P, Player } from '~/game/twoPlayer';
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

/** The `P1` / `P2` chip: player colour fill, ink text. */
export const PlayerChip = ({
  index,
  colour,
  className = '',
}: {
  index: 0 | 1;
  colour: string;
  className?: string;
}) => (
  <span
    className={`inline-flex items-center justify-center px-1.5 font-display text-sm leading-5 text-ink-deep ${className}`}
    style={{ background: colour }}
  >
    P{index + 1}
  </span>
);

/** The existing keycap look at 44 px; `lit` fills it with the player colour (the key tester). */
export const BigKeycap = ({
  children,
  lit,
  colour,
  label,
}: {
  children: ReactNode;
  lit?: boolean;
  colour: string;
  label?: string;
}) => (
  <span className="flex flex-col items-center gap-1">
    <kbd
      className="inline-flex h-11 min-w-11 items-center justify-center border border-b-[3px] px-2 font-display text-lg leading-none transition-colors duration-75"
      style={
        {
          borderColor: lit ? colour : 'rgba(230,235,245,0.3)',
          background: lit ? colour : 'rgba(230,235,245,0.1)',
          color: lit ? '#0a0d18' : '#e6ebf5',
        } as CSSProperties
      }
    >
      {children}
    </kbd>
    {label && <span className="text-[11px] font-semibold text-cream/70">{label}</span>}
  </span>
);

/** A small keycap for strips and hints. */
export const SmallKey = ({ k }: { k: string }) => (
  <kbd className="inline-flex min-w-5 items-center justify-center rounded-sm border border-b-2 border-cream/30 bg-cream/10 px-1 text-[10px] font-bold leading-4 text-cream">
    {k}
  </kbd>
);

/**
 * The key strip text for one player (spec 8): `A D move · W jump · F shoot · G push · H dash`, in layout labels.
 */
export const stripParts = (
  b: Bindings2P,
  p: Player,
  label: (c: string) => string,
): { keys: string[]; text: string }[] => {
  const k = (a: Action2P) => label(b[p][a]);
  return [
    { keys: [k('left'), k('right')], text: 'move' },
    { keys: [k('up')], text: 'jump' },
    { keys: [k('fire')], text: 'shoot' },
    { keys: [k('push')], text: 'push' },
    { keys: [k('dash')], text: 'dash' },
    { keys: [k('crouch')], text: 'sit' },
  ];
};

export const KeyStrip = ({
  bindings,
  player,
  align,
  dim,
}: {
  bindings: Bindings2P;
  player: Player;
  align: 'left' | 'right';
  dim: boolean;
}) => {
  const label = useKeyLabel();
  const [c1, c2] = usePlayerColours();
  const i = playerIndex(player);
  return (
    <div
      data-testid={`strip-${player}`}
      className={`hud-scale pointer-events-none absolute bottom-3 flex max-w-[48%] flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-cream/75 transition-opacity duration-500 ${align === 'left' ? 'left-3 origin-bottom-left' : 'right-3 origin-bottom-right justify-end'} ${dim ? 'opacity-40' : 'opacity-100'}`}
    >
      {align === 'left' && <PlayerChip index={i} colour={i === 0 ? c1 : c2} />}
      {stripParts(bindings, player, label).map((part) => (
        <span key={part.text} className="flex items-center gap-1">
          {part.keys.map((k, n) => (
            <SmallKey key={n} k={k} />
          ))}{' '}
          {part.text}
        </span>
      ))}
      {align === 'right' && <PlayerChip index={i} colour={i === 0 ? c1 : c2} />}
    </div>
  );
};

/**
 * Both players press Shoot (keys or pads) -> `onBoth`, once. Returns the ready ticks. A Shoot already held when this
 * becomes active needs a fresh press.
 */
export const useBothPress = (
  peek: () => { inputs: [{ fire: boolean }, { fire: boolean }] } | null,
  active: boolean,
  onBoth: () => void,
): [boolean, boolean] => {
  const [ready, setReady] = useState<[boolean, boolean]>([false, false]);
  const cb = useRef(onBoth);
  cb.current = onBoth;
  useEffect(() => {
    setReady([false, false]);
    if (!active) return;
    let prev: [boolean, boolean] | null = null;
    let got: [boolean, boolean] = [false, false];
    let fired = false;
    let raf = 0;
    const tick = () => {
      const p = peek();
      if (p) {
        const fire: [boolean, boolean] = [p.inputs[0].fire, p.inputs[1].fire];
        if (prev) {
          const next: [boolean, boolean] = [
            got[0] || (fire[0] && !prev[0]),
            got[1] || (fire[1] && !prev[1]),
          ];
          if (next[0] !== got[0] || next[1] !== got[1]) {
            got = next;
            setReady(next);
          }
          if (got[0] && got[1] && !fired) {
            fired = true;
            cb.current();
          }
        }
        prev = fire;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, peek]);
  return ready;
};
