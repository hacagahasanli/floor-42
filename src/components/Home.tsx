'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ROSTER } from '~/game/roster';
import { RULES } from '~/game/sim/constants';

import type { CharacterId } from '~/game/sim/types';

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/** The elevator's floor display, counting up to 42 when the page opens. */
const Elevator = () => {
  const [floor, setFloor] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setFloor((f) => (f >= 42 ? 42 : f + 1)), 28);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="panel-cut inline-flex items-center gap-2 bg-ink-deep/80 px-3 py-1 font-display text-sm text-gold" aria-label="Floor 42">
      <span className={floor < 42 ? 'animate-pulse' : ''}>▲</span>
      <span className="tabular-nums">{String(floor).padStart(2, '0')}</span>
    </span>
  );
};

export const Home = () => {
  const bgRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  const [portraits, setPortraits] = useState<Record<CharacterId, string> | null>(null);

  // Behind everything: two bots fighting it out in the real office, silent.
  useEffect(() => {
    const canvas = bgRef.current;
    if (!canvas) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void Promise.all([import('~/game/render/game'), import('~/game/render/portraits')]).then(([{ startArena }, { renderPortraits }]) => {
          if (cancelled) return;
          setPortraits(renderPortraits(Object.fromEntries(ROSTER.map((r) => [r.id, r.accent])) as Record<CharacterId, string>));
          const a = pick(ROSTER).id;
          const b = pick(ROSTER.filter((r) => r.id !== a)).id;
          let first = true;
          dispose = startArena(canvas, {
            player: a,
            opponent: b,
            demo: true,
            level: 'hard',
            backdrop: true,
            onHud: () => {
              if (first) setLive(true);
              first = false;
            },
          }).dispose;
        });
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      dispose?.();
    };
  }, []);

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-ink-deep text-cream">
      <canvas
        ref={bgRef}
        className={`pointer-events-none fixed inset-0 h-full w-full transition-opacity duration-1000 ${live ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(10,13,24,0.94)_0%,rgba(10,13,24,0.75)_36%,rgba(10,13,24,0.15)_64%,rgba(10,13,24,0.05)_100%)]" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-80 bg-gradient-to-t from-ink-deep via-ink-deep/85 to-transparent" />
      <div className="pointer-events-none fixed inset-0 bg-ink-deep/55 lg:hidden" />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-7xl flex-col justify-between gap-10 px-5 pb-8 pt-8 sm:px-8">
        <header className="flex items-center justify-between gap-4 text-xs font-semibold tracking-[0.3em] text-blue">
          <span>
            <span className="text-green">&lt;&lt;&lt;&lt;</span> MERGE CONFLICT PRESENTS <span className="text-orange">&gt;&gt;&gt;&gt;</span>
          </span>
          <Elevator />
        </header>

        <section className="grid items-center gap-10 lg:grid-cols-[1fr_auto]">
          <div className="flex max-w-xl flex-col gap-6">
            <div className="flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-widest">
              <span className="panel-cut bg-orange/90 px-3 py-1 text-ink-deep">1 v 1 · online</span>
              <span className="panel-cut bg-cream/10 px-3 py-1 text-cream/80">Desktop &amp; phone</span>
              <span className="panel-cut bg-cream/10 px-3 py-1 text-cream/80">Free · no install</span>
            </div>
            <h1 className="font-display text-7xl leading-[0.92] drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:text-9xl">
              FLOOR <span className="text-gold">42</span>
            </h1>
            <p className="font-display text-xl text-cream/90 sm:text-2xl">Code review got personal.</p>
            <p className="max-w-md text-lg text-cream/80">
              Two developers, one floor of guns, and the meeting table is your only cover. Send the link to the colleague who
              merged over your work and settle it here: two hits and you&apos;re out.
            </p>
            <div className="flex flex-wrap gap-6 text-sm">
              {[
                ['2', 'hits to KO'],
                [`${RULES.kosToWin}`, 'KOs to win'],
                ['7', 'guns on the floor'],
                ['P2P', 'direct play, low ping'],
              ].map(([n, label]) => (
                <div key={label} className="flex flex-col">
                  <span className="font-display text-2xl text-cream">{n}</span>
                  <span className="text-[11px] uppercase tracking-widest text-cream/55">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/play"
                className="panel-cut group flex items-center gap-3 bg-gold px-10 py-4 font-display text-xl uppercase text-ink-deep shadow-[0_0_40px_rgba(255,210,63,0.35)] transition hover:brightness-110"
              >
                Play online <span className="transition group-hover:translate-x-1">→</span>
              </Link>
              <Link href="/characters" className="panel-cut bg-cream/10 px-6 py-4 font-bold uppercase tracking-wider text-cream/90 hover:bg-cream/20">
                Practice vs bot
              </Link>
            </div>
          </div>

          {/* The conflict on the whiteboard that started it all. */}
          <aside className="panel-cut hidden w-[340px] flex-col gap-3 bg-ink-deep/85 p-5 font-mono text-sm backdrop-blur lg:flex" aria-label="Tonight's conflict">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
              <span className="text-orange">Tonight&apos;s conflict</span>
              <span className="text-cream/50">src/style.ts</span>
            </div>
            <pre className="whitespace-pre leading-6">
              <span className="text-green">{'<<<<<<< HEAD\n'}</span>
              <span className="text-cream/90">{'  indent: "tabs",\n'}</span>
              <span className="text-cream/40">{'=======\n'}</span>
              <span className="text-cream/90">{'  indent: "spaces",\n'}</span>
              <span className="text-orange">{'>>>>>>> their-branch'}</span>
            </pre>
            <div className="flex items-center justify-between border-t border-cream/10 pt-3 text-xs">
              <span className="text-cream/60">Some conflicts can&apos;t be resolved in code.</span>
              <span className="font-display text-gold">FIGHT</span>
            </div>
          </aside>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-4">
            <h2 className="font-display text-xl">Who are you on the floor?</h2>
            <span className="text-xs text-cream/50">Same guns for everyone: size, speed and jumps differ</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ROSTER.map((r) => (
              <Link
                key={r.id}
                href="/characters"
                className="panel-cut group relative flex h-44 overflow-hidden border border-cream/10 bg-ink/80 backdrop-blur transition hover:border-cream/30"
              >
                <div className="absolute inset-0 opacity-30 transition group-hover:opacity-50" style={{ background: `radial-gradient(circle at 75% 60%, ${r.accent}, transparent 65%)` }} />
                <div className="relative z-10 flex flex-1 flex-col justify-end gap-1 p-4">
                  <span className="font-display text-2xl leading-none" style={{ color: r.accent }}>
                    {r.name}
                  </span>
                  <span className="text-xs text-cream/60">{r.role}</span>
                  <span className="mt-1 line-clamp-3 text-xs text-cream/80">{r.pitch}</span>
                </div>
                {portraits && (
                  // A rendered portrait, not a photo: plain <img> is right here.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={portraits[r.id]} alt="" className="relative -mr-6 h-full w-auto object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)] transition group-hover:scale-105" />
                )}
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {[
            ['01', 'Send the link', 'Invite a friend makes a private room. They open the link on a laptop or a phone and you are in, connected directly when you can be.'],
            ['02', 'Grab a gun', 'Pistol in hand; an SMG, a shotgun, a sniper rail and rockets lie around the floor. Desks and the meeting table stop bullets.'],
            ['03', 'Two hits', 'Jump, double jump, kick off the glass, dash through bullets, Force Push them into the glass. First to five KOs takes the merge.'],
          ].map(([n, title, text]) => (
            <div key={n} className="panel-cut flex gap-4 bg-ink/80 p-4 backdrop-blur">
              <span className="font-display text-3xl text-gold/80">{n}</span>
              <div className="flex flex-col gap-1">
                <span className="font-display text-lg">{title}</span>
                <span className="text-sm text-cream/75">{text}</span>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
};
