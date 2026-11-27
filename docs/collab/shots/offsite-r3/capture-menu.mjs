// F-043: menu with the OFFSITE backdrop on the real GPU (Chromium 1255, ANGLE Metal), both quality tiers, draw calls per frame.
import { createRequire } from 'node:module';
const require = createRequire('/Users/hacaghahasanli/Desktop/projects/games-studio/playable-floor42/package.json');
const { chromium } = require('playwright-core');
import fs from 'node:fs';
const OUT = new URL('.', import.meta.url).pathname;
const BASE = process.env.BASE || 'http://localhost:3511';
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const result = {};
for (const arena of ['offsite', 'office']) for (const quality of ['high', 'low']) for (const [w, h] of [[1920, 1080], [1280, 720]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.addInitScript(([q, a]) => {
    localStorage.setItem('floor42:settings', JSON.stringify({ quality: q, arena: a, audience: 'regular' }));
    localStorage.setItem('floor42:finished-match', '1');
    window.__calls = 0; window.__frames = 0;
    const P = WebGL2RenderingContext.prototype;
    for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) { const o = P[n]; P[n] = function (...a) { window.__calls++; return o.apply(this, a); }; }
    const origClear = P.clear; P.clear = function (...a) { window.__frames++; return origClear.apply(this, a); };
  }, [quality, arena]);
  await page.goto(`${BASE}/#/`);
  await page.waitForTimeout(3500);
  await page.evaluate(() => { window.__calls = 0; window.__frames = 0; });
  await page.waitForTimeout(4000);
  const c = await page.evaluate(() => ({ calls: window.__calls, frames: window.__frames }));
  result[`${arena}-${quality}-${w}x${h}`] = { drawCallsPerRender: +(c.calls / Math.max(1, c.frames)).toFixed(1), renders: c.frames };
  if (quality === 'high') await page.screenshot({ path: `${OUT}menu-${arena}-${w}x${h}.png` });
  await ctx.close();
}
console.log(JSON.stringify(result, null, 1));
await browser.close();
