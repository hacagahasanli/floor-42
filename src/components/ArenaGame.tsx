'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { startArena } from '~/game/render/game';
import { ROSTER } from '~/game/roster';
import { RULES } from '~/game/sim/constants';

import type { HudFighter, HudState } from '~/game/render/game';
import type { CharacterId } from '~/game/sim/types';

const accent = (id: CharacterId) => ROSTER.find((r) => r.id === id)?.accent ?? '#fff';

const FighterPanel = ({ f, label, align }: { f: HudFighter; label: string; align: 'left' | 'right' }) => (
  <div className={`flex w-72 flex-col gap-1.5 ${align === 'right' ? 'items-end text-right' : ''}`}>
    <div className="flex items-baseline gap-2 font-mono">
      <span className="text-xs text-cream/50">{label}</span>
      <span className="text-lg font-black" style={{ color: accent(f.character) }}>
        {f.name}
      </span>
    </div>
    <div className="h-3 w-full overflow-hidden rounded-sm border border-cream/20 bg-ink-deep/80">
      <div
        className={`h-full transition-[width] duration-150 ${align === 'right' ? 'ml-auto' : ''}`}
        style={{ width: `${f.hp}%`, background: f.hp > 35 ? accent(f.character) : '#cf3b3b' }}
      />
    </div>
    <div className="flex items-center gap-3 font-mono text-[11px] text-cream/70">
      <span className="flex gap-1">
        {Array.from({ length: RULES.kosToWin }, (_, i) => (
          <span key={i} className={`inline-block h-2.5 w-2.5 rotate-45 ${i < f.kos ? 'bg-gold' : 'bg-cream/15'}`} />
        ))}
      </span>
      <span className={f.push >= 1 ? 'text-gold' : 'text-cream/40'}>
        FORCE PUSH {f.push >= 1 ? 'ready' : `${Math.round(f.push * 100)}%`}
      </span>
      {f.held && <span className="rounded bg-cream/10 px-1.5">{f.held}</span>}
    </div>
  </div>
);

const Controls = () => (
  <div className="pointer-events-none absolute bottom-4 left-4 rounded-md bg-ink-deep/70 px-3 py-2 font-mono text-[11px] leading-5 text-cream/70">
    <div>
      <b className="text-cream">A D</b> move · <b className="text-cream">W / Space</b> jump, again in air, off glass ·{' '}
      <b className="text-cream">S</b> drop / guard
    </div>
    <div>
      <b className="text-cream">Shift</b> dash · <b className="text-cream">J</b> attack · <b className="text-cream">K</b> pick up / throw
      (+W lob) · <b className="text-cream">L</b> Force Push
    </div>
  </div>
);

export const ArenaGame = ({
  player,
  opponent,
  demo = false,
}: {
  player: CharacterId;
  opponent: CharacterId;
  demo?: boolean;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<ReturnType<typeof startArena> | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = startArena(canvasRef.current, { player, opponent, demo, onHud: setHud });
    gameRef.current = game;
    return () => game.dispose();
  }, [player, opponent, demo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyR' && hud?.phase === 'over') gameRef.current?.restart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hud?.phase]);

  const showKo = hud?.lastKo && hud.phase === 'fight' && hud.fighters[hud.lastKo.fighter]?.out;
  const winnerName =
    hud?.winner === -1 ? null : hud?.winner !== null && hud?.winner !== undefined ? hud.fighters[hud.winner]?.name : null;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-ink-deep select-none">
      <canvas ref={canvasRef} className="block h-full w-full" />

      {hud && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-ink-deep/90 via-ink-deep/60 to-transparent p-4 pb-10">
            <FighterPanel f={hud.fighters[0]} label={demo ? 'BOT' : 'YOU'} align="left" />
            <div className="flex flex-col items-center font-mono">
              <span className="text-3xl font-black tabular-nums text-cream drop-shadow">
                {hud.phase === 'countdown' ? RULES.roundSeconds : Math.ceil(hud.time)}
              </span>
              <span className="text-[10px] tracking-widest text-cream/50">FIRST TO {RULES.kosToWin}</span>
            </div>
            <FighterPanel f={hud.fighters[1]} label="BOT" align="right" />
          </div>

          {hud.phase === 'countdown' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="font-mono text-5xl font-black text-cream drop-shadow-lg">
                {hud.time > 1.2 ? (
                  <span className="text-cream/90">$ git merge their-branch</span>
                ) : (
                  <span className="text-orange">CONFLICT!</span>
                )}
              </div>
            </div>
          )}

          {showKo && hud.lastKo && (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
              <div className="font-mono text-4xl font-black text-gold drop-shadow-lg">
                {hud.fighters[hud.lastKo.fighter].name} was force-pushed out
              </div>
            </div>
          )}

          {hud.phase === 'over' && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink-deep/60">
              <div className="flex flex-col items-center gap-4 rounded-xl bg-ink p-8 text-center shadow-2xl">
                <div className="font-mono text-sm text-cream/50">CONFLICT RESOLVED</div>
                <div className="font-mono text-4xl font-black text-gold">
                  {winnerName ? `${hud.winner === 0 ? 'You' : winnerName} win${hud.winner === 0 ? '' : 's'}` : 'Draw'}
                </div>
                <div className="font-mono text-cream/70">
                  {hud.fighters[0].kos} – {hud.fighters[1].kos}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => gameRef.current?.restart()}
                    className="rounded-md bg-gold px-5 py-2 font-mono font-bold text-ink"
                  >
                    Rematch (R)
                  </button>
                  <Link href="/characters" className="rounded-md border border-cream/30 px-5 py-2 font-mono font-bold">
                    Change fighter
                  </Link>
                </div>
              </div>
            </div>
          )}

          <Controls />
          <div className="pointer-events-none absolute bottom-4 right-4 font-mono text-[11px] text-cream/50">
            {hud.fps} fps
          </div>
        </>
      )}
    </main>
  );
};
