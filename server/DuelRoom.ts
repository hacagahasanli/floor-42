import { Room } from '@colyseus/core';

import { createAuthority } from '../src/game/net/authority';
import { createFixedStep, createTickStats } from '../src/game/net/fixedStep';
import { PROTOCOL_VERSION, SNAPSHOT_EVERY_TICKS } from '../src/game/net/protocol';
import { snapshotMessage } from '../src/game/net/serverSnapshot';
import { CHARACTERS } from '../src/game/sim/constants';
import { chooseCharacter, createGame } from '../src/game/sim/step';

import type { Authority } from '../src/game/net/authority';
import type { JoinOptions, StartMessage, WireInput } from '../src/game/net/protocol';
import type { CharacterId } from '../src/game/sim/types';
import type { Client } from '@colyseus/core';

interface Seat {
  client: Client;
  character: CharacterId;
  rematch: boolean;
  pause: boolean;
  /** Reported after the WebRTC handshake: null = not answered yet. */
  direct: boolean | null;
}

const isCharacter = (v: unknown): v is CharacterId => typeof v === 'string' && v in CHARACTERS;

/**
 * One 1v1 match, in one of two modes:
 * - server: the server owns the game. It runs the same deterministic simulation as the browser
 *   at 60 Hz through the shared authority loop (authority.ts: each input applied at the tick the
 *   player pressed it, rewinding up to 150 ms), decides every hit and sends numbered snapshots
 *   with the game's events; clients only send inputs.
 * - direct: when the two browsers manage a WebRTC connection between themselves (tried for a few
 *   seconds when the second player joins), the inviter's browser runs the game and the traffic
 *   goes player to player, which is far faster when both are in the same city. The server then
 *   only introduces them, handles pause, rematch, drop and leave, and relays messages if the
 *   direct line breaks.
 */
export class DuelRoom extends Room {
  maxClients = 2;
  private seats: (Seat | null)[] = [null, null];
  private auth: Authority | null = null;
  /** Counts server ticks even while the game is paused, so snapshots keep flowing. */
  private serverTick = 0;
  private seq = 0;
  /** Direct mode: the host's browser runs the game; this room doesn't simulate. */
  private direct = false;
  private handshake: ReturnType<typeof setTimeout> | null = null;

  onCreate(options: JoinOptions) {
    if (options?.private) void this.setPrivate(true);

    this.onMessage('input', (client: Client, inputs: WireInput[]) => {
      const seat = this.seatOf(client);
      if (!seat || !Array.isArray(inputs) || !this.auth) return;
      const valid = inputs
        .slice(0, 10)
        .filter((w) => Array.isArray(w) && w.length === 4 && w.every((n) => typeof n === 'number' && Number.isFinite(n)));
      this.auth.receive(this.seats.indexOf(seat), valid);
    });
    // Version-2 clients report their round trip: the lag compensated for them.
    this.onMessage('rtt', (client: Client, ms: unknown) => {
      const seat = this.seatOf(client);
      if (seat && this.auth && typeof ms === 'number' && ms > 0 && ms < 5000) this.auth.setRoundTrip(this.seats.indexOf(seat), ms);
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
      if (!seat || (!this.direct && this.auth?.state.phase !== 'over')) return;
      seat.rematch = true;
      if (this.seats.every((s) => s?.rematch)) this.startGame();
    });

    // Pause needs both players: one asks (Esc Esc), the other agrees the same way.
    this.onMessage('pause', (client: Client) => {
      const seat = this.seatOf(client);
      if (!seat || !this.auth || this.auth.state.phase === 'over') return;
      seat.pause = true;
      if (this.seats.every((x) => x?.pause)) this.auth.state.paused = true;
      this.sendPause();
    });
    this.onMessage('cancelPause', (client: Client) => {
      const seat = this.seatOf(client);
      if (!seat || this.auth?.state.paused) return;
      seat.pause = false;
      this.sendPause();
    });
    this.onMessage('resume', (client: Client) => {
      if (!this.seatOf(client) || !this.auth) return;
      this.auth.state.paused = false;
      for (const x of this.seats) if (x) x.pause = false;
      this.sendPause();
    });

    // While dead you may pick who you come back as.
    this.onMessage('character', (client: Client, character: unknown) => {
      const seat = this.seatOf(client);
      if (!seat || !this.auth || !isCharacter(character)) return;
      seat.character = character;
      const slot = this.seats.indexOf(seat);
      this.auth.mutate((s) => chooseCharacter(s, slot, character));
    });

    // Colyseus' clock needs the simulation interval; the game ticks are paced by real time on top of it
    // (see fixedStep.ts: a plain 1000/60 interval ran at 58.5 Hz).
    const stats = process.env.TICK_STATS ? createTickStats(1000 / 60, (l) => console.log(l)) : null;
    const step = createFixedStep(1000 / 60, () => {
      const t0 = performance.now();
      this.tick();
      stats?.record(t0);
    });
    this.setSimulationInterval(() => step.poll(), 2);
  }

  onJoin(client: Client, options: JoinOptions) {
    const slot = this.seats[0] === null ? 0 : 1;
    this.seats[slot] = {
      client,
      character: isCharacter(options?.character) ? options.character : 'hotfix',
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
    if (this.auth) this.auth.state.paused = true;
    this.sendPause(); // the other client must stop predicting too
    this.broadcast('dropped', { slot, seconds: 20 });
    try {
      seat.client = await this.allowReconnection(client, 20);
      if (this.auth) this.auth.state.paused = false;
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
    this.auth = null;
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
      paused: !!this.auth?.state.paused,
    });
  }

  private seatOf(client: Client) {
    return this.seats.find((s) => s?.client === client) ?? null;
  }

  private startGame() {
    const [a, b] = this.seats as Seat[];
    const game = createGame([a.character, b.character], (Math.random() * 1e9) | 0, true);
    // Keep the measured round trips across a rematch.
    if (this.auth) this.auth.reset(game);
    else this.auth = createAuthority(game, { remote: [true, true] });
    for (const s of [a, b]) {
      s.rematch = false;
      s.pause = false;
    }
    [a, b].forEach((s, slot) => {
      const msg: StartMessage = { slot, characters: [a.character, b.character], direct: this.direct, v: PROTOCOL_VERSION };
      s.client.send('start', msg);
    });
  }

  private tick() {
    const auth = this.auth;
    if (!auth || this.direct) return;
    const events = auth.advance([null, null]);
    // Test hook: NET_PROBE=1 logs every hit with the victim's position (for the network tests).
    if (process.env.NET_PROBE) {
      for (const e of events) {
        if (e.type !== 'hit' && e.type !== 'ko') continue;
        const f = auth.state.fighters[e.fighter];
        console.log(`AUTH ${JSON.stringify({ t: Date.now(), e: e.type, victim: e.fighter, x: f.x, y: f.y })}`);
      }
    }
    this.serverTick += 1;
    if (this.serverTick % SNAPSHOT_EVERY_TICKS === 0) {
      this.seq += 1;
      const raw = snapshotMessage(auth, this.seq);
      this.broadcast('snap', raw);
    }
  }
}
