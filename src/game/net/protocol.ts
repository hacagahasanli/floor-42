// Wire format shared by the game server and the browser client.

import { EMPTY_INPUT } from '../sim/types';

import type { CharacterId, GameEvent, GameState, InputState } from '../sim/types';

export const ROOM_NAME = 'duel';
export const SNAPSHOT_EVERY_TICKS = 2; // 30 snapshots a second
/**
 * 2: the authority compensates lag (rewinds up to 150 ms for late inputs), numbers snapshots and
 * sends the game's events. Sent in `start`; clients only send version-2 messages to a version-2
 * server (an older server disconnects a client for a message type it doesn't know).
 */
export const PROTOCOL_VERSION = 2;

const BUTTONS = ['left', 'right', 'up', 'down', 'dash', 'fire', 'pickup', 'reload', 'push'] as const;

/** One tick of input, compact: [clientTick, buttons bitmask, aimX, aimY]. */
export type WireInput = [number, number, number, number];

export const encodeInput = (tick: number, i: InputState): WireInput => {
  let bits = 0;
  BUTTONS.forEach((b, n) => {
    if (i[b]) bits |= 1 << n;
  });
  return [tick, bits, Math.round(i.aimX * 100) / 100, Math.round(i.aimY * 100) / 100];
};

export const decodeInput = (w: WireInput): InputState => {
  const s: InputState = { ...EMPTY_INPUT, aimX: w[2], aimY: w[3] };
  BUTTONS.forEach((b, n) => {
    s[b] = (w[1] & (1 << n)) !== 0;
  });
  return s;
};

/** Presses that happened in skipped inputs survive into the next one. */
export const mergePresses = (into: InputState, from: InputState): InputState => {
  const s = { ...into };
  for (const b of BUTTONS) s[b] = s[b] || from[b];
  return s;
};

export interface JoinOptions {
  character: CharacterId;
  private?: boolean;
}

export interface StartMessage {
  slot: number;
  characters: [CharacterId, CharacterId];
  /** True when the two browsers play over a direct line and slot 0's browser runs the game. */
  direct?: boolean;
  /** The server's protocol version (missing: 1). */
  v?: number;
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

// JSON can't carry Infinity (the pistol's reserve, empty drop slots), so it travels as a marker.
const INF = '__inf';
export const encodeSnapshot = (s: Snapshot) =>
  JSON.stringify(s, (_k, v) => (v === Infinity ? INF : v === -Infinity ? `-${INF}` : v));
export const decodeSnapshot = (raw: string): Snapshot =>
  JSON.parse(raw, (_k, v) => (v === INF ? Infinity : v === `-${INF}` ? -Infinity : v));
