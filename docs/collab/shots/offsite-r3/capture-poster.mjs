// The first-paint poster for the OFFSITE menu backdrop: the live canvas only (no menu, no grade), Hotfix, 1920x1080.
import { createRequire } from 'node:module';
const require = createRequire('/Users/hacaghahasanli/Desktop/projects/games-studio/playable-floor42/package.json');
const { chromium } = require('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await page.addInitScript(() => localStorage.setItem('floor42:settings', JSON.stringify({ quality: 'high', arena: 'offsite', audience: 'regular' })));
await page.goto('http://localhost:3511/#/');
await page.waitForTimeout(5000);
await page.evaluate(() => { for (const el of document.querySelectorAll('main > *:not(canvas)')) el.style.display = 'none'; });
await page.screenshot({ path: '/private/tmp/claude-501/diag/poster.png' });
await browser.close();
