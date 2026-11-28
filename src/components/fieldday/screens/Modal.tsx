'use client';

import { useEffect, useRef } from 'react';

import { useSpatialNav } from '../nav';
import { Ribbon } from '../parts';
import { Stage } from '../Stage';

import type { ReactNode } from 'react';

/**
 * The shared shell of the Field Day modal screens (pause, settings, how to play, credits): a full-viewport veil (the match or the
 * menu behind it blurred, with a grape tint), a Stage for the 1280x720 design frame, spatial arrow / pad navigation inside it and
 * Esc. `escCapture` takes Esc in the capture phase and stops it, so a screen opened over the match (whose own Esc resumes) closes
 * itself first (Settings did the same before). Focus goes to `[data-nav-pref]` (or the first `[data-nav]`) when it opens.
 */
export const Modal = ({
  children,
  tint = 0.5,
  onBack,
  escCapture = false,
  label,
  z = 60,
  testId,
  active = true,
  skip,
}: {
  children: ReactNode;
  tint?: number;
  onBack?: () => void;
  escCapture?: boolean;
  label: string;
  z?: number;
  testId?: string;
  active?: boolean;
  /** True while something inside owns Esc (a key being rebound, a screen on top): the modal leaves it alone. */
  skip?: () => boolean;
}) => {
  const root = useRef<HTMLDivElement>(null);
  const back = useRef(onBack);
  back.current = onBack;
  const skipRef = useRef(skip);
  skipRef.current = skip;
  useSpatialNav(root, { active, onBack: escCapture ? undefined : onBack, ignorePrevented: true });
  useEffect(() => {
    const el = root.current;
    el?.querySelector<HTMLElement>('[data-nav-pref]')?.focus({ preventScroll: true });
    if (!el?.contains(document.activeElement)) el?.querySelector<HTMLElement>('[data-nav]')?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!escCapture || !active) return;
    const on = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || e.defaultPrevented || skipRef.current?.()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) back.current?.();
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [escCapture, active]);
  return (
    <div className="fixed inset-0" style={{ zIndex: z }} role="dialog" aria-modal="true" aria-label={label} data-testid={testId}>
      <Stage>
        <div className="fd-veil" aria-hidden="true" style={{ ['--a' as string]: tint }} />
        <div ref={root} className="fd-abs" style={{ inset: 0 }}>
          {children}
        </div>
      </Stage>
    </div>
  );
};

/** A modal title ribbon (62 high, grape, tilted) with an icon, centred at `top`, overlapping the panel's top edge. */
export const TitleRibbon = ({ icon, children, top, tilt = -1.5 }: { icon?: ReactNode; children: ReactNode; top: number; tilt?: number }) => (
  <div className="fd-abs" style={{ left: '50%', top, transform: 'translateX(-50%)', zIndex: 3 }}>
    <Ribbon tilt={tilt}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
        {icon}
        {children}
      </span>
    </Ribbon>
  </div>
);
