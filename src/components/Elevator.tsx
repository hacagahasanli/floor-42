'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { menuSound } from '~/components/menu/menuSound';
import { getSettings } from '~/game/settings';

/**
 * The lift on floor 42, used for every big transition: two steel doors close over the screen (menu to match), the
 * floor counter races up while the match really loads, and the doors open on the office. Short (doors 300 ms),
 * skippable (any key or tap), and still with reduced motion (no slide, a quick fade).
 */

export const reducedMotion = () => {
  if (typeof window === 'undefined') return false;
  try {
    if (getSettings().get().reducedMotion) return true;
  } catch {
    /* settings not ready */
  }
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
};

/** Doors closing over the page, then navigate. The arena's loading screen starts with the doors shut. */
export const useLiftTo = () => {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const go = useCallback(
    (href: string) => {
      router.prefetch(href);
      menuSound.whoosh();
      if (reducedMotion()) {
        router.push(href);
        return;
      }
      setClosing(true);
      window.setTimeout(() => router.push(href), 320);
    },
    [router],
  );
  return { go, doors: closing ? <Doors state="closing" /> : null };
};

/** The two door panels with a light seam between them. `closing` slides them in, `opening` slides them out. */
export const Doors = ({ state, onDone }: { state: 'closing' | 'closed' | 'opening'; onDone?: () => void }) => {
  useEffect(() => {
    if (state !== 'opening' || !onDone) return;
    const t = window.setTimeout(onDone, reducedMotion() ? 0 : 460);
    return () => window.clearTimeout(t);
  }, [state, onDone]);
  const anim = state === 'closing' ? 'f42-door-close' : state === 'opening' ? 'f42-door-open' : '';
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[90] overflow-hidden">
      <div className={`f42-door f42-door-l ${anim}`} />
      <div className={`f42-door f42-door-r ${anim}`} />
      {/* The light where the doors meet: it flares as they close and splits as they open. */}
      <div className={`f42-seam ${anim}`} />
    </div>
  );
};

export interface LoadStep {
  label: string;
  done: boolean;
}

/** True tips from How to play, one every few seconds while the match loads. */
const TIPS = [
  'Desks and the meeting table stop bullets: fight from behind them.',
  'Force Push sends incoming bullets back at the shooter.',
  'Push your rival into the glass for a wall splat.',
  'Dash makes you untouchable to bullets for a moment (every 5 s).',
  'Kick off the glass walls to climb fast.',
  'The rockets and the sniper rail wait on the top floor.',
  'Stay out of the fight for a few seconds and your health comes back.',
];

/**
 * The match's loading screen: the lift ride up. Progress is the share of real steps finished (page code, fonts,
 * the office built, the first frame drawn); the floor counter races toward that share of 42, never past it.
 * When every step is done the doors open on the office and `onDone` fires.
 */
export const LiftLoading = ({ steps, onDone }: { steps: LoadStep[]; onDone: () => void }) => {
  const doneCount = steps.filter((s) => s.done).length;
  const target = Math.round((42 * doneCount) / steps.length);
  const [floor, setFloor] = useState(1);
  const [opening, setOpening] = useState(false);
  const [tip, setTip] = useState(0);
  const floorRef = useRef(1);

  // Race the counter toward the real progress, by the clock: a slow frame rate only makes it less smooth.
  useEffect(() => {
    const from = floorRef.current;
    if (from >= target) return;
    const t0 = performance.now();
    const span = reducedMotion() ? 0 : 260;
    let raf = 0;
    const tickUp = () => {
      const k = span ? Math.min(1, (performance.now() - t0) / span) : 1;
      const next = Math.round(from + (target - from) * k);
      floorRef.current = next;
      setFloor(next);
      if (k < 1) raf = requestAnimationFrame(tickUp);
    };
    tickUp();
    return () => cancelAnimationFrame(raf);
  }, [target]);

  useEffect(() => {
    setTip(Math.floor(Math.random() * TIPS.length));
    const t = window.setInterval(() => setTip((i) => (i + 1) % TIPS.length), 2600);
    return () => window.clearInterval(t);
  }, []);

  // Everything loaded: let the counter land on 42, then open the doors (a key or tap skips the last bit).
  const allDone = doneCount === steps.length;
  useEffect(() => {
    if (!allDone) return;
    const t = window.setTimeout(() => {
      floorRef.current = 42;
      setFloor(42);
      menuSound.whoosh();
      setOpening(true);
    }, reducedMotion() ? 0 : 280);
    return () => window.clearTimeout(t);
  }, [allDone]);
  useEffect(() => {
    if (!opening) return;
    const skip = () => onDone();
    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('pointerdown', skip, { once: true });
    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [opening, onDone]);

  const pct = Math.round((100 * doneCount) / steps.length);
  return (
    <div className="fixed inset-0 z-[80]" role="status" aria-live="polite" aria-label={`Loading the match, ${pct}%`}>
      <Doors state={opening ? 'opening' : 'closed'} onDone={onDone} />
      {!opening && (
        <div className="pointer-events-none fixed inset-0 z-[95] flex items-center justify-center px-6">
          <div className="f42-holo relative flex w-full max-w-sm flex-col items-center gap-5 text-center">
            {/* The lift's floor display. */}
            <div className="relative flex items-center gap-3 border border-gold/40 bg-ink-deep px-6 py-3 shadow-[0_0_40px_rgba(255,210,63,0.18)]">
              <span className={`text-2xl text-gold ${floor < 42 ? 'f42-blink' : ''}`}>▲</span>
              <span className="f42-glitch font-display text-6xl leading-none tabular-nums text-gold" data-text={String(floor).padStart(2, '0')}>
                {String(floor).padStart(2, '0')}
              </span>
            </div>
            <div className="flex w-full flex-col gap-2">
              <div className="h-1.5 w-full overflow-hidden bg-cream/10">
                <div className="h-full bg-[linear-gradient(90deg,#ff3b4e,#ffd23f)] transition-[width] duration-200" style={{ width: `${(100 * floor) / 42}%` }} />
              </div>
              <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 bg-ink-deep px-3 py-1 text-xs">
                {steps.map((s) => (
                  <li key={s.label} className={s.done ? 'text-green' : 'text-cream/45'}>
                    {s.done ? '✓' : '·'} {s.label}
                  </li>
                ))}
              </ul>
            </div>
            <p key={tip} className="bg-ink-deep px-4 py-2 text-sm text-cream/85 [animation:riseIn_0.35s_ease-out]">
              {TIPS[tip]}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
