'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { readAim, saveAim } from '~/components/AimChoice';
import { ArenaGame } from '~/components/ArenaGame';
import { readCharacter, saveCharacter } from '~/components/MenuShell';
import { useGamepadNav } from '~/components/menu/useGamepadNav';
import { LobbyScreen } from '~/components/online/LobbyScreen';
import { classifyError, HANDOFF_MS, ONLINE_COPY } from '~/components/online/onlineCopy';
import { useMenuTelemetry } from '~/components/useTelemetry';
import { useVsInline, useVsTo, vsTags } from '~/components/VsDoors';
import { isTouchDevice } from '~/game/input';
import { createOnlineSession, gameRegions, joinRoom, regionProbes } from '~/game/net/client';
import { createHostSession } from '~/game/net/host';
import { BOT_MODE, MATCH_TIMING, planSearch, runQuickMatch, SearchCancelled } from '~/game/net/matchmaking';
import { connectPeer } from '~/game/net/peer';
import { parseRoomInput } from '~/game/net/roomCode';
import { ROSTER } from '~/game/roster';
import { RULES } from '~/game/sim/constants';
import { PORTAL } from '~/lib/portal';

import type { LobbyHandlers, LobbyUi } from '~/components/online/LobbyScreen';
import type { ErrorKind } from '~/components/online/onlineCopy';
import type { VsInfo } from '~/components/VsDoors';
import type { AimMode } from '~/game/input';
import type { JoinMode, OnlineSession } from '~/game/net/client';
import type { LegKind } from '~/game/net/matchmaking';
import type { PeerLink } from '~/game/net/peer';
import type { StartMessage } from '~/game/net/protocol';
import type { Region } from '~/game/net/regions';
import type { BotLevel } from '~/game/sim/bot';
import type { ArenaId } from '~/game/sim/constants';
import type { CharacterId } from '~/game/sim/types';
import type { Room } from '@colyseus/sdk';

/**
 * The online lobby (`/play`): the connection state machine. The look is `online/LobbyScreen` (R-032, Field Day); the hand-off to a
 * match goes through the VS doors (found / bot frame held 900 ms, 1600 ms when the server did not answer, then the doors close and
 * the arena mounts in place behind them).
 */
type Stage =
  | { kind: 'menu' }
  | { kind: 'code' }
  | { kind: 'joining'; code: string }
  | { kind: 'connecting'; at: number; multi: boolean }
  | { kind: 'search'; at: number; leg: LegKind; regions: { home?: string; next?: string } }
  | { kind: 'invite'; roomId: string; region?: Region; at: number }
  | { kind: 'found'; at: number; rival: CharacterId | null; region?: string; multi: boolean; friend: boolean; title: string; startedAt: number }
  | { kind: 'bot'; at: number; startedAt: number; opponent: CharacterId; level: BotLevel; offline: boolean; standby: boolean }
  | {
      kind: 'playing';
      online: { session: OnlineSession; room: Room };
      characters: [CharacterId, CharacterId];
      /** The rival is the server's bot (shown as BOT · LEVEL, never as a human). */
      bot?: BotLevel;
      onlineKind: 'quick' | 'invite';
    }
  /** No human in time: a match against the bot in this browser, on standby in the quick-match room (if any). */
  | { kind: 'localBot'; opponent: CharacterId; level: BotLevel; run: number }
  | { kind: 'error'; errKind: ErrorKind; detail?: string };

/** The browser bot's level in online quick match (the server bot's default too). */
const LOCAL_BOT_LEVEL: BotLevel = 'normal';
const ONLINE_ARENA: ArenaId = 'offsite';

/** The browser's own network, nothing more: it says nothing about whether the game server is up. */
const useOnline = () => {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
};

/** A clock that re-renders every 250 ms while `on` (the search / invite / bot timers). */
const useTick = (on: boolean) => {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => bump((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, [on]);
};

// ---- dev review: `?lobbyState=` shows one frame without a server (never in production) ----
const FORCED = [
  'menu',
  'offline',
  'code',
  'joining',
  'connecting',
  'waking',
  'search-one',
  'search-home',
  'search-next',
  'search-bot',
  'found',
  'bot',
  'bot-offline',
  'invite',
  'error-server',
  'error-lost',
  'error-room',
  'error-full',
  'error-version',
] as const;
type Forced = (typeof FORCED)[number];
const readForced = (): Forced | null => {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('lobbyState');
  return (FORCED as readonly string[]).includes(v ?? '') ? (v as Forced) : null;
};
const forcedUi = (f: Forced): LobbyUi => {
  const r = { home: 'fra', next: 'iad' };
  switch (f) {
    case 'menu':
      return { k: 'menu', offline: false, portal: PORTAL };
    case 'offline':
      return { k: 'menu', offline: true, portal: PORTAL };
    case 'code':
      return { k: 'code' };
    case 'joining':
      return { k: 'joining', code: 'K7P2Q' };
    case 'connecting':
      return { k: 'connecting', elapsedMs: 600, multi: false };
    case 'waking':
      return { k: 'connecting', elapsedMs: 2300, multi: false };
    case 'search-one':
      return { k: 'search', leg: 'bot', regions: { home: 'fra' }, elapsed: 2, fuse: 2 / 8.5 };
    case 'search-home':
      return { k: 'search', leg: 'home', regions: r, elapsed: 2, fuse: 2 / 8.5 };
    case 'search-next':
      return { k: 'search', leg: 'fallback', regions: r, elapsed: 5, fuse: 5 / 8.5 };
    case 'search-bot':
      return { k: 'search', leg: 'bot', regions: r, elapsed: 8, fuse: 1 };
    case 'found':
      return { k: 'found', rival: 'standup', region: 'fra', multi: true, elapsed: 3, friend: false, title: ONLINE_COPY.connecting.title };
    case 'bot':
      return { k: 'bot', rival: 'standup', level: 'normal', offline: false, standby: true, elapsed: 9 };
    case 'bot-offline':
      return { k: 'bot', rival: 'standup', level: 'normal', offline: true, standby: false, elapsed: 4 };
    case 'invite':
      return { k: 'invite', code: 'K7P2Q', link: 'https://pewfield.nalbakigames.com/play?room=K7P2Q', copied: false, canShare: true, waited: 41, portal: false };
    default:
      return { k: 'error', kind: f.slice(6) as ErrorKind, detail: 'WebSocket connection failed' };
  }
};

export const OnlineLobby = ({ roomId, region: inviteRegion }: { roomId?: string; region?: string }) => {
  const router = useRouter();
  const [character, setCharacter] = useState<CharacterId>('hotfix');
  const [aim, setAim] = useState<AimMode>('auto');
  const [touch, setTouch] = useState(false);
  // Opened from an invite link: the first thing on screen is "Joining…", not a flash of the menu.
  const [stage, setStage] = useState<Stage>(roomId ? { kind: 'joining', code: roomId } : { kind: 'menu' });
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [forced, setForced] = useState<Forced | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setCanShare(typeof navigator.share === 'function');
    setForced(readForced());
    const saved = readCharacter();
    if (saved) setCharacter(saved);
    setAim(readAim());
    setTouch(isTouchDevice());
    setReady(true);
  }, []);
  useMenuTelemetry(ready);
  useGamepadNav();
  const browserOnline = useOnline();
  const vsInline = useVsInline();
  const vsTo = useVsTo();

  const roomRef = useRef<Room | null>(null);
  const sessionRef = useRef<OnlineSession | null>(null);
  const stageRef = useRef(stage);
  stageRef.current = stage;
  /** Standby: a human is free for the next match (server `offer`). */
  const [offer, setOffer] = useState(false);
  const linkRef = useRef<PeerLink | null>(null);
  /** Bumped by every new attempt and by Cancel: callbacks of an older attempt ignore what they hear. */
  const runRef = useRef(0);
  const lastMode = useRef<JoinMode | null>(null);
  const handoffTimer = useRef<number | undefined>(undefined);
  // Leave the room only when the page goes away. Deferred one task: React's development StrictMode unmounts and mounts
  // again at once, and leaving then cancelled an invite-link join that had just started (the guest never got in).
  const pendingLeave = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(pendingLeave.current);
    return () => {
      pendingLeave.current = window.setTimeout(() => {
        runRef.current += 1;
        window.clearTimeout(handoffTimer.current);
        sessionRef.current?.dispose();
        linkRef.current?.close();
        void roomRef.current?.leave();
      }, 0);
    };
  }, []);

  const pick = (id: CharacterId) => {
    setCharacter(id);
    saveCharacter(id);
  };

  /** The doors close over the lobby, then `then` mounts the match behind them (its VsRun carries on). */
  const doors = (rival: CharacterId, tags: [string, string], then: () => void) => {
    const info: VsInfo = { p1: character, p2: rival, tag1: tags[0], tag2: tags[1], kosToWin: RULES.kosToWin, arena: ONLINE_ARENA };
    vsInline.go(info, then);
  };
  /** Hold the found / bot frame until `ms` after it appeared, then the doors. */
  const holdThen = (shownAt: number, ms: number, fn: () => void) => {
    window.clearTimeout(handoffTimer.current);
    handoffTimer.current = window.setTimeout(fn, Math.max(0, ms - (performance.now() - shownAt)));
  };

  const startLocalBot = (run: number, offline: boolean, startedAt: number) => {
    const pool = ROSTER.map((r) => r.id).filter((id) => id !== character);
    const opponent = pool[Math.floor(Math.random() * pool.length)] ?? 'legacy';
    const at = performance.now();
    setOffer(false);
    setStage({ kind: 'bot', at, startedAt, opponent, level: LOCAL_BOT_LEVEL, offline, standby: !offline && !!roomRef.current });
    holdThen(at, offline ? HANDOFF_MS.botOffline : HANDOFF_MS.bot, () => {
      if (runRef.current !== run) return;
      doors(opponent, vsTags('1p', LOCAL_BOT_LEVEL), () => {
        if (runRef.current === run) setStage({ kind: 'localBot', opponent, level: LOCAL_BOT_LEVEL, run });
      });
    });
  };

  /**
   * Wire one room to the lobby. `matched` resolves when the room has a match (a human: `peer` / `start`; the bot:
   * `start`) and rejects if the room closes first. Messages of a room the lobby has moved on from are ignored.
   */
  const attach = (room: Room, mode: JoinMode, region: Region, live: () => boolean, startedAt: number) => {
    let session: OnlineSession | null = null;
    const mine = () => live() && roomRef.current === room;
    let found!: () => void;
    let lost!: (e: Error) => void;
    const matched = new Promise<void>((res, rej) => {
      found = res;
      lost = rej;
    });
    matched.catch(() => {});
    const onlineKind = mode.kind === 'quick' ? 'quick' : 'invite';
    const friend = mode.kind !== 'quick';
    const title = mode.kind === 'private' ? ONLINE_COPY.invite.title : mode.kind === 'join' ? ONLINE_COPY.menu.title : ONLINE_COPY.connecting.title;
    room.onMessage('offer', (msg: { on: boolean }) => {
      if (mine()) setOffer(!!msg?.on);
    });
    room.onMessage('stateOk', () => {});
    room.onMessage('waiting', (msg: { roomId: string }) => {
      if (mine() && mode.kind === 'private') setStage({ kind: 'invite', roomId: msg.roomId, region, at: performance.now() });
    });
    // Both players are in: show who (RIVAL FOUND!) and try a direct line between the two browsers before the match starts.
    room.onMessage('peer', (msg: { slot: number; characters?: [CharacterId, CharacterId] }) => {
      if (!mine()) return;
      found();
      const rival = msg.characters?.[1 - msg.slot] ?? null;
      const multi = gameRegions().length > 1;
      setStage({ kind: 'found', at: performance.now(), rival, region: region.id, multi, friend, title, startedAt });
      void connectPeer(room, msg.slot === 0).then((link) => {
        linkRef.current = link;
        room.send('direct', { ok: !!link });
      });
    });
    room.onMessage('start', (msg: StartMessage) => {
      if (session || !mine()) return; // later starts (rematches) are handled inside the arena
      found();
      const link = linkRef.current;
      if (msg.direct && link) {
        // Direct: the inviter's browser runs the game, the other predicts against it.
        session = msg.slot === 0 ? createHostSession(room, link, msg) : createOnlineSession(room, msg, link);
      } else {
        link?.close();
        linkRef.current = null;
        session = createOnlineSession(room, msg);
      }
      sessionRef.current = session;
      const s = session;
      const rival = msg.characters[1 - msg.slot];
      const bot = msg.bot && msg.bot.slot !== msg.slot ? msg.bot.level : undefined;
      const playing = () =>
        setStage({ kind: 'playing', online: { session: s, room }, characters: msg.characters, onlineKind, ...(bot ? { bot } : {}) });
      const run = runRef.current;
      const toDoors = () => doors(rival, bot ? vsTags('1p', bot) : vsTags('online'), () => runRef.current === run && playing());
      const st = stageRef.current;
      if (bot) {
        // Server bot (NEXT_PUBLIC_SERVER_BOT=1): the same honest frame as the browser bot.
        const at = performance.now();
        setStage({ kind: 'bot', at, startedAt, opponent: rival, level: bot, offline: false, standby: false });
        holdThen(at, HANDOFF_MS.bot, toDoors);
      } else if (st.kind === 'found') {
        setStage({ ...st, rival });
        holdThen(st.at, HANDOFF_MS.found, toDoors);
      } else {
        const at = performance.now();
        setStage({ kind: 'found', at, rival, region: region.id, multi: gameRegions().length > 1, friend, title, startedAt });
        holdThen(at, HANDOFF_MS.found, toDoors);
      }
    });
    // The rival left before the match started (the direct-line handshake): back to searching, or waiting for the friend.
    room.onMessage('left', () => {
      if (session || !mine()) return;
      window.clearTimeout(handoffTimer.current);
      linkRef.current?.close();
      linkRef.current = null;
      setOffer(false);
      // Playing the browser bot on standby: the other player left; stay in the room, the bot match goes on.
      if (stageRef.current.kind === 'localBot' || stageRef.current.kind === 'bot') return;
      if (mode.kind === 'quick') {
        roomRef.current = null;
        void room.leave();
        void go({ kind: 'quick' });
      } else if (mode.kind === 'private') setStage({ kind: 'invite', roomId: room.roomId, region, at: performance.now() });
    });
    room.onLeave((code: number) => {
      lost(new Error(`left ${code}`));
      const k = stageRef.current.kind;
      // During a browser-bot match the standby room is optional: losing it just ends the standby.
      if ((k === 'localBot' || k === 'bot') && mine()) {
        roomRef.current = null;
        setOffer(false);
        return;
      }
      // 4409: the bot took the seat while this join was on its way; the search starts again (catch in go).
      if (!session && mine() && code !== 4409) {
        window.clearTimeout(handoffTimer.current);
        roomRef.current = null;
        setStage({ kind: 'error', errKind: 'lost', detail: `left ${code}` });
      }
    });
    return { matched };
  };

  const go = async (mode: JoinMode) => {
    if (forced) return;
    const run = ++runRef.current;
    const live = () => runRef.current === run;
    lastMode.current = mode;
    window.clearTimeout(handoffTimer.current);
    const pressedAt = performance.now();
    const multi = gameRegions().length > 1;
    if (mode.kind === 'join') setStage({ kind: 'joining', code: mode.roomId });
    else setStage({ kind: 'connecting', at: pressedAt, multi });
    try {
      if (mode.kind === 'quick') {
        // Own region, then the nearest other one, then the bot (matchmaking.ts). Never more than ~9 s.
        const regions = gameRegions();
        const legs = planSearch(regions, await regionProbes(regions));
        const regionIds = { home: legs[0]?.region.id, next: legs.find((l) => l.kind === 'fallback')?.region.id };
        let leg: LegKind = legs[0]?.kind ?? 'bot';
        const matchedOf = new WeakMap<Room, Promise<void>>();
        const res = await runQuickMatch<Room>(legs, {
          now: () => performance.now(),
          startedAt: pressedAt,
          sleep: (ms) => new Promise((r) => window.setTimeout(r, ms)),
          cancelled: () => !live(),
          onLeg: (l) => {
            leg = l.kind;
            if (live()) setStage((st) => (st.kind === 'search' ? { ...st, leg } : st));
          },
          join: async (region, botAfterMs) => {
            const { room } = await joinRoom(mode, character, region, botAfterMs);
            if (!live()) {
              void room.leave();
              throw new SearchCancelled();
            }
            roomRef.current = room;
            matchedOf.set(room, attach(room, mode, region, live, pressedAt).matched);
            // The first room joined ends the warm-up: the search frame takes over.
            if (live()) setStage((st) => (st.kind === 'connecting' || st.kind === 'search' ? { kind: 'search', at: pressedAt, leg, regions: regionIds } : st));
            return room;
          },
          matched: (room) => matchedOf.get(room)!,
          leave: (room) => {
            if (roomRef.current === room) roomRef.current = null;
            void room.leave();
          },
        });
        if (res.botTime && live()) {
          // Nobody in time. Tell the room we are busy (a human who arrives now waits for our next match); if the server
          // says a human match is already starting, take it instead.
          const room = res.room;
          const human = matchedOf.get(room)!.then(
            () => 'human' as const,
            () => 'gone' as const,
          );
          let off = () => {};
          const busy = new Promise<'busy' | 'human'>((res2) => {
            off = room.onMessage('stateOk', (m: { ok: boolean }) => res2(m?.ok ? 'busy' : 'human'));
          });
          room.send('state', { busy: true });
          const r = await Promise.race([human, busy, new Promise<'busy'>((r2) => window.setTimeout(() => r2('busy'), 1500))]);
          off();
          if (!live() || r === 'human') return;
          startLocalBot(run, false, pressedAt);
        }
        return;
      }
      const { room, region } = await joinRoom(mode, character);
      if (!live()) {
        // Cancelled while connecting: don't stay in a room nobody is looking at.
        void room.leave();
        return;
      }
      roomRef.current = room;
      attach(room, mode, region, live, pressedAt);
    } catch (e) {
      if (!live() || e instanceof SearchCancelled) return;
      if (mode.kind === 'quick' && e instanceof Error && e.message === 'left 4409') {
        void go(mode);
        return;
      }
      const kind = classifyError(mode.kind, e);
      // Browser bot: no server reachable is no reason to leave the player with nothing, but it must SAY so (F-078):
      // the bot-offline frame, held 1600 ms. A version mismatch is not "the server is down": it asks for a reload.
      if (mode.kind === 'quick' && BOT_MODE === 'client' && kind === 'server') {
        roomRef.current = null;
        startLocalBot(run, true, pressedAt);
        return;
      }
      setStage({ kind: 'error', errKind: kind, detail: e instanceof Error ? e.message : String(e) });
    }
  };

  /** Leave the search or room and go back to the menu. */
  const cancel = useCallback(() => {
    if (forced) return;
    runRef.current += 1;
    window.clearTimeout(handoffTimer.current);
    linkRef.current?.close();
    linkRef.current = null;
    sessionRef.current?.dispose();
    sessionRef.current = null;
    const room = roomRef.current;
    roomRef.current = null;
    void room?.leave();
    setOffer(false);
    setStage({ kind: 'menu' });
  }, [forced]);

  // Opened from an invite link: join straight away (old ids are kept as they are, codes are case-free).
  const joined = useRef(false);
  useEffect(() => {
    if (roomId && !joined.current && ready && forced === null) {
      joined.current = true;
      const parsed = parseRoomInput(roomId);
      if (parsed) void go({ kind: 'join', roomId: parsed.roomId, region: inviteRegion ?? parsed.region });
      else setStage({ kind: 'error', errKind: 'room' });
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const ticking = stage.kind === 'connecting' || stage.kind === 'search' || stage.kind === 'invite' || stage.kind === 'found' || stage.kind === 'bot';
  useTick(ticking && !forced);

  const playOfflineBot = () => {
    const pool = ROSTER.map((r) => r.id).filter((id) => id !== character);
    const p2 = pool[Math.floor(Math.random() * pool.length)] ?? 'legacy';
    cancel();
    const [tag1, tag2] = vsTags('1p', 'normal');
    vsTo.go(`/arena?p1=${character}&p2=${p2}&bot=normal`, { p1: character, p2, tag1, tag2, kosToWin: RULES.kosToWin });
  };

  const waitingRoom = stage.kind === 'invite' ? stage.roomId : '';
  // With more than one region the link names the room's region (a room id alone does not say where it lives).
  const inviteRegionId = stage.kind === 'invite' && gameRegions().length > 1 ? stage.region?.id : undefined;
  const inviteLink =
    stage.kind === 'invite' && typeof window !== 'undefined'
      ? `${window.location.origin}/play?room=${waitingRoom}${inviteRegionId ? `&r=${inviteRegionId}` : ''}`
      : '';

  const h: LobbyHandlers = {
    onBack: () => router.push('/'),
    onQuick: () => void go({ kind: 'quick' }),
    onInvite: () => void go({ kind: 'private' }),
    onOpenCode: () => {
      cancel();
      setStage({ kind: 'code' });
    },
    onCloseCode: () => setStage({ kind: 'menu' }),
    onJoinCode: (text) => {
      const p = parseRoomInput(text);
      if (p) void go({ kind: 'join', roomId: p.roomId, region: p.region });
      else setStage({ kind: 'error', errKind: 'room' });
    },
    onCancel: cancel,
    onPick: pick,
    onAim: (m) => {
      setAim(m);
      saveAim(m);
    },
    onCopy: () => {
      void navigator.clipboard
        ?.writeText(inviteLink)
        .then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        })
        .catch(() => {});
    },
    onShare: () => void navigator.share?.({ title: 'Pewfield', text: ONLINE_COPY.invite.shareText, url: inviteLink }).catch(() => {}),
    onBotWhileWaiting: playOfflineBot,
    onRetry: () => void go(lastMode.current ?? { kind: 'quick' }),
    onPlayBot: playOfflineBot,
    onReload: () => window.location.reload(),
  };

  if (stage.kind === 'localBot') {
    return (
      <>
        <ArenaGame
          key={stage.run}
          player={character}
          opponent={stage.opponent}
          arena={ONLINE_ARENA}
          onlineBot={stage.level}
          localBot={{
            offer,
            onAvailable: (available) => roomRef.current?.send('state', { busy: !available }),
            onAccept: () => roomRef.current?.send('state', { accept: true }),
            onExit: cancel,
            onSearch: () => {
              cancel();
              void go({ kind: 'quick' });
            },
          }}
        />
        {vsInline.doors}
      </>
    );
  }

  if (stage.kind === 'playing') {
    const { online: net, characters, bot, onlineKind } = stage;
    return (
      <>
        <ArenaGame
          player={characters[net.session.slot]}
          opponent={characters[1 - net.session.slot]}
          online={net}
          onlineBot={bot}
          onlineKind={onlineKind}
          onOnlineExit={(next) => {
            cancel();
            if (next === 'quick') void go({ kind: 'quick' });
            else if (next === 'invite') void go({ kind: 'private' });
          }}
        />
        {vsInline.doors}
      </>
    );
  }

  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  const ui: LobbyUi = forced
    ? forcedUi(forced)
    : stage.kind === 'menu'
      ? { k: 'menu', offline: !browserOnline, portal: PORTAL }
      : stage.kind === 'code'
        ? { k: 'code' }
        : stage.kind === 'joining'
          ? { k: 'joining', code: stage.code }
          : stage.kind === 'connecting'
            ? { k: 'connecting', elapsedMs: now - stage.at, multi: stage.multi }
            : stage.kind === 'search'
              ? { k: 'search', leg: stage.leg, regions: stage.regions, elapsed: (now - stage.at) / 1000, fuse: (now - stage.at) / MATCH_TIMING.BOT_DUE_MS }
              : stage.kind === 'found'
                ? { k: 'found', rival: stage.rival, region: stage.region, multi: stage.multi, elapsed: (now - stage.startedAt) / 1000, friend: stage.friend, title: stage.title }
                : stage.kind === 'bot'
                  ? { k: 'bot', rival: stage.opponent, level: stage.level, offline: stage.offline, standby: stage.standby, elapsed: (now - stage.startedAt) / 1000 }
                  : stage.kind === 'invite'
                    ? { k: 'invite', code: stage.roomId, link: inviteLink, copied, canShare, waited: (now - stage.at) / 1000, portal: PORTAL }
                    : { k: 'error', kind: stage.errKind, detail: stage.detail };

  return (
    <>
      {ready && <LobbyScreen ui={ui} me={character} aim={aim} touch={touch} h={h} />}
      {vsInline.doors}
      {vsTo.doors}
    </>
  );
};
