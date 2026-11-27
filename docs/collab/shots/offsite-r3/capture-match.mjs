// F-040..F-044 stills on the real GPU (Chromium 1255, ANGLE Metal): wide start, shooting moment, cliffs, name card fade.
import { createRequire } from 'node:module';
const require = createRequire('/Users/hacaghahasanli/Desktop/projects/games-studio/playable-floor42/package.json');
const { chromium } = require('playwright-core');
const OUT = new URL('.', import.meta.url).pathname;
const BASE = process.env.BASE || 'http://localhost:3511';
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const out = {};
for (const [w, h] of [[1920, 1080], [1280, 720]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('floor42:settings', JSON.stringify({ audience: 'regular' })));
  await page.goto(`${BASE}/#/arena?p1=hotfix&p2=standup&bot=hard&demo=1&arena=offsite`);
  await page.waitForFunction(() => window.__mc && window.__mc.state);
  await page.evaluate(() => window.__mc.wide(true));
  await page.waitForFunction(() => window.__mc.state().phase === 'fight', null, { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}wide-start-fight+0.6s-${w}x${h}.png` });
  const pillOn = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=floor-pill]')).opacity);
  await page.waitForTimeout(3800);
  await page.screenshot({ path: `${OUT}wide-start-fight+4.4s-${w}x${h}.png` });
  const pillOff = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=floor-pill]')).opacity);
  out[`${w}x${h}`] = { pillAt0_6s: pillOn, pillAt4_4s: pillOff };
  // HUD text colours (F-044)
  out[`${w}x${h}`].hud = await page.evaluate(() => {
    const cs = (el) => { const s = getComputedStyle(el); return { color: s.color, size: s.fontSize, weight: s.fontWeight }; };
    const labels = [...document.querySelectorAll('span')].filter((e) => /^BOT · |^YOU$/.test(e.textContent || '') && e.children.length === 0).map(cs);
    return labels;
  });
  // cliffs: wide shot cropped around the left cliff, 2x
  await page.screenshot({ path: `${OUT}cliffs-left-crop-${w}x${h}.png`, clip: { x: 0, y: 0, width: Math.round(w * 0.22), height: h } });
  // follow camera: wait for a frame with several bullets
  await page.evaluate(() => window.__mc.wide(false));
  let got = false;
  for (let i = 0; i < 400 && !got; i++) {
    await page.waitForTimeout(60);
    const n = await page.evaluate(() => window.__mc.state().projectiles.filter((p) => p.kind !== 'rail' && p.kind !== 'rocket' && p.kind !== 'bomb').length);
    if (n >= 4) { await page.screenshot({ path: `${OUT}shooting-${w}x${h}.png` }); got = true; }
  }
  out[`${w}x${h}`].shootingCaptured = got;
  await ctx.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
