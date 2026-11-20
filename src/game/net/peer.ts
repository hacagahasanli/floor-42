import type { EventBatch } from './protocol';
import type { Room } from '@colyseus/sdk';

/**
 * A direct WebRTC line between the two players, so game traffic doesn't travel to the server
 * and back. The game server only introduces the two browsers (it relays the WebRTC offer,
 * answer and network candidates) and stays as a fallback relay.
 *
 * Two data channels:
 * - `game`: unordered, no retransmits. Inputs and snapshots: a late packet is a useless packet,
 *   and each one repeats what matters (inputs carry the last few ticks, snapshots the whole state).
 * - `ctl`: reliable and ordered, for the rare one-off messages (picking a character).
 *
 * If the direct line never opens (some mobile networks block it) the match runs on the server as
 * before. If it goes quiet mid-match (no message for 600 ms, or the connection reports
 * disconnected) every message also goes through the server's relay until the line talks again:
 * a data channel stays "open" for seconds after the network under it died, and messages sent into
 * it are silently lost. Both sides drop duplicates (inputs by number, snapshots by seq).
 *
 * TURN: two players behind strict NATs (many mobile networks, some offices) can't reach each
 * other with STUN alone. A TURN server relays their traffic instead, still far closer than the
 * game server when it runs near them. Configure one with NEXT_PUBLIC_TURN_URL (comma-separated
 * turn:/turns: URLs), NEXT_PUBLIC_TURN_USERNAME and NEXT_PUBLIC_TURN_CREDENTIAL. See
 * docs/TECHNICAL.md, "TURN".
 */

const turnUrls = (process.env.NEXT_PUBLIC_TURN_URL ?? '')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);
export const ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  ...(turnUrls.length
    ? [{ urls: turnUrls, username: process.env.NEXT_PUBLIC_TURN_USERNAME, credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL }]
    : []),
];

/**
 * The game server accepts at most 4 KB per message from a client (Colyseus' WebSocket default) and
 * disconnects a client that sends more. A snapshot is 3-8 KB, so through the relay it travels in
 * parts. (Before this, the first snapshot relayed after the direct line dropped cut the host off
 * the server and ended the match: "Your rival left".)
 */
const RELAY_PART = 3000;

/** How messages travel right now: straight between browsers, through a TURN relay, or through the game server. */
export type LinkMode = 'direct' | 'turn' | 'relay';
const QUIET_MS = 600;

export type PeerMessage =
  | { t: 'in'; w: [number, number, number, number][] }
  | { t: 'snap'; raw: string }
  | { t: 'char'; c: string }
  | { t: 'ev'; b: EventBatch }
  | { t: 'ping'; n: number }
  | { t: 'part'; id: number; i: number; n: number; d: string }
  | { t: 'pong'; n: number };

export interface PeerLink {
  /** True while the direct line is open and talking (else messages go through the server relay). */
  readonly direct: boolean;
  readonly mode: LinkMode;
  send: (m: PeerMessage, reliable?: boolean) => void;
  on: (cb: (m: PeerMessage) => void) => () => void;
  /** Round-trip time to the other player in ms, measured over the line in use. */
  readonly rtt: number;
  /** The best round trip of the last few pings (for lag compensation: jitter excluded). */
  readonly minRtt: number;
  /** When anything last arrived from the other player (performance.now()). */
  readonly lastHeard: number;
  close: () => void;
}

/**
 * Start connecting to the other player. `host` (slot 0) makes the offer. Resolves with the link
 * once the direct line is open, or with `null` after `timeoutMs` (the match then stays on the
 * server).
 */
export const connectPeer = (room: Room, host: boolean, timeoutMs = 4500): Promise<PeerLink | null> =>
  new Promise((resolve) => {
    if (typeof RTCPeerConnection === 'undefined') {
      resolve(null);
      return;
    }
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const listeners = new Set<(m: PeerMessage) => void>();
    let game: RTCDataChannel | null = null;
    let ctl: RTCDataChannel | null = null;
    let done = false;
    let rtt = 0;
    const rtts: number[] = [];
    let pingTimer = 0;
    let statsTimer = 0;
    let lastDirect = performance.now();
    let lastHeard = performance.now();
    let viaTurn = false;
    /** The line is open but silent, or the connection says it is broken: use the relay too. */
    const quiet = () =>
      performance.now() - lastDirect > QUIET_MS || pc.connectionState === 'disconnected' || pc.connectionState === 'failed';

    let partId = 0;
    const parts = new Map<number, string[]>();
    const relay = (raw: string) => {
      if (raw.length <= RELAY_PART) {
        room.send('relay', raw);
        return;
      }
      const id = ++partId;
      const n = Math.ceil(raw.length / RELAY_PART);
      for (let i = 0; i < n; i++) room.send('relay', JSON.stringify({ t: 'part', id, i, n, d: raw.slice(i * RELAY_PART, (i + 1) * RELAY_PART) }));
    };
    const deliver = (raw: string, direct: boolean) => {
      lastHeard = performance.now();
      if (direct) lastDirect = lastHeard;
      let m: PeerMessage;
      try {
        m = JSON.parse(raw) as PeerMessage;
      } catch {
        return;
      }
      if (m.t === 'part') {
        // The relay keeps order: parts of one message arrive together, in order.
        const got = parts.get(m.id) ?? [];
        got[m.i] = m.d;
        parts.set(m.id, got);
        for (const id of parts.keys()) if (id < m.id - 20) parts.delete(id);
        if (got.filter((x) => x !== undefined).length === m.n) {
          parts.delete(m.id);
          deliver(got.join(''), direct);
        }
        return;
      }
      if (m.t === 'ping') {
        link.send({ t: 'pong', n: m.n });
        return;
      }
      if (m.t === 'pong') {
        rtt = Math.round(performance.now() - m.n);
        rtts.push(rtt);
        if (rtts.length > 10) rtts.shift();
        return;
      }
      listeners.forEach((cb) => cb(m));
    };
    const offRelay = room.onMessage('relay', (raw: string) => deliver(raw, false));
    const offSignal = room.onMessage('signal', async (msg: { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit }) => {
      try {
        if (msg.sdp) {
          await pc.setRemoteDescription(msg.sdp);
          if (msg.sdp.type === 'offer') {
            await pc.setLocalDescription(await pc.createAnswer());
            room.send('signal', { sdp: pc.localDescription });
          }
        } else if (msg.ice) {
          await pc.addIceCandidate(msg.ice);
        }
      } catch {
        /* a stale candidate: ignore */
      }
    });
    pc.onicecandidate = (e) => {
      if (e.candidate) room.send('signal', { ice: e.candidate.toJSON() });
    };

    const open = () => game?.readyState === 'open';
    const link: PeerLink = {
      get direct() {
        return open() && !quiet();
      },
      get mode() {
        return !open() || quiet() ? 'relay' : viaTurn ? 'turn' : 'direct';
      },
      get rtt() {
        return rtt;
      },
      get minRtt() {
        return rtts.length ? Math.min(...rtts) : rtt;
      },
      get lastHeard() {
        return lastHeard;
      },
      send: (m, reliable = false) => {
        const raw = JSON.stringify(m);
        const ch = reliable ? ctl : game;
        let sent = false;
        if (ch?.readyState === 'open') {
          try {
            ch.send(raw);
            sent = true;
          } catch {
            /* fall through to the relay */
          }
        }
        // A silent line may be dead: send through the server as well (duplicates are dropped).
        if (!sent || quiet()) relay(raw);
      },
      on: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      close: () => {
        clearInterval(pingTimer);
        clearInterval(statsTimer);
        offRelay();
        offSignal();
        game?.close();
        ctl?.close();
        pc.close();
      },
    };

    const wire = (ch: RTCDataChannel) => {
      ch.onmessage = (e) => deliver(String(e.data), true);
      if (ch.label === 'game') {
        game = ch;
        ch.onopen = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          lastDirect = performance.now();
          pingTimer = window.setInterval(() => link.send({ t: 'ping', n: performance.now() }), 1000);
          // Which path won: a relay candidate means the traffic goes through the TURN server.
          const readPath = () =>
            pc
              .getStats()
              .then((report) => {
                report.forEach((r: RTCStats & { type: string; state?: string; nominated?: boolean; localCandidateId?: string; remoteCandidateId?: string }) => {
                  if (r.type !== 'candidate-pair' || r.state !== 'succeeded' || !r.nominated) return;
                  const types = [r.localCandidateId, r.remoteCandidateId].map(
                    (id) => (report.get(id ?? '') as { candidateType?: string } | undefined)?.candidateType,
                  );
                  viaTurn = types.includes('relay');
                });
              })
              .catch(() => undefined);
          void readPath();
          statsTimer = window.setInterval(readPath, 5000);
          resolve(link);
        };
      } else ctl = ch;
    };
    if (host) {
      wire(pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 }));
      wire(pc.createDataChannel('ctl', { ordered: true }));
      void pc
        .createOffer()
        .then((o) => pc.setLocalDescription(o))
        .then(() => room.send('signal', { sdp: pc.localDescription }));
    } else {
      pc.ondatachannel = (e) => wire(e.channel);
    }

    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      link.close();
      resolve(null);
    }, timeoutMs);
  });
