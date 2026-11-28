// R-027 colour balance: BEFORE captures of the real build (portal dev, 1280x720 @1x, Chromium 1255 ANGLE Metal).
// Needs `npx vite --config vite.portal.config.ts --port 3251` in floor-42 (portal-build) and --port 3252 in floor-42-rename.
// Usage: node capture.mjs
import { createRequire } from 'node:module';
const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const OUT = new URL('./before/', import.meta.url).pathname;
const A = process.env.A || 'http://localhost:3251';
const B = process.env.B || 'http://localhost:3252';
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const shot = async (id, base, route, act = async () => {}, wait = 3000) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('floor42:settings', JSON.stringify({ quality: 'high', arena: 'offsite', showKeyHints: true }));
    localStorage.setItem('floor-42:finished-match', '1');
  });
  await page.goto(base + route);
  await page.waitForTimeout(wait);
  await act(page);
  await page.screenshot({ path: `${OUT}${id}.png` });
  console.log('ok', id);
  await ctx.close();
};
const press = (...k) => async (p) => { for (const x of k) { await p.keyboard.press(x); await p.waitForTimeout(250); } await p.waitForTimeout(700); };
await shot('home', A, '/#/');
await shot('home-pewfield', B, '/#/');
await shot('select', A, '/#/characters', press('ArrowRight'));
await shot('select-2p', A, '/#/?2p', press('KeyF'));
// HUD mid-fight: real bot match on OFFSITE, ZUZU vs BRIX; let it play 9 s so damage, pickups and callouts are on screen.
await shot('hud-offsite', A, '/#/arena?p1=standup&p2=hotfix&bot=normal&arena=offsite', async (p) => {
  await p.waitForSelector('[data-testid="fd-hud"]', { timeout: 90000 });
  await p.waitForFunction(() => window.__mc?.state()?.phase === 'fight', null, { timeout: 30000 });
  await p.keyboard.down('KeyD'); await p.waitForTimeout(1200); await p.keyboard.up('KeyD');
  for (let i = 0; i < 20; i++) { await p.mouse.click(900, 400); await p.waitForTimeout(250); }
  await p.waitForTimeout(1500);
}, 1000);
await shot('result', A, '/zz_result.html?case=win', async (p) => { await p.waitForTimeout(3500); }, 1500);
await browser.close();
