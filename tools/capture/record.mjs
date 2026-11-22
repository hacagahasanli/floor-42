/**
 * Floor 42 trailer capture (not part of the game). Dev server up with `next dev -p 3310`; needs playwright-core and
 * the Chromium it installed (PW_CORE=/path/to/node_modules/playwright-core, CHROME=/path/to/Chrome binary).
 *
 *   node record.mjs <outDir> [seconds=60] [width=1920] [height=1080] [dpr=1.5] [query]
 *
 * Opens /arena?capture=1 (the capture-only camera director, dev builds only), lets two bots fight, records CDP
 * screencast frames (JPEG q95) with their timestamps into <outDir>/frames, and writes <outDir>/log.json: per-frame
 * game clock, KOs and health, so shots can be picked by score before cutting (see cut.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const exe = process.env.CHROME ?? process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const [out, secs = '60', W = '1920', H = '1080', DPR = '1.5', query = 'p1=hotfix&p2=legacy&bot=hard'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:3310';
fs.mkdirSync(path.join(out, 'frames'), { recursive: true });

const b = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +DPR });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('floor42:settings', JSON.stringify({ showKeyHints: false }));
  } catch {}
});
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(`${base}/arena?capture=${process.env.CAPTURE ?? '1'}&${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await p.waitForFunction(() => !!window.__capture, null, { timeout: 120000 });
await p.waitForFunction(() => window.__mc.state().phase === 'fight', null, { timeout: 60000 });
await p.addStyleTag({ content: '*{cursor:none !important}' });
// The game shows a "come back as" picker while your fighter is down and a small Aim/Shake pill: not store material.
await p.evaluate(() => {
  setInterval(() => {
    document.querySelectorAll('main div, main span').forEach((el) => {
      const t = el.textContent ?? '';
      if (el.children.length <= 3 && (t.includes('come back as') || /^Aim: /.test(t) || /^Shake: /.test(t))) {
        let n = el;
        if (t.includes('come back as')) while (n.parentElement && !n.className.includes('z-[6]')) n = n.parentElement;
        n.style.visibility = 'hidden';
      }
    });
  }, 100);
});
await p.evaluate(() => {
  window.__log = [];
  // Matches are short (first to 5): start the next one a moment after the result appears, so a take is all fighting.
  let overAt = 0;
  const tick = () => {
    const ph = window.__mc.state().phase;
    if (ph === 'over') {
      overAt ||= performance.now();
      if (performance.now() - overAt > 900) {
        window.__capture.restart();
        overAt = 0;
      }
    } else overAt = 0;
    const s = window.__mc.state();
    window.__log.push({ t: performance.now() / 1000, ph: s.phase, kos: s.fighters.map((f) => f.kos), hp: s.fighters.map((f) => Math.round(f.hp)), x: s.fighters.map((f) => +f.x.toFixed(1)) });
    requestAnimationFrame(tick);
  };
  tick();
});
const cdp = await ctx.newCDPSession(p);
let n = 0;
const times = [];
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  fs.writeFileSync(path.join(out, 'frames', `f${String(n).padStart(6, '0')}.jpg`), Buffer.from(data, 'base64'));
  times.push(metadata.timestamp);
  n++;
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
const t0 = await p.evaluate(() => performance.now() / 1000);
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, everyNthFrame: 1 });
await p.waitForTimeout(+secs * 1000);
await cdp.send('Page.stopScreencast');
const log = await p.evaluate(() => window.__log);
fs.writeFileSync(path.join(out, 'log.json'), JSON.stringify({ t0, times, log }));
console.log('frames', n, 'span', (times.at(-1) - times[0]).toFixed(1), 's =>', (n / (times.at(-1) - times[0])).toFixed(1), 'fps');
await b.close();
