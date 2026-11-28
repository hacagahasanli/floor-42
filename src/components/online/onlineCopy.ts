/**
 * Every player-facing string of the online screens (Creative Director, R-032: docs/collab/CREATIVE/ui/direction-b/online/spec.md
 * sections 3-6, verbatim) and the pure builders that pick them per state. No React, no DOM: tested in onlineCopy.test.ts.
 */
import { MATCH_TIMING } from '~/game/net/matchmaking';

import type { LegKind } from '~/game/net/matchmaking';

/** `0:09` in the copy is the bot moment, from MATCH_TIMING (never hard-coded). */
export const botClock = (dueMs: number = MATCH_TIMING.BOT_DUE_MS) => `0:${String(Math.ceil(dueMs / 1000)).padStart(2, '0')}`;

/** m:ss. */
export const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const REGION_NAMES: Record<string, string> = { fra: 'EUROPE', iad: 'US EAST', sin: 'ASIA', syd: 'AUSTRALIA', gru: 'SOUTH AMERICA' };
/** `fra` -> `EUROPE`; an unknown id -> the id upper-cased. */
export const regionName = (id: string | undefined) => (id ? (REGION_NAMES[id] ?? id.toUpperCase()) : '');
const REGION_PLACES: Record<string, string> = { fra: 'Europe', iad: 'US East', sin: 'Asia', syd: 'Australia', gru: 'South America' };
/** The region in a sentence (`A player from Europe…`); an unknown id upper-cased. */
const regionPlace = (id: string) => REGION_PLACES[id] ?? id.toUpperCase();

export const ONLINE_COPY = {
  menu: {
    title: 'PLAY ONLINE',
    back: 'BACK',
    quick: 'QUICK MATCH',
    promise: ['A player near you. Nobody free? A ', 'BOT', ' steps in.'] as const,
    offlinePromise: "You're offline. Bot matches on the home screen still work.",
    invite: 'INVITE A FRIEND',
    inviteSub: 'Send a link. No bot, ever.',
    join: 'JOIN WITH A CODE',
    joinSub: 'Got a code or link from a friend?',
    aim: 'AIM',
    aimAuto: 'AUTO-AIM',
    aimMouse: 'MOUSE',
    rivalName: 'RIVAL',
    rivalRole: "WHO'S NEXT?",
    hints: { fighter: 'Fighter', quick: 'Quick match', back: 'Back' },
  },
  code: {
    ribbon: 'JOIN WITH A CODE',
    line: 'Type the code or paste the link your friend sent.',
    placeholder: 'Code or link',
    join: 'JOIN',
    close: 'CLOSE',
    friendName: 'FRIEND',
    friendRole: 'WAITING FOR A CODE',
    hints: { join: 'Join', close: 'Close' },
    joiningRibbon: 'JOINING…',
    joiningLine: "Getting you into your friend's room.",
  },
  connecting: {
    title: 'QUICK MATCH',
    ribbon: 'WARMING UP',
    lineMulti: 'Finding the fastest server for you.',
    lineOne: 'Reaching the game server.',
    slowLine: 'Waking up the game server.',
    slowSmall: "It naps when nobody's playing. A few seconds, tops.",
    cancel: 'CANCEL',
    rivalRole: 'SEARCHING SOON',
  },
  search: {
    ribbon: 'FINDING A RIVAL',
    near: 'NEAR YOU',
    next: 'NEXT REGION',
    bot: 'BOT BACKUP',
    fuseNote: 'Bar full = the BOT steps in.',
    rivalRole: 'SEARCHING…',
    botIncoming: 'BOT INCOMING',
  },
  found: {
    ribbon: 'RIVAL FOUND!',
    matched: 'Matched. Doors close in a moment.',
    rivalTag: 'RIVAL',
  },
  bot: {
    ribbon: 'A BOT STEPS IN',
    line: "Nobody free yet, so you're playing a BOT.",
    standby: 'It runs on your device: zero lag. We keep looking, and if a player frees up we offer them after this match.',
    offlineLine: "Online isn't answering, so it's you vs a BOT.",
    offlineSmall: 'Nothing here goes online. Try QUICK MATCH again after this match.',
    role: 'PLAYED BY A BOT',
  },
  invite: {
    title: 'INVITE A FRIEND',
    cancel: 'CANCEL',
    ribbon: 'YOUR ROOM IS OPEN',
    line: 'Send this to your friend. The match starts the moment they open it.',
    codeLabel: 'ROOM CODE',
    // Spec: `Read it out` / `with the capitals`. R-033 made codes case-free, so the second line would be false: dropped
    // (the spec says to delete the capitals line when case-free codes land); flagged back to the Creative Director.
    readOut: 'Read it out',
    copy: 'COPY LINK',
    copied: 'COPIED!',
    copiedSr: 'Link copied',
    share: 'SHARE',
    shareText: 'Fight me in PEWFIELD',
    botWait: 'BOT WHILE YOU WAIT',
    friendName: 'FRIEND',
    friendRole: 'NOT HERE YET',
    waiting: (s: number) => `WAITING ${clock(s)}`,
    friendIn: 'Your friend is in. Shaking hands…',
  },
  tags: { you: 'YOU', rival: 'RIVAL' },
  vs: 'VS',
} as const;

export type ErrorKind = 'server' | 'lost' | 'room' | 'full' | 'version';

export interface ErrorView {
  ribbon: string;
  icon: 'plug' | 'link';
  line: string;
  small?: string;
  /** First = sun, focused. */
  primary: { label: string; icon: 'again' | 'bolt' | 'reload'; action: 'retry' | 'quick' | 'reload' };
  secondary: { label: string; icon: 'bot' | 'ticket' | 'back'; action: 'bot' | 'code' | 'back' };
  /** Short code at the panel's foot (`Code: E-WS · for support`); the full detail goes in `title`. */
  code?: string;
  card: { name: string; role: string; plug: boolean };
}

/** Spec 3.5: the lobby's error panel per case. */
export const errorView = (kind: ErrorKind): ErrorView => {
  const botSmall = "Bot matches don't need the server. They work right now.";
  const roomSmall = 'Ask your friend for a fresh link, or jump into a quick match.';
  const retry = { label: 'TRY AGAIN', icon: 'again', action: 'retry' } as const;
  const playBot = { label: 'PLAY VS BOT', icon: 'bot', action: 'bot' } as const;
  const quick = { label: 'QUICK MATCH', icon: 'bolt', action: 'quick' } as const;
  const code = { label: 'ENTER ANOTHER CODE', icon: 'ticket', action: 'code' } as const;
  switch (kind) {
    case 'server':
      return { ribbon: "CAN'T REACH ONLINE", icon: 'plug', line: "The game server isn't answering. It may be down, or your network is blocking it.", small: botSmall, primary: retry, secondary: playBot, code: 'E-WS', card: { name: 'NOBODY', role: 'NO SIGNAL', plug: true } };
    case 'lost':
      return { ribbon: 'LOST THE CONNECTION', icon: 'plug', line: 'The line to the game server dropped while we were looking.', small: botSmall, primary: retry, secondary: playBot, code: 'E-LEFT', card: { name: 'NOBODY', role: 'NO SIGNAL', plug: true } };
    case 'room':
      return { ribbon: 'THAT ROOM IS GONE', icon: 'link', line: 'This link is old, or the match already started without you.', small: roomSmall, primary: quick, secondary: code, code: 'E-JOIN', card: { name: 'FRIEND', role: 'ROOM CLOSED', plug: false } };
    case 'full':
      return { ribbon: 'THAT ROOM IS FULL', icon: 'link', line: 'Two players are already in there.', small: roomSmall, primary: quick, secondary: code, code: 'E-JOIN', card: { name: 'FRIEND', role: 'ROOM CLOSED', plug: false } };
    case 'version':
      return { ribbon: 'NEW VERSION OUT', icon: 'plug', line: 'PEWFIELD just got an update. Reload to play online.', primary: { label: 'RELOAD', icon: 'reload', action: 'reload' }, secondary: { label: 'BACK', icon: 'back', action: 'back' }, code: 'E-VER', card: { name: 'NOBODY', role: 'NO SIGNAL', plug: true } };
  }
};

/** Which error a failed join / connection is (the raw message never reaches the player). */
export const classifyError = (mode: 'quick' | 'private' | 'join', e: unknown, lostMidSearch = false): ErrorKind => {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  const code = (e as { code?: number } | null)?.code;
  if (code === 4426 || /out of date|reload/i.test(msg)) return 'version';
  if (lostMidSearch) return 'lost';
  if (mode === 'join') return /full|locked/i.test(msg) ? 'full' : 'room';
  return 'server';
};

export type StepState = 'now' | 'wait' | 'skip' | 'done';
export interface StepRow {
  key: 'near' | 'next' | 'bot';
  title: string;
  sub: string;
  state: StepState;
}
export interface SearchView {
  line: string;
  steps: StepRow[];
  /** The mystery card's chip: `BOT INCOMING` on the bot step of a multi-region search. */
  botIncoming: boolean;
}

/**
 * Spec 3.3: the status line and the step tracker per search leg, for one region (today) or several. `home` / `next` are
 * region ids (fra, iad, ...).
 */
export const searchView = (leg: LegKind, regions: { home?: string; next?: string }): SearchView => {
  const multi = !!regions.next;
  const due = botClock();
  const near = multi && regions.home ? `${ONLINE_COPY.search.near} · ${regionName(regions.home)}` : ONLINE_COPY.search.near;
  const next = `${ONLINE_COPY.search.next} · ${regionName(regions.next)}`;
  const botWait = `Nobody free by about ${due}? A BOT plays you`;
  if (!multi) {
    return {
      line: `Looking for a player. Nobody by about ${due}? A BOT steps in.`,
      steps: [
        { key: 'near', title: near, sub: 'The fastest connection for you', state: 'now' },
        { key: 'bot', title: ONLINE_COPY.search.bot, sub: botWait, state: 'wait' },
      ],
      botIncoming: false,
    };
  }
  switch (leg) {
    case 'home':
      return {
        line: 'Looking for a player near you.',
        steps: [
          { key: 'near', title: near, sub: 'The fastest connection for you', state: 'now' },
          { key: 'next', title: next, sub: "Only if it's still quick to reach", state: 'wait' },
          { key: 'bot', title: ONLINE_COPY.search.bot, sub: botWait, state: 'wait' },
        ],
        botIncoming: false,
      };
    case 'fallback':
      return {
        line: 'Nobody near you yet. Checking next door.',
        steps: [
          { key: 'near', title: near, sub: 'Nobody free', state: 'skip' },
          { key: 'next', title: next, sub: 'Still quick to reach from you', state: 'now' },
          { key: 'bot', title: ONLINE_COPY.search.bot, sub: botWait, state: 'wait' },
        ],
        botIncoming: false,
      };
    case 'bot':
      return {
        line: 'Nobody free right now. A BOT is on its way.',
        steps: [
          { key: 'near', title: near, sub: 'Nobody free', state: 'skip' },
          { key: 'next', title: next, sub: 'Nobody free', state: 'skip' },
          { key: 'bot', title: ONLINE_COPY.search.bot, sub: 'A player can still grab the seat first', state: 'now' },
        ],
        botIncoming: true,
      };
  }
};

/** Spec 3.3 found line: `A player from Europe is in. Shaking hands…` (one region: no place name). */
export const foundLine = (region: string | undefined, multi: boolean) =>
  multi && region ? `A player from ${regionPlace(region)} is in. Shaking hands…` : 'A player is in. Shaking hands…';

/** The found row of the tracker: the region the match was made in. */
export const foundRow = (region: string | undefined, multi: boolean): StepRow => ({
  key: 'near',
  title: multi && region ? `${ONLINE_COPY.search.near} · ${regionName(region)}` : ONLINE_COPY.search.near,
  sub: ONLINE_COPY.found.matched,
  state: 'done',
});

/** Spec 3.2 connecting copy: the line changes after 1.5 s (a cold Fly machine). */
export const connectingView = (elapsedMs: number, multi: boolean) =>
  elapsedMs < 1500
    ? { line: multi ? ONLINE_COPY.connecting.lineMulti : ONLINE_COPY.connecting.lineOne, small: undefined }
    : { line: ONLINE_COPY.connecting.slowLine, small: ONLINE_COPY.connecting.slowSmall };

/** Hold times before the doors (spec 4): a human 900 ms, a bot 900 ms, a bot because the server is down 1600 ms. */
export const HANDOFF_MS = { found: 900, bot: 900, botOffline: 1600 } as const;

// ---- in-match (spec 5) ----

export const NET_COPY = {
  shaky: 'SHAKY CONNECTION · MOVES MAY LAG',
  pauseAsk: (touch: boolean) => `YOUR RIVAL WANTS A PAUSE · ${touch ? 'TAP PAUSE' : 'PRESS ESC'} TO AGREE`,
  ms: (ms: number) => `${Math.round(ms)} MS`,
  title: (ms: number, mode: string) => `Round trip ${Math.round(ms)} ms · ${mode === 'direct' ? 'direct line' : mode === 'server' ? 'server' : 'relay'}`,
  syncing: 'Syncing with your rival…',
} as const;

export const OVERLAY_COPY = {
  dropped: { ribbon: 'ON HOLD', line: "Your rival's connection dropped. The match is frozen while they get back.", small: "Nothing counts while it's on hold." },
  left: {
    ribbon: 'YOUR RIVAL LEFT',
    line: 'Holding the room. They can come back with the same link.',
    last: 'Last wait. After this the link closes.',
    copy: 'COPY THE LINK AGAIN',
    copied: 'COPIED!',
    leave: 'LEAVE',
    portalLine: 'Waiting a moment in case they come back.',
    quickLine: "They're gone. Find someone new?",
    quick: 'QUICK MATCH',
    menu: 'BACK TO MENU',
  },
  asking: {
    ribbon: 'STILL NOT BACK',
    line: 'Keep the room open another minute?',
    lastLine: 'One more minute? After that the link closes.',
    keep: 'KEEP WAITING',
    lastKeep: 'WAIT ONE LAST MINUTE',
    leave: 'LEAVE',
  },
  expired: {
    ribbon: 'LINK EXPIRED',
    line: "Your rival didn't come back, so the room is closed.",
    small: 'Open a new room and send a fresh link, or find someone new.',
    newRoom: 'NEW ROOM',
    quick: 'QUICK MATCH',
  },
  gl: { ribbon: 'GRAPHICS PAUSED', line: 'Your browser stopped drawing the game. Reload to jump back in.', small: 'This match starts over.', reload: 'RELOAD' },
} as const;

export const OFFER_COPY = {
  title: 'A PLAYER IS FREE!',
  small: 'Fight them next instead of the BOT.',
  fight: 'FIGHT THEM',
  connecting: 'CONNECTING…',
  goneTitle: 'They just got snapped up.',
  goneSmall: 'Rematch the BOT or search again.',
  search: 'SEARCH AGAIN',
} as const;
