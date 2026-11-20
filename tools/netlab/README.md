# Network lab

Two real Chromium browsers play one online match (invite link flow) against a local game server
over a deliberately bad network, and every frame is logged. This is how the "froze, then I was
dead" report was reproduced and how the fix was measured (docs/TECHNICAL.md, section 14).

Playwright is not a dependency of the game. Install it outside the repo, or with
`npm i --no-save playwright` and `npx playwright install chromium`.

## Run

```bash
NET_PROBE=1 npm run server > server.log   # local game server on :2567, logging every hit
npm run dev                         # the game on :3000 (dev build: the __mc test hook exists)

node tools/netlab/run.mjs out.json --web http://localhost:3000 --server ws://localhost:2567 --secs 60 \
  --host  '{"seed":3,"rtt":80,"jitter":20,"loss":0.01,"stallEvery":[4000,9000],"stallMs":[300,800],"ws":true,"dc":true}' \
  --guest '{"seed":7,"rtt":180,"jitter":60,"loss":0.05,"stallEvery":[3000,7000],"stallMs":[300,800],"ws":true,"dc":true}'
node tools/netlab/short.mjs out.json server.log   # readable summary (server.log: the server's stdout)
```

Add `"blockIce":true` to both configs to stop the direct line from forming (no TURN), so the match
falls back to server mode. `--cpu 4` throttles the CPU, `--phone` uses a phone viewport.

`node tools/netlab/perf.mjs http://localhost:3000 --cpu 4 [--phone]` plays the bot on a throttled
CPU, forces the first rocket, its explosion and a knockout, and prints the longest frame and the
number of compiled shader programs around each.

## How the network is impaired (`netshim.js`, injected before any page script)

- **WebSocket** (Colyseus: server mode, signalling, relay): both directions in the page get a
  one-way delay of `rtt/2 + U(0, jitter)`. Order is kept, as TCP does; a lost frame is resent
  after `max(200, 1.5 x rtt)` ms and everything behind it waits (head-of-line blocking). Chrome's
  DevTools network throttling does not model loss or jitter on WebSockets, so this shim does it.
- **WebRTC data channels**: each browser impairs what it sends (`RTCDataChannel.prototype.send`).
  Unordered, unreliable channels get an independent delay per message (so messages reorder) and
  lose a message of `n` 1150-byte SCTP chunks with probability `1 - (1 - loss)^n` (partial
  reliability drops the whole message when one chunk is lost). Ordered channels behave like TCP.
- **Stalls**: windows of `stallMs` every `stallEvery` ms in which nothing is delivered; what was
  sent is held and released together at the end (a burst).
- **blockIce**: `addIceCandidate` does nothing, so no direct line can form.

Everything is seeded: the same config gives the same network.

## What is logged

Per frame on each browser: frame time, the state (`__mc.state()`), the drawn positions
(`__mc.view()`), connection status (`__mc.net()`); snapshot arrivals and reconciliations
(`__netprobe`, pushed by the game in development builds); the authority's hits (host browser, or the
server with `NET_PROBE=1`). `analyze.mjs` turns that into frame-time percentiles, snapshot gaps,
correction sizes, rival teleports and freezes, "froze then dead" knockouts, hits shown with no shot
drawn near you, and how far each victim was from where its own screen showed it at each hit.
