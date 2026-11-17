// Wire format shared by the game server and the browser client.

import { EMPTY_INPUT } from '../sim/types';

import type { CharacterId, GameState, InputState } from '../sim/types';

export const ROOM_NAME = 'duel';
export const SNAPSHOT_EVERY_TICKS = 2; // 30 snapshots a second

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
}

export interface Snapshot {
  /** The last client tick the server applied, per slot. */
  ack: [number, number];
  /** The inputs the server is currently using, per slot. */
  inputs: [WireInput, WireInput];
  state: GameState;
}

// JSON can't carry Infinity (the pistol's reserve, empty drop slots), so it travels as a marker.
const INF = '__inf';
export const encodeSnapshot = (s: Snapshot) =>
  JSON.stringify(s, (_k, v) => (v === Infinity ? INF : v === -Infinity ? `-${INF}` : v));
export const decodeSnapshot = (raw: string): Snapshot =>
  JSON.parse(raw, (_k, v) => (v === INF ? Infinity : v === `-${INF}` ? -Infinity : v));
