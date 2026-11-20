// Render hitches on a throttled CPU: node perf.mjs <web> [--phone] [--cpu 4]
// Plays /arena vs the bot (dev build, uses the __mc hook), then forces the first rocket, its
// explosion and a KO, and reports the longest frame after each and the shader program count.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
// Playwright is not a dependency of the game: install it next to the repo, or `npm i --no-save playwright`.
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const web = args[0] || 'http://localhost:3001';
const phone = args.includes('--phone');
const cpu = Number(args[args.indexOf('--cpu') + 1] || 4);
const shim = fs.readFileSync(new URL('./netshim.js', import.meta.url), 'utf8');
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext(
  phone ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } },
);
const p = await ctx.newPage();
await p.addInitScript(() => (window.__NETCFG = {}));
await p.addInitScript(shim);
const cdp = await ctx.newCDPSession(p);
await p.goto(`${web}/arena?p1=hotfix&p2=legacy&bot=easy`);
await p.waitForFunction(() => window.__mc && window.__mc.state().phase === 'fight', null, { timeout: 60000 });
await p.waitForTimeout(1500);
// A real player has clicked or pressed something by now (the menu, the first move).
await p.mouse.click(5, 5);
await p.waitForTimeout(500);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
const mark = (name) => p.evaluate((n) => (window.__marks = window.__marks || []).push([n, performance.timeOrigin + performance.now(), window.__mc.renderer ? window.__mc.renderer.info.programs.length : -1]), name);
await mark('start');
await p.waitForTimeout(4000);
await mark('getgun');
// Give the player a launcher, face the bot and fire once.
await p.evaluate(() => {
  const s = window.__mc.state();
  const f = s.fighters[0];
  Object.assign(f.weapon, { kind: 'launcher', mag: 6, reserve: 0, cooldown: 0, reload: 0 });
  f.invulnerable = 5;
});
await p.waitForTimeout(1500);
await mark('fire');
await p.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })), 80);
});
await p.waitForTimeout(3000);
await mark('ko');
await p.evaluate(() => {
  const s = window.__mc.state();
  s.fighters[1].hp = 1;
  s.fighters[1].invulnerable = 0;
  const f = s.fighters[0];
  Object.assign(f.weapon, { kind: 'pistol', mag: 12, reserve: Infinity, cooldown: 0, reload: 0 });
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
});
await p.waitForTimeout(6000);
await mark('end');
const r = await p.evaluate(() => ({ frames: window.__frames, marks: window.__marks }));
await b.close();
const fr = r.frames.filter((f) => f.t >= r.marks[0][1]);
const q = (a, x) => [...a].sort((m, n) => m - n)[Math.min(a.length - 1, Math.floor(x * a.length))];
for (let i = 0; i < r.marks.length - 1; i++) {
  const [n, t0, progs] = r.marks[i];
  const t1 = r.marks[i + 1][1];
  const seg = fr.filter((f) => f.t > t0 && f.t <= t1).map((f) => f.dt);
  console.log(`${n.padEnd(6)} frames ${seg.length} p50 ${q(seg, 0.5).toFixed(1)} p95 ${q(seg, 0.95).toFixed(1)} p99 ${q(seg, 0.99).toFixed(1)} max ${Math.max(...seg).toFixed(1)} >50ms ${seg.filter((x) => x > 50).length} | programs at start ${progs} -> ${r.marks[i + 1][2]}`);
}
const all = fr.map((f) => f.dt);
console.log(`ALL    frames ${all.length} p95 ${q(all, 0.95).toFixed(1)} p99 ${q(all, 0.99).toFixed(1)} max ${Math.max(...all).toFixed(1)} >50ms ${all.filter((x) => x > 50).length}`);
