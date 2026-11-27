'use client';

import { useEffect, useRef } from 'react';

import { reducedMotion } from '~/components/Elevator';
import { menuSound } from '~/components/menu/menuSound';
import { getSettings } from '~/game/settings';

import type { CSSProperties, ReactNode } from 'react';

/**
 * <Stamp size="md|lg|xl" colour="#ffd23f" plate rot={-6} leaving silent noKick>text</Stamp>: an office rubber stamp that lands
 * on mount (R-013 3.2): scale-in + flash + thunk (md/lg `stamp()`, xl `stampBig()` + a 160 ms kick of the nearest
 * [data-kick-root] ancestor). `leaving` plays the 140 ms exit (the parent unmounts after). Shake OFF or reduced motion: no
 * kick, no scale/rotation, a 120 ms fade; the sound still plays. `silent` skips the sound, `noKick` skips the kick.
 */

export type StampSize = 'md' | 'lg' | 'xl';

interface Props {
  size?: StampSize;
  /** Fill (and plate border) colour; default gold. Any CSS colour. */
  colour?: string;
  /** Ink plate with a border in `colour` behind the text. */
  plate?: boolean;
  /** Rotation in degrees; default -6 (use +4 for the second stamp of a pair). */
  rot?: number;
  /** Play the 140 ms exit. */
  leaving?: boolean;
  /** No sound. */
  silent?: boolean;
  /** No page kick (xl only kicks anyway). */
  noKick?: boolean;
  className?: string;
  children: ReactNode;
}

export const Stamp = ({ size = 'md', colour, plate, rot = -6, leaving, silent, noKick, className = '', children }: Props) => {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!silent) (size === 'xl' ? menuSound.stampBig : menuSound.stamp)();
    if (size !== 'xl' || noKick || reducedMotion() || !getSettings().get().shake) return;
    const root = ref.current?.closest<HTMLElement>('[data-kick-root]');
    if (!root) return;
    root.classList.remove('f42-kick');
    void root.offsetWidth; // restart the animation when two stamps land back to back
    root.classList.add('f42-kick');
    const t = window.setTimeout(() => root.classList.remove('f42-kick'), 180);
    return () => {
      window.clearTimeout(t);
      root.classList.remove('f42-kick');
    };
    // Lands once per mount; props are read at that moment.
  }, []);
  const style = { '--stamp-rot': `${rot}deg`, ...(colour ? { '--stamp-colour': colour } : {}) } as CSSProperties;
  return (
    <span
      ref={ref}
      role="status"
      data-stamp={size}
      data-leaving={leaving ? '' : undefined}
      className={`f42-stamp f42-stamp-${size}${plate ? ' f42-stamp-plate' : ''} ${className}`}
      style={style}
    >
      {children}
    </span>
  );
};
