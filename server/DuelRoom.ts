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
}

const isCharacter = (v: unknown): v is CharacterId => typeof v === 'string' && v in CHARACTERS;

/**
 * One 1v1 match. The server owns the game: it runs the same deterministic
 * simulation as the browser at 60 Hz, decides every hit, and sends snapshots.
 * Clients only send inputs.
 */
export class DuelRoom extends Room {
  maxClients = 2;
  private seats: (Seat | null)[] = [null, null];
  private game: GameState | null = null;
  /** Counts server ticks even while the game is paused, so snapshots keep flowing. */
  private serverTick = 0;

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

    this.onMessage('rematch', (client: Client) => {
      const seat = this.seatOf(client);
      if (!seat || this.game?.phase !== 'over') return;
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
    };
    if (this.seats.every(Boolean)) {
      void this.lock();
      this.startGame();
    } else {
      client.send('waiting', { roomId: this.roomId });
    }
  }

  onLeave(client: Client) {
    const slot = this.seats.findIndex((s) => s?.client === client);
    if (slot < 0) return;
    this.seats[slot] = null;
    this.game = null;
    this.broadcast('left', {});
    void this.unlock();
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
      const msg: StartMessage = { slot, characters: [a.character, b.character] };
      s.client.send('start', msg);
    });
  }

  private tick() {
    const game = this.game;
    if (!game) return;
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
