'use client';

import { forwardRef, useLayoutEffect, useRef, useState } from 'react';

import { GAME_NAME, wordmarkParts } from './brand';
import { fitScale } from './fit';
import { Icon, RibbonTail } from './Icon';

import type { IconName } from './Icon';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

/**
 * Small Field Day parts: Keycap, Chip, Pill, HintStrip, Panel, Card, Ribbon, Pips, Wordmark. Styles live in fieldday.css.
 * All sizes are design px (the Stage scales them).
 */

const ARROW: Record<string, string> = {
  '←': 'M15 5 8 12l7 7',
  '→': 'M9 5l7 7-7 7',
  '↑': 'M5 15l7-7 7 7',
  '↓': 'M5 9l7 7 7-7',
};
export const ARROW_KEYS = Object.keys(ARROW);

/** A keycap. Arrow glyphs (Baloo has none) draw as SVG chevrons. `state`: 'listening' = sun, pulsing; 'empty' = dashed "+ ADD". */
export const Keycap = ({
  k,
  state,
  className = '',
  style,
}: {
  k: string;
  state?: 'listening' | 'empty';
  className?: string;
  style?: CSSProperties;
}) => {
  const arrow = ARROW[k.trim()];
  return (
    <kbd
      className={`fd-kc ${state === 'listening' ? 'fd-listening' : ''} ${state === 'empty' ? 'fd-empty' : ''} ${className}`}
      style={style}
    >
      {arrow ? (
        <svg viewBox="0 0 24 24" aria-label={k} role="img">
          <path d={arrow} fill="none" stroke="#3B1F6B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        k
      )}
    </kbd>
  );
};

/** A key label for a button face: arrows draw as SVG chevrons (Baloo has no arrows), anything else is its text. */
export const KeyLabel = ({ k }: { k: string }) => {
  const arrow = ARROW[k.trim()];
  return arrow ? (
    <svg viewBox="0 0 24 24" aria-label={k} role="img" style={{ width: 14, height: 14 }}>
      <path d={arrow} fill="none" stroke="#3B1F6B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <>{k}</>
  );
};

/**
 * A status chip (HUD and traits): pill, 3 px grape border, grape text. `color` is any CSS colour (default white; R-027: leave it
 * white unless the chip IS the action / event (sun) or belongs to a fighter (that fighter's accent)).
 */
export const Chip = forwardRef<
  HTMLSpanElement,
  {
    children: ReactNode;
    color?: string;
    icon?: IconName;
    iconClassName?: string;
    height?: number;
    fontSize?: number;
    className?: string;
    style?: CSSProperties;
  } & Omit<HTMLAttributes<HTMLSpanElement>, 'color'>
>(function Chip({ children, color, icon, iconClassName, height, fontSize, className = '', style, ...rest }, ref) {
  return (
  <span
    {...rest}
    ref={ref}
    className={`fd-chip ${className}`}
    style={{
      ...(color ? { ['--c' as string]: color } : null),
      ...(height ? { height } : null),
      ...(fontSize ? { fontSize } : null),
      ...style,
    }}
  >
    {icon && <Icon name={icon} className={iconClassName} />}
    {children}
  </span>
  );
});

/** The info pill: cream on grape-deep at 86 % (15:1). */
export const Pill = ({ children, className = '', style, ...rest }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={`fd-pill ${className}`} style={style} {...rest}>
    {children}
  </span>
);

/** A hint strip: pairs of keycaps and verbs, e.g. `<HintStrip items={[{ keys: ['←','→'], label: 'Choose' }]} />`. */
export const HintStrip = ({
  items,
  className = '',
  style,
}: {
  items: { keys: string[]; label: string }[];
  className?: string;
  style?: CSSProperties;
}) => (
  <div className={`fd-hints ${className}`} style={style}>
    {items.map((it) => (
      <span key={it.label}>
        {it.keys.map((k, i) => (
          <Keycap key={i} k={k} />
        ))}
        {it.label}
      </span>
    ))}
  </div>
);

/** Paper panel: 4 px grape border, radius 28, drop 8. Positioned absolutely by the caller (left/top/width/height in style). */
export const Panel = ({ children, className = '', style, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div className={`fd-panel ${className}`} style={style} {...rest}>
    {children}
  </div>
);

/** White card: 4 px grape border, radius 22, drop 8, clips its content. */
export const Card = ({ children, className = '', style, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div className={`fd-card ${className}`} style={style} {...rest}>
    {children}
  </div>
);

/**
 * Measure `ref` and return the scale that fits it in `max` (spec 3.1). Re-measures when `deps` change and when fonts load.
 * `followsScale`: the measured element's own size already includes the returned scale (the wordmark multiplies its font
 * sizes), so the natural width is the measured width divided by it; otherwise the scale is applied as a transform.
 */
export const useFit = (max: number, deps: unknown[], followsScale = false) => {
  const ref = useRef<HTMLElement | null>(null);
  const [scale, setScale] = useState(1);
  const current = useRef(1);
  current.current = scale;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const measure = () => {
      if (!alive) return;
      const natural = followsScale ? el.offsetWidth / current.current : el.offsetWidth;
      const next = fitScale(natural, max);
      setScale((prev) => (Math.abs(next - prev) < 0.001 ? prev : next));
    };
    measure();
    void document.fonts?.ready.then(measure);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [max, ...deps]);
  return [ref, scale] as const;
};

/**
 * A ribbon (spec 2.4): grape by default (R-027: a sun ribbon must be a celebration), notched tails, tilted. Sized by its
 * content; `maxWidth` auto-fits it (never wraps). `height` 62 for modal titles, 44 for the home arena ribbon. `tilt` in
 * degrees. `labelColor` sets a plain label colour with no outline (the home arena ribbon's sun label); without it the label is
 * outlined white. Position it with `style`.
 */
export const Ribbon = ({
  children,
  color = 'var(--grape)',
  lip = 'var(--grape-deep)',
  tail = '#26124A',
  labelColor,
  height = 62,
  tilt = -1.5,
  maxWidth,
  className = '',
  style,
  ...rest
}: {
  children: ReactNode;
  color?: string;
  lip?: string;
  tail?: string;
  labelColor?: string;
  height?: number;
  tilt?: number;
  maxWidth?: number;
} & Omit<HTMLAttributes<HTMLDivElement>, 'color'>) => {
  const small = height < 56;
  const [ref, scale] = useFit(maxWidth ?? 99999, [children]);
  const tailStyle = (side: 'left' | 'right'): CSSProperties => (small ? { top: 12, width: 34, height: 38, [side]: -22 } : {});
  return (
    <div
      className={`fd-ribbon ${className}`}
      style={{
        height,
        padding: small ? '0 24px' : undefined,
        ['--c' as string]: color,
        ['--lo' as string]: lip,
        transform: `rotate(${tilt}deg) scale(${scale})`,
        transformOrigin: '50% 50%',
        ...style,
      }}
      {...rest}
    >
      <RibbonTail fill={tail} className="fd-tail fd-l" style={tailStyle('left')} />
      <RibbonTail fill={tail} className="fd-tail fd-r" style={tailStyle('right')} />
      <span
        ref={ref}
        className={labelColor ? 'fd-titan' : 'fd-titan fd-ol'}
        style={{ fontSize: small ? 20 : 30, ['--o' as string]: small ? '2px' : '2.5px', ['--d' as string]: small ? '3px' : '3px', letterSpacing: small ? 1 : undefined, ...(labelColor ? { color: labelColor } : null) }}
      >
        {children}
      </span>
    </div>
  );
};

/** Pips (1-5): speed, jump, weight. Filled pips are grape for every fighter (R-027: four accent pip blocks were noise); `color` overrides. */
export const Pips = ({ n, color, label }: { n: number; color?: string; label: string }) => (
  <span className="fd-pips" style={color ? { ['--c' as string]: color } : undefined} role="img" aria-label={`${label} ${n} of 5`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <i key={i} className={i <= n ? 'fd-on' : ''} />
    ))}
  </span>
);

/** The SPEED / JUMP / WEIGHT row under a fighter card. */
export const StatRow = ({ label, n, color }: { label: string; n: number; color?: string }) => (
  <div className="fd-stat">
    <span>{label}</span>
    <Pips n={n} color={color} label={label.toLowerCase()} />
  </div>
);

/**
 * The wordmark slot (spec 3.1, R-023): box 420x118 at --s 1 (`scale` multiplies, 1.25 on the boot screen). Reads GAME_NAME from
 * brand.ts. A name wider than the slot scales down to fit, never wraps, never below 0.6. Pass `name` to override (the stress test).
 * The slot has the box's size, so the layout never moves when the font loads or the name changes.
 */
export const Wordmark = ({ name = GAME_NAME, scale = 1, className = '', style }: { name?: string; scale?: number; className?: string; style?: CSSProperties }) => {
  const parts = wordmarkParts(name);
  const [ref, fit] = useFit(420 * scale, [name, scale], true);
  const s = scale * fit;
  const big = parts.length === 1 ? parts[0] : parts[1];
  return (
    <div className={className} style={{ width: 420 * scale, height: 104 * scale, position: 'relative', ...style }} data-testid="wordmark">
      <h1
        ref={ref as React.RefObject<HTMLHeadingElement>}
        aria-label={name}
        style={{
          margin: 0,
          display: 'flex',
          whiteSpace: 'nowrap',
          alignItems: 'flex-end',
          gap: 10 * s,
          transform: 'rotate(-3deg)',
          transformOrigin: 'left bottom',
          position: 'absolute',
          left: 0,
          top: 0,
          width: 'max-content',
        }}
      >
        {parts.length === 2 && (
          <span aria-hidden="true" className="fd-titan fd-ol" style={{ fontSize: 60 * s, ['--o' as string]: `${4 * s}px`, ['--d' as string]: `${6 * s}px`, paddingBottom: 8 * s }}>
            {parts[0]}
          </span>
        )}
        <span aria-hidden="true" className="fd-titan fd-ol fd-sun" style={{ fontSize: 104 * s, ['--o' as string]: `${5 * s}px`, ['--d' as string]: `${9 * s}px`, display: 'inline-block', transform: 'rotate(-4deg)' }}>
          {big}
        </span>
      </h1>
    </div>
  );
};

/** The trait disc (R-026 11.1): the fighter's accent with the white trait icon. `size` is the disc, the icon is about 73 % of it. */
export const TraitDisc = ({ id, accent, size = 22 }: { id: IconName; accent: string; size?: number }) => (
  <span className="fd-tdisc" style={{ width: size, height: size, ['--c' as string]: accent }} aria-hidden="true">
    <Icon name={id} size={Math.round(size * 0.73)} />
  </span>
);

/** The trait sticker (select, R-026 11.3): a paper pill with the disc and the trait name, tilted -3 degrees. Position it from outside. */
export const TraitSticker = ({ id, accent, label, className = '', style }: { id: IconName; accent: string; label: string; className?: string; style?: CSSProperties }) => (
  <span className={`fd-tsticker ${className}`} style={style} data-testid="trait-sticker">
    <TraitDisc id={id} accent={accent} size={22} />
    {label}
  </span>
);

/** The focused fighter's trait line (select, R-026 11.3): a grape pill with disc, NAME in sun and the one-line description. */
export const TraitLine = ({ id, accent, label, line, wrap = false, fontSize = 15, style }: { id: IconName; accent: string; label: string; line: string; wrap?: boolean; fontSize?: number; style?: CSSProperties }) => (
  <span className="fd-pill fd-tline" key={id} data-testid="trait-line" style={{ fontSize, ...(wrap ? { whiteSpace: 'normal' } : null), ...style }}>
    <TraitDisc id={id} accent={accent} size={24} />
    <span>
      <b style={{ color: 'var(--sun)', font: "800 1em 'Baloo 2', sans-serif", letterSpacing: 0.6, marginRight: 8 }}>{label}</b>
      {line}
    </span>
  </span>
);
