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
import { FdHud } from '~/components/fieldday/hud/FdHud';
import { STACK_STYLE, useCornerLayout } from '~/components/fieldday/hud/useClearOf';
import { HowToScreen } from '~/components/fieldday/screens/HowToScreen';
import { PauseScreen } from '~/components/fieldday/screens/PauseScreen';
import { SettingsPanel } from '~/components/menu/SettingsPanel';
import { useCopy } from '~/components/menu/useCopy';
import { KeyCard } from '~/components/twoPlayer/KeyCard';
import { useBothPress, usePlayerColours } from '~/components/twoPlayer/shared';
import { useGamepadNav } from '~/components/menu/useGamepadNav';
import { useSettings } from '~/components/menu/useSettings';
import { LiftLoading } from '~/components/Elevator';
import { VsRun, vsTags } from '~/components/VsDoors';
import { useRoundTelemetry } from '~/components/useTelemetry';
import { KnockoutBand, useKeyStrip } from '~/components/FightStamps';
import { Stamp } from '~/components/Stamp';
import { INPUT_AT_MS, ResultScreen } from '~/components/fieldday/screens/ResultScreen';
import { Support } from '~/components/SupportLink';
import { titleCase } from '~/components/fieldday/resultModel';
import { ARENA_COPY, resolveArena } from '~/game/arenaChoice';
import { botLevelFor, readFinishedMatch, saveFinishedMatch } from '~/game/firstMatch';
import { isTouchDevice } from '~/game/input';
import { startArena } from '~/game/render/game';
import { ROSTER } from '~/game/roster';
import { ARENA_IDS, RULES } from '~/game/sim/constants';
import { getSettings } from '~/game/settings';
import { addToTally, keyCardSeen, markKeyCardSeen, readTally, resetTally, sessionStore } from '~/game/twoPlayer';
import { navigate, PORTAL } from '~/lib/portal';
import { getPlatform } from '~/platform';

import type { Copy } from '~/game/copy';
import type { NetStatus, OnlineSession } from '~/game/net/client';
import type { StartMessage } from '~/game/net/protocol';
import type { Room } from '@colyseus/sdk';
import type { HudState } from '~/game/render/game';
import type { BotLevel } from '~/game/sim/bot';
import type { CharacterId } from '~/game/sim/types';
import type { Tally } from '~/game/twoPlayer';

const accent = (id: CharacterId) => ROSTER.find((r) => r.id === id)?.accent ?? '#fff';
const WAIT_SECONDS = 60;
const MAX_WAITS = 3;

const END_TEXT = (hud: HudState, demo: boolean, copy: Copy) => {
  if (hud.winner === -1 || hud.winner === null)
    return { title: 'Draw', sub: copy.drawSub };
  const name = hud.winner === 0 && !demo ? 'You win' : `${hud.fighters[hud.winner].name} wins`;
  return {
    title: name,
    sub:
      hud.endReason === 'time' ? 'More KOs when time ran out.' : `First to ${hud.kosToWin} KOs.`,
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

export interface LocalBotHooks {
  /** A human is free for the next match. */
  offer: boolean;
  /** False while a round is on (countdown / fight), true on the result screen. */
  onAvailable: (available: boolean) => void;
  onAccept: () => void;
  /** Menu / change fighter: back to the online lobby (leaves the standby room). */
  onExit: () => void;
}

export const ArenaGame = ({
  player,
  opponent,
  demo = false,
  level: requestedLevel = 'normal',
  arena: requestedArena,
  online,
  onlineBot,
  localBot,
  twoPlayer,
}: {
  player: CharacterId;
  opponent: CharacterId;
  demo?: boolean;
  level?: BotLevel;
  /** The `arena=` of the URL: which arena an offline match is played in (else the remembered pick, else the default). */
  arena?: string | null;
  online?: { session: OnlineSession; room: Room };
  /** Online vs the server's bot (no human was free): its level, shown as BOT · LEVEL like offline. */
  onlineBot?: BotLevel;
  /**
   * Online quick match found no human in time, so this is a match against the bot in the browser (zero network) while the
   * player stays on standby in the quick-match room. A human who becomes free is offered on the result screen, for the
   * next match only. `onlineBot` gives the level.
   */
  localBot?: LocalBotHooks;
  /** Local 2-player on one keyboard: `player` is P1's fighter, `opponent` P2's; first to `kosToWin`. */
  twoPlayer?: { kosToWin: number };
}) => {
  const tp = !!twoPlayer && !online && !demo;
  // The very first match against the bot is always easy; after that the menu's choice stands.
  const [firstMatch] = useState(() => !readFinishedMatch());
  const level = onlineBot ?? (demo || online || tp ? requestedLevel : botLevelFor(requestedLevel, !firstMatch));
  const kosToWin = twoPlayer?.kosToWin;
  // Fixed for the life of the page: changing the pick in settings mid-match must not rebuild the arena.
  const [arenaId] = useState(() => resolveArena({ online: !!online, onlineArena: online?.session.state.arena, query: requestedArena, saved: getSettings().get().arena }));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<ReturnType<typeof startArena> | null>(null);
  const keyTrapRef = useRef<HTMLInputElement>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [rematchAsked, setRematchAsked] = useState(false);
  /** Offline rematch: the VS doors close, the match restarts behind them, they open (R-013 4.4). */
  const [vsRematch, setVsRematch] = useState(false);
  const [rivalLeft, setRivalLeft] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  /** Which pause item had focus when settings or how-to opened, so focus comes back to it. */
  const pauseFocus = useRef('resume');
  const settings = useSettings();
  const copy = useCopy(arenaId);
  const colours = usePlayerColours();
  /** Local 2-player: the key card before the first round ('start') or from Pause > Controls ('view'). */
  const [keyCard, setKeyCard] = useState<'start' | 'view' | null>(null);
  const [pausedBy, setPausedBy] = useState<0 | 1 | 'pad' | null>(null);
  const [tally, setTally] = useState<Tally>({ p1: 0, p2: 0 });
  const counted = useRef(false);
  const padPauseRef = useRef<(who: 0 | 1 | 'pad') => void>(() => undefined);
  const padCount = useGamepadNav(menuOpen);
  // Rival left: wait up to three rounds of WAIT_SECONDS, asking in between, then the link expires.
  const [waitRound, setWaitRound] = useState(0);
  const [waitLeft, setWaitLeft] = useState(0);
  const [asking, setAsking] = useState(false);
  const [expired, setExpired] = useState(false);
  // The GPU dropped the 3D view and did not give it back (weak or busy graphics driver).
  const [glLost, setGlLost] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  /** Seconds left for a rival whose connection dropped to come back, or null. */
  const [dropLeft, setDropLeft] = useState<number | null>(null);
  // Phones and tablets: touch controls, auto-aim, landscape. Known only after mount.
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(isTouchDevice()), []);
  const portrait = useLandscape();
  // Phones: keep the office clear of the control strips (and the notch).
  useEffect(() => {
    if (!touch || demo || tp) return;
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
  }, [touch, demo, tp, settings.touch.leftHanded, settings.touch.size]);
  const hudRef = useRef<HudState | null>(null);
  hudRef.current = hud;
  const [tag1, tag2] = vsTags(tp ? '2p' : '1p', level);
  const vsInfo = { p1: player, p2: opponent, tag1, tag2, kosToWin: kosToWin ?? RULES.kosToWin, arena: arenaId };
  // Anonymous usage events: a no-op unless the site started counting (never on a portal build).
  const isLocalBot = !!localBot && !online;
  const localBotRef = useRef(localBot);
  localBotRef.current = localBot;
  useRoundTelemetry(hud, { demo, online: !!online, twoPlayer: tp, onlineBot: isLocalBot });
  // Standby: busy while a round is on, available on the result screen (the server offers a free human only then).
  const roundOn = hud ? hud.phase !== 'over' : true;
  useEffect(() => {
    if (isLocalBot) localBotRef.current?.onAvailable(!roundOn);
  }, [roundOn, isLocalBot]);
  const [acceptedOffer, setAcceptedOffer] = useState(false);
  useEffect(() => {
    if (roundOn) setAcceptedOffer(false);
  }, [roundOn]);

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
        // Local 2-player: the key card holds the clock the first time in this browser session.
        const card = tp && !keyCardSeen(sessionStore());
        game = startArena(canvas, {
          player,
          opponent,
          demo,
          level,
          arena: arenaId,
          aimMode: isTouchDevice() ? 'auto' : readAim(),
          onHud: setHud,
          onContextLost: () => setGlLost(true),
          online: online?.session,
          traits: !isLocalBot,
          ...(tp && kosToWin
            ? {
                twoPlayer: { kosToWin },
                hold: card,
                onPadPause: (who: 0 | 1) => padPauseRef.current(who),
                onPadLost: () => padPauseRef.current('pad'),
              }
            : {}),
        });
        if (card) setKeyCard('start');
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
  }, [player, opponent, demo, level, arenaId, online, tp, kosToWin]);

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
    if (isLocalBot) return localBotRef.current?.onExit();
    if (online) void online.room.leave();
    // Leaving a 2-player session for the main menu ends tonight's tally.
    if (tp) resetTally(sessionStore());
    navigate(online ? '/play' : '/');
  };
  /** Local 2-player: back to the split fighter select, both picks kept (unlocked), the tally kept. */
  const changeFighters = () => navigate(`/?2p&p1=${player}&p2=${opponent}&n=${kosToWin ?? RULES.kosToWin}&keep=1`);
  /** Result: the same match in the other arena (offline), by its URL; the route remounts the match. */
  const nextArena = () => {
    const next = ARENA_IDS[(ARENA_IDS.indexOf(arenaId) + 1) % ARENA_IDS.length];
    const q = new URLSearchParams({ p1: player, p2: opponent, arena: next });
    if (tp) {
      q.set('mode', '2p');
      q.set('n', String(kosToWin ?? RULES.kosToWin));
    } else {
      q.set('bot', requestedLevel);
      if (demo) q.set('demo', '');
    }
    navigate(`/arena?${q.toString()}`);
  };
  /** Result: CHANGE FIGHTER. 2-player: the split select; vs bot: the fighter select; online: the next fighter in the roster for the next round. */
  const onChangeFighter = () => {
    if (tp) return changeFighters();
    if (isLocalBot) return localBotRef.current?.onExit();
    if (!online) return navigate('/characters');
    const cur = hudRef.current?.nextCharacter ?? hudRef.current?.character;
    const i = ROSTER.findIndex((r) => r.id === cur);
    gameRef.current?.pickCharacter(ROSTER[(i + 1) % ROSTER.length].id);
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
        setPausedBy(null);
        setMenuOpen(true);
        return;
      }
      // 2-player: no mid-match fighter change, 1-4 are inert.
      if (tpRef.current) return;
      const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (n >= 0 && h.respawnIn !== null) gameRef.current?.pickCharacter(ROSTER[n].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Pad: LB / RB cycle who you come back as while you wait (the same pick as keys 1-4; vs a bot only, like the card's row).
  useEffect(() => {
    if (tp || online || demo) return;
    const held = [false, false];
    const id = window.setInterval(() => {
      const h = hudRef.current;
      const pads = h && h.respawnIn !== null ? (navigator.getGamepads?.() ?? []) : [];
      const pad = pads.find((g) => g && g.connected !== false);
      const now = [!!pad?.buttons[4]?.pressed, !!pad?.buttons[5]?.pressed];
      if (h) {
        const cur = ROSTER.findIndex((r) => r.id === (h.nextCharacter ?? h.character));
        const step = now[1] && !held[1] ? 1 : now[0] && !held[0] ? -1 : 0;
        if (step) gameRef.current?.pickCharacter(ROSTER[(cur + step + 4) % 4].id);
      }
      held[0] = now[0];
      held[1] = now[1];
    }, 50);
    return () => window.clearInterval(id);
  }, [tp, online, demo]);

  /** The touch pause button: the same as Esc. A pad's Start in 2-player says who paused. */
  const openMenu = (who: 0 | 1 | 'pad' | null = null) => {
    const h = hudRef.current;
    if (!h || h.phase === 'over') return;
    if (menuOpenRef.current) {
      // Already paused: a lost pad still says so.
      if (who === 'pad') setPausedBy('pad');
      return;
    }
    if (!h.paused) gameRef.current?.requestPause();
    setPausedBy(who);
    setMenuOpen(true);
  };
  padPauseRef.current = (who) => openMenu(who);
  const tpRef = useRef(tp);
  tpRef.current = tp;

  const closeMenu = () => {
    setMenuOpen(false);
    setSettingsOpen(false);
    setHowOpen(false);
    pauseFocus.current = 'resume';
    setKeyCard(null);
    setTimeout(() => keyTrapRef.current?.focus({ preventScroll: true }), 0);
    if (hudRef.current?.paused) gameRef.current?.resume();
    else gameRef.current?.cancelPause();
  };
  const menuOpenRef = useRef(false);
  menuOpenRef.current = menuOpen;
  const closeMenuRef = useRef(closeMenu);
  closeMenuRef.current = closeMenu;

  const rematch = () => {
    if (vsRematch) return;
    // Only online waits for the rival; against the bot (offline, or the server's bot) the rematch starts at once.
    if (online && !onlineBot) setRematchAsked(true);
    counted.current = false;
    if (!online && !demo) {
      setVsRematch(true);
      return;
    }
    gameRef.current?.restart();
  };

  // Remember that this player has finished a match against the bot (the next one uses the menu's level).
  useEffect(() => {
    if (hud?.phase === 'over' && !demo && !online && !tp) saveFinishedMatch();
  }, [hud?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Local 2-player: count the decided match once into tonight's tally (draws don't count).
  useEffect(() => {
    if (!tp) return;
    if (hud?.phase === 'over' && !counted.current) {
      counted.current = true;
      setTally(addToTally(sessionStore(), hud.winner));
    } else if (hud && hud.phase !== 'over') counted.current = false;
    if (!hud) setTally(readTally(sessionStore()));
  }, [tp, hud?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const startFromCard = useCallback(() => {
    markKeyCardSeen(sessionStore());
    setKeyCard(null);
    gameRef.current?.setHold(false);
    setTimeout(() => keyTrapRef.current?.focus({ preventScroll: true }), 0);
  }, []);
  const peek2P = useCallback(() => gameRef.current?.peek2P() ?? null, []);

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

  // The rival resumed: close our pause menu too.
  const wasPaused = useRef(false);
  useEffect(() => {
    if (wasPaused.current && hud && !hud.paused) setMenuOpen(false);
    wasPaused.current = !!hud?.paused;
  }, [hud?.paused]); // eslint-disable-line react-hooks/exhaustive-deps

  // The portal wants to know when a player is really playing (not in a countdown, a pause menu, the results or a demo).
  const playing = !demo && hud?.phase === 'fight' && !hud.paused && !menuOpen;
  useEffect(() => {
    if (playing) getPlatform().gameplayStart();
    else getPlatform().gameplayStop();
  }, [playing]);
  useEffect(() => () => getPlatform().gameplayStop(), []);

  const toggleAim = () => gameRef.current?.setAimMode(hud?.aimMode === 'mouse' ? 'auto' : 'mouse');
  const showKo = hud?.lastKo && hud.phase === 'fight' && !hud.paused && hud.fighters[hud.lastKo.fighter]?.out;
  // The match-winning KO: offline the slow-motion holds the fight (hud.finale); online and 2-player have none, so the band holds 1.1 s.
  const quickOver = !!hud && hud.phase === 'over' && hud.endReason === 'kos' && (!!online || tp) && hud.winner !== null && hud.winner >= 0;
  const [quickDone, setQuickDone] = useState(false);
  useEffect(() => {
    if (!quickOver) {
      setQuickDone(false);
      return;
    }
    const t = window.setTimeout(() => setQuickDone(true), 1100);
    return () => window.clearTimeout(t);
  }, [quickOver]);
  const bandHold = quickOver && !quickDone;
  const bandWinner: 0 | 1 | null = hud && (hud.finale || bandHold) && (hud.winner === 0 || hud.winner === 1) ? hud.winner : null;
  const stripOn = !demo && !online && !tp && !touch && firstMatch;
  const keyStrip = useKeyStrip(stripOn, hud?.phase, settings.bindings);
  // The 2-player key strips (FdHud draws them) replace the centre Shake pill while they show.
  const tp2Strips = tp && !!hud && !demo && settings.showKeyHints && hud.phase !== 'over' && !keyCard && !hud.paused && !menuOpen && hud.fighters[0].kos + hud.fighters[1].kos < 2;
  // FIGHT! stays 140 ms into the fight to play its exit.
  const [goOut, setGoOut] = useState(false);
  const prevPhase = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevPhase.current === 'countdown' && hud?.phase === 'fight') {
      setGoOut(true);
      const t = window.setTimeout(() => setGoOut(false), 160);
      prevPhase.current = hud.phase;
      return () => window.clearTimeout(t);
    }
    prevPhase.current = hud?.phase;
  }, [hud?.phase]);
  const end = hud?.phase === 'over' && !bandHold ? END_TEXT(hud, demo, copy) : null;
  // The AIM / SHAKE pills step aside while the bottom key strip or hint would run into them (small windows, release QA item 1).
  const cornerRef = useRef<HTMLDivElement>(null);
  // R-030 3 / F-072: on desktop 1P they stack into a right-aligned column first (AIM on top) and hide only if that clashes too.
  const cornerMode = useCornerLayout(
    cornerRef,
    '[data-testid="key-strip"]:not([aria-hidden="true"]), [data-testid="hud-hint"]',
    !tp && !touch,
  );
  const cornerClash = cornerMode === 'hidden';
  // Results: rematch when both players press Shoot, counted only once the result screen is up and its input lock has passed
  // (release QA 2026-11-28 item 3: Shoot mashed through the final KO went straight to the next match).
  // R-030 2 / F-071: in 2P, Shoot+Shoot opens only once REMATCH and its P1 / P2 chips are up (2.2 s, or at once after an
  // Enter / Space skip), never before 0.6 s; mashed and held presses before that are thrown away.
  const [choiceUp, setChoiceUp] = useState(false);
  const resultUp = !!end && !rivalLeft;
  useEffect(() => {
    if (!resultUp) setChoiceUp(false);
  }, [resultUp]);
  const onChoiceUp = useCallback(() => setChoiceUp(true), []);
  const rematchTicks = useBothPress(peek2P, tp && resultUp, () => rematch(), INPUT_AT_MS, choiceUp);

  return (
    <main data-kick-root className="relative h-[100dvh] w-screen touch-none select-none overflow-hidden bg-ink-deep">
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
          {/* The HUD leaves when the match is over (the result screen owns the view; offline the finale holds phase 'fight'). */}
          {hud.phase !== 'over' && (
          <FdHud
            hud={hud}
            arena={arenaId}
            demo={demo}
            tp={tp}
            online={!!online}
            onlineBot={!!onlineBot}
            touch={touch}
            level={level}
            colours={colours}
            card={arenaId === 'office' ? { title: 'FLOOR 42', line: copy.hudRoom } : { title: ARENA_COPY[arenaId].name, line: ARENA_COPY[arenaId].line }}
            tips={copy.tips}
            keyHints={settings.showKeyHints || keyStrip.shown}
            bindings={settings.bindings}
            bindings2p={settings.bindings2p}
            lit={keyStrip.lit}
            large={settings.largeHud}
            menuOpen={menuOpen}
            covered={hud.paused || menuOpen || !!keyCard}
          />
          )}

          {/* READY / FIGHT! land as stamps (R-013 4.5). Offline counts down 2 s: READY from 1.8 s; online keeps 3.6 s: READY from 1.6 s. */}
          {((hud.phase === 'countdown' && hud.time <= (online ? 1.6 : 1.8)) || goOut) && (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 z-[5] flex justify-center">
              {goOut ? (
                <Stamp key="go" size="xl" colour="#ffd23f" rot={4} leaving silent>
                  {copy.countdownGo}
                </Stamp>
              ) : hud.time > 0.8 ? (
                <Stamp key="ready" size="lg" colour="#e6ebf5">
                  {copy.countdownReady}
                </Stamp>
              ) : (
                <Stamp key="go" size="xl" colour="#ffd23f" rot={4}>
                  {copy.countdownGo}
                </Stamp>
              )}
            </div>
          )}
          {/* FIGHT! leaves with the first frame of the fight: the stamp unmounts at phase 'fight'. */}

          <KnockoutBand
            show={bandWinner !== null}
            colour={accent(hud.fighters[hud.winner === 1 ? 1 : 0].character)}
            title={copy.knockoutStamp}
            line={copy.knockoutLine.replace('{NAME}', hud.fighters[hud.winner === 1 ? 1 : 0].name.toUpperCase())}
            delayMs={hud.finale ? 300 : 0}
          />
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

          {(hud.paused || menuOpen) && hud.phase !== 'over' && !rivalLeft && dropLeft === null && !settingsOpen && !howOpen && (
            <PauseScreen
              paused={hud.paused}
              online={!!online}
              fighters={[hud.fighters[0], hud.fighters[1]]}
              onResume={closeMenu}
              onSettings={() => setSettingsOpen(true)}
              onHowTo={() => setHowOpen(true)}
              onQuit={exit}
              pad={padCount > 0}
              initial={pauseFocus.current}
              onFocusItem={(id) => (pauseFocus.current = id)}
              {...(tp ? { onControls: () => setKeyCard('view'), pausedBy } : {})}
            />
          )}
          {howOpen && (hud.paused || menuOpen) && <HowToScreen onClose={() => setHowOpen(false)} touch={touch} kos={hud.kosToWin} traits={!online} />}
          {settingsOpen && (hud.paused || menuOpen) && (
            <SettingsPanel onClose={() => setSettingsOpen(false)} />
          )}

          {glLost && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink-deep/90">
              <div className="panel-cut flex w-[26rem] max-w-[90vw] flex-col items-center gap-4 bg-ink p-7 text-center">
                <div className="font-display text-2xl text-gold">Graphics paused</div>
                <p className="text-sm text-cream/70">Your browser stopped drawing the game. Reload to jump back in. This match will start over.</p>
                <button
                  type="button"
                  autoFocus
                  onClick={() => window.location.reload()}
                  className="panel-cut w-full bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep"
                >
                  Reload
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
                      Waiting for them to come back{PORTAL ? '' : ' with the same link'}
                      {waitRound >= MAX_WAITS ? ' (last wait)' : ''}:{' '}
                      <span className="font-display text-cream">
                        {Math.floor(waitLeft / 60)}:{String(waitLeft % 60).padStart(2, '0')}
                      </span>
                    </p>
                    {!PORTAL && (
                      <button
                        type="button"
                        onClick={copyInvite}
                        className="panel-cut w-full bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep"
                      >
                        {linkCopied ? 'Link copied' : 'Copy the link again'}
                      </button>
                    )}
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
            <>
              <ResultScreen
                mode={demo ? 'demo' : tp ? 'twoPlayer' : online ? 'online' : 'solo'}
                fighters={[hud.fighters[0], hud.fighters[1]]}
                winner={hud.winner}
                colours={tp ? colours : undefined}
                tally={tp ? tally : undefined}
                rematchAsked={rematchAsked}
                rematchTicks={tp ? [rematchTicks[0], rematchTicks[1]] : undefined}
                canNextArena={!online && !isLocalBot}
                nextCharacter={online ? (hud.nextCharacter ?? hud.character) : undefined}
                onRematch={rematch}
                onNextArena={nextArena}
                onChangeFighter={onChangeFighter}
                onMenu={exit}
                keyTrapRef={keyTrapRef}
                onChoiceUp={onChoiceUp}
              />
              <Support variant="results" className="absolute left-6 top-24 z-[31]" />
              {/* Placeholder look (R-032): a human became free while you played the browser bot. Next match only. */}
              {isLocalBot && localBot?.offer && (
                <div className="absolute inset-x-0 top-6 z-[32] flex justify-center" role="status">
                  <div className="panel-cut flex items-center gap-3 bg-ink-deep/90 px-4 py-2 text-cream">
                    <span className="font-bold uppercase tracking-wider">A player is free</span>
                    <button
                      type="button"
                      data-testid="fight-player"
                      disabled={acceptedOffer}
                      onClick={() => {
                        setAcceptedOffer(true);
                        localBotRef.current?.onAccept();
                      }}
                      className="panel-cut bg-gold px-4 py-1 font-bold uppercase tracking-wider text-ink-deep"
                    >
                      {acceptedOffer ? 'Connecting…' : 'Fight them'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {!demo && !tp && touch && hud.phase !== 'over' && !rivalLeft && !menuOpen && !hud.paused && (
            <TouchControls
              press={(b, on) => gameRef.current?.touch(b, on)}
              onPause={openMenu}
              ready={{ dash: hud.fighters[0].dash, push: hud.fighters[0].push }}
              size={settings.touch.size}
              opacity={settings.touch.opacity}
              leftHanded={settings.touch.leftHanded}
              bomb={hud.fighters[0].bombs > 0}
            />
          )}
          <div
            ref={cornerRef}
            data-testid="corner-pills"
            data-hidden={cornerClash || undefined}
            data-layout={cornerMode}
            className={`fd absolute z-[5] flex items-center gap-2 text-[12px] font-bold ${tp ? 'bottom-3 left-1/2 -translate-x-1/2' : touch ? 'right-3 top-20' : 'bottom-3 right-3'}`}
            style={{ color: '#FFF3D6', visibility: cornerClash ? 'hidden' : undefined, ...(cornerMode === 'stack' ? STACK_STYLE : {}) }}
          >
            {!demo && !touch && !tp && (
              <button
                type="button"
                onClick={toggleAim}
                className="rounded-full bg-[rgba(38,18,74,.86)] px-3 py-1 text-[12px] font-extrabold uppercase tracking-wider text-[#FFF3D6] hover:bg-[#5A3596] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_#fff,0_0_0_6px_#3B1F6B]"
                title="Toggle aim mode (T)"
              >
                Aim: {hud.aimMode} <span className="opacity-60">(T)</span>
              </button>
            )}
            {!tp2Strips && (
            <button
              type="button"
              onClick={() => gameRef.current?.toggleMotion()}
              className="rounded-full bg-[rgba(38,18,74,.86)] px-3 py-1 text-[12px] font-extrabold uppercase tracking-wider text-[#FFF3D6] hover:bg-[#5A3596] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_#fff,0_0_0_6px_#3B1F6B]"
              title="Screen shake and flashes"
            >
              Shake: {hud.motion ? 'on' : 'off'}
            </button>
            )}
            {hud.net && <NetBadge net={hud.net} />}
            {hud.muted && <span className="rounded-full bg-[rgba(38,18,74,.86)] px-3 py-1">muted (M)</span>}
            {settings.showFps && <span className="rounded-full bg-[rgba(38,18,74,.86)] px-3 py-1 tabular-nums">{hud.fps} fps</span>}
          </div>
        </>
      )}
      {tp && keyCard && hud && (
        <KeyCard
          bindings={settings.bindings2p}
          fighters={[player, opponent]}
          mode={keyCard}
          peek={peek2P}
          onStart={startFromCard}
          onBack={() => (keyCard === 'start' ? changeFighters() : setKeyCard(null))}
        />
      )}
      {touch && portrait && <RotateHint />}
      {lift && (online || demo) && (
        <LiftLoading
          steps={[
            { label: 'The game', done: true },
            { label: 'Fonts', done: loaded.fonts },
            // Online rooms play OFFSITE now: name the arena actually loading (existing arena copy), not always the office.
            { label: arenaId === 'office' ? 'The office' : titleCase(ARENA_COPY[arenaId].name), done: loaded.office },
            { label: 'First frame', done: hud !== null },
          ]}
          onDone={endLift}
          traits={!online}
        />
      )}
      {lift && !online && !demo && (
        <VsRun
          mode="load"
          info={vsInfo}
          progress={(1 + Number(loaded.fonts) + Number(loaded.office) + Number(hud !== null)) / 4}
          onDone={endLift}
        />
      )}
      {vsRematch && !lift && (
        <VsRun
          mode="rematch"
          info={vsInfo}
          progress={1}
          onShut={() => gameRef.current?.restart()}
          onDone={() => setVsRematch(false)}
        />
      )}
    </main>
  );
};
