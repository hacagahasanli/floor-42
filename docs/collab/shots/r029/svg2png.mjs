// node svg2png.mjs in.svg out.png width
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const [inp, out, w] = process.argv.slice(2);
const svg = fs.readFileSync(inp, 'utf8');
const m = svg.match(/viewBox="([\d.\s-]+)"/)[1].split(/\s+/).map(Number);
const W = +w, H = Math.round(W * m[3] / m[2]);
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
await p.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${W}" height="${H}" style="display:block"></body></html>`);
await p.waitForTimeout(300);
await p.screenshot({ path: out, omitBackground: true });
await b.close();
