// Press shot with the real HUD: a 1P match vs the hard bot on OFFSITE, the player held by a simple script (move toward the
// rival, jump, shoot). 1920x1080 CSS at DPR 4/3 = 2560x1440. No DOM or camera changes.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const OUT = new URL('./raw/HUD/', import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 4 / 3 })).newPage();
await page.addInitScript(() => {
  localStorage.setItem('floor42:settings', JSON.stringify({ quality: 'high', arena: 'offsite', showKeyHints: false }));
  localStorage.setItem('floor-42:finished-match', '1');
});
await page.goto('http://localhost:3261/#/arena?p1=standup&p2=intern&bot=hard&arena=offsite');
await page.waitForFunction(() => window.__mc?.state()?.phase === 'fight', null, { timeout: 90000 });
await page.mouse.move(2, 2);
let n = 0;
for (let i = 0; i < 70; i++) {
  const s = await page.evaluate(() => { const st = window.__mc.state(); return st.fighters.map((f) => ({ x: f.x, y: f.y })); });
  const dir = s[1].x > s[0].x ? 'KeyD' : 'KeyA';
  await page.keyboard.down(dir); await page.keyboard.down('Space');
  if (i % 4 === 0) await page.keyboard.press('KeyW');
  await page.waitForTimeout(200);
  await page.keyboard.up(dir);
  if (Math.abs(s[0].x - s[1].x) < 7 && i > 5) { await page.screenshot({ path: `${OUT}${String(n++).padStart(3, '0')}.png` }); }
  await page.keyboard.up('Space');
}
console.log('frames', n);
await browser.close();
