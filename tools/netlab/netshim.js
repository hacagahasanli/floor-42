// Injected before any page script (Playwright addInitScript). Reads window.__NETCFG.
// 1. Impairs the network the game uses, deterministically from a seed:
//    - WebSocket (Colyseus, server mode + relay + signalling): TCP semantics. Every frame, both
//      directions, gets one-way delay rtt/2 + U(0, jitter); order is kept; a "lost" frame is
//      retransmitted after an RTO (max(200 ms, 1.5 x rtt)) and everything behind it waits
//      (head-of-line blocking), as TCP does.
//    - RTCDataChannel unordered/unreliable ('game'): each send gets its own delay rtt/2 +
//      U(0, jitter) so packets can reorder; a message of n SCTP chunks (1150 B each) is lost with
//      1-(1-p)^n (partial reliability abandons the whole message when one chunk is lost).
//    - RTCDataChannel ordered/reliable ('ctl'): like TCP above.
//    - Stalls: windows of U(stallMs) every U(stallEvery) during which nothing is delivered; what
//      was sent is held and released together at the end of the window (a burst).
//    Data channels are impaired on the sending side (each browser impairs what it sends), the
//    WebSocket on both sides in this page.
//    - blockIce: addIceCandidate is a no-op, so no direct line can form (no TURN case).
// 2. Records a probe: per animation frame, frame time and the game state (dev hook __mc), plus
//    snapshot arrivals (JSON.parse of a snapshot string) and hooks pushed by the game.
(() => {
  const cfg = window.__NETCFG || {};
  const now = () => performance.now();
  const wall = () => performance.timeOrigin + performance.now();
  let seed = (cfg.seed || 1) >>> 0;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const U = (a, b) => a + (b - a) * rnd();
  const rtt = cfg.rtt || 0;
  const jitter = cfg.jitter || 0;
  const loss = cfg.loss || 0;
  // Stall windows in page time.
  const stalls = [];
  if (cfg.stallEvery) {
    let t = U(cfg.stallEvery[0], cfg.stallEvery[1]);
    while (t < 10 * 60 * 1000) {
      const len = U(cfg.stallMs[0], cfg.stallMs[1]);
      stalls.push([t, t + len]);
      t += len + U(cfg.stallEvery[0], cfg.stallEvery[1]);
    }
  }
  const stallEnd = (t) => {
    for (const [a, b] of stalls) {
      if (t >= a && t < b) return b;
      if (a > t) break;
    }
    return t;
  };
  const oneWay = () => rtt / 2 + jitter * rnd();
  const rto = Math.max(200, 1.5 * rtt);
  const later = (at, fn) => setTimeout(fn, Math.max(0, at - now()));
  /** In-order stream (TCP-like): one queue and one pump, so equal release times keep order. */
  const stream = () => {
    let lastAt = 0;
    const q = [];
    let timer = 0;
    const pump = () => {
      timer = 0;
      while (q.length && q[0][0] <= now() + 0.5) q.shift()[1]();
      if (q.length) timer = setTimeout(pump, Math.max(0, q[0][0] - now()));
    };
    return (fn) => {
      let at = now() + oneWay();
      if (rnd() < loss) at += rto;
      at = stallEnd(at);
      at = Math.max(at, lastAt);
      lastAt = at;
      q.push([at, fn]);
      if (!timer) timer = setTimeout(pump, Math.max(0, q[0][0] - now()));
    };
  };
  const stats = { wsOut: 0, wsIn: 0, dcSent: 0, dcLost: 0, dcBytes: 0 };
  window.__netstats_shim = stats;
  window.__stalls = stalls;

  if (cfg.ws) {
    const Native = window.WebSocket;
    const outQ = new WeakMap();
    class ShimWS extends Native {
      constructor(...a) {
        super(...a);
        const inQ = stream();
        outQ.set(this, stream());
        this.addEventListener('message', (e) => {
          if (e.__shim) return;
          e.stopImmediatePropagation();
          stats.wsIn++;
          inQ(() => {
            const ev = new MessageEvent('message', { data: e.data });
            ev.__shim = true;
            this.dispatchEvent(ev);
          });
        });
      }
      send(d0) {
        // Colyseus reuses its encode buffer: copy now, or a delayed send ships a later message.
        const d = ArrayBuffer.isView(d0) ? d0.slice() : d0 instanceof ArrayBuffer ? d0.slice(0) : d0;
        stats.wsOut++;
        outQ.get(this)(() => {
          if (this.readyState === 1) Native.prototype.send.call(this, d);
        });
      }
    }
    window.WebSocket = ShimWS;
  }

  if (cfg.dc && window.RTCDataChannel) {
    const nativeSend = RTCDataChannel.prototype.send;
    const q = new WeakMap();
    RTCDataChannel.prototype.send = function (d) {
      const size = typeof d === 'string' ? d.length : d.byteLength || d.size || 0;
      stats.dcSent++;
      stats.dcBytes += size;
      const go = () => {
        if (this.readyState === 'open') nativeSend.call(this, d);
      };
      if (this.ordered) {
        if (!q.has(this)) q.set(this, stream());
        q.get(this)(go);
        return;
      }
      const chunks = Math.max(1, Math.ceil(size / 1150));
      if (rnd() < 1 - Math.pow(1 - loss, chunks)) {
        stats.dcLost++;
        return;
      }
      later(stallEnd(now() + oneWay()), go);
    };
  }

  if (cfg.blockIce && window.RTCPeerConnection) {
    RTCPeerConnection.prototype.addIceCandidate = function () {
      return Promise.resolve();
    };
  }

  // ---------- probe ----------
  const probe = [];
  window.__netprobe = probe;
  const NP = JSON.parse;
  JSON.parse = function (s, r) {
    const v = NP.call(JSON, s, r);
    if (typeof s === 'string' && s.startsWith('{"ack"')) probe.push({ k: 'snap', t: wall(), tick: v.state.tick, ack: v.ack });
    return v;
  };
  const frames = [];
  window.__frames = frames;
  let last = 0;
  const loop = (ts) => {
    const t = wall();
    const rec = { t, dt: last ? ts - last : 0 };
    last = ts;
    const mc = window.__mc;
    if (mc && mc.state) {
      try {
        const s = mc.state();
        const me = mc.me ?? 0;
        rec.tick = s.tick;
        rec.hs = s.hitstop;
        rec.pz = s.paused;
        rec.ph = s.phase;
        rec.f = s.fighters.map((f) => [+f.x.toFixed(3), +f.y.toFixed(3), f.hp, +f.respawn.toFixed(2), +f.vx.toFixed(2), +f.vy.toFixed(2)]);
        rec.me = me;
        const v = mc.view && mc.view();
        if (v) rec.v = v.map((p) => [+p.x.toFixed(3), +p.y.toFixed(3)]);
        const mf = s.fighters[me];
        rec.np = s.projectiles.filter((p) => p.owner !== me && Math.abs(p.x - mf.x) < 4 && Math.abs(p.y - mf.y - 1) < 3).length;
        if (mc.net) rec.net = mc.net();
      } catch (e) {
        rec.err = String(e);
      }
    }
    frames.push(rec);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // ---------- autopilot (synthetic keys; the game reads window keydown/keyup) ----------
  window.__autopilot = (aseed) => {
    let s2 = aseed >>> 0;
    const r = () => {
      s2 = (s2 + 0x6d2b79f5) | 0;
      let t = Math.imul(s2 ^ (s2 >>> 15), 1 | s2);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const held = new Set();
    const key = (code, on) => {
      if (on === held.has(code)) return;
      if (on) held.add(code);
      else held.delete(code);
      window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, bubbles: true }));
    };
    const tap = (code) => {
      key(code, true);
      setTimeout(() => key(code, false), 50);
    };
    let dir = 0;
    let until = 0;
    setInterval(() => {
      const mc = window.__mc;
      if (!mc) return;
      const st = mc.state();
      const me = st.fighters[mc.me ?? 0];
      const foe = st.fighters[1 - (mc.me ?? 0)];
      const t = now();
      if (t > until) {
        const dx = foe.x - me.x;
        const d = Math.abs(dx);
        dir = d > 7 ? Math.sign(dx) : d < 2.5 ? -Math.sign(dx) : r() < 0.5 ? -1 : 1;
        if (r() < 0.2) dir = 0;
        until = t + 250 + r() * 700;
      }
      key('KeyA', dir < 0);
      key('KeyD', dir > 0);
      key('Space', r() < 0.75);
      if (foe.y > me.y + 1.5 && r() < 0.3) tap('KeyW');
      else if (r() < 0.04) tap('KeyW');
      if (r() < 0.02) tap('ShiftLeft');
      if (r() < 0.03) tap('KeyE');
      if (foe.y < me.y - 1.5 && r() < 0.1) tap('KeyS');
    }, 100);
  };
})();
