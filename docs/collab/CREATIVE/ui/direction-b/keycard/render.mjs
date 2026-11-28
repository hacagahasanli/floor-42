// Renders keycard.html to keycard.png (1280x720) with the same Chromium 1255 as the impl captures, plus a layout check:
// every text box inside its container, nothing outside a 12 px safe area. Usage: node render.mjs
import { createRequire } from 'node:module';
const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const DIR = new URL('.', import.meta.url).pathname;
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.goto('file://' + DIR + 'keycard.html');
await page.evaluate(() => document.fonts.ready);
const report = await page.evaluate(() => {
  const out = [];
  const boxes = [...document.querySelectorAll('.title,.pill,.card,.strip,.status,.cap,.lab,.test,.head')];
  for (const el of boxes) {
    const r = el.getBoundingClientRect();
    if (r.left < 12 || r.top < 12 || r.right > 1268 || r.bottom > 708) out.push('SAFE ' + el.className + ' ' + JSON.stringify([r.left, r.top, r.right, r.bottom].map(Math.round)));
    if (el.scrollWidth > el.clientWidth + 1) out.push('CLIP ' + el.className + ' ' + el.textContent.trim().slice(0, 30));
  }
  const tops = [...document.querySelectorAll('.pill,.card,.strip,.title')].map((e) => [e.className, Math.round(e.getBoundingClientRect().top), Math.round(e.getBoundingClientRect().bottom)]);
  return { fonts: [...document.fonts].filter((f) => f.status === 'loaded').length, issues: out, tops };
});
console.log(JSON.stringify(report, null, 1));
await page.screenshot({ path: DIR + 'keycard.png' });
await browser.close();
