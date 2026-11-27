// Renders sheet.html to traits-sheet.png (CD, R-026). node render.mjs
import { createRequire } from 'node:module';
const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const HERE = new URL('.', import.meta.url).pathname;
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('file://' + HERE + 'sheet.html'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
await p.screenshot({ path: HERE + 'traits-sheet.png', fullPage: true }); await b.close();
