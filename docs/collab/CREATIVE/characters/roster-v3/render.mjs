// Renders every <section class="sheet"> of sheets.html to <id>.png at 1920x1080.
// three.js is served from the project's node_modules (the page asks unpkg; the request is answered locally).
// Run from this folder: node render.mjs
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const npx = path.join(process.env.HOME, '.npm/_npx');
const pwDir = fs.readdirSync(npx).map((d) => path.join(npx, d, 'node_modules/playwright')).find((p) => fs.existsSync(p));
const { chromium } = require(pwDir);
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const here = path.dirname(new URL(import.meta.url).pathname);
const threeDir = path.resolve(here, '../../../../../node_modules/three/build');
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined, args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[error]', e.message));
await page.route('https://unpkg.com/three@0.170.0/build/**', (route) => {
  const file = path.join(threeDir, path.basename(new URL(route.request().url()).pathname));
  route.fulfill({ path: file, contentType: 'text/javascript' });
});
await page.goto('file://' + path.join(here, 'sheets.html'));
await page.waitForSelector('body[data-ready="1"]', { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
const ids = await page.$$eval('section.sheet', (s) => s.map((e) => e.id));
for (const id of ids) {
  const out = path.join(here, `${id}.png`);
  await page.locator('#' + id).screenshot({ path: out });
  console.log('wrote', path.basename(out));
}
await browser.close();
