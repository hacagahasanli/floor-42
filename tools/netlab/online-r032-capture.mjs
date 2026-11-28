// R-032 implementation captures: every lobby state (dev `?lobbyState=`) and every in-match overlay (dev `?overlay=` on a
// browser-bot match), at 1280x720 and 1920x1080, real-GPU Chromium, plus the layout check (overlap / overflow of [data-ui]
// boxes and text outside its box). Needs Next dev with NEXT_PUBLIC_ONLINE=1 on WEB (default :3011).
// node tools/netlab/online-r032-capture.mjs <outdir> [ids,...]
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const WEB = process.env.WEB || 'http://localhost:3011';
const OUT = process.argv[2] || 'r032-impl';
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
fs.mkdirSync(OUT, { recursive: true });
const STATES = ['menu', 'offline', 'code', 'joining', 'connecting', 'waking', 'search-one', 'search-home', 'search-next', 'search-bot', 'found', 'bot', 'bot-offline', 'invite', 'error-server', 'error-lost', 'error-room', 'error-full', 'error-version'];
const SIZES = process.env.SIZES
  ? process.env.SIZES.split(',').map((x) => x.split('x').map(Number))
  : [
      [1280, 720],
      [1920, 1080],
    ];
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});

/** Layout check in the page: visible text elements clipped by an ancestor with overflow hidden, text overflowing its own box,
 *  panels / buttons / cards overlapping each other (siblings in the lobby frame), anything outside the viewport. */
const check = () => {
  const issues = [];
  const vw = innerWidth;
  const vh = innerHeight;
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0';
  };
  const name = (el) => (el.getAttribute('data-testid') || el.className?.toString?.().split(' ')[0] || el.tagName) + ':' + (el.textContent || '').trim().slice(0, 30);
  const blocks = [...document.querySelectorAll('.on-panel, .on-fcard, .fd-btn, .on-picker, .fd-hints, .on-title, .fd-seg, .fd-pill, .on-offer')].filter(vis);
  for (const el of blocks) {
    const r = el.getBoundingClientRect();
    if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) issues.push(`off-screen ${name(el)} ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`);
  }
  // overlaps between top-level blocks that are not nested in each other (cards may touch the VS disc: it sits on them on purpose)
  const top = blocks.filter((el) => !blocks.some((o) => o !== el && o.contains(el)));
  for (let i = 0; i < top.length; i++)
    for (let j = i + 1; j < top.length; j++) {
      const a = top[i].getBoundingClientRect();
      const b = top[j].getBoundingClientRect();
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix > 2 && iy > 2) issues.push(`overlap ${name(top[i])} x ${name(top[j])} (${Math.round(ix)}x${Math.round(iy)})`);
    }
  // text overflowing its box
  for (const el of document.querySelectorAll('.on-line, .on-small, .on-t, .on-s, .fd-btn .fd-label, .on-ribbon, .on-code, .on-nm, .on-rl, .fd-chip, .on-warnchip, .on-netpill')) {
    if (!vis(el)) continue;
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') issues.push(`text-overflow ${name(el)}`);
    // text that runs past its panel
    const panel = el.closest('.on-panel');
    if (panel) {
      const p = panel.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (r.right > p.right + 1 || r.bottom > p.bottom + 1 || r.left < p.left - 1) issues.push(`outside-panel ${name(el)}`);
    }
  }
  const suns = [...document.querySelectorAll('.fd-btn.fd-t-sun, .on-ribbon.on-sun, .on-dot.on-now')].filter(vis).length;
  return { issues, suns };
};

const report = [];
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  for (const s of STATES) {
    if (ONLY && !ONLY.includes(s)) continue;
    await page.goto(`${WEB}/play?lobbyState=${s}`);
    await page.waitForSelector('[data-testid="online-lobby"]', { timeout: 20000 });
    await page.waitForTimeout(900);
    await page.evaluate(() => document.fonts?.ready);
    // freeze idle motion for a stable picture
    await page.addStyleTag({ content: '*{animation-play-state:paused!important}' });
    await page.screenshot({ path: `${OUT}/lobby-${s}-${w}x${h}.png` });
    const c = await page.evaluate(check);
    report.push({ id: `lobby-${s}`, size: `${w}x${h}`, ...c, errors: errors.splice(0) });
  }
  await ctx.close();
}

// in-match: the overlays over a browser-bot match (?overlay= dev switch on /arena)
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  for (const o of ['dropped', 'left', 'left-last', 'left-quick', 'asking', 'asking-last', 'expired', 'gl']) {
    if (ONLY && !ONLY.includes(`overlay-${o}`)) continue;
    await page.goto(`${WEB}/arena?p1=hotfix&p2=standup&bot=normal&overlay=${o}`);
    await page.waitForSelector(`[data-testid="overlay-${o.split('-')[0] === 'left' ? 'left' : o.split('-')[0]}"]`, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.addStyleTag({ content: '*{animation-play-state:paused!important}' });
    await page.screenshot({ path: `${OUT}/overlay-${o}-${w}x${h}.png` });
    const c = await page.evaluate(check);
    report.push({ id: `overlay-${o}`, size: `${w}x${h}`, ...c });
  }
  await ctx.close();
}
fs.writeFileSync(`${OUT}/layout-check.json`, JSON.stringify(report, null, 2));
const bad = report.filter((r) => r.issues.length || r.errors?.length);
console.log(`${report.length} frames, ${bad.length} with issues`);
for (const r of bad) console.log(r.id, r.size, JSON.stringify(r.issues), JSON.stringify(r.errors ?? []));
console.log('suns per frame', JSON.stringify(Object.fromEntries(report.filter((r) => r.size === '1280x720').map((r) => [r.id, r.suns]))));
await browser.close();
