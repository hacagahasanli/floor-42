'use client';

import { useEffect, useMemo, useState } from 'react';

import { confettiAllowed, confettiPlan, CONFETTI } from './confettiRules';
import { useStage } from './Stage';

import type { ConfettiKind } from './confettiRules';
import type { CSSProperties } from 'react';

/**
 * A burst of confetti (rules in confetti.ts). Absolutely fills its parent (give the parent a size, e.g. the whole Frame for a
 * cannon, a 110x80 box beside a score tile for a puff). Plays once from mount and removes itself when the last piece is done;
 * change `burst` to fire again. Renders nothing when the rules or Reduced motion say no. It is `aria-hidden` and ignores the
 * pointer. Mount it BEFORE the screen's content (or under a higher z-index) so it stays behind every title and button.
 *
 *   <Confetti kind="ready" burst={bothReadyCount} />
 */
export const Confetti = ({
  kind,
  burst = 0,
  outcome,
  width,
  height,
  seed,
  className = '',
  style,
}: {
  kind: ConfettiKind;
  /** Bump to fire a new burst; 0 = none yet. */
  burst?: number;
  outcome?: 'win' | 'loss';
  width: number;
  height: number;
  seed?: number;
  className?: string;
  style?: CSSProperties;
}) => {
  const { reduced } = useStage();
  const [live, setLive] = useState<number>(0);
  const allowed = confettiAllowed({ kind, outcome, reduced });
  useEffect(() => {
    if (!burst || !allowed) return;
    setLive(burst);
    const t = window.setTimeout(() => setLive(0), (CONFETTI[kind].stopAt + 3) * 1000);
    return () => window.clearTimeout(t);
  }, [burst, allowed, kind]);
  const pieces = useMemo(() => (live ? confettiPlan(kind, width, height, seed ?? live * 7919) : []), [live, kind, width, height, seed]);
  if (!pieces.length) return null;
  return (
    <div className={`fd-confetti ${className}`} style={style} aria-hidden="true" data-testid={`confetti-${kind}`}>
      {pieces.map((p, i) => (
        <i
          key={`${live}-${i}`}
          style={{
            left: p.x,
            top: p.y,
            width: p.w,
            height: p.h,
            ['--dur' as string]: `${p.dur}s`,
            ['--del' as string]: `${p.delay}s`,
            ['--dx' as string]: `${p.dx}px`,
            ['--pk' as string]: `${p.peak}px`,
            ['--end' as string]: `${p.end}px`,
            ['--rot' as string]: `${p.rot}deg`,
          }}
        >
          <b style={{ background: p.color }} />
        </i>
      ))}
    </div>
  );
};
