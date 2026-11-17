'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { startArena } from '~/game/render/game';
import { ROSTER } from '~/game/roster';
import { RULES } from '~/game/sim/constants';

import type { AimMode } from '~/game/input';
import type { OnlineSession } from '~/game/net/client';
import type { StartMessage } from '~/game/net/protocol';
import type { Room } from '@colyseus/sdk';
import type { HudFighter, HudState } from '~/game/render/game';
import type { BotLevel } from '~/game/sim/bot';
import type { CharacterId } from '~/game/sim/types';

const accent = (id: CharacterId) => ROSTER.find((r) => r.id === id)?.accent ?? '#fff';
const AIM_KEY = 'merge-conflict:aim';

const readAim = (): AimMode => {
  try {
    return window.localStorage.getItem(AIM_KEY) === 'mouse' ? 'mouse' : 'auto';
  } catch {
    return 'auto';
  }
};

const Key = ({ k }: { k: string }) => (
  <kbd className="inline-flex min-w-5 items-center justify-center rounded-sm border border-b-2 border-cream/30 bg-cream/10 px-1 text-[10px] font-bold leading-4 text-cream">
    {k}
  </kbd>
);

const FighterPanel = ({ f, label, align }: { f: HudFighter; label: string; align: 'left' | 'right' }) => (
  <div className={`flex w-72 flex-col gap-1 ${align === 'right' ? 'items-end text-right' : ''}`}>
    <div className={`flex items-baseline gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      <span className="font-display text-lg leading-none" style={{ color: accent(f.character) }}>
        {f.name}
      </span>
      <span className="text-[10px] font-semibold tracking-widest text-cream/50">{label}</span>
    </div>
    <div className="panel-cut h-3 w-full bg-ink-deep/80">
      <div
        className={`h-full transition-[width] duration-150 ${align === 'right' ? 'ml-auto' : ''}`}
        style={{ width: `${(f.hp / f.maxHp) * 100}%`, background: f.hp / f.maxHp > 0.5 ? accent(f.character) : '#ff3d6e' }}
      />
    </div>
    <div className={`flex items-center gap-3 text-[11px] text-cream/70 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      <span className="flex gap-1">
        {Array.from({ length: RULES.kosToWin }, (_, i) => (
          <span key={i} className={`inline-block h-2.5 w-2.5 rotate-45 ${i < f.kos ? 'bg-gold' : 'bg-cream/15'}`} />
        ))}
      </span>
      <span className="font-semibold text-cream">{f.gun}</span>
      {f.reloading > 0 ? (
        <span className="text-gold">reloading</span>
      ) : (
        <span className={`tabular-nums ${f.mag === 0 ? 'text-orange' : ''}`}>
          {f.mag}/{f.reserve === Infinity ? '∞' : f.reserve}
        </span>
      )}
    </div>
  </div>
);

const Controls = ({ aim }: { aim: AimMode }) => (
  <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-cream/50">
    <span className="flex items-center gap-1">
      <Key k="A" />
      <Key k="D" /> move
    </span>
    <span className="flex items-center gap-1">
      <Key k="W" /> jump
    </span>
    <span className="flex items-center gap-1">
      <Key k="Space" /> {aim === 'mouse' ? 'or click: shoot' : 'shoot'}
    </span>
    <span className="flex items-center gap-1">
      <Key k="S" /> drop
    </span>
    <span className="flex items-center gap-1">
      <Key k="Shift" /> dash
    </span>
    <span className="flex items-center gap-1">
      <Key k="Q" /> push
    </span>
  </div>
);

const END_TEXT = (hud: HudState, demo: boolean) => {
  if (hud.winner === -1 || hud.winner === null) return { title: 'Draw', sub: 'Time ran out with nothing resolved.' };
  const name = hud.winner === 0 && !demo ? 'You win' : `${hud.fighters[hud.winner].name} wins`;
  return { title: name, sub: hud.endReason === 'time' ? 'More KOs when time ran out.' : `First to ${RULES.kosToWin} KOs.` };
};

export const ArenaGame = ({
  player,
  opponent,
  demo = false,
  level = 'normal',
  online,
}: {
  player: CharacterId;
  opponent: CharacterId;
  demo?: boolean;
  level?: BotLevel;
  online?: { session: OnlineSession; room: Room };
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<ReturnType<typeof startArena> | null>(null);
  const keyTrapRef = useRef<HTMLInputElement>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [rematchAsked, setRematchAsked] = useState(false);
  const [rivalLeft, setRivalLeft] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = startArena(canvasRef.current, {
      player,
      opponent,
      demo,
      level,
      aimMode: readAim(),
      onHud: setHud,
      online: online?.session,
    });
    gameRef.current = game;
    return () => game.dispose();
  }, [player, opponent, demo, level, online]);

  // Online: the server starts each new round and tells us if the rival leaves.
  useEffect(() => {
    if (!online) return;
    const offStart = online.room.onMessage('start', (msg: StartMessage) => {
      setRematchAsked(false);
      gameRef.current?.serverStart(msg);
    });
    const offLeft = online.room.onMessage('left', () => setRivalLeft(true));
    // Leaving the room is the lobby's job (it owns the connection), not this effect's:
    // React re-runs effects in development, which would otherwise drop the match.
    return () => {
      offStart();
      offLeft();
    };
  }, [online]);

  const rematch = () => {
    setRematchAsked(true);
    gameRef.current?.restart();
  };

  // Remember the aim mode (T toggles it inside the game).
  useEffect(() => {
    if (!hud) return;
    try {
      window.localStorage.setItem(AIM_KEY, hud.aimMode);
    } catch {
      /* storage unavailable: the default is fine */
    }
  }, [hud?.aimMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard-navigation extensions (Vimium and friends) swallow keys like D, J, K, L
  // unless a text field has focus. Keep an invisible one focused while the game runs.
  useEffect(() => {
    const trap = keyTrapRef.current;
    if (!trap) return;
    const refocus = () => setTimeout(() => trap.focus({ preventScroll: true }), 0);
    trap.focus({ preventScroll: true });
    trap.addEventListener('blur', refocus);
    window.addEventListener('pointerdown', refocus);
    return () => {
      trap.removeEventListener('blur', refocus);
      window.removeEventListener('pointerdown', refocus);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' && hud?.phase === 'over') rematch();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hud?.phase]);

  const toggleAim = () => gameRef.current?.setAimMode(hud?.aimMode === 'mouse' ? 'auto' : 'mouse');
  const showKo = hud?.lastKo && hud.phase === 'fight' && hud.fighters[hud.lastKo.fighter]?.out;
  const end = hud?.phase === 'over' ? END_TEXT(hud, demo) : null;

  return (
    <main className="relative h-screen w-screen select-none overflow-hidden bg-ink-deep">
      <canvas ref={canvasRef} className={`block h-full w-full ${hud?.aimMode === 'mouse' ? 'cursor-crosshair' : ''}`} />
      <input
        ref={keyTrapRef}
        aria-label="Game keyboard input"
        className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
        autoComplete="off"
        value=""
        onChange={() => undefined}
      />

      {hud && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-ink-deep/90 to-transparent px-4 pb-8 pt-3">
            <FighterPanel f={hud.fighters[0]} label={demo ? 'BOT' : 'YOU'} align="left" />
            <div className="flex flex-col items-center gap-1.5">
              <span className="font-display text-3xl leading-none tabular-nums text-cream">
                {hud.phase === 'countdown' ? RULES.roundSeconds : Math.ceil(hud.time)}
              </span>
              <span className="text-[10px] font-semibold tracking-widest text-cream/50">FIRST TO {RULES.kosToWin}</span>
            </div>
            <FighterPanel f={hud.fighters[1]} label={online ? 'RIVAL' : `BOT · ${level}`} align="right" />
          </div>

          {hud.phase === 'countdown' && (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 flex flex-col items-center gap-3">
              <div className="font-display text-5xl drop-shadow-lg">
                {hud.time > 1.2 ? <span className="text-cream">git merge</span> : <span className="text-orange">CONFLICT!</span>}
              </div>
              <div className="panel-cut bg-ink-deep/80 px-4 py-2 text-sm text-cream/80">
                Two hits and you&apos;re out. Furniture stops bullets: use it.
              </div>
            </div>
          )}

          {showKo && hud.lastKo && (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
              <div className="font-display text-4xl text-gold drop-shadow-lg">{hud.fighters[hud.lastKo.fighter].name} is out</div>
            </div>
          )}

          {hud.hint.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center">
              <div className="panel-cut flex items-center gap-3 bg-ink-deep/85 px-4 py-1.5 text-sm text-cream">
                {hud.hint.map((h) => (
                  <span key={h.key} className="flex items-center gap-2">
                    <Key k={h.key} /> {h.text}
                  </span>
                ))}
              </div>
            </div>
          )}

          {rivalLeft && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink-deep/80">
              <div className="panel-cut flex flex-col items-center gap-4 bg-ink p-8 text-center">
                <div className="font-display text-3xl text-gold">Your rival left</div>
                <Link href="/play" className="panel-cut bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep">
                  Find another match
                </Link>
              </div>
            </div>
          )}

          {end && !rivalLeft && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink-deep/70">
              <div className="panel-cut flex flex-col items-center gap-4 bg-ink p-8 text-center">
                <div className="text-xs font-bold tracking-[0.3em] text-blue">CONFLICT RESOLVED</div>
                <div className="font-display text-4xl text-gold">{end.title}</div>
                <div className="text-cream/70">{end.sub}</div>
                <div className="font-display text-xl text-cream">
                  {hud.fighters[0].kos} – {hud.fighters[1].kos}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={rematch}
                    disabled={rematchAsked}
                    className="panel-cut bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep disabled:opacity-60"
                  >
                    {rematchAsked ? 'Waiting for rival…' : 'Rematch (Enter)'}
                  </button>
                  <Link href="/characters" className="panel-cut bg-cream/10 px-5 py-2 font-bold uppercase tracking-wider">
                    Change fighter
                  </Link>
                </div>
              </div>
            </div>
          )}

          {!demo && <Controls aim={hud.aimMode} />}
          <div className="absolute bottom-3 right-3 flex items-center gap-3 text-[10px] text-cream/50">
            {!demo && (
              <button
                type="button"
                onClick={toggleAim}
                className="panel-cut bg-cream/10 px-2 py-1 font-semibold uppercase tracking-wider text-cream/80 hover:bg-cream/20"
                title="Toggle aim mode (T)"
              >
                Aim: {hud.aimMode} <span className="text-cream/40">(T)</span>
              </button>
            )}
            {hud.ping !== null && <span>{hud.ping} ms</span>}
            {hud.muted && <span>muted (M)</span>}
            <span>{hud.fps} fps</span>
          </div>
        </>
      )}
    </main>
  );
};
