'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ArenaGame } from '~/components/ArenaGame';
import { InstallHint } from '~/components/InstallHint';
import { createOnlineSession, joinRoom } from '~/game/net/client';
import { ROSTER } from '~/game/roster';

import type { JoinMode, OnlineSession } from '~/game/net/client';
import type { StartMessage } from '~/game/net/protocol';
import type { CharacterId } from '~/game/sim/types';
import type { Room } from '@colyseus/sdk';

type Stage =
  | { kind: 'menu' }
  | { kind: 'connecting' }
  | { kind: 'waiting'; roomId: string; invite: boolean }
  | { kind: 'playing'; online: { session: OnlineSession; room: Room }; characters: [CharacterId, CharacterId] }
  | { kind: 'error'; message: string };

const CHAR_KEY = 'merge-conflict:character';

export const OnlineLobby = ({ roomId }: { roomId?: string }) => {
  const [character, setCharacter] = useState<CharacterId>('hotfix');
  const [stage, setStage] = useState<Stage>({ kind: 'menu' });
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState('');
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CHAR_KEY);
      if (saved && ROSTER.some((r) => r.id === saved)) setCharacter(saved as CharacterId);
    } catch {
      /* no storage: keep the default */
    }
  }, []);

  const sessionRef = useRef<OnlineSession | null>(null);
  // Leave the room only when the page goes away.
  useEffect(
    () => () => {
      sessionRef.current?.dispose();
      void roomRef.current?.leave();
    },
    [],
  );

  const pick = (id: CharacterId) => {
    setCharacter(id);
    try {
      window.localStorage.setItem(CHAR_KEY, id);
    } catch {
      /* ignore */
    }
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
      room.onMessage('start', (msg: StartMessage) => {
        if (session) return; // later starts (rematches) are handled inside the arena
        session = createOnlineSession(room, msg);
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

  return (
    <main className="grid-bg flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-10 text-center">
      <Link href="/" className="text-xs text-cream/50 hover:text-cream">
        ← Floor 42
      </Link>
      <h1 className="font-display text-4xl sm:text-5xl">
        Play <span className="text-gold">online</span>
      </h1>

      {stage.kind === 'menu' && (
        <>
          <div className="flex flex-wrap justify-center gap-2">
            {ROSTER.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => pick(r.id)}
                className={`panel-cut border-2 px-4 py-2 font-display text-lg ${character === r.id ? 'border-gold bg-ink' : 'border-cream/10 bg-ink/60 hover:border-cream/30'}`}
                style={{ color: r.accent }}
              >
                {r.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => go({ kind: 'private' })}
              className="panel-cut bg-gold px-7 py-3 font-bold uppercase tracking-wider text-ink-deep hover:brightness-110"
            >
              Invite a friend
            </button>
            <button
              type="button"
              onClick={() => go({ kind: 'quick' })}
              className="panel-cut bg-cream/10 px-7 py-3 font-bold uppercase tracking-wider hover:bg-cream/20"
            >
              Quick match
            </button>
            <Link
              href={`/arena?p1=${character}&bot=normal`}
              className="panel-cut bg-cream/10 px-7 py-3 font-bold uppercase tracking-wider hover:bg-cream/20"
            >
              Play vs bot
            </Link>
          </div>
          <p className="max-w-sm text-sm text-cream/60">
            Invite a friend makes a private room and gives you a link. Quick match puts you with whoever else is waiting.
            Nobody around? Play the bot.
          </p>
          {/* For the installed app (no address bar) or a code read out loud: paste the link here. */}
          <form
            className="flex w-full max-w-sm items-center gap-2"
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

      {stage.kind === 'connecting' && <p className="text-cream/70">Connecting to the game server…</p>}

      {stage.kind === 'waiting' && (
        <div className="panel-cut flex max-w-lg flex-col items-center gap-4 bg-ink p-6">
          {stage.invite ? (
            <>
              <p className="text-cream/80">Send this link to your rival. The match starts when they open it.</p>
              <div className="flex w-full items-center gap-2">
                <input
                  readOnly
                  value={inviteLink}
                  className="panel-cut min-w-0 flex-1 bg-ink-deep px-3 py-2 text-sm text-cream"
                  onFocus={(e) => e.target.select()}
                  aria-label="Invite link"
                />
                <button type="button" onClick={copy} className="panel-cut bg-gold px-4 py-2 font-bold uppercase text-ink-deep">
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </>
          ) : (
            <p className="text-cream/80">Waiting for someone to join the quick match…</p>
          )}
          <span className="animate-pulse text-xs tracking-widest text-cream/50">WAITING FOR RIVAL</span>
          {/* Leaving this page leaves the room, so nobody joins an empty match. */}
          <Link href={`/arena?p1=${character}&bot=normal`} className="text-sm text-cream/70 underline underline-offset-4 hover:text-cream">
            Nobody yet? Play the bot instead
          </Link>
        </div>
      )}

      {stage.kind === 'error' && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-orange">{stage.message}</p>
          <button type="button" onClick={() => setStage({ kind: 'menu' })} className="panel-cut bg-cream/10 px-5 py-2 font-bold uppercase">
            Back
          </button>
        </div>
      )}
    </main>
  );
};
