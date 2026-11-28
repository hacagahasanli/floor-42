import type { CSSProperties } from 'react';

/**
 * The sunburst (spec 2.4, 5): a conic fan of rays that turns. `spin` seconds per turn (60 on menus and the result, 20 on the VS
 * doors; 0 = still). `soft` fades the rays to nothing at the edge (the select screen's halo behind the picked card); without it
 * the rays fill the disc (R-027: the home fighter disc now uses the soft fade at 0.75). Never on a match. Reduced motion stops the spin (CSS).
 * Place and size it with `left/top/size`; it is decorative (aria-hidden) and ignores the pointer.
 */
export const Sunburst = ({
  size,
  left,
  top,
  right,
  spin = 60,
  soft = true,
  light = '#FFE38A',
  dark = '#FFC83D',
  opacity,
  style,
}: {
  size: number;
  left?: number;
  top?: number;
  right?: number;
  spin?: number;
  soft?: boolean;
  light?: string;
  dark?: string;
  opacity?: number;
  style?: CSSProperties;
}) => (
  <div
    aria-hidden="true"
    className={`fd-rays ${soft ? '' : 'fd-solid'}`}
    style={{
      left,
      top,
      right,
      width: size,
      height: size,
      opacity,
      pointerEvents: 'none',
      ['--r1' as string]: light,
      ['--r2' as string]: dark,
      ['--spin' as string]: `${spin || 60}s`,
      ...(spin ? null : { animation: 'none' }),
      ...style,
    }}
  />
);
