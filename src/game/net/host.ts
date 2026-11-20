import { chooseCharacter, createGame } from '../sim/step';

import { createAuthority } from './authority';
import { encodeSnapshot, SNAPSHOT_EVERY_TICKS } from './protocol';

import type { NetStatus, OnlineSession } from './client';
import type { PeerLink } from './peer';
import type { StartMessage, WireInput } from './protocol';
import type { CharacterId, GameEvent, GameState, InputState } from '../sim/types';
import type { Room } from '@colyseus/sdk';

const TROUBLE_MS = 1500;

/**
 * The host's side of a direct match: this browser (slot 0, the one who sent the invite) runs
 * the authoritative game. The guest's inputs go through the shared authority loop (authority.ts):
 * applied at the tick the guest pressed them, rewinding up to 150 ms. Snapshots go back numbered
 * on the unordered line; the game's events go on the reliable one.
 *
 * Lifecycle stays on the server room: who joined, pause by agreement, rematch, drop and leave.
 */
export const createHostSession = (room: Room, link: PeerLink, start: StartMessage): OnlineSession => {
  const slot = start.slot;
  const guestSeat = 1 - slot;
  const remote = [false, false];
  remote[guestSeat] = true;
  const newGame = (characters: [CharacterId, CharacterId]) => createGame(characters, (Math.random() * 1e9) | 0, true);
  const auth = createAuthority(newGame(start.characters), { remote });
  let tick = 0;
  let seq = 0;
  let pauseRequests: boolean[] = [false, false];
  let paused = false;
  let lastTroubleAt = -Infinity;
  let lastLate = 0;
  const now = () => performance.now();
  const probe = (rec: Record<string, unknown>) => {
    if (process.env.NODE_ENV === 'production') return;
    (globalThis as { __netprobe?: unknown[] }).__netprobe?.push({ t: performance.timeOrigin + now(), ...rec });
  };

  const off = link.on((m) => {
    if (m.t === 'in') {
      const wires = (Array.isArray(m.w) ? m.w.slice(0, 12) : []).filter(
        (w): w is WireInput => Array.isArray(w) && w.length === 4 && w.every((n) => typeof n === 'number' && Number.isFinite(n)),
      );
      auth.receive(guestSeat, wires);
    } else if (m.t === 'char') {
      auth.mutate((s) => chooseCharacter(s, guestSeat, m.c as CharacterId));
    }
  });
  const offPause = room.onMessage('pauseState', (msg: { requests: boolean[]; paused: boolean }) => {
    pauseRequests = msg.requests;
    paused = msg.paused;
  });

  return {
    slot,
    get state(): GameState {
      return auth.state;
    },
    get status(): NetStatus {
      const t = now();
      const st = auth.stats(guestSeat);
      if (t - link.lastHeard > 250 && !paused) lastTroubleAt = t;
      if (st && st.lateInputs > lastLate) {
        lastLate = st.lateInputs;
        lastTroubleAt = t;
      }
      return {
        mode: link.mode,
        ping: link.rtt,
        unstable: t - lastTroubleAt < TROUBLE_MS,
        authority: 'here',
        snapGapMs: Math.round(t - link.lastHeard),
        inputDelayMs: 0,
        delayMs: 0,
        underruns: 0,
        rewinds: st?.rewinds ?? 0,
        lateInputs: st?.lateInputs ?? 0,
      };
    },
    get pauseRequests() {
      return pauseRequests;
    },
    requestPause: () => room.send('pause'),
    cancelPause: () => room.send('cancelPause'),
    resume: () => room.send('resume'),
    chooseCharacter: (c: CharacterId) => auth.mutate((s) => chooseCharacter(s, slot, c)),
    tick: (input: InputState): GameEvent[] => {
      tick += 1;
      auth.setRoundTrip(guestSeat, link.minRtt);
      auth.state.paused = paused;
      const local: (InputState | null)[] = [null, null];
      local[slot] = input;
      const events = auth.advance(local);
      for (const e of events) {
        if (e.type === 'hit' || e.type === 'ko') {
          const f = auth.state.fighters[e.fighter];
          probe({ k: 'auth', e: e.type, victim: e.fighter, x: f.x, y: f.y });
        }
      }
      if (tick % SNAPSHOT_EVERY_TICKS === 0) {
        const snap = auth.snapshot();
        const [a, b] = snap.seats;
        seq += 1;
        link.send({
          t: 'snap',
          raw: encodeSnapshot({
            seq,
            ack: [a.ack, b.ack],
            inputs: [a.wire, b.wire],
            next: [a.next, b.next],
            state: { ...snap.state, events: [] },
          }),
        });
        const batch = auth.takeEvents();
        if (batch) link.send({ t: 'ev', b: batch }, true);
      }
      return events;
    },
    restart: (msg: StartMessage) => {
      auth.reset(newGame(msg.characters));
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
