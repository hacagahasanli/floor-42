/**
 * Turns a record.mjs take into a constant-60 fps H.264 mp4 (<take>/take.mp4) and prints where the KOs and big
 * health swings are, in video seconds, so shots can be picked and then looked at as stills.
 *   node mktake.mjs <takeDir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dir = process.argv[2];
const { t0, times, log } = JSON.parse(fs.readFileSync(path.join(dir, 'log.json'), 'utf8'));
const lines = [];
for (let i = 0; i < times.length; i++) {
  const d = i + 1 < times.length ? times[i + 1] - times[i] : 1 / 60;
  lines.push(`file 'frames/f${String(i).padStart(6, '0')}.jpg'`, `duration ${Math.max(0.001, d).toFixed(5)}`);
}
lines.push(`file 'frames/f${String(times.length - 1).padStart(6, '0')}.jpg'`);
fs.writeFileSync(path.join(dir, 'list.txt'), lines.join('\n'));
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', 'fps=60', '-c:v', 'libx264', '-crf', '12', '-preset', 'fast', '-pix_fmt', 'yuv420p', path.join(dir, 'take.mp4')], { stdio: 'inherit' });
// Events in video seconds (log.t is the page clock; the screencast started at t0).
let prev = null;
const ev = [];
for (const r of log) {
  if (r.t < t0) continue;
  if (prev) {
    const t = (r.t - t0).toFixed(1);
    if (r.kos[0] !== prev.kos[0] || r.kos[1] !== prev.kos[1]) ev.push(`${t}s KO ${prev.kos}->${r.kos}`);
    const dh = Math.max(prev.hp[0] - r.hp[0], prev.hp[1] - r.hp[1]);
    if (dh >= 25) ev.push(`${t}s hit -${dh} hp=${r.hp} x=${r.x}`);
  }
  prev = r;
}
console.log(ev.join('\n'));
