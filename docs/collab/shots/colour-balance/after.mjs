// R-027 AFTER mockups: same captures as capture.mjs, with calm.css + the small DOM recolours below injected into the real build.
// These are design proofs, not the implementation. Usage: node after.mjs (dev servers as in capture.mjs)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const DIR = new URL('.', import.meta.url).pathname;
const OUT = DIR + 'after/';
const CSS = fs.readFileSync(DIR + 'calm.css', 'utf8');
const A = process.env.A || 'http://localhost:3251';
const B = process.env.B || 'http://localhost:3252';
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
// DOM recolours that CSS alone cannot reach (inline backgrounds / SVG fills).
const calm = ({ wordmark }) => {
  const BUNT = ['#FFC83D', '#FFF3D6', '#FF7A2F', '#FFF3D6'];
  document.querySelectorAll('[data-testid="bunting"] .fd-pen path').forEach((p, i) => p.setAttribute('fill', BUNT[i % 4]));
  // home: the sunburst behind the card fades at the edge and steps back
  const home = document.querySelector('[data-testid="home"]');
  if (home) home.querySelectorAll('.fd-rays').forEach((r) => { r.classList.remove('fd-solid'); r.style.opacity = '0.75'; });
  // 2P: header bars grape with a 6 px accent foot; READY = sun; VS = white
  document.querySelectorAll('.fd div').forEach((d) => {
    const s = d.style;
    if (s.height === '58px' && /rgb\(/.test(s.background)) {
      const acc = s.background.match(/rgb\([^)]+\)/)[0];
      s.background = 'var(--grape)'; s.boxShadow = `inset 0 -6px 0 ${acc}`;
    }
    if (s.borderRadius === '50%' && s.width === '72px' && /sun/.test(s.background)) { s.background = '#fff'; }
  });
  document.querySelectorAll('[data-testid^="ready-p"]').forEach((b) => {
    if (/teal/.test(b.getAttribute('style'))) { b.style.background = 'var(--sun)'; b.style.boxShadow = 'inset 0 -6px 0 var(--sun-lo), 0 6px 0 var(--grape)'; }
  });
  // result: medal ring = the holder's accent; confetti = sun, white, winner accent
  const ring = { boomerang: '#E5392F', bouncy: '#E5392F', pinata: '#F25CB8' };
  for (const [k, c] of Object.entries(ring)) { const m = document.querySelector(`[data-testid="award-${k}"] .fd-res-disc`); if (m) m.style.setProperty('--ring', c); }
  const CONF = ['#FFC83D', '#FFFFFF', '#E5392F', '#FFE38A', '#FFFFFF', '#FFC83D'];
  document.querySelectorAll('.fd-confetti b').forEach((b, i) => (b.style.background = CONF[i % 6]));
  // HUD: FIRST TO 5 pill white (sun only at match point)
  const fp = document.querySelector('[data-testid="hud-timer"]')?.parentElement?.querySelector('.fd-chip');
  // wordmark: 160 px high (art about 369 x 160), ribbon tucked under it, menu column unchanged in height
  if (wordmark && home) {
    const wm = home.querySelector('[data-testid="wordmark"]');
    wm.style.height = '160px'; wm.style.width = '420px'; wm.parentElement.style.top = '34px'; wm.parentElement.style.left = '34px';
    const rib = home.querySelector('[data-testid="arena-ribbon"]'); rib.style.top = '184px'; rib.style.left = '64px';
    const col = rib.nextElementSibling; col.style.top = '252px'; col.style.gap = '16px';
  }
};
const shot = async (id, base, route, act = async () => {}, wait = 3000, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('floor42:settings', JSON.stringify({ quality: 'high', arena: 'offsite', showKeyHints: true }));
    localStorage.setItem('floor-42:finished-match', '1');
  });
  await page.goto(base + route);
  await page.waitForTimeout(wait);
  await act(page);
  await page.addStyleTag({ content: CSS });
  await page.evaluate(calm, opts);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}${id}.png` });
  console.log('ok', id);
  await ctx.close();
};
const press = (...k) => async (p) => { for (const x of k) { await p.keyboard.press(x); await p.waitForTimeout(250); } await p.waitForTimeout(700); };
// await shot('home', A, '/#/');
await shot('home-pewfield', B, '/#/', undefined, 3000, { wordmark: true });
await shot('select', A, '/#/characters', press('ArrowRight'));
await shot('select-2p', A, '/#/?2p', press('KeyF'));
await shot('hud-offsite', A, '/#/arena?p1=standup&p2=hotfix&bot=normal&arena=offsite', async (p) => {
  await p.waitForSelector('[data-testid="fd-hud"]', { timeout: 90000 });
  await p.waitForFunction(() => window.__mc?.state()?.phase === 'fight', null, { timeout: 30000 });
  await p.keyboard.down('KeyD'); await p.waitForTimeout(1200); await p.keyboard.up('KeyD');
  for (let i = 0; i < 20; i++) { await p.mouse.click(900, 400); await p.waitForTimeout(250); }
  await p.waitForTimeout(1500);
}, 1000);
await shot('result', A, '/zz_result.html?case=win', async (p) => { await p.waitForTimeout(3500); }, 1500);
await browser.close();
