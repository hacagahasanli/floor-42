// Deterministic network simulation of one server-mode match, no browsers.
//   npx tsx tools/netlab/sim.mts [--rtt 60] [--jitter 10] [--loss 0.01] [--secs 60] [--seed 1] [--json]
//
// Runs the REAL code: the shared authority (lag compensation, rewinds), the snapshot encoder, the
// client session (prediction, reconciliation) and the timeline (interpolation), on a virtual
// clock. Only the network is modelled, with the same TCP semantics as netshim.js: one-way delay
// rtt/2 + U(0, jitter), order kept, a lost message is resent after max(200, 1.5 rtt) ms and
// everything behind it waits (head-of-line blocking).
//
// What it reports (per client, pooled):
//  - rival age: how far behind the authority's truth the drawn rival is, measured by matching the
//    drawn position against the authority's recorded path. The network's own share is rtt/2 +
//    jitter/2; "added" is what is left, i.e. what our code adds on top of the network.
//  - snapshot gaps, bytes per second the server sends one client, underruns, own corrections.
import { createAuthority } from '../../src/game/net/authority';
import { createOnlineSession } from '../../src/game/net/client';
import { SNAPSHOT_EVERY_TICKS } from '../../src/game/net/protocol';
import { snapshotMessage } from '../../src/game/net/serverSnapshot';
import { createGame } from '../../src/game/sim/step';
import { EMPTY_INPUT } from '../../src/game/sim/types';

import type { InputState } from '../../src/game/sim/types';

const args = process.argv.slice(2);
const opt = (k: string, d: number) => {
  const i = args.indexOf('--' + k);
  return i < 0 ? d : Number(args[i + 1]);
};
const RTT = opt('rtt', 60);
const JITTER = opt('jitter', 10);
const LOSS = opt('loss', 0.01);
const SECS = opt('secs', 60);
const ARENA = args.includes('--office') ? undefined : ('offsite' as const);
let seed = opt('seed', 1) >>> 0;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Virtual clock: the client code reads performance.now().
let vt = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => vt, timeOrigin: 0 }, configurable: true });

/** TCP-like one-direction pipe. */
const pipe = () => {
  let last = 0;
  const q: { at: number; fn: () => void }[] = [];
  return {
    send(fn: () => void) {
      let at = vt + RTT / 2 + JITTER * rnd();
      if (rnd() < LOSS) at += Math.max(200, 1.5 * RTT);
      at = Math.max(at, last);
      last = at;
      q.push({ at, fn });
    },
    pump() {
      while (q.length && q[0].at <= vt) q.shift()!.fn();
    },
  };
};

const TICK = 1000 / 60;
const game = createGame(['hotfix', 'legacy'], 7, true, undefined, ARENA ? { arena: ARENA } : undefined);
// The client's reconcile probe: every own correction (metres) it had to absorb.
const netprobe: { k: string; own?: number; t: number }[] = [];
(globalThis as { __netprobe?: unknown[] }).__netprobe = netprobe;
const auth = createAuthority(game, { remote: [true, true] });
auth.setRoundTrip(0, RTT);
auth.setRoundTrip(1, RTT);

interface Sink {
  snap?: (raw: string) => void;
}
const makeClient = (slot: number) => {
  const toClient = pipe();
  const toServer = pipe();
  const sink: Sink = {};
  const room = {
    onMessage: (type: string, cb: (m: never) => void) => {
      if (type === 'snap') sink.snap = cb as never;
      return () => {};
    },
    send: () => {},
    ping: () => {},
  };
  const session = createOnlineSession(room as never, { slot, characters: ['hotfix', 'legacy'], v: 4, ...(ARENA ? { arena: ARENA } : {}) });
  // The session sends inputs with room.send('input', [w]): route them over the simulated pipe.
  (room as { send: unknown }).send = (type: string, payload: never) => {
    if (type === 'input') toServer.send(() => auth.receive(slot, payload));
  };
  return { slot, toClient, toServer, sink, session, bytes: 0, gaps: [] as number[], lastSnap: -1, rivalAge: [] as number[], corr: [] as number[], lastOwn: null as null | { x: number; y: number } };
};
const clients = [makeClient(0), makeClient(1)];

// A bot: runs, jumps, fires and dashes on a seeded schedule.
const botInput = (slot: number, t: number): InputState => {
  const ph = Math.floor(t / 700) + slot * 13;
  const h = Math.imul(ph, 2654435761) >>> 0;
  return {
    ...EMPTY_INPUT,
    left: (h & 3) === 0,
    right: (h & 3) === 1,
    up: (h & 28) === 0 && t % 700 < 40,
    fire: !args.includes("--nofire") && (h & 96) !== 0,
    dash: (h & 255) === 7 && t % 700 < 40,
    aimX: slot === 0 ? 1 : -1,
    aimY: 0,
  };
};

// Authority path of each fighter, to date the drawn rival.
const path: { t: number; x: number[] }[] = [];
// Input -> rival screen: when a client changes direction (left/right), how long until the OTHER client draws the
// rival moving that way. And input -> own screen: how long until this client's own drawn fighter moves that way.
const lastDir = [0, 0];
const turns: { slot: number; at: number; dir: number; ownAt?: number; rivalAt?: number }[] = [];
let seq = 0;
let nextClientTick = 0;
let nextServerTick = 0;
let nextFrame = 0;
let serverTicks = 0;
const end = SECS * 1000;
const warm = 3000;
for (; vt <= end; vt += 0.5) {
  for (const c of clients) {
    c.toClient.pump();
    c.toServer.pump();
  }
  while (nextServerTick <= vt) {
    nextServerTick += TICK;
    auth.advance([null, null]);
    serverTicks += 1;
    path.push({ t: nextServerTick, x: auth.state.fighters.map((f) => f.x) });
    if (serverTicks % SNAPSHOT_EVERY_TICKS === 0) {
      seq += 1;
      const raw = snapshotMessage(auth, seq);
      for (const c of clients) {
        if (vt > warm) c.bytes += raw.length;
        c.toClient.send(() => c.sink.snap?.(raw));
      }
    }
  }
  while (nextClientTick <= vt) {
    nextClientTick += TICK;
    for (const c of clients) {
      const inp = botInput(c.slot, nextClientTick);
      const dir = inp.right ? 1 : inp.left ? -1 : 0;
      if (dir !== 0 && dir !== lastDir[c.slot] && vt > warm) turns.push({ slot: c.slot, at: vt, dir });
      lastDir[c.slot] = dir;
      c.session.tick(inp);
    }
  }
  while (nextFrame <= vt) {
    nextFrame += TICK;
    for (const c of clients) {
      const p = c.session.present?.(TICK);
      if (!p?.view || vt < warm) continue;
      const rival = 1 - c.slot;
      const drawn = p.view.fighters[rival];
      const truth = path.slice(-40); // last ~670 ms of authority positions
      let best = Infinity;
      let bestT = 0;
      for (const s of truth) {
        const d = Math.abs(s.x[rival] - drawn.x);
        if (d < best) {
          best = d;
          bestT = s.t;
        }
      }
      // Only frames where the rival moves: a standing fighter has no meaningful age.
      if (Math.abs(drawn.vx) > 2 && best < 0.5) c.rivalAge.push(vt - bestT);
      // The frame drawn now (render runs right after the tick in the browser too).
      const ownVx = c.session.state.fighters[c.slot].vx;
      for (const tr of turns) {
        if (tr.slot === c.slot && tr.ownAt === undefined && Math.sign(ownVx) === tr.dir && vt >= tr.at) tr.ownAt = vt;
        if (tr.slot === rival && tr.rivalAt === undefined && Math.sign(drawn.vx) === tr.dir && Math.abs(drawn.vx) > 0.5 && vt >= tr.at) tr.rivalAt = vt;
      }
      const own = c.session.state.fighters[c.slot];
      if (c.lastOwn) c.corr.push(Math.hypot(own.x - c.lastOwn.x, own.y - c.lastOwn.y));
      c.lastOwn = { x: own.x, y: own.y };
    }
  }
}
// Snapshot gaps, from the clients' view (the session records them in its own status).
const q = (a: number[], p: number) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
};
const out = clients.map((c) => ({
  slot: c.slot,
  rivalAgeMs: { p50: q(c.rivalAge, 0.5), p95: q(c.rivalAge, 0.95), n: c.rivalAge.length },
  addedMs: { p50: +(q(c.rivalAge, 0.5) - RTT / 2).toFixed(1), p95: +(q(c.rivalAge, 0.95) - RTT / 2).toFixed(1) },
  bytesPerSec: Math.round(c.bytes / ((end - warm) / 1000)),
  timeline: c.session.timeline,
}));
const done = turns.filter((t) => t.ownAt !== undefined && t.rivalAt !== undefined && t.rivalAt - t.at < 1500);
const corrections = netprobe.filter((p) => p.k === 'rec' && (p.own ?? 0) > 0.05).length;
const rubber = netprobe.filter((p) => p.k === 'rec' && (p.own ?? 0) > 0.5).length;
const minutes = (end - warm) / 60_000;
const latency = {
  turns: done.length,
  inputToOwnMs: { p50: q(done.map((t) => t.ownAt! - t.at), 0.5), p95: q(done.map((t) => t.ownAt! - t.at), 0.95) },
  inputToRivalMs: { p50: q(done.map((t) => t.rivalAt! - t.at), 0.5), p95: q(done.map((t) => t.rivalAt! - t.at), 0.95) },
  correctionsPerMin: +(corrections / minutes / 2).toFixed(1),
  rubberBandsPerMin: +(rubber / minutes / 2).toFixed(2),
};
const r = { RTT, JITTER, LOSS, SECS, arena: ARENA ?? 'office', snapEveryTicks: SNAPSHOT_EVERY_TICKS, latency, out };
if (args.includes('--json')) console.log(JSON.stringify(r));
else {
  console.log(`rtt ${RTT} jitter ${JITTER} loss ${LOSS} | snapshot every ${SNAPSHOT_EVERY_TICKS} tick(s) | ${ARENA ?? 'office'}`);
  console.log(
    `input->own p50 ${latency.inputToOwnMs.p50} p95 ${latency.inputToOwnMs.p95} ms | input->rival screen p50 ${latency.inputToRivalMs.p50} p95 ${latency.inputToRivalMs.p95} ms (${latency.turns} turns) | own corrections >5cm ${latency.correctionsPerMin}/min, >50cm ${latency.rubberBandsPerMin}/min per client`,
  );
  for (const o of out)
    console.log(
      `client ${o.slot}: rival age p50 ${o.rivalAgeMs.p50} p95 ${o.rivalAgeMs.p95} ms (network share ${RTT / 2}) -> added p50 ${o.addedMs.p50} p95 ${o.addedMs.p95} | ${o.bytesPerSec} B/s | delay ${o.timeline?.delayMs} ms underruns ${o.timeline?.underruns} received ${o.timeline?.received}`,
    );
}
process.exit(0);
