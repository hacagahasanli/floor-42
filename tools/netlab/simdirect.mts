// Deterministic network simulation of one DIRECT (browser-to-browser WebRTC) match, no browsers. The counterpart of
// sim.mts (server mode over WebSocket/TCP), same scripted players and the same metrics, so the two can be compared.
//   npx tsx tools/netlab/simdirect.mts [--rtt 60] [--jitter 10] [--loss 0.01] [--secs 60] [--seed 1] [--nofire] [--json]
//
// Runs the REAL code: the host session (host.ts: the authority runs in slot 0's browser) and the guest session
// (client.ts: prediction, reconciliation, timeline). The line is modelled as peer.ts opens it:
//  - 'game' channel, unordered and maxRetransmits 0: each message gets its own one-way delay rtt/2 + U(0, jitter), so
//    messages can overtake each other, and is LOST with probability 1 - (1 - loss)^chunks (1150-byte SCTP chunks).
//    Inputs repeat the last 8 ticks (client.ts), snapshots are full state: a loss costs one packet, nothing waits.
//  - 'ctl' channel, reliable and ordered (events, character picks): TCP-like, a loss is resent after max(200, 1.5 rtt)
//    and what follows waits (as in sim.mts).
// RTT here is browser to browser (the direct line), not to a server.
import { createOnlineSession } from '../../src/game/net/client';
import { createHostSession } from '../../src/game/net/host';
import { EMPTY_INPUT } from '../../src/game/sim/types';

import type { PeerLink, PeerMessage } from '../../src/game/net/peer';
import type { StartMessage } from '../../src/game/net/protocol';
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
let seed = opt('seed', 1) >>> 0;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

let vt = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => vt, timeOrigin: 0 }, configurable: true });
const netprobe: { k: string; own?: number }[] = [];
(globalThis as { __netprobe?: unknown[] }).__netprobe = netprobe;

type Q = { at: number; fn: () => void }[];
const queue: Q = [];
const at = (t: number, fn: () => void) => queue.push({ at: t, fn });
/** One direction of the line: an unreliable channel and an ordered reliable one. */
const direction = () => {
  let lastReliable = 0;
  return {
    unreliable(bytes: number, fn: () => void) {
      const chunks = Math.max(1, Math.ceil(bytes / 1150));
      if (rnd() < 1 - Math.pow(1 - LOSS, chunks)) return;
      at(vt + RTT / 2 + JITTER * rnd(), fn);
    },
    reliable(fn: () => void) {
      let t = vt + RTT / 2 + JITTER * rnd();
      if (rnd() < LOSS) t += Math.max(200, 1.5 * RTT);
      t = Math.max(t, lastReliable);
      lastReliable = t;
      at(t, fn);
    },
  };
};

const makeLink = (out: ReturnType<typeof direction>, deliverTo: () => ((m: PeerMessage) => void)[], heard: { t: number }) => {
  const handlers: ((m: PeerMessage) => void)[] = [];
  const link: PeerLink & { handlers: typeof handlers; bytes: number } = {
    direct: true,
    mode: 'direct',
    rtt: RTT + JITTER / 2,
    minRtt: RTT,
    get lastHeard() {
      return heard.t;
    },
    handlers,
    bytes: 0,
    send: (m: PeerMessage, reliable = false) => {
      const raw = JSON.stringify(m);
      if (vt > 3000) link.bytes += raw.length;
      const go = () => deliverTo().forEach((h) => h(JSON.parse(raw)));
      if (reliable) out.reliable(go);
      else out.unreliable(raw.length, go);
    },
    on: (cb) => {
      handlers.push(cb);
      return () => {};
    },
    close: () => {},
  };
  return link;
};

const hostHeard = { t: 0 };
const guestHeard = { t: 0 };
const toGuest = direction();
const toHost = direction();
let hostLink: ReturnType<typeof makeLink>;
let guestLink: ReturnType<typeof makeLink>;
// Each side's handlers also mark "heard" (peer.ts does it on any message).
hostLink = makeLink(toGuest, () => [(..._a) => (guestHeard.t = vt), ...guestLink.handlers], hostHeard);
guestLink = makeLink(toHost, () => [(..._a) => (hostHeard.t = vt), ...hostLink.handlers], guestHeard);
const room = { onMessage: () => () => {}, send: () => {}, ping: () => {} };
const ARENA = args.includes('--office') ? undefined : ('offsite' as const);
const start = (slot: number): StartMessage => ({ slot, characters: ['hotfix', 'legacy'], v: 4, direct: true, ...(ARENA ? { arena: ARENA } : {}) });
const host = createHostSession(room as never, hostLink, start(0));
const guest = createOnlineSession(room as never, start(1), guestLink);
const sessions = [host, guest];

const botInput = (slot: number, t: number): InputState => {
  const ph = Math.floor(t / 700) + slot * 13;
  const h = Math.imul(ph, 2654435761) >>> 0;
  return {
    ...EMPTY_INPUT,
    left: (h & 3) === 0,
    right: (h & 3) === 1,
    up: (h & 28) === 0 && t % 700 < 40,
    fire: !args.includes('--nofire') && (h & 96) !== 0,
    dash: (h & 255) === 7 && t % 700 < 40,
    aimX: slot === 0 ? 1 : -1,
    aimY: 0,
  };
};

const TICK = 1000 / 60;
const warm = 3000;
const end = SECS * 1000;
const lastDir = [0, 0];
const turns: { slot: number; at: number; dir: number; ownAt?: number; rivalAt?: number }[] = [];
let nextTick = 0;
for (; vt <= end; vt += 0.5) {
  queue.sort((a, b) => a.at - b.at);
  while (queue.length && queue[0].at <= vt) queue.shift()!.fn();
  while (nextTick <= vt) {
    nextTick += TICK;
    sessions.forEach((s, slot) => {
      const inp = botInput(slot, nextTick);
      const dir = inp.right ? 1 : inp.left ? -1 : 0;
      if (dir !== 0 && dir !== lastDir[slot] && vt > warm) turns.push({ slot, at: vt, dir });
      lastDir[slot] = dir;
      s.tick(inp);
    });
    if (vt < warm) continue;
    // Draw: the host draws the authority's state; the guest its prediction (own) and the timeline (rival).
    sessions.forEach((s, slot) => {
      const rival = 1 - slot;
      const view = s.present?.(TICK)?.view;
      const drawnRival = view ? view.fighters[rival] : s.state.fighters[rival];
      const ownVx = s.state.fighters[slot].vx;
      for (const tr of turns) {
        if (tr.slot === slot && tr.ownAt === undefined && Math.sign(ownVx) === tr.dir && vt >= tr.at) tr.ownAt = vt;
        if (tr.slot === rival && tr.rivalAt === undefined && Math.sign(drawnRival.vx) === tr.dir && Math.abs(drawnRival.vx) > 0.5 && vt >= tr.at) tr.rivalAt = vt;
      }
    });
  }
}
const q = (a: number[], p: number) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
};
const done = turns.filter((t) => t.ownAt !== undefined && t.rivalAt !== undefined && t.rivalAt - t.at < 1500);
const minutes = (end - warm) / 60_000;
const rec = netprobe.filter((p) => p.k === 'rec');
const lat = (xs: typeof done) => ({ p50: q(xs.map((t) => t.rivalAt! - t.at), 0.5), p95: q(xs.map((t) => t.rivalAt! - t.at), 0.95) });
const latency = {
  turns: done.length,
  inputToOwnMs: { p50: q(done.map((t) => t.ownAt! - t.at), 0.5), p95: q(done.map((t) => t.ownAt! - t.at), 0.95) },
  inputToRivalMs: lat(done),
  guestSeesHostMs: lat(done.filter((t) => t.slot === 0)),
  hostSeesGuestMs: lat(done.filter((t) => t.slot === 1)),
  // Only the guest reconciles (the host runs the game): its corrections, per minute. Pooled per client for sim.mts parity.
  correctionsPerMin: +(rec.filter((p) => (p.own ?? 0) > 0.05).length / minutes / 2).toFixed(1),
  rubberBandsPerMin: +(rec.filter((p) => (p.own ?? 0) > 0.5).length / minutes / 2).toFixed(2),
  guestUnderruns: guest.timeline?.underruns,
  guestDelayMs: guest.timeline?.delayMs,
  bytesPerSec: [Math.round(hostLink.bytes / ((end - warm) / 1000)), Math.round(guestLink.bytes / ((end - warm) / 1000))],
};
const r = { mode: 'direct', RTT, JITTER, LOSS, SECS, latency };
if (args.includes('--json')) console.log(JSON.stringify(r));
else
  console.log(
    `direct rtt ${RTT} jitter ${JITTER} loss ${LOSS} | input->own p50 ${latency.inputToOwnMs.p50} p95 ${latency.inputToOwnMs.p95} | input->rival p50 ${latency.inputToRivalMs.p50} p95 ${latency.inputToRivalMs.p95} (guest sees host ${JSON.stringify(latency.guestSeesHostMs)}, host sees guest ${JSON.stringify(latency.hostSeesGuestMs)}) | corr>5cm ${latency.correctionsPerMin}/min >50cm ${latency.rubberBandsPerMin}/min | underruns ${latency.guestUnderruns} delay ${latency.guestDelayMs}`,
  );
process.exit(0);
