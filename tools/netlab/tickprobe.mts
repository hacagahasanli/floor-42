// Two headless clients play a match against a local server (npm run server); reports the
// server's real tick rate (game ticks per wall second, from the snapshots) and snapshot gaps.
//   npx tsx tools/netlab/tickprobe.mts [ws://localhost:2567] [secs]
import { Client } from '@colyseus/sdk';

import { decodeSnapshot, encodeInput } from '../../src/game/net/protocol';
import { EMPTY_INPUT } from '../../src/game/sim/types';

const url = process.argv[2] ?? 'ws://localhost:2567';
const secs = Number(process.argv[3] ?? 20);
const a = await new Client(url).create('duel', { character: 'hotfix' });
const b = await new Client(url).joinById(a.roomId, { character: 'legacy' });
const gaps: number[] = [];
let first: { tick: number; at: number } | null = null;
let lastAt = 0;
let lastTick = 0;
let bytes = 0;
let n = 0;
a.onMessage('snap', (raw: string) => {
  const at = performance.now();
  const s = decodeSnapshot(raw);
  if (!first && s.state.phase === 'fight') first = { tick: s.state.tick, at };
  if (first) {
    if (lastAt) gaps.push(at - lastAt);
    bytes += raw.length;
    n += 1;
  }
  lastAt = at;
  lastTick = s.state.tick;
});
for (const r of [a, b]) r.onMessage('*', () => {});
setTimeout(() => [a, b].forEach((r) => r.send('direct', { ok: false })), 300);
let t = 0;
const iv = setInterval(() => {
  t += 1;
  for (const [i, r] of [a, b].entries()) r.send('input', [encodeInput(t, { ...EMPTY_INPUT, right: (t >> 6) % 2 === i, left: (t >> 6) % 2 !== i, fire: t % 9 === 0 })]);
}, 1000 / 60);
await new Promise((r) => setTimeout(r, (secs + 7) * 1000));
clearInterval(iv);
const el = (lastAt - first!.at) / 1000;
const q = (p: number) => [...gaps].sort((x, y) => x - y)[Math.min(gaps.length - 1, Math.floor(p * gaps.length))].toFixed(1);
console.log(`game ticks/s ${((lastTick - first!.tick) / el).toFixed(2)} | snapshots/s ${(n / el).toFixed(1)} | gap p50 ${q(0.5)} p95 ${q(0.95)} p99 ${q(0.99)} max ${q(1)} ms | ${Math.round(bytes / el)} B/s per client`);
process.exit(0);
