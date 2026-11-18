'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { AimChoice } from '~/components/AimChoice';
import { ArenaGame } from '~/components/ArenaGame';
import { InstallHint } from '~/components/InstallHint';
import { accentOf, FighterCards, FighterHero, MenuShell, readCharacter, saveCharacter, Steps, usePortraits } from '~/components/MenuShell';
import { createOnlineSession, joinRoom } from '~/game/net/client';
import { createHostSession } from '~/game/net/host';
import { connectPeer } from '~/game/net/peer';
import { CHARACTERS, RULES } from '~/game/sim/constants';

import type { JoinMode, OnlineSession } from '~/game/net/client';
import type { PeerLink } from '~/game/net/peer';
import type { StartMessage } from '~/game/net/protocol';
import type { CharacterId } from '~/game/sim/types';
import type { Room } from '@colyseus/sdk';

type Stage =
  | { kind: 'menu' }
  | { kind: 'connecting' }
  | { kind: 'linking' }
  | { kind: 'waiting'; roomId: string; invite: boolean }
  | { kind: 'playing'; online: { session: OnlineSession; room: Room }; characters: [CharacterId, CharacterId] }
  | { kind: 'error'; message: string };

export const OnlineLobby = ({ roomId }: { roomId?: string }) => {
  const [character, setCharacter] = useState<CharacterId>('hotfix');
  const [stage, setStage] = useState<Stage>({ kind: 'menu' });
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState('');
  const roomRef = useRef<Room | null>(null);
  const portraits = usePortraits();

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
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const statusText =
    stage.kind === 'waiting' ? 'WAITING FOR RIVAL' : stage.kind === 'connecting' || stage.kind === 'linking' ? 'CONNECTING' : 'ONLINE · 1 V 1';

  return (
    <MenuShell
      accent={accentOf(character)}
      status={
        <>
          <span className={`h-2 w-2 rounded-full ${stage.kind === 'error' ? 'bg-orange' : 'animate-pulse bg-green'}`} /> {statusText}
        </>
      }
    >
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] [@media(max-height:500px)]:grid-cols-2 [@media(max-height:500px)]:gap-4">
        <FighterHero id={character} label="You fight as" />

        <div className="flex flex-col gap-4">
          {stage.kind === 'menu' && (
            <>
              <div className="flex items-end justify-between gap-3">
                <h2 className="font-display text-2xl [@media(max-height:500px)]:text-lg">
                  Play <span className="text-gold">online</span>
                </h2>
                <span className="text-right text-xs text-cream/50">First to {RULES.kosToWin} KOs takes the merge</span>
              </div>
              <FighterCards value={character} onPick={pick} portraits={portraits} />
              <AimChoice />
              <div className="grid gap-2 sm:grid-cols-[1.3fr_1fr_1fr]">
                <button
                  type="button"
                  onClick={() => go({ kind: 'private' })}
                  className="panel-cut group flex items-center justify-center gap-2 bg-gold px-5 py-4 font-display text-lg uppercase [@media(max-height:500px)]:py-3 [@media(max-height:500px)]:text-sm text-ink-deep shadow-[0_0_40px_rgba(255,210,63,0.3)] transition hover:brightness-110"
                >
                  Invite a friend <span className="transition group-hover:translate-x-1">→</span>
                </button>
                <button
                  type="button"
                  onClick={() => go({ kind: 'quick' })}
                  className="panel-cut bg-cream/10 px-5 py-4 font-bold uppercase tracking-wider hover:bg-cream/20 [@media(max-height:500px)]:py-3 [@media(max-height:500px)]:text-sm"
                >
                  Quick match
                </button>
                <Link
                  href={`/arena?p1=${character}&bot=normal`}
                  className="panel-cut flex items-center justify-center bg-cream/10 px-5 py-4 font-bold uppercase tracking-wider hover:bg-cream/20 [@media(max-height:500px)]:py-3 [@media(max-height:500px)]:text-sm"
                >
                  Play vs bot
                </Link>
              </div>
              <p className="text-sm text-cream/60">
                Invite a friend makes a private room and gives you a link. Quick match puts you with whoever else is waiting.
                Nobody around? Play the bot.
              </p>
              {/* For the installed app (no address bar) or a code read out loud: paste the link here. */}
              <form
                className="panel-cut flex w-full items-center gap-2 bg-ink/80 p-2 backdrop-blur"
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
                  if (id) void go({ kind: 'join', roomId: id });
                }}
              >
                <input
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder="Have a link? Paste it here"
                  aria-label="Invite link or room code"
                  className="panel-cut min-w-0 flex-1 bg-ink-deep px-3 py-2 text-sm text-cream placeholder:text-cream/40"
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                <button type="submit" disabled={!pasted.trim()} className="panel-cut bg-cream/10 px-4 py-2 text-sm font-bold uppercase disabled:opacity-40">
                  Join
                </button>
              </form>
              <InstallHint />
            </>
          )}

          {(stage.kind === 'connecting' || stage.kind === 'linking') && (
            <div className="panel-cut flex flex-1 flex-col items-center justify-center gap-4 bg-ink/80 p-8 text-center backdrop-blur">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-cream/15 border-t-gold" />
              <p className="text-cream/80">
                {stage.kind === 'connecting' ? 'Connecting to the game server…' : 'Your rival is here. Connecting the two of you directly…'}
              </p>
            </div>
          )}

          {stage.kind === 'waiting' && (
            <div className="panel-cut flex flex-1 flex-col justify-center gap-4 bg-ink/80 p-6 backdrop-blur">
              {stage.invite ? (
                <>
                  <h2 className="font-display text-2xl">
                    Send the <span className="text-gold">link</span>
                  </h2>
                  <p className="text-cream/80">Send this link to your rival. The match starts when they open it.</p>
                  <div className="flex w-full items-center gap-2">
                    <input
                      readOnly
                      value={inviteLink}
                      className="panel-cut min-w-0 flex-1 bg-ink-deep px-3 py-3 text-sm text-cream"
                      onFocus={(e) => e.target.select()}
                      aria-label="Invite link"
                    />
                    <button type="button" onClick={copy} className="panel-cut bg-gold px-5 py-3 font-bold uppercase text-ink-deep">
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="font-display text-2xl">
                    Quick <span className="text-gold">match</span>
                  </h2>
                  <p className="text-cream/80">Waiting for someone to join the quick match…</p>
                </>
              )}
              {/* The empty rival slot, so the wait reads as a lobby. */}
              <div className="grid grid-cols-2 gap-2">
                <div className="panel-cut flex items-center gap-2 bg-gold/15 px-3 py-2 text-sm">
                  <span className="h-2 w-2 rounded-full bg-gold" />
                  you · <span style={{ color: accentOf(character) }}>{CHARACTERS[character].name}</span>
                </div>
                <div className="panel-cut flex items-center gap-2 bg-cream/5 px-3 py-2 text-sm text-cream/50">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-cream/40" /> waiting for rival…
                </div>
              </div>
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
    </MenuShell>
  );
};
