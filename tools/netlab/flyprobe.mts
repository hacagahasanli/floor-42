// Probe a deployed game server: WebSocket round trip (Colyseus ping) and, with two clients in one invite room playing in
// server mode, snapshot rate and gaps as received here. npx tsx tools/netlab/flyprobe.mts wss://floor42-game.fly.dev [secs]
import { Client } from '@colyseus/sdk';

import { decodeSnapshot, encodeInput, PROTOCOL_VERSION } from '../../src/game/net/protocol';
import { EMPTY_INPUT } from '../../src/game/sim/types';

const url = process.argv[2];
const secs = Number(process.argv[3] ?? 15);
const opts = { character: 'hotfix', v: PROTOCOL_VERSION };
const a = await new Client(url).create('duel', { ...opts, private: true });
const b = await new Client(url).joinById(a.roomId, { ...opts, character: 'legacy' });
for (const r of [a, b]) r.onMessage('*', (t: unknown) => t === 'peer' && r.send('direct', { ok: false }));
const pings: number[] = [];
const gaps: number[] = [];
let last = 0;
let n = 0;
let bytes = 0;
let started = 0;
a.onMessage('snap', (raw: string) => {
  const now = performance.now();
  if (decodeSnapshot(raw).state.phase !== 'countdown' || started) {
    if (!started) started = now;
    if (last) gaps.push(now - last);
    n += 1;
    bytes += raw.length;
  }
  last = now;
});
let t = 0;
const iv = setInterval(() => {
  t++;
  for (const [i, r] of [a, b].entries()) r.send('input', [encodeInput(t, { ...EMPTY_INPUT, right: (t >> 6) % 2 === i, left: (t >> 6) % 2 !== i, fire: t % 9 === 0, aimX: 0, aimY: 1 })]);
}, 1000 / 60);
const pinger = setInterval(() => a.ping((ms) => pings.push(ms)), 500);
await new Promise((r) => setTimeout(r, (secs + 8) * 1000));
clearInterval(iv);
clearInterval(pinger);
const q = (xs: number[], p: number) => [...xs].sort((x, y) => x - y)[Math.min(xs.length - 1, Math.floor(p * xs.length))]?.toFixed(1);
const el = (last - started) / 1000;
console.log(JSON.stringify({ url, pingP50: q(pings, 0.5), pingMin: q(pings, 0), pingP95: q(pings, 0.95), snapsPerSec: +(n / el).toFixed(1), gapP50: q(gaps, 0.5), gapP99: q(gaps, 0.99), gapMax: q(gaps, 1), bytesPerSec: Math.round(bytes / el) }));
await a.leave();
await b.leave();
process.exit(0);
