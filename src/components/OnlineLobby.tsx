'use client';

import { useEffect, useRef, useState } from 'react';

import { ArenaGame } from '~/components/ArenaGame';
import { useLiftTo } from '~/components/Elevator';
import { InstallHint } from '~/components/InstallHint';
import { FighterBadges } from '~/components/lobby/FighterBadges';
import { FighterInfo } from '~/components/lobby/FighterInfo';
import {
  ActionButton,
  AimControl,
  CodeRow,
  IconBot,
  IconInvite,
  IconQuick,
} from '~/components/lobby/LobbyControls';
import { LobbyHud } from '~/components/lobby/LobbyHud';
import {
  ConnectingPanel,
  ErrorPanel,
  FoundPanel,
  InvitePanel,
  QuickPanel,
} from '~/components/lobby/LobbyPanels';
import { LobbyScene } from '~/components/lobby/LobbyScene';
import {
  backKeyAction,
  escapeAction,
  FRAMING,
  lobbyView,
  readForcedState,
} from '~/components/lobby/lobbyView';
import { accentOf, readCharacter, saveCharacter, usePortraits } from '~/components/MenuShell';
import { menuSound } from '~/components/menu/menuSound';
import { useGamepadNav } from '~/components/menu/useGamepadNav';
import { useMenuTelemetry } from '~/components/useTelemetry';
import { createOnlineSession, gameRegions, joinRoom, regionProbes } from '~/game/net/client';
import { planSearch, runQuickMatch, SearchCancelled } from '~/game/net/matchmaking';
import { PORTAL } from '~/lib/portal';
import { createHostSession } from '~/game/net/host';
import { connectPeer } from '~/game/net/peer';
import { ROSTER } from '~/game/roster';
import { RULES } from '~/game/sim/constants';

import '~/components/lobby/lobby.css';

import type { ForcedState } from '~/components/lobby/lobbyView';
import type { JoinMode, OnlineSession } from '~/game/net/client';
import type { LegKind } from '~/game/net/matchmaking';
import type { Region } from '~/game/net/regions';
import type { BotLevel } from '~/game/sim/bot';
import type { PeerLink } from '~/game/net/peer';
import type { StartMessage } from '~/game/net/protocol';
import type { CharacterId } from '~/game/sim/types';
import type { Room } from '@colyseus/sdk';
import type { CSSProperties } from 'react';

interface ErrorInfo {
  title: string;
  message: string;
  detail?: string;
  joinFailed: boolean;
}

type Stage =
  | { kind: 'menu' }
  | { kind: 'connecting'; join?: string }
  | { kind: 'linking' }
  | { kind: 'waiting'; roomId: string; invite: boolean; leg?: LegKind; region?: Region }
  | {
      kind: 'playing';
      online: { session: OnlineSession; room: Room };
      characters: [CharacterId, CharacterId];
      /** The rival is the server's bot (shown as BOT · LEVEL, never as a human). */
      bot?: BotLevel;
    }
  | ({ kind: 'error' } & ErrorInfo);

type ShownStage = Exclude<Stage, { kind: 'playing' }>;

/** The dev-only `?lobbyState=` switch: the stage (and clock, and network) to show for design review. */
const forcedStage = (f: ForcedState): { stage: ShownStage; elapsed: number; online: boolean } => {
  const sample = 'AbC12';
  switch (f) {
    case 'menu':
      return { stage: { kind: 'menu' }, elapsed: 0, online: true };
    case 'offline':
      return { stage: { kind: 'menu' }, elapsed: 0, online: false };
    case 'connecting':
      return { stage: { kind: 'connecting' }, elapsed: 0, online: true };
    case 'joining':
      return { stage: { kind: 'connecting', join: sample }, elapsed: 0, online: true };
    case 'invite':
      return { stage: { kind: 'waiting', roomId: sample, invite: true }, elapsed: 0, online: true };
    case 'quick':
      return {
        stage: { kind: 'waiting', roomId: sample, invite: false },
        elapsed: 12,
        online: true,
      };
    case 'quick30':
      return {
        stage: { kind: 'waiting', roomId: sample, invite: false },
        elapsed: 34,
        online: true,
      };
    case 'linking':
      return { stage: { kind: 'linking' }, elapsed: 0, online: true };
    case 'error':
      return {
        stage: {
          kind: 'error',
          title: 'Lost the connection',
          message: "Can't reach the game server.",
          detail: 'WebSocket connection failed',
          joinFailed: false,
        },
        elapsed: 0,
        online: true,
      };
    case 'join-error':
      return {
        stage: {
          kind: 'error',
          title: 'That room is gone',
          message: 'That room is full or gone. Ask for a new link.',
          joinFailed: true,
        },
        elapsed: 0,
        online: true,
      };
  }
};

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

/** Seconds since `active` last turned true (0 while inactive). */
const useElapsed = (active: boolean) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const t0 = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => window.clearInterval(id);
  }, [active]);
  return elapsed;
};

/** The search status under "Looking for a rival" (placeholder copy, R-032 asks the Creative Director for the real words). */
const legLine = (leg: LegKind | undefined, multi: boolean) =>
  leg === 'fallback'
    ? 'Nobody near you yet. Trying the next region…'
    : leg === 'bot' && !multi
      ? 'Looking for a player. If nobody comes, a bot joins in a few seconds.'
      : leg === 'bot'
        ? 'Nobody free right now. A bot joins in a few seconds.'
        : 'Looking for a player near you…';

export const OnlineLobby = ({ roomId, region: inviteRegion }: { roomId?: string; region?: string }) => {
  const [character, setCharacter] = useState<CharacterId>('hotfix');
  const [characterReady, setCharacterReady] = useState(false);
  // Opened from an invite link: the first thing on screen is "Joining room", not a flash of the menu.
  const [stage, setStage] = useState<Stage>(
    roomId ? { kind: 'connecting', join: roomId } : { kind: 'menu' },
  );
  const [copied, setCopied] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [forced, setForced] = useState<ForcedState | null>(null);
  useEffect(() => {
    setCanShare(typeof navigator.share === 'function');
    setForced(readForcedState(window.location.search));
  }, []);
  const roomRef = useRef<Room | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [infoFits, setInfoFits] = useState(true);
  const portraits = usePortraits();
  useMenuTelemetry(!!portraits);
  const lift = useLiftTo();
  useGamepadNav();
  const browserOnline = useOnline();

  useEffect(() => {
    const saved = readCharacter();
    if (saved) setCharacter(saved);
    setCharacterReady(true);
  }, []);

  const sessionRef = useRef<OnlineSession | null>(null);
  const linkRef = useRef<PeerLink | null>(null);
  /** Bumped by every new attempt and by Cancel: callbacks of an older attempt ignore what they hear. */
  const runRef = useRef(0);
  const lastMode = useRef<JoinMode | null>(null);
  // Leave the room only when the page goes away.
  useEffect(
    () => () => {
      runRef.current += 1;
      sessionRef.current?.dispose();
      linkRef.current?.close();
      void roomRef.current?.leave();
    },
    [],
  );

  const pick = (id: CharacterId) => {
    setCharacter(id);
    saveCharacter(id);
  };

  /**
   * Wire one room to the lobby. `matched` resolves when the room has a match (a human: `peer` / `start`; the bot:
   * `start`) and rejects if the room closes first. Messages of a room the lobby has moved on from are ignored.
   */
  const attach = (room: Room, mode: JoinMode, region: Region, live: () => boolean) => {
    let session: OnlineSession | null = null;
    const mine = () => live() && roomRef.current === room;
    let found!: () => void;
    let lost!: (e: Error) => void;
    const matched = new Promise<void>((res, rej) => {
      found = res;
      lost = rej;
    });
    matched.catch(() => {});
    room.onMessage('waiting', (msg: { roomId: string }) => {
      if (mine() && mode.kind !== 'quick') setStage({ kind: 'waiting', roomId: msg.roomId, invite: mode.kind === 'private', region });
    });
    // Both players are in: try a direct line between the two browsers before the match starts.
    room.onMessage('peer', (msg: { slot: number }) => {
      if (!mine()) return;
      found();
      setStage({ kind: 'linking' });
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
      setStage({
        kind: 'playing',
        online: { session, room },
        characters: msg.characters,
        ...(msg.bot && msg.bot.slot !== msg.slot ? { bot: msg.bot.level } : {}),
      });
    });
    // The rival left before the match started (the direct-line handshake): back to searching, or waiting for the friend.
    room.onMessage('left', () => {
      if (session || !mine()) return;
      linkRef.current?.close();
      linkRef.current = null;
      if (mode.kind === 'quick') {
        roomRef.current = null;
        void room.leave();
        void go({ kind: 'quick' });
      } else setStage({ kind: 'waiting', roomId: room.roomId, invite: true, region });
    });
    room.onLeave((code: number) => {
      lost(new Error(`left ${code}`));
      // 4409: the bot took the seat while this join was on its way; the search starts again (catch below).
      if (!session && mine() && code !== 4409) {
        setStage({
          kind: 'error',
          title: 'Lost the connection',
          message: 'Lost the connection to the game server.',
          joinFailed: false,
        });
      }
    });
    return { matched };
  };

  const go = async (mode: JoinMode) => {
    if (forced) return;
    const run = ++runRef.current;
    const live = () => runRef.current === run;
    lastMode.current = mode;
    setStage({ kind: 'connecting', join: mode.kind === 'join' ? mode.roomId : undefined });
    try {
      if (mode.kind === 'quick') {
        // Own region, then the nearest other one, then the server bot (matchmaking.ts). Never more than ~9 s.
        const regions = gameRegions();
        const legs = planSearch(regions, await regionProbes(regions));
        const matchedOf = new WeakMap<Room, Promise<void>>();
        await runQuickMatch<Room>(legs, {
          now: () => performance.now(),
          sleep: (ms) => new Promise((r) => window.setTimeout(r, ms)),
          cancelled: () => !live(),
          onLeg: (leg) => {
            if (live()) setStage((st) => ({ kind: 'waiting', roomId: st.kind === 'waiting' ? st.roomId : '', invite: false, leg: leg.kind, region: leg.region }));
          },
          join: async (region, botAfterMs) => {
            const { room } = await joinRoom(mode, character, region, botAfterMs);
            if (!live()) {
              void room.leave();
              throw new SearchCancelled();
            }
            roomRef.current = room;
            matchedOf.set(room, attach(room, mode, region, live).matched);
            if (live()) setStage((st) => (st.kind === 'waiting' ? { ...st, roomId: room.roomId } : st));
            return room;
          },
          matched: (room) => matchedOf.get(room)!,
          leave: (room) => {
            if (roomRef.current === room) roomRef.current = null;
            void room.leave();
          },
        });
        return;
      }
      const { room, region } = await joinRoom(mode, character);
      if (!live()) {
        // Cancelled while connecting: don't stay in a room nobody is looking at.
        void room.leave();
        return;
      }
      roomRef.current = room;
      attach(room, mode, region, live);
    } catch (e) {
      if (!live() || e instanceof SearchCancelled) return;
      if (mode.kind === 'quick' && e instanceof Error && e.message === 'left 4409') {
        void go(mode);
        return;
      }
      const detail = e instanceof Error ? e.message : String(e);
      setStage(
        mode.kind === 'join'
          ? {
              kind: 'error',
              title: 'That room is gone',
              message: 'That room is full or gone. Ask for a new link.',
              joinFailed: true,
            }
          : {
              kind: 'error',
              title: 'Lost the connection',
              message: "Can't reach the game server.",
              detail,
              joinFailed: false,
            },
      );
    }
  };

  /** Leave the search or room and go back to the menu. */
  const cancel = () => {
    if (forced) return;
    runRef.current += 1;
    linkRef.current?.close();
    linkRef.current = null;
    const room = roomRef.current;
    roomRef.current = null;
    void room?.leave();
    setStage({ kind: 'menu' });
  };

  // Opened from an invite link: join straight away.
  const joined = useRef(false);
  useEffect(() => {
    if (roomId && !joined.current && forced === null) {
      joined.current = true;
      void go({ kind: 'join', roomId, region: inviteRegion });
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const shown: ShownStage = stage.kind === 'playing' ? { kind: 'menu' } : stage;
  const force = process.env.NODE_ENV !== 'production' && forced ? forcedStage(forced) : null;
  const view_stage = force ? force.stage : shown;
  const isQuick = view_stage.kind === 'waiting' && !view_stage.invite;
  const realElapsed = useElapsed(isQuick && !force);
  const elapsed = force ? force.elapsed : realElapsed;
  const online = force ? force.online : browserOnline;
  const view = lobbyView({
    stage: view_stage.kind,
    invite: view_stage.kind === 'waiting' ? view_stage.invite : undefined,
    joining: view_stage.kind === 'connecting' ? view_stage.join : undefined,
    joinFailed: view_stage.kind === 'error' ? view_stage.joinFailed : undefined,
    elapsed,
    online,
    kos: RULES.kosToWin,
  });
  const inMenu = view_stage.kind === 'menu';

  // Home through the lift doors, once (a second Esc or click while the doors close does nothing).
  const leaving = useRef(false);
  const goHome = () => {
    if (leaving.current) return;
    leaving.current = true;
    lift.go('/');
  };
  // The Back key: leave a search or room first, then go home.
  const goBack = () => {
    const action = backKeyAction(view.panel);
    if (action === 'none') return;
    if (action === 'cancel-home') cancel();
    goHome();
  };

  // Keys 1-4 pick a fighter; Esc goes home when idle and leaves a search or an open room otherwise.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
        return;
      if (e.key === 'Escape' && !e.repeat) {
        const action = escapeAction(view.panel);
        if (action === 'none') return;
        e.preventDefault();
        menuSound.back();
        if (action === 'cancel') cancel();
        else goHome();
        return;
      }
      const n = ['1', '2', '3', '4'].indexOf(e.key);
      if (n >= 0 && inMenu) {
        const id = ROSTER[n].id;
        if (id !== character) {
          menuSound.confirm();
          pick(id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Phone portrait panel states: the panel docks to the bottom; the scrim starts 80 px above it, and the
  // fighter info shows above it only if it fits under the fighter's feet (the fighter always wins).
  const panelKind = view.panel;
  useEffect(() => {
    const root = rootRef.current;
    const right = rightRef.current;
    if (!root || !right) return;
    const measure = () => {
      const portrait =
        window.matchMedia('(max-width: 1023px), (max-aspect-ratio: 1/1)').matches &&
        !window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
      if (!portrait || panelKind === 'menu') {
        root.style.removeProperty('--lb-scrim-top');
        setInfoFits(true);
        return;
      }
      const top = window.innerHeight - 24 - right.offsetHeight;
      root.style.setProperty('--lb-scrim-top', `${Math.max(0, top - 80)}px`);
      setInfoFits(panelKind !== 'invite' && top >= FRAMING.portrait.y * window.innerHeight + 118);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(right);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [panelKind]);

  // Dev review only: a forced error shows the cutout tipping over (it has to be standing first).
  const [tipped, setTipped] = useState(false);
  useEffect(() => {
    if (forced !== 'error') return;
    const t = window.setTimeout(() => setTipped(true), 1200);
    return () => window.clearTimeout(t);
  }, [forced]);
  const spot = forced === 'error' && !tipped ? 'searching' : view.spot;

  // The rival is found: a rising chime.
  const wasFound = useRef(false);
  useEffect(() => {
    if (view.rivalFound && !wasFound.current) menuSound.confirm();
    wasFound.current = view.rivalFound;
  }, [view.rivalFound]);

  if (stage.kind === 'playing') {
    const { online: net, characters, bot } = stage;
    return (
      <ArenaGame
        player={characters[net.session.slot]}
        opponent={characters[1 - net.session.slot]}
        online={net}
        onlineBot={bot}
      />
    );
  }

  const waitingRoom = view_stage.kind === 'waiting' ? view_stage.roomId : '';
  // With more than one region the link names the room's region (a room id alone does not say where it lives).
  const inviteRegion_ = view_stage.kind === 'waiting' && gameRegions().length > 1 ? view_stage.region?.id : undefined;
  const inviteLink =
    view_stage.kind === 'waiting'
      ? `${window.location.origin}/play?room=${waitingRoom}${inviteRegion_ ? `&r=${inviteRegion_}` : ''}`
      : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      menuSound.confirm();
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* no clipboard: the link is selectable in the field */
    }
  };
  const share = () =>
    void navigator
      .share?.({ title: 'Pewfield', text: 'Fight me in Pewfield', url: inviteLink })
      .catch(() => {});
  const botHref = `/arena?p1=${character}&bot=normal`;
  const entry = ROSTER.find((r) => r.id === character)!;

  return (
    <main
      ref={rootRef}
      className="lb-root"
      data-mode={inMenu ? 'menu' : 'panel'}
      style={{ '--a': accentOf(character) } as CSSProperties}
    >
      {characterReady && (
        <LobbyScene
          character={character}
          spot={spot}
          portrait={portraits ? portraits[character] : null}
        />
      )}
      <div className="lb-scrim-top" aria-hidden />
      <div className="lb-scrim-left" aria-hidden />
      <div className="lb-scrim-bottom" aria-hidden />

      <div
        className="lb-ui"
        data-mode={inMenu ? 'menu' : 'panel'}
        data-info={infoFits ? 'show' : 'hide'}
      >
        <LobbyHud
          name={entry.name}
          character={character}
          view={view}
          onHome={goHome}
          onBack={goBack}
        />
        <div className="lb-left">
          <FighterInfo id={character} />
        </div>
        <div className="lb-badges-wrap">
          <FighterBadges value={character} onPick={pick} portraits={portraits} disabled={!inMenu} />
        </div>

        <div ref={rightRef} className="lb-right">
          {view_stage.kind === 'menu' && (
            <>
              <AimControl />
              {!PORTAL && (
              <ActionButton
                level="primary"
                icon={<IconInvite size={28} />}
                title="Invite a friend"
                sub="Get a link and a code to send"
                onClick={() => void go({ kind: 'private' })}
                disabled={view.offline}
                describedBy="lb-offline-reason"
                delay={0.05}
              />
              )}
              {view.offline && (
                <p id="lb-offline-reason" className="lb-reason">
                  You&apos;re offline. The bot is still here.
                </p>
              )}
              <div className="lb-pair" data-hidden={codeOpen}>
                <ActionButton
                  level={PORTAL ? 'primary' : 'secondary'}
                  icon={<IconQuick />}
                  title="Quick match"
                  sub="Fight whoever is waiting"
                  onClick={() => void go({ kind: 'quick' })}
                  disabled={view.offline}
                  describedBy="lb-offline-reason"
                  delay={0.1}
                />
                <ActionButton
                  level="secondary"
                  icon={<IconBot />}
                  title="Play vs bot"
                  sub="Start right now"
                  href={botHref}
                  delay={0.15}
                />
              </div>
              {!PORTAL && (
                <>
              {/* For the installed app (no address bar) or a code read out loud: paste the link here. */}
              <CodeRow
                onJoin={(id) => void go({ kind: 'join', roomId: id })}
                onOpenChange={setCodeOpen}
              />
                </>
              )}
              {!PORTAL && <InstallHint />}
            </>
          )}

          {view_stage.kind === 'connecting' && (
            <ConnectingPanel joining={!!view_stage.join} onCancel={cancel} />
          )}
          {view_stage.kind === 'linking' && <FoundPanel />}
          {view_stage.kind === 'waiting' && view_stage.invite && (
            <InvitePanel
              roomId={waitingRoom}
              link={inviteLink}
              copied={copied}
              canShare={canShare}
              botHref={botHref}
              onCopy={copy}
              onShare={share}
              onCancel={cancel}
            />
          )}
          {view_stage.kind === 'waiting' && !view_stage.invite && (
            <QuickPanel
              elapsed={elapsed}
              status={legLine(view_stage.leg, gameRegions().length > 1)}
              botHref={botHref}
              onInvite={
                PORTAL
                  ? undefined
                  : () => {
                      cancel();
                      void go({ kind: 'private' });
                    }
              }
              onCancel={cancel}
            />
          )}
          {view_stage.kind === 'error' && (
            <ErrorPanel
              title={view_stage.title}
              message={view_stage.message}
              detail={view_stage.detail}
              botHref={botHref}
              onRetry={() => void go(lastMode.current ?? { kind: 'quick' })}
              onBack={() => setStage({ kind: 'menu' })}
            />
          )}
        </div>
      </div>
      {lift.doors}
    </main>
  );
};
