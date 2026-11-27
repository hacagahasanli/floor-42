import { createRequire } from 'node:module';
const require = createRequire('/Users/hacaghahasanli/Desktop/projects/games-studio/playable-floor42/package.json');
const { chromium } = require('playwright-core');
import fs from 'node:fs';
const OUT = '/Users/hacaghahasanli/Desktop/projects/games-studio/floor-42/docs/collab/shots/offsite-r2';
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:3411';
const WX = process.env.WX; // water tower x override via query? (code constant) not used
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-frame-rate-limit'],
});
const tag = process.env.TAG || '';
const result = {};
for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__calls = 0;
    for (const P of [WebGL2RenderingContext.prototype]) for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) {
      const o = P[n]; P[n] = function (...a) { window.__calls++; return o.apply(this, a); };
    }
    window.__frames = 0; const raf = () => { window.__frames++; requestAnimationFrame(raf); }; requestAnimationFrame(raf);
  });
  await page.goto(`${BASE}/#/arena?p1=hotfix&p2=legacy&bot=hard&arena=offsite`);
  await page.waitForFunction(() => window.__mc && window.__mc.state);
  await page.evaluate(() => window.__mc.wide(true));
  await page.waitForTimeout(1500);
  const gl = await page.evaluate(() => { const g = window.__mc.renderer.getContext(); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; });
  result.gl = gl;
  await page.screenshot({ path: `${OUT}/wide-start-hud-${w}x${h}${tag}.png` });
  // A3 with HUD on + F-034 corner check, from the screenshot pixels.
  const buf = await page.screenshot();
  const px = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const at = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3));
    const sky = [111, 187, 227], skyLow = [152, 205, 232];
    let skyPx = 0, tot = 0;
    for (let y = Math.floor(c.height * 0.75); y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) { const p = at(x, y); tot++; if ([sky, skyLow].some((s) => s.every((v, i) => Math.abs(v - p[i]) <= 14))) skyPx++; }
    return { top: at(Math.round(c.width * 0.5), 0), top2: at(Math.round(c.width * 0.3), 0), y130: at(Math.round(c.width * 0.3), Math.round(130 * (c.height / 720))), y180: at(Math.round(c.width * 0.3), Math.round(180 * (c.height / 720))), skyBottomQuarter: skyPx, of: tot };
  }, buf.toString('base64'));
  result[`${w}x${h}`] = px;
  await page.evaluate(() => { document.querySelector('[data-testid=hud-scrim]').style.display = 'none'; });
  const buf2 = await page.screenshot();
  result[`${w}x${h}`].noScrim = await page.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const k = c.height / 720; return { y0: Array.from(g.getImageData(Math.round(c.width*0.3), 0, 1, 1).data.slice(0,3)), y130: Array.from(g.getImageData(Math.round(c.width*0.3), Math.round(130*k), 1, 1).data.slice(0,3)) }; }, buf2.toString('base64'));
  await page.evaluate(() => { document.querySelector('[data-testid=hud-scrim]').style.display = ''; });
  // draw calls at the wide start frame, then average over 4 s of wide
  await page.evaluate(() => { window.__calls = 0; window.__frames = 0; });
  await page.waitForTimeout(4000);
  result[`${w}x${h}`].callsPerFrameWide = await page.evaluate(() => window.__calls / window.__frames);
  if (w === 1280) {
    await page.evaluate(() => window.__mc.wide(false));
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `${OUT}/follow-${w}x${h}${tag}.png` });
    await page.evaluate(() => { window.__calls = 0; window.__frames = 0; });
    await page.waitForTimeout(6000);
    result.followCalls = await page.evaluate(() => window.__calls / window.__frames);
    result.followFrames = await page.evaluate(() => window.__frames);
  }
  if (w === 1920) {
    await page.evaluate(() => window.__mc.wide(false));
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `${OUT}/follow-${w}x${h}${tag}.png` });
  }
  await ctx.close();
}
console.log(JSON.stringify(result, null, 1));
await browser.close();
