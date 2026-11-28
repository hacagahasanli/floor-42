// F-069 before/after: one real shotgun blast (2P on OFFSITE, P2 standing 2.2 m in front of P1, P1 handed a fresh shotgun and pressing F
// once), REAL build via vite dev (needs `npx vite --config vite.portal.config.ts --port 3251`), Chromium 1255 with ANGLE Metal (real GPU).
// Usage: TAG=before|after node capture.mjs   -> f069-<TAG>-<ms>.png and the hit events the sim emitted for that blast.
import { createRequire } from 'node:module';

const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const OUT = new URL('.', import.meta.url).pathname;
const A = process.env.A || 'http://localhost:3251';
const TAG = process.env.TAG || 'after';
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.addInitScript(() => {
    localStorage.setItem('floor42:settings', JSON.stringify({ quality: 'high', arena: 'offsite', showKeyHints: true }));
    localStorage.setItem('floor-42:finished-match', '1');
  });
  await page.goto(A + '/#/arena?mode=2p&p1=intern&p2=hotfix&arena=offsite&n=5');
  // 2P starts on the key card: both players press shoot (F and ;) to ready up.
  await page.waitForSelector('[data-testid="key-card"]', { timeout: 90000 });
  await page.waitForTimeout(800);
  await page.keyboard.down('KeyF'); await page.keyboard.down('Semicolon'); await page.waitForTimeout(150); await page.keyboard.up('KeyF'); await page.keyboard.up('Semicolon');
  await page.waitForSelector('[data-testid="key-card"]', { state: 'detached', timeout: 10000 });
  await page.waitForFunction(() => window.__mc?.state()?.phase === 'fight', null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const setup = await page.evaluate(() => {
    const s = window.__mc.state();
    const [a, b] = s.fighters;
    b.x = a.x + 2.2; b.y = a.y; b.vx = 0; b.vy = 0; b.onGround = a.onGround;
    a.facing = 1;
    a.weapon = { kind: 'shotgun', mag: 4, reserve: 8, cooldown: 0, reload: 0 };
    window.__hits = [];
    const grab = () => { for (const e of window.__mc.state().events) if (e.type === 'hit' || e.type === 'shot') window.__hits.push({ t: window.__mc.state().tick, ...e }); requestAnimationFrame(grab); };
    grab();
    return { a: [a.x, a.y], b: [b.x, b.y] };
  });
  await page.keyboard.down('KeyF');
  const t0 = Date.now();
  await page.waitForTimeout(40);
  await page.keyboard.up('KeyF');
  for (const ms of [140, 260]) {
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
    await page.screenshot({ path: `${OUT}f069-${TAG}-${ms}.png` });
  }
  const hits = await page.evaluate(() => window.__hits.map((e) => e.type === 'hit' ? `tick ${e.t} hit f${e.fighter} by ${e.by} dmg ${e.damage.toFixed(1)}` : `tick ${e.t} shot f${e.fighter} ${e.gun}`));
  console.log(TAG, JSON.stringify(setup), '\n ' + hits.join('\n '));
  await ctx.close();
} finally {
  await browser.close();
}
