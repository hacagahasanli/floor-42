import { Client } from '@colyseus/sdk';

import { createGame, step } from '../sim/step';
import { EMPTY_INPUT } from '../sim/types';

import { decodeInput, decodeSnapshot, encodeInput, ROOM_NAME } from './protocol';

import type { JoinOptions, Snapshot, StartMessage, WireInput } from './protocol';
import type { CharacterId, GameEvent, GameState, InputState } from '../sim/types';
import type { Room } from '@colyseus/sdk';

/** The Fly.io game server. Point it at a local one with NEXT_PUBLIC_GAME_SERVER=ws://localhost:2567. */
export const GAME_SERVER = process.env.NEXT_PUBLIC_GAME_SERVER ?? 'wss://floor42-game.fly.dev';

export type JoinMode = { kind: 'quick' } | { kind: 'private' } | { kind: 'join'; roomId: string };

export const joinRoom = async (mode: JoinMode, character: CharacterId): Promise<Room> => {
  const client = new Client(GAME_SERVER);
  const options: JoinOptions = { character, private: mode.kind === 'private' };
  if (mode.kind === 'join') return client.joinById(mode.roomId, options);
  if (mode.kind === 'private') return client.create(ROOM_NAME, options);
  return client.joinOrCreate(ROOM_NAME, options);
};

/**
 * Client-side prediction with server reconciliation.
 *
 * Every tick we apply our own input locally right away (so the game feels
 * instant) and send it to the server. When a snapshot arrives, we jump to the
 * server's state, which is the truth, and replay the inputs the server has not
 * processed yet. The rival's input is assumed to stay what the server last saw.
 */
export const createOnlineSession = (room: Room, start: StartMessage) => {
  const slot = start.slot;
  let state: GameState = createGame(start.characters);
  let tick = 0;
  let history: WireInput[] = [];
  let pending: Snapshot | null = null;
  let rival: InputState = { ...EMPTY_INPUT };
  let latency = 0;

  const offSnap = room.onMessage('snap', (raw: string) => {
    pending = decodeSnapshot(raw);
  });
  const ping = setInterval(() => room.ping((ms) => (latency = ms)), 2000);

  const reconcile = (snap: Snapshot) => {
    state = snap.state;
    rival = decodeInput(snap.inputs[1 - slot]);
    const acked = snap.ack[slot];
    history = history.filter((w) => w[0] > acked);
    for (const w of history) {
      const inputs: InputState[] = [];
      inputs[slot] = decodeInput(w);
      inputs[1 - slot] = rival;
      step(state, inputs);
    }
  };

  return {
    slot,
    get state() {
      return state;
    },
    get latency() {
      return latency;
    },
    /** One fixed tick: reconcile if a snapshot came in, then predict. Returns this tick's events. */
    tick: (input: InputState): GameEvent[] => {
      if (pending) {
        reconcile(pending);
        pending = null;
      }
      tick += 1;
      const w = encodeInput(tick, input);
      history.push(w);
      if (history.length > 240) history.shift();
      room.send('input', [w]);
      const inputs: InputState[] = [];
      inputs[slot] = input;
      inputs[1 - slot] = rival;
      step(state, inputs);
      return state.events;
    },
    /** A new round started on the server (first round or rematch). */
    restart: (msg: StartMessage) => {
      state = createGame(msg.characters);
      history = [];
      pending = null;
    },
    rematch: () => room.send('rematch'),
    dispose: () => {
      offSnap();
      clearInterval(ping);
    },
  };
};

export type OnlineSession = ReturnType<typeof createOnlineSession>;
