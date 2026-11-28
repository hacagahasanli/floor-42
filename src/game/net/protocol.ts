// Wire format shared by the game server and the browser client.

import { expandState, compactState } from './wire';

import type { WireInput } from './protocol-input';
import type { WireState } from './wire';
import type { BotLevel } from '../sim/bot';
import type { ArenaId } from '../sim/constants';
import type { CharacterId, GameEvent, GameState } from '../sim/types';

export const ROOM_NAME = 'duel';
export const SNAPSHOT_EVERY_TICKS = 1; // 60 snapshots a second (2 was 30)
/**
 * 4: matchmaking with a bot fallback (docs/online/2026-11-28-matchmaking.md). `start` says when the rival is a server
 * bot (`bot`) and which arena the room plays (`arena`, also in the snapshot state); a quick-match join may ask for a
 * bot after a wait (JoinOptions.bot). Older clients are refused (they would show a bot as a human "RIVAL").
 *
 * 3: compact snapshots (wire.ts: rows of rounded numbers, about a fifth of the bytes) sent at 60
 * a second. Clients say their version when they join and the server refuses any other, so an old
 * page gets "reload" instead of garbage; a new client still reads an older server's snapshots.
 *
 * 2: the authority compensates lag (rewinds up to 150 ms for late inputs), numbers snapshots and
 * sends the game's events. Sent in `start`; clients only send version-2 messages to a version-2
 * server (an older server disconnects a client for a message type it doesn't know).
 */
export const PROTOCOL_VERSION = 4;
/** The version that introduced lag compensation, numbered snapshots and events. */
export const LAG_COMP_VERSION = 2;

export { decodeInput, encodeInput, mergePresses } from './protocol-input';
export type { WireInput } from './protocol-input';

export interface JoinOptions {
  character: CharacterId;
  private?: boolean;
  /** The client's PROTOCOL_VERSION; the server refuses a join without the current one. */
  v?: number;
  /**
   * Quick match only: if no human has joined this room this many ms after you joined it, the server seats a bot and
   * starts. Absent: wait for a human (an earlier region in the search, or an invite). Clamped by the server.
   */
  bot?: number;
}

/** The rival is a server bot (never shown as a human). */
export interface BotSeat {
  slot: number;
  level: BotLevel;
}

export interface StartMessage {
  slot: number;
  characters: [CharacterId, CharacterId];
  /** True when the two browsers play over a direct line and slot 0's browser runs the game. */
  direct?: boolean;
  /** The server's protocol version (missing: 1). */
  v?: number;
  /** Set when the rival is the server's bot (protocol 4). */
  bot?: BotSeat;
  /** The arena the room plays (protocol 4; missing: the office). */
  arena?: ArenaId;
}

/**
 * The authority's events (shots, hits, knockouts...) for game ticks `from..to`, each with its
 * tick. A batch replaces whatever the receiver had for that range: a rewind can change them.
 */
export interface EventBatch {
  from: number;
  to: number;
  e: [number, GameEvent][];
}

export interface Snapshot {
  /** The last client tick the server applied, per slot. */
  ack: [number, number];
  /** The inputs the server is currently using, per slot. */
  inputs: [WireInput, WireInput];
  state: GameState;
  /** Snapshot number, rising: over the unordered direct line an older one can arrive later. */
  seq?: number;
  /** Events since the previous snapshot (server version 2; the direct line sends them apart). */
  ev?: EventBatch;
  /**
   * Each seat's inputs for the ticks after `state`, up to the authority's newest tick. `state`
   * is the newest tick every remote input reached; replaying these on it gives the newest one.
   */
  next?: [WireInput[], WireInput[]];
}

/** True when a snapshot numbered `seq` is newer than the last one used (unnumbered: always). */
export const isNewer = (seq: number | undefined, last: number) => seq === undefined || seq > last;

// JSON can't carry Infinity (events could, in principle), so it travels as a marker.
const INF = '__inf';
const replacer = (_k: string, v: unknown) => (v === Infinity ? INF : v === -Infinity ? `-${INF}` : v);
const reviver = (_k: string, v: unknown) => (v === INF ? Infinity : v === `-${INF}` ? -Infinity : v);

/** Version 3 on the wire: short keys, the state as rows (wire.ts), each seat's `next` inputs relative to its ack. */
interface WireSnapshot {
  q?: number;
  a: [number, number];
  i: [WireInput, WireInput];
  n?: [number[][], number[][]];
  e?: EventBatch;
  s: WireState;
}

export const encodeSnapshot = (s: Snapshot): string => {
  const w: WireSnapshot = { a: s.ack, i: s.inputs, s: compactState(s.state) };
  if (s.seq !== undefined) w.q = s.seq;
  if (s.ev) w.e = s.ev;
  if (s.next) w.n = [0, 1].map((k) => s.next![k].map((r) => [r[0] - s.ack[k], r[1], r[2], r[3]])) as [number[][], number[][]];
  return JSON.stringify(w, replacer);
};

/** Reads version 3, and the full-state form an older server or host sends (it has a `state` field). */
export const decodeSnapshot = (raw: string): Snapshot => {
  const w = JSON.parse(raw, reviver) as WireSnapshot | Snapshot;
  if ('state' in w) return w;
  const snap: Snapshot = { ack: w.a, inputs: w.i, state: expandState(w.s) };
  if (w.q !== undefined) snap.seq = w.q;
  if (w.e) snap.ev = w.e;
  if (w.n) snap.next = [0, 1].map((k) => w.n![k].map((r) => [r[0] + w.a[k], r[1], r[2], r[3]])) as [WireInput[], WireInput[]];
  return snap;
};
