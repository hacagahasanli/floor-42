'use client';

import { useEffect, useRef, useState } from 'react';

import type { Button } from '~/game/input';

type Press = (b: Button, on: boolean) => void;

/**
 * The side strips the controls live in (CSS px, before the notch's safe area). The game keeps
 * the office out of them, so a button never covers a fighter.
 */
export const TOUCH_STRIPS = { left: 132, right: 200, top: 62 };

/** Ask once for fullscreen in landscape: hides the browser bars on Android Chrome. */
let askedFullscreen = false;
const goFullscreen = () => {
  if (askedFullscreen || typeof document === 'undefined') return;
  askedFullscreen = true;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  if (!req || document.fullscreenElement) return;
  req({ navigationUI: 'hide' } as FullscreenOptions)
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => undefined);
};

/**
 * The movement stick: left and right run, pushing up jumps, pushing down drops through
 * furniture. It appears where your thumb lands in the left half of the screen.
 */
const Stick = ({ press }: { press: Press }) => {
  const [base, setBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);
  const held = useRef<Record<'left' | 'right' | 'up' | 'down', boolean>>({ left: false, right: false, up: false, down: false });
  const R = 56;

  const apply = (dx: number, dy: number) => {
    const want = { left: dx < -0.3, right: dx > 0.3, up: dy < -0.6, down: dy > 0.6 };
    for (const k of ['left', 'right', 'up', 'down'] as const) {
      if (want[k] !== held.current[k]) {
        held.current[k] = want[k];
        press(k, want[k]);
      }
    }
  };
  const release = () => {
    pointer.current = null;
    setBase(null);
    setKnob({ x: 0, y: 0 });
    apply(0, 0);
  };

  return (
    <div
      className="absolute bottom-0 left-0 top-16 touch-none"
      style={{ width: `calc(${TOUCH_STRIPS.left}px + env(safe-area-inset-left))` }}
      onPointerDown={(e) => {
        goFullscreen();
        if (pointer.current !== null) return;
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        setBase({ x: e.clientX - r.left, y: e.clientY - r.top });
        setKnob({ x: 0, y: 0 });
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pointer.current || !base) return;
        const r = e.currentTarget.getBoundingClientRect();
        let dx = e.clientX - r.left - base.x;
        let dy = e.clientY - r.top - base.y;
        const d = Math.hypot(dx, dy);
        if (d > R) {
          dx = (dx / d) * R;
          dy = (dy / d) * R;
        }
        setKnob({ x: dx, y: dy });
        apply(dx / R, dy / R);
      }}
      onPointerUp={(e) => e.pointerId === pointer.current && release()}
      onPointerCancel={(e) => e.pointerId === pointer.current && release()}
    >
      {base ? (
        <div className="pointer-events-none absolute" style={{ left: base.x - R, top: base.y - R }}>
          <div className="rounded-full border-2 border-cream/25 bg-ink-deep/40" style={{ width: R * 2, height: R * 2 }} />
          <div
            className="absolute rounded-full bg-cream/70 shadow-lg"
            style={{ width: 52, height: 52, left: R - 26 + knob.x, top: R - 26 + knob.y }}
          />
        </div>
      ) : (
        <div
          className="pointer-events-none absolute bottom-6 flex h-28 w-28 items-center justify-center rounded-full border-2 border-dashed border-cream/25 text-[10px] font-semibold uppercase tracking-widest text-cream/50"
          style={{ left: 'calc(6px + env(safe-area-inset-left))' }}
        >
          move
        </div>
      )}
    </div>
  );
};

const Pad = ({ b, label, press, className, big }: { b: Button; label: string; press: Press; className: string; big?: boolean }) => {
  const [down, setDown] = useState(false);
  const up = () => {
    setDown(false);
    press(b, false);
  };
  return (
    <button
      type="button"
      aria-label={label}
      className={`absolute flex touch-none select-none items-center justify-center rounded-full border-2 font-display uppercase shadow-lg ${
        big ? 'h-[104px] w-[104px] text-lg' : 'h-[72px] w-[72px] text-xs'
      } ${down ? 'scale-95 border-gold bg-gold/80 text-ink-deep' : 'border-cream/30 bg-ink-deep/55 text-cream/90'} ${className}`}
      onPointerDown={(e) => {
        goFullscreen();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDown(true);
        press(b, true);
      }}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
};

/** Touch controls for phones: the stick on the left, actions on the right, pause on top. */
export const TouchControls = ({ press, onPause }: { press: Press; onPause: () => void }) => (
  <div className="absolute inset-0 z-[5] select-none" style={{ WebkitTouchCallout: 'none' } as React.CSSProperties}>
    <Stick press={press} />
    {/* The right strip: Fire under the thumb, Jump beside it, Dash and Push above, Swap on top. */}
    <div className="absolute bottom-0 top-16" style={{ right: 'env(safe-area-inset-right)', width: TOUCH_STRIPS.right }}>
      <Pad b="fire" label="Fire" press={press} big className="bottom-3 right-2" />
      <Pad b="up" label="Jump" press={press} className="bottom-3 right-[116px]" />
      <Pad b="dash" label="Dash" press={press} className="bottom-[118px] right-4" />
      <Pad b="push" label="Push" press={press} className="bottom-[92px] right-[116px]" />
      <Pad b="reload" label="Swap" press={press} className="bottom-[178px] right-[124px] !h-14 !w-14 !text-[10px]" />
      <button
        type="button"
        aria-label="Pause"
        onClick={onPause}
        className="absolute bottom-[198px] right-6 flex h-11 w-11 items-center justify-center rounded-full border-2 border-cream/30 bg-ink-deep/60 text-cream"
      >
      <span className="flex gap-1">
        <span className="h-4 w-1.5 rounded-sm bg-cream" />
        <span className="h-4 w-1.5 rounded-sm bg-cream" />
      </span>
      </button>
    </div>
  </div>
);

/** The notch's safe-area insets in CSS px (0 on most screens). */
export const safeArea = () => {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = { left: parseFloat(cs.paddingLeft) || 0, right: parseFloat(cs.paddingRight) || 0 };
  probe.remove();
  return out;
};

/** Phones held upright: ask to turn sideways (the arena is wide). */
export const useLandscape = () => {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const check = () => setPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);
  return portrait;
};

export const RotateHint = () => (
  <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-ink-deep px-8 text-center">
    <div className="relative h-24 w-14 animate-[turnPhone_2.4s_ease-in-out_infinite] rounded-xl border-4 border-gold">
      <div className="absolute bottom-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-gold" />
    </div>
    <div className="font-display text-2xl text-gold">Turn your phone sideways</div>
    <p className="max-w-xs text-sm text-cream/70">Floor 42 is a wide room: play it in landscape. The match keeps running.</p>
  </div>
);
