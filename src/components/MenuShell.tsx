'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ROSTER } from '~/game/roster';
import { CHARACTERS } from '~/game/sim/constants';

import type { CharacterId } from '~/game/sim/types';
import type { ReactNode } from 'react';

/**
 * The look of the home page for the menu pages (lobby, fighter pick), without the live office
 * behind it: a calm backdrop that glows in the picked fighter's colour, rendered portraits,
 * cut panels and the gold call to action.
 */

export const CHAR_KEY = 'merge-conflict:character';

export const readCharacter = (): CharacterId | null => {
  try {
    const saved = window.localStorage.getItem(CHAR_KEY);
    return saved && ROSTER.some((r) => r.id === saved) ? (saved as CharacterId) : null;
  } catch {
    return null;
  }
};

export const saveCharacter = (id: CharacterId) => {
  try {
    window.localStorage.setItem(CHAR_KEY, id);
  } catch {
    /* no storage */
  }
};

export const accentOf = (id: CharacterId) => ROSTER.find((r) => r.id === id)!.accent;

/** Portraits from the game's own models, rendered once after the page has painted. */
export const usePortraits = () => {
  const [portraits, setPortraits] = useState<Record<CharacterId, string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void import('~/game/render/portraits').then(({ renderPortraits }) => {
          if (!cancelled) setPortraits(renderPortraits(Object.fromEntries(ROSTER.map((r) => [r.id, r.accent])) as Record<CharacterId, string>));
        });
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);
  return portraits;
};

export const MenuShell = ({
  accent,
  status,
  children,
  backdrop,
}: {
  accent: string;
  status: ReactNode;
  children: ReactNode;
  /** Extra layers behind the content (the online lobby's moving floor and light streaks). */
  backdrop?: ReactNode;
}) => (
  <main className="relative min-h-[100dvh] overflow-hidden bg-ink-deep text-cream">
    <div
      className="pointer-events-none fixed inset-0 transition-[background] duration-700"
      style={{ background: `radial-gradient(ellipse 60% 70% at 22% 45%, ${accent}2e, transparent 70%), radial-gradient(ellipse 50% 60% at 100% 100%, #3ec5ff14, transparent 70%)` }}
    />
    <div className="grid-bg pointer-events-none fixed inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]" />
    {backdrop}
    {/* The floor number, huge and faint, like the lift lobby wall. */}
    <span className="pointer-events-none fixed -bottom-16 -right-6 select-none font-display text-[18rem] leading-none text-transparent [-webkit-text-stroke:2px_rgba(230,235,245,0.06)] sm:text-[26rem]" aria-hidden>
      42
    </span>
    <div className="relative mx-auto flex min-h-[100dvh] max-w-7xl flex-col gap-6 px-4 pb-28 pt-5 sm:px-8 sm:pb-8">
      <header className="flex items-center justify-between gap-3 whitespace-nowrap text-[10px] font-semibold tracking-[0.2em] text-blue sm:text-xs sm:tracking-[0.3em]">
        <Link href="/" className="hover:text-cream">
          <span className="text-green">&lt;&lt;</span> FLOOR <span className="text-gold">42</span>
        </Link>
        <span className="flex items-center gap-2 text-cream/60">{status}</span>
      </header>
      {children}
    </div>
  </main>
);

const STAT_MAX = { speed: 11, weight: 1.4, jump: 17.5, jumps: 2 };

const Bar = ({ label, value, text, color }: { label: string; value: number; text: string; color: string }) => (
  <div className="flex flex-col gap-1">
    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-cream/55">
      <span>{label}</span>
      <span className="text-cream/80">{text}</span>
    </div>
    <div className="h-1.5 overflow-hidden bg-cream/10">
      <div className="h-full transition-all duration-500" style={{ width: `${Math.min(100, value * 100)}%`, background: color }} />
    </div>
  </div>
);

/** The picked fighter, big: a live turntable of the model, name, pitch and stats. */
export const FighterHero = ({ id, label }: { id: CharacterId; label: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const entry = ROSTER.find((r) => r.id === id)!;
  const s = CHARACTERS[id];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    void import('~/game/render/gallery').then(({ startGallery }) => {
      if (!cancelled) dispose = startGallery(canvas, id).dispose;
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [id]);

  return (
    <div className="panel-cut relative flex min-h-[320px] overflow-hidden border border-cream/10 bg-ink/70 backdrop-blur sm:min-h-[400px] [@media(max-height:500px)]:min-h-[250px]">
      <div className="absolute inset-0 opacity-45 transition-[background] duration-700" style={{ background: `radial-gradient(circle at 72% 62%, ${entry.accent}, transparent 60%)` }} />
      {/* A fresh canvas per fighter: a WebGL context can't be handed to a new turntable. */}
      <canvas key={id} ref={canvasRef} className="absolute -right-8 bottom-0 h-full w-[60%] [animation:fadeIn_0.4s_ease-out] sm:right-0" aria-hidden />
      <div className="relative z-10 flex max-w-[60%] flex-1 flex-col justify-between gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-cream/70">{label}</span>
          <h1 key={id} className="font-display text-4xl leading-none [animation:riseIn_0.35s_ease-out] sm:text-6xl [@media(max-height:500px)]:text-4xl" style={{ color: entry.accent }}>
            {entry.name.toUpperCase()}
          </h1>
          <span className="text-sm text-cream/70">{entry.role}</span>
          <p className="hidden max-w-xs text-sm text-cream/80 sm:block [@media(max-height:500px)]:hidden">{entry.pitch}</p>
        </div>
        {/* On a dark panel: the turntable's white plinth can sit right behind the numbers. */}
        <div className="panel-cut flex max-w-[12.5rem] flex-col gap-3 bg-ink-deep/80 p-3 backdrop-blur-sm sm:max-w-[16.5rem]">
          <Bar label="Speed" value={s.speed / STAT_MAX.speed} text={`${s.speed} m/s`} color="#3ec5ff" />
          <Bar label="Jump" value={s.jump / STAT_MAX.jump} text={`${s.airJumps + 1}× jump`} color="#3ddc84" />
          <Bar label="Weight" value={s.weight / STAT_MAX.weight} text={s.weight >= 1.2 ? 'hard to shove' : s.weight <= 0.85 ? 'light' : 'average'} color="#ffd23f" />
        </div>
      </div>
    </div>
  );
};

/** Four portrait cards to pick from. */
export const FighterCards = ({
  value,
  onPick,
  portraits,
  label = 'Fighter',
}: {
  value: CharacterId;
  onPick: (id: CharacterId) => void;
  portraits: Record<CharacterId, string> | null;
  label?: string;
}) => (
  <div className="grid grid-cols-4 gap-2 sm:gap-3" role="radiogroup" aria-label={label}>
    {ROSTER.map((r) => {
      const on = r.id === value;
      return (
        <button
          key={r.id}
          type="button"
          role="radio"
          aria-checked={on}
          onClick={() => onPick(r.id)}
          className={`panel-cut group relative flex h-28 flex-col justify-end overflow-hidden border-2 bg-ink/80 p-2 text-left transition sm:h-40 [@media(max-height:500px)]:h-28 ${on ? 'border-gold' : 'border-cream/10 hover:border-cream/30'}`}
        >
          <div className={`absolute inset-0 transition ${on ? 'opacity-60' : 'opacity-25 group-hover:opacity-40'}`} style={{ background: `radial-gradient(circle at 50% 40%, ${r.accent}, transparent 65%)` }} />
          {portraits && (
            // A rendered portrait, not a photo: plain <img> is right here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={portraits[r.id]} alt="" className={`absolute inset-x-0 top-0 mx-auto h-[82%] w-auto object-contain transition ${on ? 'scale-105' : 'opacity-80 group-hover:scale-105'}`} />
          )}
          <div className="relative z-10 flex items-baseline justify-between bg-gradient-to-t from-ink-deep/90 to-transparent pt-4">
            <span className="truncate font-display text-xs leading-none sm:text-base [@media(max-height:500px)]:text-xs" style={{ color: r.accent }}>
              {r.name}
            </span>
            {on && <span className="hidden text-[9px] font-bold tracking-widest text-gold sm:inline [@media(max-height:500px)]:hidden">YOU</span>}
          </div>
        </button>
      );
    })}
  </div>
);

/** The three steps from the home page, so the menu pages read as part of the same game. */
export const Steps = () => (
  <section className="grid gap-3 sm:grid-cols-3">
    {[
      ['01', 'Pick', 'Same guns for everyone. Speed, size, jumps and how hard you are to shove are what differ.'],
      ['02', 'Grab a gun', 'Pistol in hand; an SMG, a shotgun, a sniper rail and rockets lie around the floor. Desks stop bullets.'],
      ['03', 'Outplay them', 'Jump, kick off the glass, dash (every 5 s), Force Push them into the glass. First to five KOs wins.'],
    ].map(([n, title, text]) => (
      <div key={n} className="panel-cut flex gap-4 bg-ink/70 p-4 backdrop-blur">
        <span className="font-display text-2xl text-gold/80">{n}</span>
        <div className="flex flex-col gap-1">
          <span className="font-display text-base">{title}</span>
          <span className="text-sm text-cream/70">{text}</span>
        </div>
      </div>
    ))}
  </section>
);
