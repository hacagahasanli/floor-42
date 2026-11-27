// Rename shots (Pewfield): boot, home, credits, OFFSITE water tower, favicons. Real GPU: Chromium 1255, ANGLE Metal, 1280x720.
// Usage: node scripts/portal-serve.mjs 3215 &  then  node docs/collab/shots/rename/capture.mjs
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
const root = process.env.HOME + '/.npm/_npx';
const dir = readdirSync(root).find((d) => existsSync(`${root}/${d}/node_modules/playwright-core`));
const { chromium } = createRequire(`${root}/${dir}/`)('playwright-core');
const OUT = new URL('.', import.meta.url).pathname;
const BASE = process.env.BASE || 'http://localhost:3215/games/floor-42/';
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const seed = (extra = {}) => ([e]) => {
  localStorage.setItem('floor42:settings', JSON.stringify({ quality: 'high', audience: 'regular', ...e }));
  localStorage.setItem('floor42:finished-match', '1');
};
const open = async (settings, hold = false) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.addInitScript(seed(), [settings]);
  if (hold) await page.route(/assets\/index-.*\.js/, () => {}); // never answers: the boot screen stays up
  return { ctx, page };
};
let { ctx, page } = await open({}, true);
await page.goto(BASE).catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + 'boot-1280x720.png' });
console.log('boot title:', await page.title());
await ctx.close();

({ ctx, page } = await open({}));
await page.goto(BASE + '#/');
await page.waitForSelector('[data-testid=home]', { timeout: 20000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + 'home-1280x720.png' });
console.log('home title:', await page.title(), '| wordmark h1:', await page.locator('[data-testid=wordmark] h1').getAttribute('aria-label').catch(() => 'n/a'), await page.locator('[data-testid=wordmark] svg').getAttribute('aria-label'));
const box = await page.locator('[data-testid=wordmark]').boundingBox();
console.log('wordmark slot box', JSON.stringify(box));
await page.click('[data-testid=credits-link]');
await page.waitForSelector('[data-testid=credits]');
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + 'credits-1280x720.png' });
await ctx.close();

({ ctx, page } = await open({ arena: 'offsite' }));
await page.goto(BASE + '#/arena?p1=brix&p2=ormo&bot=hard&demo=1&arena=offsite');
await page.waitForTimeout(6000);
await page.screenshot({ path: OUT + 'offsite-watertower-1280x720.png' });
await ctx.close();

ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
page = await ctx.newPage();
await page.setContent(`<body style="margin:0;background:#26124a;font:700 20px sans-serif;color:#fff;display:flex;gap:40px;align-items:center;justify-content:center;height:720px">
${[['favicon.svg 128', 'favicon.svg', 128], ['favicon-32 x4', 'favicon-32.png', 128], ['favicon-16 x8', 'favicon-16.png', 128], ['icon-48 x2', 'icons/icon-48.png', 96], ['icon-192', 'icons/icon-192.png', 192], ['icon-512', 'icons/icon-512.png', 256]]
  .map(([l, s, w]) => `<figure style="margin:0;text-align:center"><img src="${BASE}${s}" width="${w}" style="image-rendering:pixelated;display:block"><figcaption>${l}</figcaption></figure>`).join('')}</body>`);
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + 'favicons-1280x720.png' });
await browser.close();
