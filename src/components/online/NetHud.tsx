'use client';

import { useEffect, useRef, useState } from 'react';

import { Icon } from '~/components/fieldday/Icon';

import { createPingWindow, nextBars } from './netBands';
import { NET_COPY } from './onlineCopy';

import type { Bars } from './netBands';
import type { NetStatus } from '~/game/net/client';

import './online.css';

const BarsIcon = ({ lit }: { lit: number }) => (
  <span className="on-bars" aria-hidden="true">
    {[1, 2, 3].map((i) => (
      <i key={i} className={i <= lit ? '' : 'on-off'} />
    ))}
  </span>
);

/**
 * The ping pill (R-032 5.1, o12/o13): signal bars + `42 MS` on the median of the last 2 s, bands with hysteresis, no colour per
 * band. The mode (server / direct line / relay) only in the tooltip. Lives in the HUD's bottom-right corner group.
 */
export const NetPill = ({ net }: { net: NetStatus }) => {
  const win = useRef(createPingWindow(2000));
  const [shown, setShown] = useState<{ ms: number; bars: Bars } | null>(null);
  useEffect(() => {
    if (!(net.ping > 0)) return;
    win.current.push(performance.now(), net.ping);
    const m = win.current.median();
    if (m === null) return;
    setShown((prev) => ({ ms: m, bars: nextBars(prev?.bars ?? null, m) }));
  }, [net.ping, net.snapGapMs]);
  const ms = shown?.ms ?? net.ping;
  const bars = shown?.bars ?? 3;
  return (
    <span className="on-netpill" title={NET_COPY.title(ms, net.mode)} aria-label={NET_COPY.title(ms, net.mode)} data-testid="net-pill" data-bars={bars} style={{ minWidth: 92, justifyContent: 'center' }}>
      <BarsIcon lit={bars} />
      {NET_COPY.ms(ms)}
    </span>
  );
};

/**
 * Shaky connection (R-032 5.2): shows after `unstable` has held 300 ms, stays at least 2 s after it clears. No ms, no mode.
 * Hidden during pause and on the result (`hidden`).
 */
export const ShakyChip = ({ unstable, hidden }: { unstable: boolean; hidden: boolean }) => {
  const [on, setOn] = useState(false);
  const since = useRef<number | null>(null);
  const shownAt = useRef(0);
  useEffect(() => {
    const t = window.setInterval(() => {
      const now = performance.now();
      if (unstable) {
        since.current ??= now;
        if (!on && now - since.current >= 300) {
          shownAt.current = now;
          setOn(true);
        }
      } else {
        since.current = null;
        if (on && now - shownAt.current >= 2000) setOn(false);
      }
    }, 50);
    return () => window.clearInterval(t);
  }, [unstable, on]);
  if (!on || hidden) return null;
  return (
    <div className="fd pointer-events-none absolute left-1/2 z-[7] -translate-x-1/2" style={{ top: '21.4vh' }} role="status" aria-live="polite">
      <span className="on-warnchip" data-testid="shaky-chip">
        <BarsIcon lit={1} />
        {NET_COPY.shaky}
      </span>
    </div>
  );
};

/** R-032 5.3: the rival asked to pause; the same chip shape, a clock, no bars. */
export const PauseAskChip = ({ touch }: { touch: boolean }) => (
  <div className="fd pointer-events-none absolute left-1/2 z-[7] -translate-x-1/2" style={{ top: '21.4vh' }} role="status" aria-live="polite">
    <span className="on-warnchip" data-testid="pause-ask">
      <Icon name="clock" />
      {NET_COPY.pauseAsk(touch)}
    </span>
  </div>
);
