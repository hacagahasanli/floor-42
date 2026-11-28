'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useSettings } from '~/components/menu/useSettings';

import { DESIGN_H, DESIGN_W, stageMetrics } from './geometry';

import './fieldday.css';

import type { CSSProperties, ReactNode } from 'react';

/**
 * The root of every Field Day screen. It scales the 1280x720 design frame to the window (spec 2.1: s = min(w/1280, h/720)),
 * gives children the stage size in design units (a wider window adds space between anchors and never stretches a component),
 * and owns three document-wide facts the CSS needs:
 *   data-kbd      "1" while the last input was a key or a pad (the focus ring shows), "0" after a pointer press;
 *   data-reduced  "1" when Settings > Reduced motion or the OS asks for it (all idle motion off, 120 ms fades);
 *   --s           the scale, for the rare effect that needs it.
 *
 *   <Stage><Frame>...children placed with left/right/top/bottom in design px...</Frame></Stage>
 */

interface StageInfo {
  /** UI scale (1 at 1280x720, 1.5 at 1920x1080). */
  s: number;
  /** Stage size in design units (>= 1280 x 720 at 16:9, wider or taller otherwise). */
  w: number;
  h: number;
  reduced: boolean;
}
const StageContext = createContext<StageInfo>({ s: 1, w: DESIGN_W, h: DESIGN_H, reduced: false });
export { DESIGN_H, DESIGN_W, stageMetrics };
export const useStage = () => useContext(StageContext);

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Settings > Accessibility > Reduced motion, or the OS preference. */
export const useReducedMotion = (): boolean => {
  const setting = useSettings().reducedMotion;
  const [os, setOs] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    setOs(mq.matches);
    const on = () => setOs(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return setting || os;
};

export const Stage = ({
  children,
  className = '',
  style,
  testId,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  testId?: string;
}) => {
  const box = useRef<HTMLDivElement>(null);
  // Start at the design size on the server AND the client: the site hydrates server HTML, and React does not patch a style
  // that differs at hydration, so a client-only first value (the window size) left the stage stuck at 1280x720 on any other
  // window. The layout effect below measures the real box before the first paint and re-renders at the right scale.
  const [m, setM] = useState(() => stageMetrics(DESIGN_W, DESIGN_H));
  const [kbd, setKbd] = useState(true);
  const reduced = useReducedMotion();

  useIsoLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setM(stageMetrics(r.width, r.height));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Input modality: any key (a pad's synthetic arrows included) shows the focus ring; a pointer press hides it.
  useEffect(() => {
    const key = () => setKbd(true);
    const ptr = () => setKbd(false);
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', ptr, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', ptr, true);
    };
  }, []);

  return (
    <div
      ref={box}
      className={`fd fd-viewport ${className}`}
      data-kbd={kbd ? '1' : '0'}
      data-reduced={reduced ? '1' : '0'}
      data-testid={testId}
      style={{ ...style, ['--s' as string]: m.s }}
    >
      <StageContext.Provider value={{ s: m.s, w: m.w, h: m.h, reduced }}>
        <div className="fd-stage" style={{ width: m.w, height: m.h, transform: `scale(${m.s})` }}>
          {children}
        </div>
      </StageContext.Provider>
    </div>
  );
};

/** The 720-high design frame, centred vertically in the stage. Anchor children with left/right/top/bottom (design px). */
export const Frame = ({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) => {
  const { h } = useStage();
  return (
    <div className={`fd-frame ${className}`} style={{ top: (h - DESIGN_H) / 2 }} {...rest}>
      {children}
    </div>
  );
};
