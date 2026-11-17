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
 * before; if it drops mid-match, messages go through the server's relay instead.
 */

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

export type PeerMessage =
  | { t: 'in'; w: [number, number, number, number][] }
  | { t: 'snap'; raw: string }
  | { t: 'char'; c: string }
  | { t: 'ping'; n: number }
  | { t: 'pong'; n: number };

export interface PeerLink {
  /** True while the direct line is open (else messages go through the server relay). */
  readonly direct: boolean;
  send: (m: PeerMessage, reliable?: boolean) => void;
  on: (cb: (m: PeerMessage) => void) => () => void;
  /** Round-trip time to the other player in ms, measured over the line in use. */
  readonly rtt: number;
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
    let pingTimer = 0;

    const deliver = (raw: string) => {
      let m: PeerMessage;
      try {
        m = JSON.parse(raw) as PeerMessage;
      } catch {
        return;
      }
      if (m.t === 'ping') {
        link.send({ t: 'pong', n: m.n });
        return;
      }
      if (m.t === 'pong') {
        rtt = Math.round(performance.now() - m.n);
        return;
      }
      listeners.forEach((cb) => cb(m));
    };
    const offRelay = room.onMessage('relay', (raw: string) => deliver(raw));
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
        return open();
      },
      get rtt() {
        return rtt;
      },
      send: (m, reliable = false) => {
        const raw = JSON.stringify(m);
        const ch = reliable ? ctl : game;
        if (ch?.readyState === 'open') {
          try {
            ch.send(raw);
            return;
          } catch {
            /* fall through to the relay */
          }
        }
        room.send('relay', raw);
      },
      on: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      close: () => {
        clearInterval(pingTimer);
        offRelay();
        offSignal();
        game?.close();
        ctl?.close();
        pc.close();
      },
    };

    const wire = (ch: RTCDataChannel) => {
      ch.onmessage = (e) => deliver(String(e.data));
      if (ch.label === 'game') {
        game = ch;
        ch.onopen = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          pingTimer = window.setInterval(() => link.send({ t: 'ping', n: performance.now() }), 1000);
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
