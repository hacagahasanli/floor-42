// Renders every <section class="screen" id="..."> of dir-*/index.html to dir-*/<id>.png at 1280x720,
// then the comparison sheet. Run: node render.mjs (from this folder)
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const npx = path.join(process.env.HOME, '.npm/_npx');
const pwDir = fs.readdirSync(npx).map(d => path.join(npx, d, 'node_modules/playwright')).find(p => fs.existsSync(p));
const { chromium } = require(pwDir);
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const here = path.dirname(new URL(import.meta.url).pathname);
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const only = process.argv[2];
for (const dir of ['dir-a', 'dir-b', 'dir-c', 'compare']) {
  if (only && only !== dir) continue;
  const file = path.join(here, dir === 'compare' ? 'compare.html' : `${dir}/index.html`);
  if (!fs.existsSync(file)) continue;
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto('file://' + file);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const ids = await page.$$eval('section.screen', s => s.map(e => e.id));
  for (const id of ids) {
    const out = dir === 'compare' ? path.join(here, `${id}.png`) : path.join(here, dir, `${id}.png`);
    await page.locator('#' + id).screenshot({ path: out });
    console.log('wrote', path.relative(here, out));
  }
  await page.close();
}
await browser.close();
