// Load probe: N quick-match players each get the server bot at once; reports server CPU (one core = 100) and snapshot sizes.
//   npx tsx tools/netlab/botload.mts ws://localhost:2567 <server node pid> <rooms> <secs>
import { Client } from '@colyseus/sdk';
import { execSync } from 'node:child_process';
import { encodeInput, PROTOCOL_VERSION } from '../../src/game/net/protocol';
import { EMPTY_INPUT } from '../../src/game/sim/types';
const [url, pidS, nS, secsS] = process.argv.slice(2);
const n = Number(nS), secs = Number(secsS);
const cpu = () => { const t = execSync(`ps -o time= -p ${pidS}`).toString().trim(); const [m, s] = t.split(':'); return Number(m) * 60 + Number(s); };
const rooms = [];
let bytes = 0, snaps = 0;
for (let i = 0; i < n; i++) {
  const r = await new Client(url).joinOrCreate('duel', { character: 'hotfix', v: PROTOCOL_VERSION, bot: 0 });
  r.onMessage('*', () => {});
  r.onMessage('snap', (raw: string) => { bytes += raw.length; snaps += 1; });
  rooms.push(r);
}
let t = 0;
const iv = setInterval(() => { t++; for (const [i, r] of rooms.entries()) r.send('input', [encodeInput(t, { ...EMPTY_INPUT, right: ((t + i * 37) >> 6) % 2 === 0, left: ((t + i * 37) >> 6) % 2 === 1, fire: t % 9 === 0, aimX: 0, aimY: 1 })]); }, 1000 / 60);
await new Promise((r) => setTimeout(r, 5000));
const c0 = cpu(), b0 = bytes, s0 = snaps, w0 = performance.now();
await new Promise((r) => setTimeout(r, secs * 1000));
const c1 = cpu(), el = (performance.now() - w0) / 1000;
console.log(JSON.stringify({ rooms: n, cpuPctOfOneCore: +((c1 - c0) / el * 100).toFixed(1), perRoomPct: +((c1 - c0) / el * 100 / n).toFixed(2), avgSnapBytes: Math.round((bytes - b0) / (snaps - s0)), bytesPerSecPerClient: Math.round((bytes - b0) / el / n) }));
clearInterval(iv);
for (const r of rooms) await r.leave();
process.exit(0);
