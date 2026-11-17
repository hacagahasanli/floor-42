import { Room } from '@colyseus/core';

import { decodeInput, encodeSnapshot, mergePresses, SNAPSHOT_EVERY_TICKS } from '../src/game/net/protocol';
import { CHARACTERS } from '../src/game/sim/constants';
import { chooseCharacter, createGame, step } from '../src/game/sim/step';
import { EMPTY_INPUT } from '../src/game/sim/types';

import type { JoinOptions, StartMessage, WireInput } from '../src/game/net/protocol';
import type { CharacterId, GameState, InputState } from '../src/game/sim/types';
import type { Client } from '@colyseus/core';

interface Seat {
  client: Client;
  character: CharacterId;
  queue: WireInput[];
  current: InputState;
  currentWire: WireInput;
  ack: number;
  rematch: boolean;
  pause: boolean;
  /** Reported after the WebRTC handshake: null = not answered yet. */
  direct: boolean | null;
}

const isCharacter = (v: unknown): v is CharacterId => typeof v === 'string' && v in CHARACTERS;

/**
 * One 1v1 match, in one of two modes:
 * - server: the server owns the game. It runs the same deterministic simulation as the browser
 *   at 60 Hz, decides every hit and sends snapshots; clients only send inputs.
 * - direct: when the two browsers manage a WebRTC connection between themselves (tried for a few
 *   seconds when the second player joins), the inviter's browser runs the game and the traffic
 *   goes player to player, which is far faster when both are in the same city. The server then
 *   only introduces them, handles pause, rematch, drop and leave, and relays messages if the
 *   direct line breaks.
 */
export class DuelRoom extends Room {
  maxClients = 2;
  private seats: (Seat | null)[] = [null, null];
  private game: GameState | null = null;
  /** Counts server ticks even while the game is paused, so snapshots keep flowing. */
  private serverTick = 0;
  /** Direct mode: the host's browser runs the game; this room doesn't simulate. */
  private direct = false;
  private handshake: ReturnType<typeof setTimeout> | null = null;

  onCreate(options: JoinOptions) {
    if (options?.private) void this.setPrivate(true);

    this.onMessage('input', (client: Client, inputs: WireInput[]) => {
      const seat = this.seatOf(client);
      if (!seat || !Array.isArray(inputs)) return;
      for (const w of inputs.slice(0, 10)) {
        if (Array.isArray(w) && w.length === 4 && w.every((n) => typeof n === 'number' && Number.isFinite(n))) {
          if (w[0] > seat.ack && !seat.queue.some((q) => q[0] === w[0])) seat.queue.push(w);
        }
      }
    });

    // WebRTC introductions: offers, answers and candidates go to the other player as they are.
    this.onMessage('signal', (client: Client, msg: unknown) => this.other(client)?.client.send('signal', msg));
    // Direct mode's fallback when the direct line drops: pass game messages through.
    this.onMessage('relay', (client: Client, raw: unknown) => {
      if (typeof raw === 'string' && raw.length < 200_000) this.other(client)?.client.send('relay', raw);
    });
    this.onMessage('direct', (client: Client, msg: { ok?: boolean }) => {
      const seat = this.seatOf(client);
      if (!seat || !this.handshake) return;
      seat.direct = !!msg?.ok;
      if (this.seats.every((x) => x && x.direct !== null)) this.finishHandshake();
    });

    this.onMessage('rematch', (client: Client) => {
      const seat = this.seatOf(client);
      // In direct mode the host's browser knows when the match is over, not this room.
      if (!seat || (!this.direct && this.game?.phase !== 'over')) return;
      seat.rematch = true;
      if (this.seats.every((s) => s?.rematch)) this.startGame();
    });

    // Pause needs both players: one asks (Esc Esc), the other agrees the same way.
    this.onMessage('pause', (client: Client) => {
      const seat = this.seatOf(client);
      if (!seat || !this.game || this.game.phase === 'over') return;
      seat.pause = true;
      if (this.seats.every((x) => x?.pause)) this.game.paused = true;
      this.sendPause();
    });
    this.onMessage('cancelPause', (client: Client) => {
      const seat = this.seatOf(client);
      if (!seat || this.game?.paused) return;
      seat.pause = false;
      this.sendPause();
    });
    this.onMessage('resume', (client: Client) => {
      if (!this.seatOf(client) || !this.game) return;
      this.game.paused = false;
      for (const x of this.seats) if (x) x.pause = false;
      this.sendPause();
    });

    // While dead you may pick who you come back as.
    this.onMessage('character', (client: Client, character: unknown) => {
      const seat = this.seatOf(client);
      if (!seat || !this.game || !isCharacter(character)) return;
      seat.character = character;
      chooseCharacter(this.game, this.seats.indexOf(seat), character);
    });

    this.setSimulationInterval(() => this.tick(), 1000 / 60);
  }

  onJoin(client: Client, options: JoinOptions) {
    const slot = this.seats[0] === null ? 0 : 1;
    this.seats[slot] = {
      client,
      character: isCharacter(options?.character) ? options.character : 'hotfix',
      queue: [],
      current: { ...EMPTY_INPUT },
      currentWire: [0, 0, 0, 0],
      ack: 0,
      rematch: false,
      pause: false,
      direct: null,
    };
    if (this.seats.every(Boolean)) {
      void this.lock();
      // First try to connect the two browsers directly; start in any case within 6 seconds.
      // Clients that don't know about direct play never answer and simply get server mode.
      this.seats.forEach((x, slot) => x!.client.send('peer', { slot }));
      this.handshake = setTimeout(() => this.finishHandshake(), 6000);
    } else {
      client.send('waiting', { roomId: this.roomId });
    }
  }

  /** A dropped connection (wifi blip, tab asleep) gets 20 seconds to come back to the same seat. */
  async onDrop(client: Client) {
    const seat = this.seatOf(client);
    if (!seat) return;
    const slot = this.seats.indexOf(seat);
    if (this.game) this.game.paused = true;
    this.sendPause(); // the other client must stop predicting too
    this.broadcast('dropped', { slot, seconds: 20 });
    try {
      seat.client = await this.allowReconnection(client, 20);
      if (this.game) this.game.paused = false;
      this.broadcast('back', { slot });
      this.sendPause();
    } catch {
      // Did not come back: onLeave handles it.
    }
  }

  onLeave(client: Client) {
    const slot = this.seats.findIndex((s) => s?.client === client);
    if (slot < 0) return;
    this.seats[slot] = null;
    this.game = null;
    this.direct = false;
    if (this.handshake) clearTimeout(this.handshake);
    this.handshake = null;
    this.broadcast('left', {});
    void this.unlock();
  }

  private finishHandshake() {
    if (!this.handshake) return;
    clearTimeout(this.handshake);
    this.handshake = null;
    this.direct = this.seats.every((x) => x?.direct === true);
    this.startGame();
  }

  private other(client: Client) {
    const seat = this.seatOf(client);
    return seat ? (this.seats.find((x) => x && x !== seat) ?? null) : null;
  }

  private sendPause() {
    this.broadcast('pauseState', {
      requests: this.seats.map((x) => !!x?.pause),
      paused: !!this.game?.paused,
    });
  }

  private seatOf(client: Client) {
    return this.seats.find((s) => s?.client === client) ?? null;
  }

  private startGame() {
    const [a, b] = this.seats as Seat[];
    this.game = createGame([a.character, b.character], (Math.random() * 1e9) | 0);
    for (const s of [a, b]) {
      s.rematch = false;
      s.pause = false;
      s.queue = [];
      s.current = { ...EMPTY_INPUT };
    }
    [a, b].forEach((s, slot) => {
      const msg: StartMessage = { slot, characters: [a.character, b.character], direct: this.direct };
      s.client.send('start', msg);
    });
  }

  private tick() {
    const game = this.game;
    if (!game || this.direct) return;
    const inputs = this.seats.map((seat) => {
      if (!seat) return { ...EMPTY_INPUT };
      seat.queue.sort((x, y) => x[0] - y[0]);
      // Fell behind: fold the oldest inputs together so no press is lost.
      while (seat.queue.length > 4) {
        const old = seat.queue.shift()!;
        seat.queue[0] = mergeWire(old, seat.queue[0]);
      }
      const next = seat.queue.shift();
      if (next) {
        seat.current = decodeInput(next);
        seat.currentWire = next;
        seat.ack = next[0];
      } else {
        // Nothing new: hold the movement, drop one-shot presses.
        seat.current = { ...seat.current, up: false, dash: false, push: false, pickup: false, reload: false };
      }
      return seat.current;
    });
    step(game, inputs);
    this.serverTick += 1;
    if (this.serverTick % SNAPSHOT_EVERY_TICKS === 0) {
      const [a, b] = this.seats;
      const raw = encodeSnapshot({
        ack: [a?.ack ?? 0, b?.ack ?? 0],
        inputs: [a?.currentWire ?? [0, 0, 0, 0], b?.currentWire ?? [0, 0, 0, 0]],
        state: { ...game, events: [] },
      });
      this.broadcast('snap', raw);
    }
  }
}

const mergeWire = (a: WireInput, b: WireInput): WireInput => {
  const merged = mergePresses(decodeInput(b), decodeInput(a));
  return [b[0], b[1] | (a[1] & 0b111111100), merged.aimX, merged.aimY];
};
