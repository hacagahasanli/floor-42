// F-067 home layout re-check (the F-060 check from ../../colour-balance/layout-check.mjs) at 1280x720 and 1920x1080 after the
// wordmark viewBox went 520 -> 544, plus the wordmark box size and console errors on the site routes.
// Real GPU Chromium 1255 (ANGLE Metal). Usage: A=http://localhost:3292 [P=http://localhost:4173] node capture.mjs
import { createRequire } from 'node:module';

import { check, issuesOf, notesOf } from '../../colour-balance/layout-check.mjs';

const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const OUT = new URL('.', import.meta.url).pathname;
const A = process.env.A || 'http://localhost:3292';
const P = process.env.P;
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
try {
  const visit = async (id, url, w, h, layout) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
    page.on('console', (m) => m.type() === 'error' && errs.push('console ' + m.text()));
    await page.addInitScript(() => {
      localStorage.setItem('floor42:settings', JSON.stringify({ quality: 'high', arena: 'offsite' }));
      localStorage.setItem('floor-42:finished-match', '1');
    });
    await page.goto(url);
    await page.waitForTimeout(4000);
    let line = `${id} @${w}x${h}: errors ${errs.length}${errs.length ? '\n  ' + errs.join('\n  ') : ''}`;
    if (layout) {
      await page.mouse.move(2, 2);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}${id}.png` });
      const all = [...new Set(await page.evaluate(check))];
      const issues = issuesOf(all);
      const wm = await page.evaluate(() => {
        const s = document.querySelector('[data-testid="wordmark"] svg')?.getBoundingClientRect();
        return s && `${Math.round(s.width)}x${Math.round(s.height)} at ${Math.round(s.x)},${Math.round(s.y)}`;
      });
      line += `\n  layout: ${issues.length} issue(s)${issues.length ? '\n  ' + issues.join('\n  ') : ''}; notes ${notesOf(all).length}\n  wordmark svg box: ${wm}`;
    }
    console.log(line);
    await ctx.close();
  };
  await visit('site-home', A + '/', 1280, 720, true);
  await visit('site-home-1920', A + '/', 1920, 1080, true);
  for (const r of ['/play', '/arena', '/characters']) await visit('site' + r.replace('/', '-'), A + r, 1280, 720, false);
  if (P) {
    await visit('portal-home', P + '/#/', 1280, 720, true);
    await visit('portal-home-1920', P + '/#/', 1920, 1080, true);
  }
} finally {
  await browser.close();
}
