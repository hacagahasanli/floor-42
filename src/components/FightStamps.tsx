'use client';

import { useEffect, useRef, useState } from 'react';

import { reducedMotion } from '~/components/Elevator';
import { menuSound } from '~/components/menu/menuSound';
import { Stamp } from '~/components/Stamp';
import { useKeyLabel } from '~/components/twoPlayer/shared';

import type { Bindings } from '~/game/settings';
import type { ComponentProps, ReactNode } from 'react';

/**
 * The fight-feel pieces built on <Stamp> (spec fight-feel-pages.md 4.5-4.7): the first-match key strip, the normal KO
 * stamp, the full-width KNOCKOUT band, a stamp that lands after a delay, and a number that counts up.
 */

type Action = 'move' | 'jump' | 'shoot';
const FIRST_MATCH_KEYS_MAX_S = 8;

/**
 * State of the first-match key strip: shown from the arena opening until the player has moved, jumped and shot (or 8 s into
 * the fight), then it fades for 300 ms. `enabled` is false everywhere but the first 1-player match against the bot.
 */
export const useKeyStrip = (enabled: boolean, phase: string | undefined, bindings: Bindings) => {
  const [done, setDone] = useState<Record<Action, boolean>>({ move: false, jump: false, shoot: false });
  const [lit, setLit] = useState<Record<string, boolean>>({});
  const [expired, setExpired] = useState(false);
  const [gone, setGone] = useState(false);
  const fighting = phase === 'fight';
  const bindRef = useRef(bindings);
  bindRef.current = bindings;
  const fightRef = useRef(fighting);
  fightRef.current = fighting;

  useEffect(() => {
    if (!enabled) return;
    const timers = new Set<number>();
    const flash = (id: string) => {
      setLit((l) => ({ ...l, [id]: true }));
      const t = window.setTimeout(() => {
        setLit((l) => ({ ...l, [id]: false }));
        timers.delete(t);
      }, 200);
      timers.add(t);
    };
    const hit = (code: string | null) => {
      const b = bindRef.current;
      const has = (a: keyof Bindings) => !!code && b[a].includes(code);
      const mark = (action: Action) => fightRef.current && setDone((d) => (d[action] ? d : { ...d, [action]: true }));
      if (code === null) {
        flash('fire');
        mark('shoot');
        return;
      }
      for (const a of ['left', 'right', 'up', 'fire'] as const) {
        if (!has(a)) continue;
        flash(a);
        mark(a === 'up' ? 'jump' : a === 'fire' ? 'shoot' : 'move');
      }
    };
    const onKey = (e: KeyboardEvent) => hit(e.code);
    const onPointer = (e: PointerEvent) => e.button === 0 && hit(null);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [enabled]);

  // 8 s into the fight the strip leaves whatever was pressed.
  useEffect(() => {
    if (!enabled || !fighting) return;
    const t = window.setTimeout(() => setExpired(true), FIRST_MATCH_KEYS_MAX_S * 1000);
    return () => window.clearTimeout(t);
  }, [enabled, fighting]);

  const complete = done.move && done.jump && done.shoot;
  const fading = enabled && (complete || expired) && !gone;
  useEffect(() => {
    if (!fading) return;
    const t = window.setTimeout(() => setGone(true), 300);
    return () => window.clearTimeout(t);
  }, [fading]);
  // A rematch or the result screen is not part of the first minute.
  useEffect(() => {
    if (phase === 'over') setGone(true);
  }, [phase]);

  return { shown: enabled && !gone, fading, lit };
};

const Cap = ({ label, lit, size }: { label: string; lit: boolean; size: number }) => (
  <kbd
    className="inline-flex items-center justify-center border-2 border-b-4 px-3 font-display leading-none transition-colors duration-100"
    style={{
      height: size,
      minWidth: size,
      fontSize: size / 2,
      borderColor: lit ? '#ffd23f' : 'rgba(230,235,245,0.3)',
      background: lit ? '#ffd23f' : '#0a0d18',
      color: lit ? '#0a0d18' : '#e6ebf5',
    }}
  >
    {label}
  </kbd>
);

/** Move / jump / shoot, bottom centre, in the player's own key labels. */
export const FirstMatchKeys = ({ strip, bindings }: { strip: ReturnType<typeof useKeyStrip>; bindings: Bindings }) => {
  const label = useKeyLabel();
  if (!strip.shown) return null;
  const first = (a: keyof Bindings) => label(bindings[a][0] || bindings[a][1]);
  // F-022: 48 px caps (Bungee 24) under 800 px tall, 56 px (Bungee 28) from 800 up.
  const cap = typeof window !== 'undefined' && window.innerHeight < 800 ? 48 : 56;
  const groups: { keys: [string, boolean][]; text: string }[] = [
    { keys: [[first('left'), !!strip.lit.left], [first('right'), !!strip.lit.right]], text: 'move' },
    { keys: [[first('up'), !!strip.lit.up]], text: 'jump' },
    { keys: [[first('fire'), !!strip.lit.fire]], text: 'shoot' },
  ];
  return (
    <div
      data-testid="first-match-keys"
      aria-label="Controls: move, jump, shoot"
      className="pointer-events-none absolute inset-x-0 bottom-[12px] z-[6] flex justify-center gap-10 transition-opacity duration-300"
      style={{ opacity: strip.fading ? 0 : 1 }}
    >
      {groups.map((g) => (
        <span key={g.text} className="flex flex-col items-center gap-1">
          <span className="flex gap-1.5">
            {g.keys.map(([k, lit], i) => (
              <Cap key={i} label={k} lit={lit} size={cap} />
            ))}
          </span>
          <span className="text-[14px] leading-none font-semibold text-cream/85 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">{g.text}</span>
        </span>
      ))}
    </div>
  );
};

const KO_HOLD_MS = 700;
const KO_EXIT_MS = 140;

/** A normal KO: `{NAME} IS OUT` in the fallen fighter's colour, held 700 ms, then out. Mount it with a key per KO. */
export const KoStamp = ({ name, colour, rot }: { name: string; colour: string; rot: number }) => {
  const [stage, setStage] = useState<'in' | 'out' | 'gone'>('in');
  useEffect(() => {
    const a = window.setTimeout(() => setStage('out'), KO_HOLD_MS);
    const b = window.setTimeout(() => setStage('gone'), KO_HOLD_MS + KO_EXIT_MS);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, []);
  if (stage === 'gone') return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/3 z-[5] flex justify-center" data-testid="ko-stamp">
      <Stamp size="md" plate colour={colour} rot={rot} leaving={stage === 'out'}>
        {name} is out
      </Stamp>
    </div>
  );
};

const BAND_EXIT_MS = 160;

/**
 * The match-winning KO: a full-width ink band slides in, the winner's colour stamps `KNOCKOUT` (or `MERGED`) with the
 * line under it. `show` false plays the 160 ms exit. `delayMs` waits for the hit-stop and the first beat of slow-motion.
 */
export const KnockoutBand = ({
  show,
  colour,
  title,
  line,
  delayMs,
}: {
  show: boolean;
  colour: string;
  title: string;
  line: string;
  delayMs: number;
}) => {
  const [mounted, setMounted] = useState(show);
  const [stamped, setStamped] = useState(false);
  useEffect(() => {
    if (show) {
      setMounted(true);
      const t = window.setTimeout(() => setStamped(true), delayMs + (reducedMotion() ? 0 : 140));
      return () => window.clearTimeout(t);
    }
    setStamped(false);
    const t = window.setTimeout(() => setMounted(false), BAND_EXIT_MS);
    return () => window.clearTimeout(t);
  }, [show, delayMs]);
  if (!mounted) return null;
  return (
    <div
      data-testid="knockout-band"
      className="pointer-events-none absolute inset-x-0 top-[45%] z-[8] flex h-[22vh] -translate-y-1/2 items-center justify-center overflow-hidden"
    >
      <div
        aria-hidden
        className={`absolute -inset-x-4 inset-y-0 -skew-y-[3deg] bg-ink-deep/85 ${show ? 'f42-band-in' : 'f42-band-out'}`}
        style={{ animationDelay: show ? `${delayMs}ms` : '0ms' }}
      />
      <div className="relative flex flex-col items-center gap-[1.2vh]">
        {stamped && show ? (
          <>
            <Stamp size="xl" colour={colour} rot={-4}>
              {title}
            </Stamp>
            <span className="font-display text-[28px] uppercase leading-none text-cream [animation:fadeIn_0.12s_ease-out_0.12s_both]">{line}</span>
          </>
        ) : null}
      </div>
    </div>
  );
};

/** A stamp that lands `delayMs` after mount (with its result sting). Holds its box meanwhile so nothing shifts. */
export const LateStamp = ({
  delayMs,
  sting,
  children,
  ...rest
}: { delayMs: number; sting?: 'win' | 'loss'; children: ReactNode } & Omit<ComponentProps<typeof Stamp>, 'children'>) => {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setOn(true);
      if (sting === 'win') menuSound.winSting();
      if (sting === 'loss') menuSound.lossSting();
    }, delayMs);
    return () => window.clearTimeout(t);
    // Lands once; props are read at that moment.
  }, []);
  if (on) return <Stamp {...rest}>{children}</Stamp>;
  const size = rest.size ?? 'md';
  return (
    <span aria-hidden className={`f42-stamp f42-stamp-${size}`} style={{ animation: 'none', opacity: 0, color: 'transparent' }}>
      {children}
    </span>
  );
};

const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3);

/** A whole number that counts up from 0 in 400 ms (still with reduced motion). Width stays put (tabular numerals). */
export const CountUp = ({ value, delayMs = 0, unit = '' }: { value: number; delayMs?: number; unit?: string }) => {
  const [shown, setShown] = useState(() => (reducedMotion() || value === 0 ? value : 0));
  useEffect(() => {
    if (reducedMotion() || value === 0) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now() + delayMs;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / 400));
      setShown(Math.round(value * easeOutCubic(k)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, delayMs]);
  return (
    <>
      {shown}
      {unit}
    </>
  );
};
