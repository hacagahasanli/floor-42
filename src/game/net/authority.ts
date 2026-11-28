import { step } from '../sim/step';
import { EMPTY_INPUT } from '../sim/types';

import { cloneState } from './clone';
import { decodeInput, encodeInput } from './protocol';

import type { EventBatch, WireInput } from './protocol';
import type { GameEvent, GameState, InputState } from '../sim/types';

/**
 * The authoritative game loop, shared by the inviter's browser (direct play) and the game server.
 *
 * A remote player's inputs arrive half a round trip late, later with jitter and stalls. The old
 * loop applied each input on the first tick after it arrived and, while nothing had arrived, kept
 * the player running with their last input. So the authority judged hits against where a remote
 * player had been a round trip earlier: you dodged on your screen and were hit where you no
 * longer were.
 *
 * Lag compensation with a cap: each remote input is applied at the tick its sender pressed it
 * (estimated as arrival minus the one-way delay), by rewinding the game to that tick and replaying
 * forward. Never more than REWIND_CAP_TICKS (150 ms): an input slower than that only adds its
 * presses to the next tick, so a far or frozen player can't reach back and undo what already
 * happened. While an input is missing, the player keeps their last movement (a guess, corrected
 * by a rewind when the real input lands).
 *
 * Inputs are numbered by their sender (one per sender tick). Each authority tick consumes the
 * counters up to `tick - offset`; the offset follows the arrivals so that the fastest inputs land
 * `comp` ticks (the one-way delay) after they were due.
 */

export const REWIND_CAP_TICKS = 9; // 150 ms at 60 Hz
const TICK_MS = 1000 / 60;
/** Bits of presses that must not be lost when inputs are folded: up, down, dash, fire, pickup, reload, push, throw bomb. */
const PRESSES = 0b10111111100;
/** Bits cleared when holding a missing input: up, dash, pickup, reload, push, throw bomb (fire and down stay held). */
const HOLD_CLEAR = 0b10111010100;
/**
 * Fire and push act on the other player. A late input moves its sender in the past (that's the
 * dodge that counts), but its shots and shoves start when it arrives: a bullet that appears
 * already halfway to you, or hits you before it was ever drawn, is exactly the unfair death this
 * module exists to prevent, so it must not happen to the host either.
 */
const ATTACK = (1 << 5) | (1 << 8) | (1 << 10);
const WINDOW = 120; // arrival samples kept for the offset (about 2 s)
/**
 * At most 5 ticks (83 ms) of the 150 ms are spent on the steady one-way delay; the rest is
 * headroom for jitter, so a slightly slow input still lands inside the window.
 */
export const MAX_COMP_TICKS = REWIND_CAP_TICKS - 4;

interface Tick {
  /** State before this tick ran. */
  before: GameState;
  inputs: InputState[];
  /** Remote seats: the highest counter this tick consumed (-1: none yet). */
  counter: number[];
  /** Remote seats: the input whose movement is held after this tick. */
  held: (WireInput | null)[];
  /** Remote seats: the input this tick needed had arrived (false: a guess a rewind may replace). */
  real: boolean[];
  stateTick: number;
  events: GameEvent[];
}

interface Remote {
  /** Counter n is due at tick n + offset. Null until the first input arrives. */
  offset: number | null;
  /** One-way delay compensated, in ticks (0 .. MAX_COMP_TICKS). */
  comp: number;
  /** Recent round trips reported; the best one is the path without queueing or jitter. */
  rtts: number[];
  inbox: Map<number, WireInput>;
  /** Every counter received recently: inputs are sent several times over, count each once. */
  seen: Set<number>;
  /** The first tick each received counter may attack in (the tick after it arrived). */
  arrived: Map<number, number>;
  /** Counters whose attack was already moved to their arrival (a later rewind must not repeat it). */
  deferred: Set<number>;
  arrivals: number[];
  /** Presses from inputs too late to rewind for, added to the next tick. */
  latePresses: number;
  stats: { rewinds: number; lateInputs: number; heldTicks: number; inputs: number };
}

export interface AuthorityOptions {
  /** Which seats send their inputs over the network. */
  remote: boolean[];
}

export const createAuthority = (initial: GameState, opts: AuthorityOptions) => {
  let state = initial;
  let now = 0;
  const ring = new Map<number, Tick>();
  const newRemote = (): Remote => ({
    offset: null,
    comp: 0,
    rtts: [],
    inbox: new Map(),
    seen: new Set(),
    arrived: new Map(),
    deferred: new Set(),
    arrivals: [],
    latePresses: 0,
    stats: { rewinds: 0, lateInputs: 0, heldTicks: 0, inputs: 0 },
  });
  const remotes: (Remote | null)[] = opts.remote.map((r) => (r ? newRemote() : null));
  let dirtyFrom: number | null = null;
  /** Earliest tick whose events were not handed out yet (or were replaced by a rewind). */
  let eventsFrom = 1;
  const copy = (s: GameState) => cloneState(s);
  const counterAt = (t: number, seat: number) => ring.get(t)?.counter[seat] ?? -1;

  /** The tick that consumes counter n: a future tick, a tick still open to rewinds, or 'late'. */
  const dueTick = (seat: number, n: number): number | 'late' => {
    const cNow = counterAt(now, seat);
    if (n > cNow) return cNow < 0 ? now + 1 : now + (n - cNow);
    for (let t = now; t > Math.max(0, now - REWIND_CAP_TICKS); t--) {
      if (n > counterAt(t - 1, seat)) return t;
    }
    return 'late';
  };

  /** A remote seat's input for tick t, which consumes counters (prev, cur]. */
  const resolve = (r: Remote, t: number, prev: number, cur: number, held: WireInput | null) => {
    let presses = 0;
    let latest: WireInput | null = null;
    let early = false;
    for (let n = Math.max(prev + 1, cur - 30); n <= cur; n++) {
      const w = r.inbox.get(n);
      if (!w) continue;
      presses |= w[1] & PRESSES;
      latest = w;
      if ((r.arrived.get(n) ?? 0) > t) {
        // Moved into the past: its shot or shove waits for the tick it arrived (once).
        early = true;
        if (w[1] & ATTACK && !r.deferred.has(n)) {
          r.deferred.add(n);
          r.latePresses |= w[1] & ATTACK;
        }
      }
    }
    const strip = (bits: number) => (early ? bits & ~ATTACK : bits);
    if (latest) return { wire: [latest[0], strip((latest[1] & ~PRESSES) | presses), latest[2], latest[3]] as WireInput, held: latest, real: true };
    const missing = cur > prev; // a tick that should have had a new input
    if (held) {
      const heldEarly = (r.arrived.get(held[0]) ?? 0) > t;
      const bits = held[1] & ~HOLD_CLEAR;
      return { wire: [held[0], heldEarly ? bits & ~ATTACK : bits, held[2], held[3]] as WireInput, held, real: !missing };
    }
    return { wire: encodeInput(0, EMPTY_INPUT), held: null, real: !missing };
  };

  /** Run tick t from the current state. `replay` keeps the counters it consumed the first time. */
  const runTick = (t: number, local: (InputState | null)[], replay: Tick | null) => {
    const counter: number[] = [];
    const held: (WireInput | null)[] = [];
    const real: boolean[] = [];
    const inputs: InputState[] = [];
    remotes.forEach((r, seat) => {
      if (!r) {
        inputs[seat] = replay ? replay.inputs[seat] : (local[seat] ?? EMPTY_INPUT);
        return;
      }
      const prev = counterAt(t - 1, seat);
      const cur = replay ? replay.counter[seat] : r.offset === null ? prev : Math.max(prev, t - r.offset);
      const res = resolve(r, t, prev, cur, ring.get(t - 1)?.held[seat] ?? null);
      let wire = res.wire;
      if (!replay) {
        if (r.latePresses) {
          wire = [wire[0], wire[1] | r.latePresses, wire[2], wire[3]];
          r.latePresses = 0;
        }
        if (!res.real) r.stats.heldTicks += 1;
      }
      counter[seat] = cur;
      held[seat] = res.held;
      real[seat] = res.real;
      inputs[seat] = decodeInput(wire);
    });
    // A pause set between ticks is part of the recorded state: a replay must keep it.
    if (replay) state.paused = replay.before.paused;
    const before = copy(state);
    step(state, inputs);
    const rec: Tick = { before, inputs, counter, held, real, stateTick: state.tick, events: state.events };
    ring.set(t, rec);
    ring.delete(t - REWIND_CAP_TICKS - 2);
    return rec;
  };

  const rewind = (from: number) => {
    const first = ring.get(from);
    if (!first) return;
    state = copy(first.before);
    for (let t = from; t <= now; t++) runTick(t, [], ring.get(t)!);
    eventsFrom = Math.min(eventsFrom, from);
  };

  return {
    get state() {
      return state;
    },
    /** Ticks run so far. */
    get tick() {
      return now;
    },
    /** The one-way delay to compensate for a remote seat, from its best recent round trip. */
    setRoundTrip: (seat: number, rttMs: number) => {
      const r = remotes[seat];
      if (!r || !Number.isFinite(rttMs) || rttMs < 0) return;
      r.rtts.push(rttMs);
      if (r.rtts.length > 10) r.rtts.shift();
      r.comp = Math.max(0, Math.min(MAX_COMP_TICKS, Math.round(Math.min(...r.rtts) / 2 / TICK_MS)));
    },
    /** A remote seat's inputs arrived: any order, duplicates allowed. */
    receive: (seat: number, wires: WireInput[]) => {
      const r = remotes[seat];
      if (!r) return;
      for (const w of wires) {
        const n = w[0];
        if (r.seen.has(n)) continue;
        r.seen.add(n);
        r.stats.inputs += 1;
        if (r.offset === null) r.offset = now + 1 - n;
        r.arrivals.push(now - n);
        if (r.arrivals.length > WINDOW) r.arrivals.shift();
        const due = dueTick(seat, n);
        if (due === 'late') {
          // Too late to rewind for: its presses go into the next tick, a jump is never lost.
          r.latePresses |= w[1] & PRESSES;
          r.stats.lateInputs += 1;
          continue;
        }
        r.inbox.set(n, w);
        r.arrived.set(n, now + 1);
        if (due <= now) {
          dirtyFrom = Math.min(dirtyFrom ?? due, due);
        }
      }
    },
    /** Run the next tick. `local` holds the inputs of the seats that are not remote. */
    advance: (local: (InputState | null)[]): GameEvent[] => {
      if (dirtyFrom !== null) {
        rewind(dirtyFrom);
        remotes.forEach((r) => r && (r.stats.rewinds += 1));
        dirtyFrom = null;
      }
      // The offset follows the arrivals: the fastest inputs are due `comp` ticks before they land.
      if (now % 15 === 0) {
        remotes.forEach((r) => {
          if (!r || r.offset === null || r.arrivals.length < 10) return;
          const target = Math.min(...r.arrivals) + 1 - r.comp;
          if (target > r.offset) r.offset += 1;
          else if (target < r.offset) r.offset -= 1;
        });
      }
      now += 1;
      const rec = runTick(now, local, null);
      remotes.forEach((r, seat) => {
        if (!r) return;
        const gone = counterAt(now - REWIND_CAP_TICKS - 1, seat);
        for (const n of r.inbox.keys()) if (n <= gone) r.inbox.delete(n);
        for (const n of r.arrived.keys()) if (n <= gone) r.arrived.delete(n);
        for (const n of r.deferred) if (n <= gone) r.deferred.delete(n);
        if (r.seen.size > 600) for (const n of r.seen) if (n < gone - 240) r.seen.delete(n);
      });
      return rec.events;
    },
    /** For a snapshot: the last counter applied for a seat and the input it runs with now. */
    seatView: (seat: number): { ack: number; wire: WireInput } => {
      const k = ring.get(now);
      if (!k || !remotes[seat]) return { ack: 0, wire: [0, 0, 0, 0] };
      return { ack: Math.max(0, k.counter[seat]), wire: encodeInput(Math.max(0, k.counter[seat]), k.inputs[seat]) };
    },
    /**
     * What a snapshot carries. The newest ticks ran on guesses for inputs still on their way
     * (that's what lag compensation means), so the state sent is the newest tick that every
     * remote input really reached (or the oldest one no rewind can change any more), plus the
     * inputs of every seat for the ticks after it: a client replays them and gets the newest tick
     * without adopting guesses about its own inputs.
     */
    snapshot: () => {
      let c = Math.max(0, now - REWIND_CAP_TICKS);
      for (let t = c + 1; t <= now; t++) {
        const k = ring.get(t);
        if (!k || remotes.some((r, seat) => r && !k.real[seat])) break;
        c = t;
      }
      const at = ring.get(c);
      const st = c >= now ? state : (ring.get(c + 1)?.before ?? state);
      const seats = opts.remote.map((_, seat) => {
        const ack = Math.max(0, at?.counter[seat] ?? 0);
        const wire = at ? encodeInput(ack, at.inputs[seat]) : ([0, 0, 0, 0] as WireInput);
        const next: WireInput[] = [];
        for (let t = c + 1; t <= now; t++) {
          const k = ring.get(t);
          if (k) next.push(encodeInput(Math.max(0, k.counter[seat] ?? t), k.inputs[seat]));
        }
        return { ack, wire, next };
      });
      return { state: st, seats };
    },
    /** Events since the last call, with every tick a rewind replayed (they replace the old ones). */
    takeEvents: (): EventBatch | null => {
      if (eventsFrom > now) return null;
      const before = ring.get(eventsFrom - 1);
      const from = before ? before.stateTick + 1 : 0;
      const e: [number, GameEvent][] = [];
      for (let t = eventsFrom; t <= now; t++) for (const ev of ring.get(t)?.events ?? []) e.push([ring.get(t)!.stateTick, ev]);
      const replaced = eventsFrom < now;
      eventsFrom = now + 1;
      if (!e.length && !replaced) return null;
      return { from, to: state.tick, e };
    },
    stats: (seat: number) => remotes[seat]?.stats ?? null,
    /** Change the game outside a tick (a character pick): also in the saved past, so a rewind keeps it. */
    mutate: (fn: (s: GameState) => void) => {
      fn(state);
      for (const k of ring.values()) fn(k.before);
    },
    /** A new round (rematch): start over. */
    reset: (next: GameState) => {
      state = next;
      now = 0;
      ring.clear();
      dirtyFrom = null;
      eventsFrom = 1;
      remotes.forEach((r, i) => {
        if (!r) return;
        const { comp, rtts } = r;
        remotes[i] = newRemote();
        Object.assign(remotes[i]!, { comp, rtts });
      });
    },
  };
};

export type Authority = ReturnType<typeof createAuthority>;
