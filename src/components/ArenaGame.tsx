'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { RotateHint, safeArea, TOUCH_STRIPS, TouchControls, useLandscape } from '~/components/TouchControls';
import { isTouchDevice } from '~/game/input';
import { startArena } from '~/game/render/game';
import { ROSTER } from '~/game/roster';
import { RULES } from '~/game/sim/constants';

import type { AimMode } from '~/game/input';
import type { OnlineSession } from '~/game/net/client';
import type { StartMessage } from '~/game/net/protocol';
import type { Room } from '@colyseus/sdk';
import type { HudFighter, HudState } from '~/game/render/game';
import type { BotLevel } from '~/game/sim/bot';
import type { VolumeKind } from '~/game/sfx';
import type { CharacterId } from '~/game/sim/types';

const accent = (id: CharacterId) => ROSTER.find((r) => r.id === id)?.accent ?? '#fff';
const AIM_KEY = 'merge-conflict:aim';
const WAIT_SECONDS = 60;
const MAX_WAITS = 3;

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

const FighterPanel = ({ f, label, align, compact }: { f: HudFighter; label: string; align: 'left' | 'right'; compact?: boolean }) => (
  <div className={`flex ${compact ? 'w-48' : 'w-72'} flex-col gap-1 ${align === 'right' ? 'items-end text-right' : ''}`}>
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
    <span className="flex items-center gap-1">
      <Key k="Esc" />
      <Key k="Esc" /> pause / exit
    </span>
  </div>
);

const END_TEXT = (hud: HudState, demo: boolean) => {
  if (hud.winner === -1 || hud.winner === null) return { title: 'Draw', sub: 'Time ran out with nothing resolved.' };
  const name = hud.winner === 0 && !demo ? 'You win' : `${hud.fighters[hud.winner].name} wins`;
  return { title: name, sub: hud.endReason === 'time' ? 'More KOs when time ran out.' : `First to ${RULES.kosToWin} KOs.` };
};

const VOLUME_LABELS: { kind: VolumeKind; label: string }[] = [
  { kind: 'master', label: 'All sound' },
  { kind: 'guns', label: 'Gunshots' },
];

/** Volume sliders in the Esc Esc menu: applied at once, remembered in this browser. */
const SoundSliders = ({ game }: { game: ReturnType<typeof startArena> | null }) => {
  const [v, setV] = useState(() => game?.volumes() ?? { master: 0.8, guns: 0.45 });
  return (
    <div className="flex w-full flex-col gap-2 text-left">
      <span className="text-[10px] font-semibold tracking-widest text-cream/50">SOUND</span>
      {VOLUME_LABELS.map(({ kind, label }) => (
        <label key={kind} className="flex items-center gap-3 text-sm text-cream/80">
          <span className="w-20 shrink-0">{label}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(v[kind] * 100)}
            onChange={(e) => {
              const value = Number(e.target.value) / 100;
              game?.setVolume(kind, value);
              setV((old) => ({ ...old, [kind]: value }));
            }}
            className="h-2 flex-1 cursor-pointer accent-[#ffd23f]"
            aria-label={label}
          />
          <span className="w-8 text-right text-xs tabular-nums text-cream/60">{Math.round(v[kind] * 100)}</span>
        </label>
      ))}
    </div>
  );
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
  const [menuOpen, setMenuOpen] = useState(false);
  // Rival left: wait up to three rounds of WAIT_SECONDS, asking in between, then the link expires.
  const [waitRound, setWaitRound] = useState(0);
  const [waitLeft, setWaitLeft] = useState(0);
  const [asking, setAsking] = useState(false);
  const [expired, setExpired] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  /** Seconds left for a rival whose connection dropped to come back, or null. */
  const [dropLeft, setDropLeft] = useState<number | null>(null);
  const lastEsc = useRef(0);
  // Phones and tablets: touch controls, auto-aim, landscape. Known only after mount.
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(isTouchDevice()), []);
  const portrait = useLandscape();
  // Phones: keep the office clear of the control strips (and the notch).
  useEffect(() => {
    if (!touch || demo) return;
    const apply = () => {
      const sa = safeArea();
      gameRef.current?.setInsets({ left: TOUCH_STRIPS.left + sa.left, right: TOUCH_STRIPS.right + sa.right, top: TOUCH_STRIPS.top, bottom: 0 });
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [touch, demo]);
  const hudRef = useRef<HudState | null>(null);
  hudRef.current = hud;

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = startArena(canvasRef.current, {
      player,
      opponent,
      demo,
      level,
      aimMode: isTouchDevice() ? 'auto' : readAim(),
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
      setRivalLeft(false);
      setWaitRound(0);
      setAsking(false);
      gameRef.current?.serverStart(msg);
    });
    const offLeft = online.room.onMessage('left', () => {
      setDropLeft(null);
      setRivalLeft(true);
      setWaitRound(1);
      setWaitLeft(WAIT_SECONDS);
      setAsking(false);
    });
    // Leaving the room is the lobby's job (it owns the connection), not this effect's:
    // React re-runs effects in development, which would otherwise drop the match.
    const offDropped = online.room.onMessage('dropped', (msg: { slot: number; seconds: number }) => {
      if (msg.slot !== online.session.slot) setDropLeft(msg.seconds);
    });
    const offBack = online.room.onMessage('back', () => setDropLeft(null));
    return () => {
      offStart();
      offLeft();
      offDropped();
      offBack();
    };
  }, [online]);

  // Count down the current wait; at zero ask again, or expire after the last one.
  useEffect(() => {
    if (!rivalLeft || asking || expired || waitRound === 0) return;
    const t = setInterval(() => {
      setWaitLeft((left) => {
        if (left > 1) return left - 1;
        if (waitRound >= MAX_WAITS) {
          setExpired(true);
          void online?.room.leave();
        } else {
          setAsking(true);
        }
        return 0;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [rivalLeft, asking, expired, waitRound, online]);

  useEffect(() => {
    if (dropLeft === null || dropLeft <= 0) return;
    const t = setTimeout(() => setDropLeft((d) => (d === null ? null : d - 1)), 1000);
    return () => clearTimeout(t);
  }, [dropLeft]);

  const keepWaiting = () => {
    setWaitRound((r) => r + 1);
    setWaitLeft(WAIT_SECONDS);
    setAsking(false);
  };
  const inviteLink = online && typeof window !== 'undefined' ? `${window.location.origin}/play?room=${online.room.roomId}` : '';
  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1500);
  };

  const exit = () => {
    if (online) void online.room.leave();
    window.location.href = online ? '/play' : '/';
  };

  // Esc twice: ask to pause (online the rival has to agree the same way) and open the menu.
  // Keys 1-4 pick who you come back as while you're waiting to respawn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = hudRef.current;
      if (!h) return;
      if (e.code === 'Escape') {
        const now = performance.now();
        const double = now - lastEsc.current < 450;
        lastEsc.current = double ? 0 : now;
        if (!double || h.phase === 'over') return;
        if (!h.paused) gameRef.current?.requestPause();
        setMenuOpen(true);
        return;
      }
      const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (n >= 0 && h.respawnIn !== null) gameRef.current?.pickCharacter(ROSTER[n].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** The touch pause button: the same as Esc twice. */
  const openMenu = () => {
    const h = hudRef.current;
    if (!h || h.phase === 'over') return;
    if (!h.paused) gameRef.current?.requestPause();
    setMenuOpen(true);
  };

  const closeMenu = () => {
    setMenuOpen(false);
    if (hud?.paused) gameRef.current?.resume();
    else gameRef.current?.cancelPause();
  };

  const rematch = () => {
    // Only online waits for the rival; against the bot the rematch starts at once.
    if (online) setRematchAsked(true);
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
    // Never on phones: a focused field would pop up the on-screen keyboard.
    if (!trap || isTouchDevice()) return;
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

  // The rival resumed: close our pause menu too.
  const wasPaused = useRef(false);
  useEffect(() => {
    if (wasPaused.current && hud && !hud.paused) setMenuOpen(false);
    wasPaused.current = !!hud?.paused;
  }, [hud?.paused]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAim = () => gameRef.current?.setAimMode(hud?.aimMode === 'mouse' ? 'auto' : 'mouse');
  const showKo = hud?.lastKo && hud.phase === 'fight' && hud.fighters[hud.lastKo.fighter]?.out;
  const end = hud?.phase === 'over' ? END_TEXT(hud, demo) : null;

  return (
    <main className="relative h-[100dvh] w-screen touch-none select-none overflow-hidden bg-ink-deep">
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
            <FighterPanel f={hud.fighters[0]} label={demo ? 'BOT' : 'YOU'} align="left" compact={touch} />
            <div className="flex flex-col items-center gap-1.5">
              <span className="font-display text-3xl leading-none tabular-nums text-cream">
                {hud.phase === 'countdown' ? RULES.roundSeconds : Math.ceil(hud.time)}
              </span>
              <span className="text-[10px] font-semibold tracking-widest text-cream/50">FIRST TO {RULES.kosToWin}</span>
              {!touch && (
                <span className="panel-cut mt-1 flex items-baseline gap-2 bg-ink-deep/85 px-3 py-1">
                  <span className="font-display text-base text-gold">FLOOR 42</span>
                  <span className="text-[11px] text-cream/70">agents-know · merge room</span>
                </span>
              )}
            </div>
            <FighterPanel f={hud.fighters[1]} label={online ? 'RIVAL' : `BOT · ${level}`} align="right" compact={touch} />
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
            <div className={`pointer-events-none absolute inset-x-0 z-[6] flex justify-center ${touch ? 'top-36' : 'bottom-10'}`}>
              <div className="panel-cut flex items-center gap-3 bg-ink-deep/85 px-4 py-1.5 text-sm text-cream">
                {hud.hint.map((h) => (
                  <span key={h.key} className="flex items-center gap-2">
                    <Key k={touch ? (h.key === 'R' ? 'Swap' : h.key === 'Space' ? 'Fire' : h.key) : h.key} /> {h.text}
                  </span>
                ))}
              </div>
            </div>
          )}

          {online && !hud.paused && hud.pauseRequests[1] && !hud.pauseRequests[0] && (
            <div className="pointer-events-none absolute inset-x-0 top-28 flex justify-center">
              <div className="panel-cut bg-gold/95 px-6 py-2 text-center text-ink-deep">
                <div className="font-display text-xl">Your rival wants to pause</div>
                <div className="text-xs font-bold uppercase tracking-widest">{touch ? 'Tap pause to agree' : 'Press Esc twice to agree'}</div>
              </div>
            </div>
          )}

          {hud.respawnIn !== null && hud.phase === 'fight' && !hud.paused && (
            <div className={`absolute inset-x-0 z-[6] flex justify-center ${touch ? 'top-32' : 'bottom-16'}`}>
              <div className="panel-cut flex flex-col items-center gap-3 bg-ink-deep/90 px-6 py-4">
                <div className="text-sm text-cream/80">
                  Back in <span className="font-display text-xl text-gold">{Math.ceil(hud.respawnIn)}</span> · come back as:
                </div>
                <div className="flex gap-2">
                  {ROSTER.map((r, n) => {
                    const chosen = (hud.nextCharacter ?? hud.character) === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => gameRef.current?.pickCharacter(r.id)}
                        className={`panel-cut border-2 px-3 py-1.5 font-display text-sm ${chosen ? 'border-gold bg-ink' : 'border-cream/10 bg-ink/60 hover:border-cream/30'}`}
                        style={{ color: r.accent }}
                      >
                        <span className="mr-1.5 text-[10px] text-cream/50">{n + 1}</span>
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {dropLeft !== null && !rivalLeft && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink-deep/70">
              <div className="panel-cut flex w-[26rem] flex-col items-center gap-3 bg-ink p-7 text-center">
                <div className="font-display text-2xl text-gold">Your rival&apos;s connection dropped</div>
                <p className="text-sm text-cream/70">
                  The game is on hold while they reconnect:{' '}
                  <span className="font-display text-cream">{Math.max(0, dropLeft)}s</span>
                </p>
              </div>
            </div>
          )}

          {(hud.paused || menuOpen) && hud.phase !== 'over' && !rivalLeft && dropLeft === null && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink-deep/70">
              <div className="panel-cut flex w-80 flex-col items-center gap-4 bg-ink p-7 text-center">
                {hud.paused ? (
                  <>
                    <div className="font-display text-4xl text-gold">Paused</div>
                    <button
                      type="button"
                      onClick={closeMenu}
                      className="panel-cut w-full bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep"
                    >
                      Resume
                    </button>
                  </>
                ) : (
                  <>
                    <div className="font-display text-2xl text-gold">Pause requested</div>
                    <p className="text-sm text-cream/70">Waiting for your rival to pause too. The game keeps going until they do.</p>
                    <button type="button" onClick={closeMenu} className="panel-cut w-full bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep">
                      Keep playing
                    </button>
                  </>
                )}
                <SoundSliders game={gameRef.current} />
                <button type="button" onClick={exit} className="panel-cut w-full bg-orange/90 px-5 py-2 font-bold uppercase tracking-wider text-ink-deep">
                  Exit match
                </button>
              </div>
            </div>
          )}

          {rivalLeft && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink-deep/80">
              <div className="panel-cut flex w-[26rem] flex-col items-center gap-4 bg-ink p-7 text-center">
                {expired ? (
                  <>
                    <div className="font-display text-3xl text-orange">Link expired</div>
                    <p className="text-sm text-cream/70">Your rival didn&apos;t come back. Start a new match and send a new link.</p>
                    <Link href="/play" className="panel-cut w-full bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep">
                      New match
                    </Link>
                  </>
                ) : asking ? (
                  <>
                    <div className="font-display text-2xl text-gold">Still not back</div>
                    <p className="text-sm text-cream/70">
                      {waitRound + 1 >= MAX_WAITS
                        ? `Wait one more minute? This is the last one: after it the link expires.`
                        : `Keep waiting another minute for your rival?`}
                    </p>
                    <button type="button" onClick={keepWaiting} className="panel-cut w-full bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep">
                      {waitRound + 1 >= MAX_WAITS ? 'Wait (last time)' : 'Keep waiting'}
                    </button>
                    <button type="button" onClick={exit} className="panel-cut w-full bg-cream/10 px-5 py-2 font-bold uppercase tracking-wider">
                      Leave
                    </button>
                  </>
                ) : (
                  <>
                    <div className="font-display text-3xl text-gold">Your rival left</div>
                    <p className="text-sm text-cream/70">
                      Waiting for them to come back with the same link
                      {waitRound >= MAX_WAITS ? ' (last wait)' : ''}:{' '}
                      <span className="font-display text-cream">
                        {Math.floor(waitLeft / 60)}:{String(waitLeft % 60).padStart(2, '0')}
                      </span>
                    </p>
                    <button type="button" onClick={copyInvite} className="panel-cut w-full bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep">
                      {linkCopied ? 'Link copied' : 'Copy the link again'}
                    </button>
                    <button type="button" onClick={exit} className="panel-cut w-full bg-cream/10 px-5 py-2 font-bold uppercase tracking-wider">
                      Leave
                    </button>
                  </>
                )}
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
                {online && (
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-xs uppercase tracking-widest text-cream/50">Next round as</span>
                    <div className="flex gap-2">
                      {ROSTER.map((r) => {
                        const chosen = (hud.nextCharacter ?? hud.character) === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => gameRef.current?.pickCharacter(r.id)}
                            className={`panel-cut border-2 px-3 py-1.5 font-display text-sm ${chosen ? 'border-gold bg-ink-deep' : 'border-cream/10 bg-ink-deep/60 hover:border-cream/30'}`}
                            style={{ color: r.accent }}
                          >
                            {r.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={rematch}
                    disabled={rematchAsked}
                    className="panel-cut bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep disabled:opacity-60"
                  >
                    {rematchAsked ? 'Waiting for rival…' : touch ? 'Rematch' : 'Rematch (Enter)'}
                  </button>
                  {online ? (
                    <button type="button" onClick={exit} className="panel-cut bg-cream/10 px-5 py-2 font-bold uppercase tracking-wider">
                      Leave
                    </button>
                  ) : (
                    <Link href="/characters" className="panel-cut bg-cream/10 px-5 py-2 font-bold uppercase tracking-wider">
                      Change fighter
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

          {!demo && !touch && <Controls aim={hud.aimMode} />}
          {!demo && touch && hud.phase !== 'over' && !rivalLeft && !menuOpen && !hud.paused && (
            <TouchControls press={(b, on) => gameRef.current?.touch(b, on)} onPause={openMenu} />
          )}
          <div className={`absolute flex items-center gap-3 text-[10px] text-cream/50 ${touch ? 'right-3 top-20' : 'bottom-3 right-3'}`}>
            {!demo && !touch && (
              <button
                type="button"
                onClick={toggleAim}
                className="panel-cut bg-cream/10 px-2 py-1 font-semibold uppercase tracking-wider text-cream/80 hover:bg-cream/20"
                title="Toggle aim mode (T)"
              >
                Aim: {hud.aimMode} <span className="text-cream/40">(T)</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => gameRef.current?.toggleMotion()}
              className="panel-cut bg-cream/10 px-2 py-1 font-semibold uppercase tracking-wider text-cream/80 hover:bg-cream/20"
              title="Screen shake and flashes"
            >
              Shake: {hud.motion ? 'on' : 'off'}
            </button>
            {hud.ping !== null && (
              <span title={hud.direct ? 'Playing over a direct line to your rival' : 'Playing through the game server'}>
                {hud.direct ? 'direct' : 'server'} · {hud.ping} ms
              </span>
            )}
            {hud.muted && <span>muted (M)</span>}
            <span>{hud.fps} fps</span>
          </div>
        </>
      )}
      {touch && portrait && <RotateHint />}
    </main>
  );
};
