'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  RotateHint,
  safeArea,
  TOUCH_STRIPS,
  TouchControls,
  useLandscape,
} from '~/components/TouchControls';
import { readAim } from '~/components/AimChoice';
import { SettingsPanel } from '~/components/menu/SettingsPanel';
import { useCopy } from '~/components/menu/useCopy';
import { useGamepadNav } from '~/components/menu/useGamepadNav';
import { useSettings } from '~/components/menu/useSettings';
import { menuSound } from '~/components/menu/menuSound';
import { LiftLoading } from '~/components/Elevator';
import { useRoundTelemetry } from '~/components/useTelemetry';
import { Support } from '~/components/SupportLink';
import { isTouchDevice } from '~/game/input';
import { startArena } from '~/game/render/game';
import { ROSTER } from '~/game/roster';
import { RULES } from '~/game/sim/constants';
import { keyLabel } from '~/game/settings';

import type { Copy } from '~/game/copy';
import type { AimMode } from '~/game/input';
import type { NetStatus, OnlineSession } from '~/game/net/client';
import type { StartMessage } from '~/game/net/protocol';
import type { Room } from '@colyseus/sdk';
import type { HudFighter, HudState } from '~/game/render/game';
import type { BotLevel } from '~/game/sim/bot';
import type { Bindings } from '~/game/settings';
import type { CharacterId } from '~/game/sim/types';

const accent = (id: CharacterId) => ROSTER.find((r) => r.id === id)?.accent ?? '#fff';
const WAIT_SECONDS = 60;
const MAX_WAITS = 3;

const Key = ({ k }: { k: string }) => (
  <kbd className="inline-flex min-w-5 items-center justify-center rounded-sm border border-b-2 border-cream/30 bg-cream/10 px-1 text-[10px] font-bold leading-4 text-cream">
    {k}
  </kbd>
);

/** A small cooldown bar: fills up, then lights up when the move is ready. */
const Ready = ({ label, value }: { label: string; value: number }) => {
  const ready = value >= 1;
  return (
    <span
      className={`flex items-center gap-1 ${ready ? 'text-gold' : 'text-cream/40'}`}
      title={ready ? `${label} ready` : `${label} recharging`}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      <span className="h-1.5 w-8 overflow-hidden rounded bg-cream/15">
        <span
          className={`block h-full ${ready ? 'bg-gold' : 'bg-cream/50'}`}
          style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        />
      </span>
    </span>
  );
};

/** One side's KO count. It pops (scale + brightness flash) each time the number goes up. */
const ScoreDigit = ({ value, color, compact }: { value: number; color: string; compact?: boolean }) => {
  const prev = useRef(value);
  const [pops, setPops] = useState(0);
  useEffect(() => {
    if (value > prev.current) setPops((n) => n + 1);
    prev.current = value;
  }, [value]);
  return (
    <span
      key={pops}
      data-testid="score-digit"
      className={`inline-block min-w-[0.7em] text-center font-display leading-none tabular-nums drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] ${compact ? 'text-3xl' : 'text-5xl'} ${pops > 0 ? 'f42-score-pop' : ''}`}
      style={{ color }}
    >
      {value}
    </span>
  );
};

const FighterPanel = ({
  f,
  label,
  align,
  compact,
}: {
  f: HudFighter;
  label: string;
  align: 'left' | 'right';
  compact?: boolean;
}) => (
  <div
    className={`flex ${compact ? 'w-48' : 'w-72'} flex-col gap-1 ${align === 'right' ? 'items-end text-right' : ''}`}
  >
    <div className={`flex items-baseline gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      <span className="font-display text-lg leading-none" style={{ color: accent(f.character) }}>
        {f.name}
      </span>
      <span className="text-[10px] font-semibold tracking-widest text-cream/50">{label}</span>
    </div>
    <div className="panel-cut h-3 w-full bg-ink-deep/80">
      <div
        className={`h-full transition-[width] duration-150 ${align === 'right' ? 'ml-auto' : ''}`}
        style={{
          width: `${(f.hp / f.maxHp) * 100}%`,
          background: f.hp / f.maxHp > 0.5 ? accent(f.character) : 'var(--color-orange)',
        }}
      />
      {/* Healing: the empty part of the bar shimmers green as it refills. */}
      {f.healing && (
        <div className="pointer-events-none -mt-3 h-3 w-full animate-pulse bg-[#3ddc84]/25" />
      )}
    </div>
    <div
      className={`flex items-center gap-3 text-[11px] text-cream/70 ${align === 'right' ? 'flex-row-reverse' : ''}`}
    >
      <span className="font-semibold text-cream">{f.gun}</span>
      {label === 'YOU' && (
        <>
          <Ready label="Dash" value={f.dash} />
          <Ready label="Push" value={f.push} />
        </>
      )}
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

/** The key strip along the bottom, from the player's own bindings. */
const Controls = ({ aim, bindings }: { aim: AimMode; bindings: Bindings }) => {
  const k = (a: keyof Bindings) => keyLabel(bindings[a][0] || bindings[a][1]);
  return (
    <div className="hud-scale pointer-events-none absolute bottom-3 left-3 flex origin-bottom-left flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-cream/50">
      <span className="flex items-center gap-1">
        <Key k={k('left')} />
        <Key k={k('right')} /> move
      </span>
      <span className="flex items-center gap-1">
        <Key k={k('up')} /> jump
      </span>
      <span className="flex items-center gap-1">
        <Key k={k('fire')} /> {aim === 'mouse' ? 'or click: shoot' : 'shoot'}
      </span>
      <span className="flex items-center gap-1">
        <Key k={k('down')} /> crouch / drop
      </span>
      <span className="flex items-center gap-1">
        <Key k={k('crouch')} /> crouch on walkways
      </span>
      <span className="flex items-center gap-1">
        <Key k={k('dash')} /> dash
      </span>
      <span className="flex items-center gap-1">
        <Key k={k('push')} /> push
      </span>
      <span className="flex items-center gap-1">
        <Key k={k('pickup')} /> pick up
      </span>
      <span className="flex items-center gap-1">
        <Key k="Esc" /> pause / settings
      </span>
    </div>
  );
};

const END_TEXT = (hud: HudState, demo: boolean, copy: Copy) => {
  if (hud.winner === -1 || hud.winner === null)
    return { title: 'Draw', sub: copy.drawSub };
  const name = hud.winner === 0 && !demo ? 'You win' : `${hud.fighters[hud.winner].name} wins`;
  return {
    title: name,
    sub:
      hud.endReason === 'time' ? 'More KOs when time ran out.' : `First to ${RULES.kosToWin} KOs.`,
  };
};

const NET_LABEL: Record<NetStatus['mode'], { label: string; title: string; dot: string }> = {
  direct: { label: 'Direct', title: 'Playing over a direct line to your rival', dot: 'bg-green' },
  turn: {
    label: 'Relay (TURN)',
    title: 'A direct line through a TURN relay: your networks block a straight one',
    dot: 'bg-green',
  },
  relay: {
    label: 'Server relay',
    title: 'The direct line went quiet: messages go through the game server for now',
    dot: 'bg-gold',
  },
  server: {
    label: 'Server',
    title: 'The game server runs this match (no direct line between you)',
    dot: 'bg-gold',
  },
};

/** How this match is connected and the round trip, always visible in an online match. */
const NetBadge = ({ net }: { net: NetStatus }) => {
  const m = NET_LABEL[net.mode];
  const host = net.authority === 'here' ? ' · you host' : '';
  return (
    <span
      title={`${m.title}. Round trip ${net.ping} ms.${net.authority === 'here' ? ' Your browser runs the game.' : ''}`}
      className="panel-cut flex items-center gap-1.5 bg-cream/10 px-2 py-1 font-semibold uppercase tracking-wider text-cream/85"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${net.unstable ? 'animate-pulse bg-orange' : m.dot}`}
        aria-hidden
      />
      {m.label} · {net.ping} ms{host}
    </span>
  );
};

/**
 * The in-game pause menu: Resume · Settings · Quit to menu, slanted like the main menu. Settings opens the same
 * panel as the main menu. Online, pausing needs both players: until the rival agrees the game keeps going.
 */
const PauseMenu = ({
  paused,
  online,
  onResume,
  onSettings,
  onQuit,
}: {
  paused: boolean;
  online: boolean;
  onResume: () => void;
  onSettings: () => void;
  onQuit: () => void;
}) => {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  const item = (
    label: string,
    onClick: () => void,
    opts: {
      primary?: boolean;
      danger?: boolean;
      ref?: React.RefObject<HTMLButtonElement | null>;
    } = {},
  ) => (
    <button
      ref={opts.ref}
      type="button"
      onClick={() => {
        menuSound.confirm();
        onClick();
      }}
      onFocus={() => menuSound.tick()}
      onMouseEnter={(e) => e.currentTarget.focus()}
      onKeyDown={(e) => {
        if (e.code !== 'ArrowDown' && e.code !== 'ArrowUp') return;
        e.preventDefault();
        const list = [...(e.currentTarget.parentElement?.querySelectorAll('button') ?? [])];
        const i = list.indexOf(e.currentTarget);
        list[
          Math.max(0, Math.min(list.length - 1, i + (e.code === 'ArrowDown' ? 1 : -1)))
        ]?.focus();
      }}
      className="group relative flex w-full -skew-x-[8deg] items-center gap-3 overflow-hidden py-2.5 pl-5 text-left outline-none transition hover:bg-cream/5 focus-visible:bg-cream/[0.07]"
    >
      <span
        className={`absolute inset-y-0 left-0 w-1.5 origin-left scale-x-0 transition-transform group-hover:scale-x-100 group-focus-visible:scale-x-100 ${opts.danger ? 'bg-orange' : 'bg-gold'}`}
      />
      <span
        className={`skew-x-[8deg] font-display leading-none transition group-hover:translate-x-2 group-focus-visible:translate-x-2 ${opts.primary ? 'text-4xl text-gold' : 'text-2xl text-cream/85 group-focus-visible:text-cream'}`}
      >
        {label}
      </span>
    </button>
  );
  return (
    <div className="absolute inset-0 z-10 flex bg-[linear-gradient(90deg,rgba(10,13,24,0.95)_0%,rgba(10,13,24,0.8)_35%,rgba(10,13,24,0.35)_70%)] [animation:fadeIn_0.2s_ease-out]">
      <div className="flex w-full max-w-md flex-col justify-center gap-6 px-8 [animation:slideInLeft_0.3s_cubic-bezier(.2,.9,.2,1)] sm:px-12">
        <div className="flex flex-col gap-2">
          <h2 className="-skew-x-6 font-display text-6xl leading-none text-cream [@media(max-height:500px)]:text-4xl">
            {paused ? 'PAUSED' : 'PAUSE?'}
          </h2>
          {!paused && online && (
            <p className="max-w-xs text-sm text-cream/70">
              Waiting for your rival to pause too. The game keeps going until they do.
            </p>
          )}
        </div>
        <nav aria-label="Pause menu" className="flex flex-col gap-1">
          {item(paused ? 'RESUME' : 'KEEP PLAYING', onResume, { primary: true, ref: first })}
          {item('SETTINGS', onSettings)}
          {item(online ? 'LEAVE MATCH' : 'QUIT TO MENU', onQuit, { danger: true })}
        </nav>
        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-cream/40">
            Esc resumes
          </span>
          <Support variant="pause" className="self-start" />
        </div>
      </div>
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settings = useSettings();
  const copy = useCopy();
  useGamepadNav(menuOpen);
  // Rival left: wait up to three rounds of WAIT_SECONDS, asking in between, then the link expires.
  const [waitRound, setWaitRound] = useState(0);
  const [waitLeft, setWaitLeft] = useState(0);
  const [asking, setAsking] = useState(false);
  const [expired, setExpired] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  /** Seconds left for a rival whose connection dropped to come back, or null. */
  const [dropLeft, setDropLeft] = useState<number | null>(null);
  // Phones and tablets: touch controls, auto-aim, landscape. Known only after mount.
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(isTouchDevice()), []);
  const portrait = useLandscape();
  // Phones: keep the office clear of the control strips (and the notch).
  useEffect(() => {
    if (!touch || demo) return;
    const apply = () => {
      const sa = safeArea();
      // Left-handed swaps the strips: the stick lives on the right.
      const [l, r] = settings.touch.leftHanded
        ? [TOUCH_STRIPS.right, TOUCH_STRIPS.left]
        : [TOUCH_STRIPS.left, TOUCH_STRIPS.right];
      gameRef.current?.setInsets({
        left: l * settings.touch.size + sa.left,
        right: r * settings.touch.size + sa.right,
        top: TOUCH_STRIPS.top,
        bottom: 0,
      });
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [touch, demo, settings.touch.leftHanded, settings.touch.size]);
  const hudRef = useRef<HudState | null>(null);
  hudRef.current = hud;
  // Anonymous usage events: a no-op unless the site started counting (never on a portal build).
  useRoundTelemetry(hud, { demo, online: !!online });

  // The lift ride up: real loading steps, shown until the first frame of the office is on screen.
  const [loaded, setLoaded] = useState({ fonts: false, office: false });
  const [lift, setLift] = useState(true);
  const endLift = useCallback(() => setLift(false), []);
  useEffect(() => {
    let alive = true;
    void (document.fonts?.ready ?? Promise.resolve()).then(() => alive && setLoaded((l) => ({ ...l, fonts: true })));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let game: ReturnType<typeof startArena> | null = null;
    // Two frames first, so the loading screen is painted before the office is built (that blocks the page).
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        game = startArena(canvas, {
          player,
          opponent,
          demo,
          level,
          aimMode: isTouchDevice() ? 'auto' : readAim(),
          onHud: setHud,
          online: online?.session,
        });
        gameRef.current = game;
        setLoaded((l) => ({ ...l, office: true }));
        // Effects that ran before the game existed (touch insets) apply on resize.
        window.dispatchEvent(new Event('resize'));
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      game?.dispose();
      gameRef.current = null;
    };
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
    const offDropped = online.room.onMessage(
      'dropped',
      (msg: { slot: number; seconds: number }) => {
        if (msg.slot !== online.session.slot) setDropLeft(msg.seconds);
      },
    );
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
  const inviteLink =
    online && typeof window !== 'undefined'
      ? `${window.location.origin}/play?room=${online.room.roomId}`
      : '';
  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1500);
  };

  const exit = () => {
    if (online) void online.room.leave();
    window.location.href = online ? '/play' : '/';
  };

  // Esc: ask to pause (online the rival has to agree the same way) and open the menu, on the first press.
  // It used to take two presses within 450 ms, which read as Esc not working.
  // Keys 1-4 pick who you come back as while you're waiting to respawn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = hudRef.current;
      if (!h) return;
      if (e.code === 'Escape') {
        // A held Esc repeats: it must not open and close the menu over and over.
        if (e.repeat) return;
        // The pause menu is open: one Esc resumes (Settings, when open, takes Esc first and closes itself).
        if (menuOpenRef.current) {
          closeMenuRef.current();
          return;
        }
        if (h.phase === 'over') return;
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

  /** The touch pause button: the same as Esc. */
  const openMenu = () => {
    const h = hudRef.current;
    if (!h || h.phase === 'over') return;
    if (!h.paused) gameRef.current?.requestPause();
    setMenuOpen(true);
  };

  const closeMenu = () => {
    setMenuOpen(false);
    setSettingsOpen(false);
    setTimeout(() => keyTrapRef.current?.focus({ preventScroll: true }), 0);
    if (hudRef.current?.paused) gameRef.current?.resume();
    else gameRef.current?.cancelPause();
  };
  const menuOpenRef = useRef(false);
  menuOpenRef.current = menuOpen;
  const closeMenuRef = useRef(closeMenu);
  closeMenuRef.current = closeMenu;

  const rematch = () => {
    // Only online waits for the rival; against the bot the rematch starts at once.
    if (online) setRematchAsked(true);
    gameRef.current?.restart();
  };

  // Keyboard-navigation extensions (Vimium and friends) swallow keys like D, J, K, L
  // unless a text field has focus. Keep an invisible one focused while the game runs.
  useEffect(() => {
    const trap = keyTrapRef.current;
    // Never on phones: a focused field would pop up the on-screen keyboard.
    if (!trap || isTouchDevice()) return;
    // Not while the pause menu or Settings is open: they need focus for the keyboard and gamepad.
    const refocus = () =>
      setTimeout(() => !menuOpenRef.current && trap.focus({ preventScroll: true }), 0);
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
  const end = hud?.phase === 'over' ? END_TEXT(hud, demo, copy) : null;

  return (
    <main className="relative h-[100dvh] w-screen touch-none select-none overflow-hidden bg-ink-deep">
      <canvas
        ref={canvasRef}
        className={`block h-full w-full ${hud?.aimMode === 'mouse' ? 'cursor-crosshair' : ''}`}
      />
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
          <div className="hud-scale pointer-events-none absolute inset-x-0 top-0 flex origin-top items-start justify-between bg-gradient-to-b from-ink-deep/90 to-transparent px-4 pb-8 pt-3">
            <FighterPanel
              f={hud.fighters[0]}
              label={demo ? 'BOT' : 'YOU'}
              align="left"
              compact={touch}
            />
            <div className="flex flex-col items-center gap-1.5">
              <span className="font-display text-3xl leading-none tabular-nums text-cream">
                {hud.phase === 'countdown' ? RULES.roundSeconds : Math.ceil(hud.time)}
              </span>
              <div
                role="status"
                aria-label={`Score ${hud.fighters[0].kos} to ${hud.fighters[1].kos}`}
                className="flex items-center gap-2"
              >
                <ScoreDigit value={hud.fighters[0].kos} color={accent(hud.fighters[0].character)} compact={touch} />
                <span className="font-display text-2xl leading-none text-cream/40">:</span>
                <ScoreDigit value={hud.fighters[1].kos} color={accent(hud.fighters[1].character)} compact={touch} />
              </div>
              {Math.max(hud.fighters[0].kos, hud.fighters[1].kos) === RULES.kosToWin - 1 ? (
                <span className="text-[10px] font-bold tracking-widest text-gold">MATCH POINT</span>
              ) : (
                <span className="text-[10px] font-semibold tracking-widest text-cream/50">
                  FIRST TO {RULES.kosToWin}
                </span>
              )}
              {!touch && (
                <span className="panel-cut mt-1 flex items-baseline gap-2 bg-ink-deep/85 px-3 py-1">
                  <span className="font-display text-base text-gold">FLOOR 42</span>
                  <span className="text-[11px] text-cream/70">{copy.hudRoom}</span>
                </span>
              )}
            </div>
            <FighterPanel
              f={hud.fighters[1]}
              label={online ? 'RIVAL' : `BOT · ${level}`}
              align="right"
              compact={touch}
            />
          </div>

          {/* Every round opens on what the game is about, then the merge goes wrong. */}
          {hud.phase === 'countdown' && hud.time > 1.6 && (
            <div className="pointer-events-none absolute inset-0 z-[4] flex flex-col items-center justify-center gap-4 bg-[radial-gradient(ellipse_at_center,rgba(10,13,24,0.55),rgba(10,13,24,0.15)_70%)] px-6 text-center">
              {copy.introAbove && (
                <div className="font-mono text-xs tracking-[0.3em] text-green/90 [animation:fadeIn_0.4s_ease-out]">
                  {copy.introAbove}
                </div>
              )}
              <div className="font-display text-4xl leading-none text-gold drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)] [animation:riseIn_0.5s_ease-out] sm:text-7xl">
                {copy.introTitle[0]}
                <br />
                {copy.introTitle[1]}
              </div>
              <div className="max-w-md text-sm text-cream/85 [animation:fadeIn_0.8s_ease-out] sm:text-base">
                {copy.introLine}
              </div>
              {copy.introBelow && (
                <div className="font-mono text-xs tracking-[0.3em] text-orange/90 [animation:fadeIn_0.4s_ease-out]">
                  {copy.introBelow}
                </div>
              )}
            </div>
          )}
          {hud.phase === 'countdown' && hud.time <= 1.6 && (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 flex flex-col items-center gap-3">
              <div className="font-display text-5xl drop-shadow-lg">
                {hud.time > 0.8 ? (
                  <span className="text-cream">{copy.countdownReady}</span>
                ) : (
                  <span className="text-orange">{copy.countdownGo}</span>
                )}
              </div>
              <div className="panel-cut bg-ink-deep/80 px-4 py-2 text-sm text-cream/80">
                Keep moving. Furniture stops bullets: use it.
              </div>
            </div>
          )}

          {showKo && hud.lastKo && (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
              <div className="font-display text-4xl text-gold drop-shadow-lg">
                {hud.fighters[hud.lastKo.fighter].name} is out
              </div>
            </div>
          )}

          {hud.hint.length > 0 && (
            <div
              className={`pointer-events-none absolute inset-x-0 z-[6] flex justify-center ${touch ? 'top-36' : 'bottom-10'}`}
            >
              <div className="hud-scale panel-cut flex items-center gap-3 bg-ink-deep/85 px-4 py-1.5 text-sm text-cream">
                {hud.hint.map((h) => (
                  <span key={h.key} className="flex items-center gap-2">
                    <Key k={touch && h.key === 'Space' ? 'Fire' : h.key} />{' '}
                    {h.text}
                  </span>
                ))}
              </div>
            </div>
          )}

          {hud.net?.unstable && !hud.paused && hud.phase !== 'over' && (
            <div
              className="pointer-events-none absolute inset-x-0 top-16 z-[7] flex justify-center"
              role="status"
              aria-live="polite"
            >
              <div className="panel-cut flex items-center gap-2 bg-orange/95 px-4 py-1.5 text-ink-deep shadow-lg">
                <span className="h-2 w-2 animate-pulse rounded-full bg-ink-deep" aria-hidden />
                <span className="text-xs font-bold uppercase tracking-widest">
                  Connection unstable
                </span>
                <span className="text-[10px] font-semibold opacity-80">
                  {hud.net.mode === 'server' ? 'server' : hud.net.mode} · {hud.net.ping} ms
                </span>
              </div>
            </div>
          )}

          {online && !hud.paused && hud.pauseRequests[1] && !hud.pauseRequests[0] && (
            <div className="pointer-events-none absolute inset-x-0 top-28 flex justify-center">
              <div className="panel-cut bg-gold/95 px-6 py-2 text-center text-ink-deep">
                <div className="font-display text-xl">Your rival wants to pause</div>
                <div className="text-xs font-bold uppercase tracking-widest">
                  {touch ? 'Tap pause to agree' : 'Press Esc to agree'}
                </div>
              </div>
            </div>
          )}

          {hud.respawnIn !== null && hud.phase === 'fight' && !hud.paused && !demo && (
            <div
              className={`absolute inset-x-0 z-[6] flex justify-center ${touch ? 'top-32' : 'bottom-16'}`}
            >
              <div className="panel-cut flex flex-col items-center gap-3 bg-ink-deep/90 px-6 py-4">
                <div className="text-sm text-cream/80">
                  Back in{' '}
                  <span className="font-display text-xl text-gold">{Math.ceil(hud.respawnIn)}</span>{' '}
                  · come back as:
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
                <div className="font-display text-2xl text-gold">
                  Your rival&apos;s connection dropped
                </div>
                <p className="text-sm text-cream/70">
                  The game is on hold while they reconnect:{' '}
                  <span className="font-display text-cream">{Math.max(0, dropLeft)}s</span>
                </p>
              </div>
            </div>
          )}

          {(hud.paused || menuOpen) && hud.phase !== 'over' && !rivalLeft && dropLeft === null && (
            <PauseMenu
              paused={hud.paused}
              online={!!online}
              onResume={closeMenu}
              onSettings={() => setSettingsOpen(true)}
              onQuit={exit}
            />
          )}
          {settingsOpen && (hud.paused || menuOpen) && (
            <SettingsPanel onClose={() => setSettingsOpen(false)} />
          )}

          {rivalLeft && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink-deep/80">
              <div className="panel-cut flex w-[26rem] flex-col items-center gap-4 bg-ink p-7 text-center">
                {expired ? (
                  <>
                    <div className="font-display text-3xl text-orange">Link expired</div>
                    <p className="text-sm text-cream/70">
                      Your rival didn&apos;t come back. Start a new match and send a new link.
                    </p>
                    <Link
                      href="/play"
                      className="panel-cut w-full bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep"
                    >
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
                    <button
                      type="button"
                      onClick={keepWaiting}
                      className="panel-cut w-full bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep"
                    >
                      {waitRound + 1 >= MAX_WAITS ? 'Wait (last time)' : 'Keep waiting'}
                    </button>
                    <button
                      type="button"
                      onClick={exit}
                      className="panel-cut w-full bg-cream/10 px-5 py-2 font-bold uppercase tracking-wider"
                    >
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
                    <button
                      type="button"
                      onClick={copyInvite}
                      className="panel-cut w-full bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep"
                    >
                      {linkCopied ? 'Link copied' : 'Copy the link again'}
                    </button>
                    <button
                      type="button"
                      onClick={exit}
                      className="panel-cut w-full bg-cream/10 px-5 py-2 font-bold uppercase tracking-wider"
                    >
                      Leave
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {end && !rivalLeft && (
            <div className="absolute inset-0 z-30 flex animate-[fadeIn_0.6s_ease-out] items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(10,13,24,0.75),rgba(10,13,24,0.95))] px-6 backdrop-blur-sm">
              <div className="flex w-full max-w-3xl flex-col gap-7">
                {/* The result lands: a light streak sweeps the screen and the title slams in. */}
                <div aria-hidden className="f42-wipe" />
                <div className="flex flex-col gap-2">
                  <h2 className="font-display text-5xl leading-none text-gold sm:text-6xl">
                    <span className="f42-slam">{end.title}</span>
                  </h2>
                  <p className="text-lg text-cream/75 [animation:riseIn_0.4s_ease-out_0.2s_both]">
                    <span
                      className={`font-semibold ${hud.winner === 0 && !demo ? 'text-green' : hud.winner === null || hud.winner === -1 ? 'text-blue' : 'text-orange'}`}
                    >
                      {hud.winner === 0 && !demo
                        ? copy.resultWin
                        : hud.winner === null || hud.winner === -1
                          ? copy.resultDraw
                          : copy.resultLoss}
                    </span>{' '}
                    {end.sub}
                  </p>
                </div>

                {/* You against them, stat by stat; the better number lights up. */}
                <div className="panel-cut grid grid-cols-[1fr_auto_1fr] items-center gap-x-6 gap-y-3 bg-ink/90 p-6">
                  <span
                    className="font-display text-2xl"
                    style={{ color: accent(hud.fighters[0].character) }}
                  >
                    {hud.fighters[0].name}{' '}
                    <span className="text-xs text-cream/50">{demo ? 'BOT' : 'YOU'}</span>
                  </span>
                  <span />
                  <span
                    className="text-right font-display text-2xl"
                    style={{ color: accent(hud.fighters[1].character) }}
                  >
                    {hud.fighters[1].name}{' '}
                    <span className="text-xs text-cream/50">{online ? 'RIVAL' : 'BOT'}</span>
                  </span>
                  {(
                    [
                      ['KOs', hud.fighters[0].kos, hud.fighters[1].kos, ''],
                      [
                        'Damage dealt',
                        hud.fighters[0].stats.damage,
                        hud.fighters[1].stats.damage,
                        '',
                      ],
                      [
                        'Accuracy',
                        hud.fighters[0].stats.accuracy,
                        hud.fighters[1].stats.accuracy,
                        '%',
                      ],
                      [
                        'Best streak',
                        hud.fighters[0].stats.bestStreak,
                        hud.fighters[1].stats.bestStreak,
                        '',
                      ],
                      [
                        'Times down',
                        hud.fighters[0].stats.deaths,
                        hud.fighters[1].stats.deaths,
                        '',
                      ],
                    ] as const
                  ).map(([label, a, b, unit], row) => {
                    const lowerWins = label === 'Times down';
                    const aWins = lowerWins ? a < b : a > b;
                    const bWins = lowerWins ? b < a : b > a;
                    return (
                      <div
                        key={label}
                        className="contents animate-[riseIn_0.5s_ease-out_both]"
                        style={{ animationDelay: `${0.2 + row * 0.07}s` }}
                      >
                        <span
                          className={`font-display text-3xl tabular-nums ${aWins ? 'text-gold' : 'text-cream/70'}`}
                        >
                          {a}
                          {unit}
                        </span>
                        <span className="text-center text-[11px] font-semibold uppercase tracking-widest text-cream/50">
                          {label}
                        </span>
                        <span
                          className={`text-right font-display text-3xl tabular-nums ${bWins ? 'text-gold' : 'text-cream/70'}`}
                        >
                          {b}
                          {unit}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {online && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs uppercase tracking-widest text-cream/50">
                      Next round as
                    </span>
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
                )}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    autoFocus
                    onClick={rematch}
                    disabled={rematchAsked}
                    className="panel-cut bg-gold px-10 py-4 font-display text-xl uppercase text-ink-deep shadow-[0_0_40px_rgba(255,210,63,0.3)] hover:brightness-110 disabled:opacity-60"
                  >
                    {rematchAsked
                      ? 'Waiting for rival…'
                      : touch
                        ? 'Rematch →'
                        : 'Rematch (Enter) →'}
                  </button>
                  {online ? (
                    <button
                      type="button"
                      onClick={exit}
                      className="panel-cut bg-cream/10 px-8 py-4 font-bold uppercase tracking-wider hover:bg-cream/20"
                    >
                      Back to lobby
                    </button>
                  ) : (
                    <Link
                      href="/?select"
                      className="panel-cut bg-cream/10 px-8 py-4 font-bold uppercase tracking-wider hover:bg-cream/20"
                    >
                      Change fighter
                    </Link>
                  )}
                </div>
                <Support variant="results" />
              </div>
            </div>
          )}

          {!demo && !touch && <Controls aim={hud.aimMode} bindings={settings.bindings} />}
          {!demo && touch && hud.phase !== 'over' && !rivalLeft && !menuOpen && !hud.paused && (
            <TouchControls
              press={(b, on) => gameRef.current?.touch(b, on)}
              onPause={openMenu}
              ready={{ dash: hud.fighters[0].dash, push: hud.fighters[0].push }}
              size={settings.touch.size}
              opacity={settings.touch.opacity}
              leftHanded={settings.touch.leftHanded}
            />
          )}
          <div
            className={`absolute flex items-center gap-3 text-[10px] text-cream/50 ${touch ? 'right-3 top-20' : 'bottom-3 right-3'}`}
          >
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
            {hud.net && <NetBadge net={hud.net} />}
            {hud.muted && <span>muted (M)</span>}
            {settings.showFps && <span className="tabular-nums">{hud.fps} fps</span>}
          </div>
        </>
      )}
      {touch && portrait && <RotateHint />}
      {lift && (
        <LiftLoading
          steps={[
            { label: 'Game code', done: true },
            { label: 'Fonts', done: loaded.fonts },
            { label: 'The office', done: loaded.office },
            { label: 'First frame', done: hud !== null },
          ]}
          onDone={endLift}
        />
      )}
    </main>
  );
};
