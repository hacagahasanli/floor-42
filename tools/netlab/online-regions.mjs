// Two local "regions" (fra=:2567, iad=:2568) via the dev ?regions= switch.
// 1) a lone player: home (fra) -> fallback (iad) -> bot at home; 2) a human waiting in iad is found by the fallback leg.
import { createRequire } from 'node:module';
const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const { Client } = require(process.env.HOME + '/Desktop/projects/games-studio/floor-42-online/node_modules/@colyseus/sdk');
const Q = '?regions=' + encodeURIComponent('fra=ws://localhost:2567,iad=ws://localhost:2568');
const browser = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const run = async (label) => {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const reqs = [];
  p.on('request', (r) => /localhost:256/.test(r.url()) && reqs.push(`${((Date.now() - (p.__t0 || Date.now())) / 1000).toFixed(2)}s ${r.method()} ${r.url().replace(/\?t=.*/, '')}`));
  await p.goto('http://localhost:3011/play' + Q);
  await p.waitForTimeout(1500);
  const lines = [];
  p.__t0 = Date.now();
  await p.getByRole('button', { name: /Quick match/ }).first().click();
  for (let i = 0; i < 60; i++) {
    const st = await p.evaluate(() => [!!window.__mc, (document.querySelector('[aria-live="polite"]') || {}).textContent || '']);
    const t = ((Date.now() - p.__t0) / 1000).toFixed(1);
    if (!lines.length || lines[lines.length - 1][1] !== st[1]) lines.push([t, st[1]]);
    if (st[0]) { lines.push([t, 'IN MATCH: ' + (await p.evaluate(() => (document.body.innerText.match(/BOT · [A-Z]+|\bRIVAL\b/g) || []).join(',')))]); break; }
    await p.waitForTimeout(250);
  }
  console.log(`== ${label}`); for (const l of lines) console.log('  ', l.join('  ')); for (const r of reqs.filter((r) => /matchmake/.test(r))) console.log('   req', r);
  await p.context().close();
};
await run('lone player, two regions');
// A human waiting in iad (no bot asked).
const w = await new Client('ws://localhost:2568').joinOrCreate('duel', { character: 'legacy', v: 4 });
w.onMessage('*', (t) => { if (t === 'peer') w.send('direct', { ok: false }); });
await run('human waiting in iad');
await w.leave();
await browser.close();
process.exit(0);
