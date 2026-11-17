import { chooseCharacter, createGame, step } from '../sim/step';
import { EMPTY_INPUT } from '../sim/types';

import { decodeInput, encodeInput, encodeSnapshot, mergePresses, SNAPSHOT_EVERY_TICKS } from './protocol';

import type { PeerLink } from './peer';
import type { StartMessage, WireInput } from './protocol';
import type { CharacterId, GameEvent, GameState, InputState } from '../sim/types';
import type { Room } from '@colyseus/sdk';

/**
 * The host's side of a direct match: this browser (slot 0, the one who sent the invite) runs
 * the authoritative game, exactly as the server would. It takes the guest's inputs from the
 * peer link with the server's rules (queue, fold when behind, hold movement when nothing new)
 * and sends snapshots back. The host plays with no delay at all; the guest predicts and
 * reconciles against the host's snapshots just as it would against the server.
 *
 * Lifecycle stays on the server room: who joined, pause by agreement, rematch, drop and leave.
 */
export const createHostSession = (room: Room, link: PeerLink, start: StartMessage) => {
  const slot = start.slot;
  let state: GameState = createGame(start.characters, (Math.random() * 1e9) | 0);
  let tick = 0;
  let queue: WireInput[] = [];
  let guest: InputState = { ...EMPTY_INPUT };
  let guestWire: WireInput = [0, 0, 0, 0];
  let guestAck = 0;
  let pauseRequests: boolean[] = [false, false];
  let paused = false;

  const off = link.on((m) => {
    if (m.t === 'in') {
      for (const w of m.w.slice(0, 12)) {
        if (Array.isArray(w) && w.length === 4 && w.every((n) => typeof n === 'number' && Number.isFinite(n))) {
          if (w[0] > guestAck && !queue.some((q) => q[0] === w[0])) queue.push(w);
        }
      }
    } else if (m.t === 'char') {
      chooseCharacter(state, 1 - slot, m.c as CharacterId);
    }
  });
  const offPause = room.onMessage('pauseState', (msg: { requests: boolean[]; paused: boolean }) => {
    pauseRequests = msg.requests;
    paused = msg.paused;
  });

  const guestInput = () => {
    queue.sort((a, b) => a[0] - b[0]);
    while (queue.length > 4) {
      const old = queue.shift()!;
      const merged = mergePresses(decodeInput(queue[0]), decodeInput(old));
      queue[0] = [queue[0][0], queue[0][1] | (old[1] & 0b111111100), merged.aimX, merged.aimY];
    }
    const next = queue.shift();
    if (next) {
      guest = decodeInput(next);
      guestWire = next;
      guestAck = next[0];
    } else {
      guest = { ...guest, up: false, dash: false, push: false, pickup: false, reload: false };
    }
    return guest;
  };

  return {
    slot,
    direct: true,
    get state() {
      return state;
    },
    get latency() {
      return link.rtt;
    },
    get pauseRequests() {
      return pauseRequests;
    },
    requestPause: () => room.send('pause'),
    cancelPause: () => room.send('cancelPause'),
    resume: () => room.send('resume'),
    chooseCharacter: (c: CharacterId) => chooseCharacter(state, slot, c),
    tick: (input: InputState): GameEvent[] => {
      tick += 1;
      state.paused = paused;
      const inputs: InputState[] = [];
      inputs[slot] = input;
      inputs[1 - slot] = guestInput();
      step(state, inputs);
      const events = state.events;
      if (tick % SNAPSHOT_EVERY_TICKS === 0) {
        const ack: [number, number] = [0, 0];
        ack[slot] = tick;
        ack[1 - slot] = guestAck;
        const wires: [WireInput, WireInput] = [[0, 0, 0, 0], [0, 0, 0, 0]];
        wires[slot] = encodeInput(tick, input);
        wires[1 - slot] = guestWire;
        link.send({ t: 'snap', raw: encodeSnapshot({ ack, inputs: wires, state: { ...state, events: [] } }) });
      }
      return events;
    },
    restart: (msg: StartMessage) => {
      state = createGame(msg.characters, (Math.random() * 1e9) | 0);
      queue = [];
      guest = { ...EMPTY_INPUT };
      guestAck = 0;
      pauseRequests = [false, false];
      paused = false;
    },
    rematch: () => room.send('rematch'),
    dispose: () => {
      off();
      offPause();
    },
  };
};
