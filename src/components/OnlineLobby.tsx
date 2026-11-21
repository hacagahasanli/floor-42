'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { AimChoice } from '~/components/AimChoice';
import { ArenaGame } from '~/components/ArenaGame';
import { InstallHint } from '~/components/InstallHint';
import { accentOf, FighterCards, FighterHero, MenuShell, readCharacter, saveCharacter, Steps, usePortraits } from '~/components/MenuShell';
import { AudiencePrompt } from '~/components/menu/AudiencePrompt';
import { menuSound } from '~/components/menu/menuSound';
import { useCopy } from '~/components/menu/useCopy';
import { useMenuTelemetry } from '~/components/useTelemetry';
import { createOnlineSession, joinRoom } from '~/game/net/client';
import { createHostSession } from '~/game/net/host';
import { connectPeer } from '~/game/net/peer';
import { ROSTER } from '~/game/roster';
import { CHARACTERS } from '~/game/sim/constants';

import type { JoinMode, OnlineSession } from '~/game/net/client';
import type { PeerLink } from '~/game/net/peer';
import type { StartMessage } from '~/game/net/protocol';
import type { CharacterId } from '~/game/sim/types';
import type { Room } from '@colyseus/sdk';
import type { ReactNode } from 'react';

type Stage =
  | { kind: 'menu' }
  | { kind: 'connecting' }
  | { kind: 'linking' }
  | { kind: 'waiting'; roomId: string; invite: boolean }
  | { kind: 'playing'; online: { session: OnlineSession; room: Room }; characters: [CharacterId, CharacterId] }
  | { kind: 'error'; message: string };


/** The lobby's moving backdrop: the office carpet grid rolling in, and light streaks closing in from both sides. */
const LobbyBackdrop = ({ accent }: { accent: string }) => (
  <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
    <div className="absolute inset-x-[-20%] bottom-0 h-[55%] origin-bottom [transform:perspective(500px)_rotateX(62deg)] [mask-image:linear-gradient(to_top,black_10%,transparent_85%)]">
      <div className="f42-grid-floor h-full w-full" />
    </div>
    <div className="absolute inset-x-0 top-[38%] h-24 overflow-hidden">
      <span className="f42-streak-l absolute left-0 top-4 h-[3px] w-1/3 opacity-60" style={{ background: `linear-gradient(90deg, transparent, ${accent}, #fff)` }} />
      <span className="f42-streak-r absolute right-0 top-14 h-[3px] w-1/3 opacity-60 bg-[linear-gradient(270deg,transparent,#ff3b4e,#fff)]" />
    </div>
  </div>
);

/** A pulsing status dot: a solid centre and a ring that keeps pinging outwards. */
const Pulse = ({ color }: { color: string }) => (
  <span className="relative inline-flex h-2.5 w-2.5">
    <span className={`f42-ping absolute inset-0 rounded-full ${color}`} />
    <span className={`relative h-2.5 w-2.5 rounded-full ${color}`} />
  </span>
);

type RivalState = 'open' | 'connecting' | 'waiting' | 'found';

/** You on the left, the rival slot on the right, VS between: the lobby reads as a fight about to happen. */
const Versus = ({ me, portraits, rival }: { me: CharacterId; portraits: Record<CharacterId, string> | null; rival: RivalState }) => {
  const e = ROSTER.find((r) => r.id === me)!;
  const rivalText: Record<RivalState, [string, string]> = {
    open: ['Your rival', 'Invite a friend or take a quick match'],
    connecting: ['Connecting', 'Reaching the game server'],
    waiting: ['Waiting for rival', 'The match starts the moment they join'],
    found: ['Rival found', 'Connecting the two of you'],
  };
  const [title, sub] = rivalText[rival];
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 sm:gap-3">
      <div className="panel-cut relative flex h-32 items-end overflow-hidden border border-cream/10 bg-ink/80 p-3 [animation:slideInLeft_0.35s_ease-out] sm:h-36">
        <div className="absolute inset-0 opacity-50" style={{ background: `radial-gradient(circle at 70% 40%, ${e.accent}, transparent 65%)` }} />
        {portraits && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={portraits[me]} alt="" className="absolute -right-1 top-1 h-[92%] w-auto object-contain" />
        )}
        <div className="relative flex flex-col">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-green">
            <Pulse color="bg-green" /> Ready
          </span>
          <span className="font-display text-lg leading-none sm:text-xl" style={{ color: e.accent }}>
            {e.name.toUpperCase()}
          </span>
          <span className="text-xs text-cream/60">You</span>
        </div>
      </div>
      <span className="f42-vs self-center font-display text-3xl text-[#ff3b4e] sm:text-4xl">VS</span>
      <div
        key={rival}
        className={`panel-cut relative flex h-32 items-end overflow-hidden border p-3 sm:h-36 ${
          rival === 'found' ? 'f42-found border-gold bg-gold/15' : 'border-dashed border-cream/20 bg-ink/60'
        }`}
      >
        {/* A radar sweep while the slot is empty. */}
        {rival !== 'found' && (
          <span aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full border border-cream/10">
            <span className="f42-sweep absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,rgba(255,59,78,0.35),transparent_25%)]" />
          </span>
        )}
        <span aria-hidden className="absolute right-6 top-4 font-display text-5xl text-cream/10">?</span>
        <div className="relative flex flex-col" aria-live="polite">
          <span className={`flex items-center gap-1.5 text-xs font-semibold ${rival === 'found' ? 'text-gold' : 'text-cream/60'}`}>
            {rival === 'found' ? <Pulse color="bg-gold" /> : rival === 'open' ? <span className="h-2.5 w-2.5 rounded-full border border-cream/40" /> : <Pulse color="bg-[#ff3b4e]" />}
            {title}
          </span>
          <span className="text-xs leading-snug text-cream/55">{sub}</span>
        </div>
      </div>
    </div>
  );
};

/** One big action tile: icon, title, one line on what happens. Ticks on focus, confirms on click. */
const Action = ({
  icon,
  title,
  sub,
  primary,
  onClick,
  href,
  delay,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  primary?: boolean;
  onClick?: () => void;
  href?: string;
  delay: number;
}) => {
  const cls = `panel-cut focus-ring group relative flex items-center gap-3 overflow-hidden px-4 py-3.5 text-left transition duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 [animation:riseIn_0.4s_ease-out_both] [@media(max-height:500px)]:py-2.5 ${
    primary ? 'bg-gold text-ink-deep shadow-[0_0_40px_rgba(255,210,63,0.3)] hover:brightness-110' : 'border border-cream/10 bg-ink/80 text-cream backdrop-blur hover:border-cream/30 hover:bg-ink'
  }`;
  const body = (
    <>
      {/* A light sweep across the tile on hover. */}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/25 opacity-0 transition-all duration-500 group-hover:left-[120%] group-hover:opacity-100" />
      <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center text-xl ${primary ? 'bg-ink-deep/15' : 'bg-cream/10'}`}>
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-display text-base leading-tight sm:text-lg">{title}</span>
        <span className={`text-xs leading-snug ${primary ? 'text-ink-deep/75' : 'text-cream/60'}`}>{sub}</span>
      </span>
      <span aria-hidden className="ml-auto font-display text-lg transition group-hover:translate-x-1">→</span>
    </>
  );
  const common = {
    className: cls,
    style: { animationDelay: `${delay}s` },
    onMouseEnter: () => menuSound.tick(),
    onFocus: () => menuSound.tick(),
  };
  return href ? (
    <Link href={href} {...common} onClick={() => menuSound.confirm()}>
      {body}
    </Link>
  ) : (
    <button
      type="button"
      {...common}
      onClick={() => {
        menuSound.confirm();
        onClick?.();
      }}
    >
      {body}
    </button>
  );
};

export const OnlineLobby = ({ roomId }: { roomId?: string }) => {
  const [character, setCharacter] = useState<CharacterId>('hotfix');
  const [stage, setStage] = useState<Stage>({ kind: 'menu' });
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState('');
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === 'function'), []);
  const roomRef = useRef<Room | null>(null);
  const portraits = usePortraits();
  useMenuTelemetry(!!portraits);
  const words = useCopy();

  useEffect(() => {
    const saved = readCharacter();
    if (saved) setCharacter(saved);
  }, []);

  const sessionRef = useRef<OnlineSession | null>(null);
  const linkRef = useRef<PeerLink | null>(null);
  // Leave the room only when the page goes away.
  useEffect(
    () => () => {
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

  const go = async (mode: JoinMode) => {
    setStage({ kind: 'connecting' });
    try {
      const room = await joinRoom(mode, character);
      roomRef.current = room;
      let session: OnlineSession | null = null;
      room.onMessage('waiting', (msg: { roomId: string }) =>
        setStage({ kind: 'waiting', roomId: msg.roomId, invite: mode.kind === 'private' }),
      );
      // Both players are in: try a direct line between the two browsers before the match starts.
      room.onMessage('peer', (msg: { slot: number }) => {
        setStage({ kind: 'linking' });
        void connectPeer(room, msg.slot === 0).then((link) => {
          linkRef.current = link;
          room.send('direct', { ok: !!link });
        });
      });
      room.onMessage('start', (msg: StartMessage) => {
        if (session) return; // later starts (rematches) are handled inside the arena
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
        setStage({ kind: 'playing', online: { session, room }, characters: msg.characters });
      });
      room.onLeave(() => {
        if (!session) setStage({ kind: 'error', message: 'Lost the connection to the game server.' });
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setStage({
        kind: 'error',
        message: mode.kind === 'join' ? 'That room is full or gone. Ask for a new link.' : `Can't reach the game server. ${message}`,
      });
    }
  };

  // Opened from an invite link: join straight away.
  const joined = useRef(false);
  useEffect(() => {
    if (roomId && !joined.current && stage.kind === 'menu') {
      joined.current = true;
      void go({ kind: 'join', roomId });
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (stage.kind === 'playing') {
    const { online, characters } = stage;
    return (
      <ArenaGame player={characters[online.session.slot]} opponent={characters[1 - online.session.slot]} online={online} />
    );
  }

  const inviteLink = stage.kind === 'waiting' ? `${window.location.origin}/play?room=${stage.roomId}` : '';
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
  const share = () => void navigator.share?.({ title: 'Floor 42', text: 'Fight me on floor 42', url: inviteLink }).catch(() => {});
  const rival: RivalState =
    stage.kind === 'connecting' ? 'connecting' : stage.kind === 'linking' ? 'found' : stage.kind === 'waiting' ? 'waiting' : 'open';

  const statusText =
    stage.kind === 'waiting' ? 'WAITING FOR RIVAL' : stage.kind === 'connecting' || stage.kind === 'linking' ? 'CONNECTING' : 'ONLINE · 1 V 1';

  return (
    <MenuShell
      accent={accentOf(character)}
      status={
        <span className="flex items-center gap-2 rounded-full border border-cream/15 bg-ink-deep/70 px-3 py-1 backdrop-blur">
          {stage.kind === 'error' ? <span className="h-2.5 w-2.5 rounded-full bg-orange" /> : <Pulse color={stage.kind === 'waiting' ? 'bg-gold' : 'bg-green'} />} {statusText}
        </span>
      }
      backdrop={<LobbyBackdrop accent={accentOf(character)} />}
    >
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] [@media(max-height:500px)]:grid-cols-2 [@media(max-height:500px)]:gap-4">
        <FighterHero id={character} label="You fight as" />

        <div className="flex flex-col gap-4">
          {stage.kind !== 'error' && stage.kind !== 'menu' && <Versus me={character} portraits={portraits} rival={rival} />}

          {stage.kind === 'menu' && (
            <>
              <div className="flex items-end justify-between gap-3">
                <h2 className="font-display text-2xl [@media(max-height:500px)]:text-lg">
                  Play <span className="text-gold">online</span>
                </h2>
                <span className="text-right text-xs text-cream/50">{words.goal}</span>
              </div>
              <FighterCards value={character} onPick={pick} portraits={portraits} />
              <AimChoice />
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="sm:col-span-2 grid">
                  <Action icon="✉" title="Invite a friend" sub="A private room: you get a link and a code to send" primary onClick={() => go({ kind: 'private' })} delay={0.05} />
                </div>
                <Action icon="⚡" title="Quick match" sub="Face whoever else is waiting" onClick={() => go({ kind: 'quick' })} delay={0.1} />
                <Action icon="🤖" title="Play vs bot" sub="No wait: start right now" href={`/arena?p1=${character}&bot=normal`} delay={0.15} />
              </div>
              {/* For the installed app (no address bar) or a code read out loud: paste the link here. */}
              <form
                className="panel-cut flex w-full flex-wrap items-center gap-2 border border-cream/10 bg-ink/80 p-2 backdrop-blur"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = pasted.trim();
                  const id = (() => {
                    try {
                      return new URL(text).searchParams.get('room') ?? '';
                    } catch {
                      return text;
                    }
                  })();
                  if (id) {
                    menuSound.confirm();
                    void go({ kind: 'join', roomId: id });
                  }
                }}
              >
                <label htmlFor="f42-join" className="w-full px-2 pt-1 font-display text-sm text-cream/80 sm:w-auto sm:pt-0">
                  Got a code?
                </label>
                <input
                  id="f42-join"
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder="Paste the invite link or room code"
                  aria-label="Invite link or room code"
                  className="panel-cut min-w-0 flex-1 bg-ink-deep px-3 py-2 text-sm text-cream placeholder:text-cream/40"
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                <button type="submit" disabled={!pasted.trim()} className="panel-cut bg-cream/10 px-4 py-2 text-sm font-bold uppercase transition enabled:hover:bg-gold enabled:hover:text-ink-deep disabled:opacity-40">
                  Join
                </button>
              </form>
              <InstallHint />
            </>
          )}

          {(stage.kind === 'connecting' || stage.kind === 'linking') && (
            <div className="panel-cut flex flex-1 flex-col items-center justify-center gap-4 border border-cream/10 bg-ink/80 p-8 text-center backdrop-blur [animation:riseIn_0.3s_ease-out]">
              <span className="relative grid h-14 w-14 place-items-center">
                <span className="f42-ping absolute inset-0 rounded-full border-2 border-gold/60" />
                <span className="h-12 w-12 animate-spin rounded-full border-4 border-cream/15 border-t-gold motion-reduce:animate-none" />
              </span>
              <p className="text-cream/80">
                {stage.kind === 'connecting' ? 'Connecting to the game server…' : 'Your rival is here. Connecting the two of you directly…'}
              </p>
            </div>
          )}

          {stage.kind === 'waiting' && (
            <div className="panel-cut flex flex-1 flex-col justify-center gap-4 border border-cream/10 bg-ink/80 p-6 backdrop-blur [animation:riseIn_0.3s_ease-out]">
              {stage.invite ? (
                <>
                  <h2 className="font-display text-2xl">
                    Send the <span className="text-gold">link</span>
                  </h2>
                  <p className="text-cream/80">The match starts the moment your rival opens it.</p>
                  {/* The room code, big enough to read out loud. */}
                  <div className="panel-cut flex flex-wrap items-center justify-between gap-3 border border-gold/40 bg-ink-deep/80 px-4 py-3">
                    <span className="flex flex-col">
                      <span className="text-xs text-cream/60">Room code</span>
                      {/* Codes are case-sensitive: a monospace face that keeps the case, not the all-caps display font. */}
                      <span className="select-all font-mono text-3xl font-bold leading-none tracking-wider text-gold sm:text-4xl">{stage.roomId}</span>
                    </span>
                    <span className="flex items-center gap-2 text-sm text-cream/70">
                      <Pulse color="bg-gold" /> Room open
                    </span>
                  </div>
                  <input
                    readOnly
                    value={inviteLink}
                    className="panel-cut min-w-0 bg-ink-deep px-3 py-2.5 text-sm text-cream/80"
                    onFocus={(e) => e.target.select()}
                    aria-label="Invite link"
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={copy}
                      className={`panel-cut focus-ring flex items-center justify-center gap-2 px-5 py-4 font-display text-lg transition ${copied ? 'bg-green text-ink-deep' : 'bg-gold text-ink-deep shadow-[0_0_30px_rgba(255,210,63,0.3)] hover:brightness-110'}`}
                    >
                      {copied ? '✓ Link copied' : 'Copy invite link'}
                    </button>
                    {canShare && (
                      <button type="button" onClick={share} className="panel-cut focus-ring bg-cream/10 px-5 py-4 font-display text-lg hover:bg-cream/20">
                        Share…
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <h2 className="font-display text-2xl">
                    Quick <span className="text-gold">match</span>
                  </h2>
                  <p className="flex items-center gap-2 text-cream/80">
                    <Pulse color="bg-gold" /> Looking for someone to fight…
                  </p>
                </>
              )}
              {/* Leaving this page leaves the room, so nobody joins an empty match. */}
              <Link href={`/arena?p1=${character}&bot=normal`} className="text-sm text-cream/70 underline underline-offset-4 hover:text-cream">
                Nobody yet? Play the bot instead
              </Link>
            </div>
          )}

          {stage.kind === 'error' && (
            <div className="panel-cut flex flex-1 flex-col items-start justify-center gap-4 bg-ink/80 p-6 backdrop-blur">
              <p className="text-orange">{stage.message}</p>
              <button type="button" onClick={() => setStage({ kind: 'menu' })} className="panel-cut bg-cream/10 px-5 py-2 font-bold uppercase hover:bg-cream/20">
                Back
              </button>
            </div>
          )}
        </div>
      </section>
      <Steps />
      <AudiencePrompt />
    </MenuShell>
  );
};
