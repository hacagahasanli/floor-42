import { Client } from '@colyseus/sdk';

import { DT } from '../sim/constants';
import { chooseCharacter, createGame, step } from '../sim/step';
import { EMPTY_INPUT } from '../sim/types';

import { decodeInput, decodeSnapshot, encodeInput, isNewer, LAG_COMP_VERSION, PROTOCOL_VERSION, ROOM_NAME } from './protocol';
import { nearest, parseRegions, probeRegions, tierFor } from './regions';
import { createTimeline } from './timeline';

import type { LinkMode, PeerLink } from './peer';
import type { JoinOptions, Snapshot, StartMessage, WireInput } from './protocol';
import type { TimelineView } from './timeline';
import type { CharacterId, GameEvent, GameState, InputState } from '../sim/types';
import type { Room } from '@colyseus/sdk';

/** The Fly.io game server. Point it at a local one with NEXT_PUBLIC_GAME_SERVER=ws://localhost:2567. */
export const GAME_SERVER = process.env.NEXT_PUBLIC_GAME_SERVER ?? 'wss://floor42-game.fly.dev';

export type JoinMode = { kind: 'quick' } | { kind: 'private' } | { kind: 'join'; roomId: string };

/** Dev only: ?server=ws://localhost:2567 points this tab at a local game server. */
const serverUrl = () => {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return GAME_SERVER;
  return new URLSearchParams(window.location.search).get('server') ?? GAME_SERVER;
};

/** Multi-region mode (docs/TECHNICAL.md, "Regions"): empty unless NEXT_PUBLIC_GAME_REGIONS is set, and then nothing changes. */
const REGIONS = parseRegions(process.env.NEXT_PUBLIC_GAME_REGIONS);
let probed: { at: number; best: { url: string; rtt: number } | null } | null = null;

/** The nearest region's server and our round trip to it, probed at most once a minute. Null: regions off or none answered. */
const nearestServer = async (): Promise<{ url: string; rtt: number } | null> => {
  if (!REGIONS.length) return null;
  if (!probed || performance.now() - probed.at > 60_000) {
    const best = nearest(await probeRegions(REGIONS));
    probed = { at: performance.now(), best: best ? { url: REGIONS.find((r) => r.id === best.id)!.url, rtt: best.rtt } : null };
  }
  return probed.best;
};

export const joinRoom = async (mode: JoinMode, character: CharacterId): Promise<Room> => {
  let url = serverUrl();
  const options: JoinOptions = { character, private: mode.kind === 'private', v: PROTOCOL_VERSION };
  // Quick match goes to the nearest region and meets players of the same latency tier. Invites keep
  // the main server (a room id does not say which region it is in); ?server= (dev) wins over both.
  if (mode.kind === 'quick' && url === GAME_SERVER) {
    const near = await nearestServer();
    if (near) {
      url = near.url;
      options.tier = tierFor(near.rtt);
      options.rtt = near.rtt;
    }
  }
  const client = new Client(url);
  if (mode.kind === 'join') return client.joinById(mode.roomId, options);
  if (mode.kind === 'private') return client.create(ROOM_NAME, options);
  return client.joinOrCreate(ROOM_NAME, options);
};

/** What the HUD shows about the connection. */
export interface NetStatus {
  /** direct: browser to browser; turn: through a TURN relay; relay: through the game server's relay; server: the server runs the game. */
  mode: LinkMode | 'server';
  /** Round trip in ms over the path in use. */
  ping: number;
  /** Something went wrong in the last 1.5 s: a gap in snapshots or inputs, or the view ran dry. */
  unstable: boolean;
  /** Who runs the game: this browser, the other player's browser, or the server. */
  authority: 'here' | 'peer' | 'server';
  snapGapMs: number;
  inputDelayMs: number;
  delayMs: number;
  underruns: number;
  rewinds: number;
  lateInputs: number;
}

/** What to draw from the authority's timeline this frame (clients that don't run the game). */
export interface Presentation {
  view: TimelineView | null;
  /** The authority's events the timeline reached this frame (the rival's shots, hits on you...). */
  events: GameEvent[];
  /** How far your own fighter's drawn position is pulled back to hide a correction. */
  correction: { x: number; y: number };
}

export interface OnlineSession {
  slot: number;
  readonly state: GameState;
  readonly status: NetStatus;
  readonly pauseRequests: boolean[];
  requestPause: () => void;
  cancelPause: () => void;
  resume: () => void;
  chooseCharacter: (c: CharacterId) => void;
  /** One fixed tick. Returns this tick's events to show. */
  tick: (input: InputState) => GameEvent[];
  /** Clients only: advance the authority's timeline by dtMs and say what to draw. */
  present?: (dtMs: number) => Presentation;
  /** Clients only, for tests: the timeline's numbers. */
  readonly timeline?: Record<string, number | boolean>;
  restart: (msg: StartMessage) => void;
  rematch: () => void;
  dispose: () => void;
}

/**
 * Events this browser shows from its own prediction: what you did. What the rival caused comes
 * from the authority instead, on the timeline (when the authority sends events).
 */
export const isOwnEvent = (e: GameEvent, me: number): boolean => {
  switch (e.type) {
    case 'shot':
    case 'pickup':
    case 'reload':
    case 'empty':
    case 'jump':
    case 'dash':
    case 'push':
    case 'deflect':
      return e.fighter === me;
    case 'hit':
      return e.fighter !== me && (e.by === undefined || e.by === me);
    case 'wallSplat':
      return e.fighter !== undefined && e.fighter !== me;
    case 'impact':
    case 'explosion':
      return e.owner === me;
    default:
      return false; // knockouts and ceiling drops: the authority's word only
  }
};

const MS = DT * 1000;
const TROUBLE_MS = 1500;

/**
 * Client-side prediction with reconciliation, for the player whose game runs elsewhere (the
 * server, or the inviter's browser in a direct match).
 *
 * Every tick: apply your own input at once (instant controls) and send it; when a snapshot comes
 * in, adopt it and replay the inputs the authority hasn't applied yet. Your fighter is drawn from
 * that prediction, with corrections eased out over ~100 ms instead of snapped. The rival, their
 * shots and every result the authority decided are drawn from the timeline (see timeline.ts).
 */
export const createOnlineSession = (room: Room, start: StartMessage, link: PeerLink | null = null): OnlineSession => {
  const slot = start.slot;
  /** The authority speaks version 2: a direct host (same build) or an updated server. */
  const v2 = !!link || (start.v ?? 1) >= LAG_COMP_VERSION;
  let state: GameState = createGame(start.characters, 1, v2);
  let tick = 0;
  let history: WireInput[] = [];
  let pending: Snapshot | null = null;
  let pendingAt = 0;
  let lastSeq = -1;
  let rival: InputState = { ...EMPTY_INPUT };
  let latency = 0;
  let pauseRequests: boolean[] = [false, false];
  /** The latest pause decision; an older snapshot must not undo it. */
  let serverPaused = false;
  const timeline = createTimeline();
  /** The authority sends its events: the rival's are shown from those, on the timeline. */
  let authorityEvents = false;
  /** After a rematch, snapshots of the finished round may still be in flight: skip them. */
  let awaitingRound = false;
  const correction = { x: 0, y: 0 };
  const now = () => performance.now();
  let lastSnapAt = now();
  let lastTroubleAt = -Infinity;
  let acked = 0;
  const probe = (rec: Record<string, unknown>) => {
    if (process.env.NODE_ENV === 'production') return;
    (globalThis as { __netprobe?: unknown[] }).__netprobe?.push({ t: performance.timeOrigin + now(), ...rec });
  };

  const onSnapshot = (snap: Snapshot) => {
    if (awaitingRound && snap.state.phase === 'over') return;
    awaitingRound = false;
    const at = now();
    // An older authority sends its newest state: it feeds the timeline as it is (even an older
    // snapshot fills a gap there). A version-2 one is replayed to its newest tick first (reconcile).
    if (!snap.next) timeline.push(snap.state, at);
    if (snap.ev) {
      timeline.applyEvents(snap.ev);
      authorityEvents = true;
    }
    if (!isNewer(snap.seq, lastSeq)) return;
    if (snap.seq !== undefined) lastSeq = snap.seq;
    if (at - lastSnapAt > 250) lastTroubleAt = at;
    lastSnapAt = at;
    pending = snap;
    pendingAt = at;
    probe({ k: 'snap', tick: snap.state.tick, ack: snap.ack });
  };

  // Snapshots come from the server, or in a direct match from the host's browser.
  const offSnap = link
    ? link.on((m) => {
        if (m.t === 'snap') onSnapshot(decodeSnapshot(m.raw));
        else if (m.t === 'ev') {
          timeline.applyEvents(m.b);
          authorityEvents = true;
        }
      })
    : room.onMessage('snap', (raw: string) => onSnapshot(decodeSnapshot(raw)));
  const offPause = room.onMessage('pauseState', (msg: { requests: boolean[]; paused: boolean }) => {
    if (serverPaused && !msg.paused) timeline.resync();
    pauseRequests = msg.requests;
    serverPaused = msg.paused;
    state.paused = msg.paused;
  });
  const ping = setInterval(
    () => {
      if (link) {
        latency = link.rtt;
      } else {
        room.ping((ms) => {
          latency = ms;
          // A version-2 server compensates our lag: tell it our round trip.
          if (v2) room.send('rtt', ms);
        });
      }
    },
    link ? 500 : 2000,
  );

  const reconcile = (snap: Snapshot) => {
    const before = state.fighters[slot];
    const bx = before.x;
    const by = before.y;
    const wasOut = before.respawn > 0;
    state = snap.state;
    state.paused = serverPaused;
    rival = decodeInput(snap.inputs[1 - slot]);
    acked = snap.ack[slot];
    history = history.filter((w) => w[0] > acked);
    // The authority's newest ticks: replayed with its inputs for the rival and ours for us, which
    // gives its newest tick without its guesses about our inputs. That tick feeds the timeline.
    const rivalNext = snap.next?.[1 - slot] ?? [];
    history.forEach((w, i) => {
      if (i < rivalNext.length) rival = decodeInput(rivalNext[i]);
      const inputs: InputState[] = [];
      inputs[slot] = decodeInput(w);
      inputs[1 - slot] = rival;
      step(state, inputs);
      if (i === rivalNext.length - 1) timeline.push(state, pendingAt);
    });
    if (snap.next && !rivalNext.length) timeline.push(state, pendingAt);
    const after = state.fighters[slot];
    const dx = bx - after.x;
    const dy = by - after.y;
    // Ease small corrections out on screen; a respawn or a long way is a real jump.
    if (!wasOut && after.respawn <= 0 && Math.hypot(dx, dy) < 3) {
      correction.x += dx;
      correction.y += dy;
    } else {
      correction.x = 0;
      correction.y = 0;
    }
    if (history.length * MS > 450) lastTroubleAt = now();
    probe({ k: 'rec', ack: acked, replay: history.length, snapTick: snap.state.tick, own: Math.hypot(dx, dy) });
  };

  return {
    slot,
    /** Dev: the timeline's numbers. */
    get timeline() {
      return { ...timeline.stats };
    },
    get state() {
      return state;
    },
    get status(): NetStatus {
      const t = now();
      const gap = t - lastSnapAt;
      if (gap > 250 && !serverPaused) lastTroubleAt = t;
      return {
        mode: link ? link.mode : 'server',
        ping: latency,
        unstable: t - lastTroubleAt < TROUBLE_MS,
        authority: link ? 'peer' : 'server',
        snapGapMs: Math.round(gap),
        inputDelayMs: Math.round(history.length * MS),
        delayMs: timeline.stats.delayMs,
        underruns: timeline.stats.underruns,
        rewinds: 0,
        lateInputs: 0,
      };
    },
    get pauseRequests() {
      return pauseRequests;
    },
    requestPause: () => room.send('pause'),
    cancelPause: () => room.send('cancelPause'),
    resume: () => room.send('resume'),
    chooseCharacter: (c: CharacterId) => {
      chooseCharacter(state, slot, c);
      if (link) link.send({ t: 'char', c }, true);
      else room.send('character', c);
    },
    tick: (input: InputState): GameEvent[] => {
      if (pending) {
        reconcile(pending);
        pending = null;
      }
      tick += 1;
      const w = encodeInput(tick, input);
      history.push(w);
      if (history.length > 240) history.shift();
      // Unordered, lossy line: every packet repeats the last 8 inputs, so a lost one costs nothing.
      if (link) link.send({ t: 'in', w: history.slice(-8) });
      else room.send('input', [w]);
      const inputs: InputState[] = [];
      inputs[slot] = input;
      inputs[1 - slot] = rival;
      step(state, inputs);
      return authorityEvents ? state.events.filter((e) => isOwnEvent(e, slot)) : state.events;
    },
    present: (dtMs: number): Presentation => {
      const view = timeline.view(dtMs, now(), serverPaused || state.paused);
      // A short gap is covered by the guess; slowing to a stop is worth telling.
      if (view?.coasting) lastTroubleAt = now();
      const events = authorityEvents ? timeline.drainEvents().filter((e) => !isOwnEvent(e, slot)) : [];
      // Corrections fade with a 90 ms time constant.
      const k = Math.exp(-dtMs / 90);
      correction.x *= k;
      correction.y *= k;
      return { view, events, correction };
    },
    restart: (msg: StartMessage) => {
      state = createGame(msg.characters, 1, v2);
      history = [];
      pending = null;
      pauseRequests = [false, false];
      serverPaused = false;
      awaitingRound = true;
      timeline.reset();
    },
    rematch: () => room.send('rematch'),
    dispose: () => {
      offSnap();
      offPause();
      clearInterval(ping);
    },
  };
};
