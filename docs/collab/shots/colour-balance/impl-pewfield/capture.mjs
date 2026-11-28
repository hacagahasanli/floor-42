// F-057 (colour-balance.md section 5): PEWFIELD wordmark on home and the boot screen, real GPU (Chromium 1255, ANGLE Metal) at
// 1280x720 and 1920x1080, with the layout check from traits-menus/capture.mjs (safe area, overflow, clipping, overlap) plus the
// wordmark / ribbon / menu-column geometry in design px. Needs, in floor-42-rename:
//   npx vite --config vite.portal.config.ts --port 3252        (home)
//   npm run build:portal && node scripts/portal-serve.mjs 3253 (boot: the built page, with the main bundle held so it stays up)
// Usage: node capture.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const OUT = new URL('.', import.meta.url).pathname;
const B = process.env.B || 'http://localhost:3252';
const BUILT = process.env.BUILT || 'http://localhost:3253/games/floor-42/';
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const check = () => {
  const out = [];
  const W = innerWidth, H = innerHeight;
  const s = parseFloat(getComputedStyle(document.querySelector('.fd')).getPropertyValue('--s')) || 1;
  const safe = 12 * s;
  const name = (e) => `${e.getAttribute('data-testid') || e.className.toString().slice(0, 24)} "${(e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`;
  const UI = [...document.querySelectorAll('.fd-btn,.fd-card,.fd-panel,.fd-pill,.fd-hints,.fd-ribbon,.fd-bubble,.fd-chip,h2,[data-testid="wordmark"]')];
  for (const e of UI) {
    const r = e.getBoundingClientRect();
    if (!r.width) continue;
    const ring = e === document.activeElement ? 12 * s : 0;
    if (r.left - ring < safe - 1 || r.top - ring < safe - 1 || r.right + ring > W - safe + 1 || r.bottom + ring > H - safe + 1) {
      if (e.closest('.fd-card') && e.closest('.fd-card') !== e) continue;
      out.push('SAFE-AREA ' + name(e) + ` [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
  }
  for (const e of document.querySelectorAll('.fd-btn,.fd-chip,.fd-kc,.fd-pill,.fd-hints,.fd-ribbon')) {
    const b = e.getBoundingClientRect(), bw = (parseFloat(getComputedStyle(e).borderLeftWidth) || 0) * s;
    const rects = [];
    const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) { if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); rects.push(r.getBoundingClientRect()); }
    for (const k of e.querySelectorAll('svg:not(.fd-tail):not(.fd-ptr)')) { if (k.closest('.fd-ptr')) continue; rects.push(k.getBoundingClientRect()); }
    if (!rects.length) continue;
    const L = Math.min(...rects.map((r) => r.left)) - b.left - bw, R = b.right - bw - Math.max(...rects.map((r) => r.right));
    if (L < -0.5 || R < -0.5) out.push('OVERFLOW ' + name(e));
    const min = e.classList.contains('fd-btn') && !e.classList.contains('fd-icon') ? 12 * s : 0;
    if (min && (L < min - 1 || R < min - 1)) out.push(`TIGHT ${name(e)} ${Math.round(L / s)}/${Math.round(R / s)}px`);
  }
  for (const stage of document.querySelectorAll('.fd-stage')) {
    const tw = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) {
      if (!n.textContent.trim()) continue;
      const r = document.createRange(); r.selectNodeContents(n); const t = r.getBoundingClientRect();
      for (let a = n.parentElement; a && !a.classList.contains('fd-stage'); a = a.parentElement) {
        if (getComputedStyle(a).overflow === 'hidden' && !a.classList.contains('fd-confetti')) {
          const b = a.getBoundingClientRect();
          if (t.left < b.left - 1 || t.right > b.right + 1 || t.top < b.top - 1 || t.bottom > b.bottom + 1) out.push('CLIPPED "' + n.textContent.trim().slice(0, 24) + '" by ' + name(a));
        }
      }
    }
  }
  const boxes = UI.filter((e) => e.getBoundingClientRect().width);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.contains(b) || b.contains(a)) continue;
    const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
    const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left), oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
    if (ox > 3 * s && oy > 3 * s) out.push('OVERLAP ' + name(a) + ' x ' + name(b));
  }
  return out;
};

// Geometry in design px (rect / --s, relative to the 1280x720 frame).
const geom = () => {
  const fd = document.querySelector('.fd');
  const s = parseFloat(getComputedStyle(fd).getPropertyValue('--s')) || 1;
  const frame = document.querySelector('[data-testid="home"]').getBoundingClientRect();
  const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((v, i) => Math.round(((v - (i === 0 ? frame.left : i === 1 ? frame.top : 0)) / s) * 10) / 10); };
  return { slot: r('[data-testid="wordmark"]'), art: r('[data-testid="wordmark"] svg'), ribbon: r('[data-testid="arena-ribbon"]'), play: r('[data-testid="play"]'), howto: r('[data-testid="open-howto"]') };
};
// Boot: the wordmark and every block inside the 12 px safe area (in viewport px, scaled), and no overlaps between them.
const bootCheck = () => {
  const out = [];
  const s = parseFloat((document.getElementById('boot-stage').style.transform.match(/scale\(([\d.]+)\)/) || [0, 1])[1]);
  const safe = 12 * s, W = innerWidth, H = innerHeight;
  const els = [...document.querySelectorAll('#boot .wm, #boot .bar, #boot .tip, #boot .studio')];
  const box = (e) => e.getBoundingClientRect();
  for (const e of els) { const b = box(e); if (b.left < safe - 1 || b.top < safe - 1 || b.right > W - safe + 1 || b.bottom > H - safe + 1) out.push(`SAFE-AREA ${e.className} [${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}]`); }
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = box(els[i]), b = box(els[j]); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3) out.push(`OVERLAP ${els[i].className} x ${els[j].className}`); }
  const wm = box(document.querySelector('#boot .wm'));
  const bar = box(document.querySelector('#boot .bar'));
  return { issues: out, scale: s, wordmark: [wm.left, wm.top, wm.width, wm.height].map((v) => Math.round(v)), designHeight: Math.round(wm.height / s * 10) / 10, gapToBar: Math.round((bar.top - wm.bottom) / s) };
};
const report = [];
for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  let ctx = await browser.newContext({ viewport: { width: w, height: h } });
  let page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('floor42:settings', JSON.stringify({ quality: 'high', arena: 'offsite', showKeyHints: true }));
    localStorage.setItem('floor-42:finished-match', '1');
  });
  await page.goto(B + '/#/');
  await page.waitForSelector('[data-testid=home]', { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}home-pewfield-${w}.png` });
  const issues = [...new Set(await page.evaluate(check))];
  report.push(`home-pewfield @${w}x${h}: ${issues.length ? issues.length + ' issue(s)\n  ' + issues.join('\n  ') : '0 issues'}\n  geometry (design px, [left, top, w, h]): ${JSON.stringify(await page.evaluate(geom))}`);
  await ctx.close();

  ctx = await browser.newContext({ viewport: { width: w, height: h } });
  page = await ctx.newPage();
  await page.route(/assets\/index-.*\.js/, () => {}); // never answers: the boot screen stays up
  await page.goto(BUILT).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}boot-pewfield-${w}.png` });
  const b = await page.evaluate(bootCheck);
  report.push(`boot-pewfield @${w}x${h}: ${b.issues.length ? b.issues.length + ' issue(s)\n  ' + b.issues.join('\n  ') : '0 issues'}\n  stage scale ${b.scale}, wordmark ${JSON.stringify(b.wordmark)} viewport px, ${b.designHeight} design px high, ${b.gapToBar} design px above the loading bar`);
  await ctx.close();
}
fs.writeFileSync(OUT + 'layout-check.txt', report.join('\n') + '\n');
console.log(report.join('\n'));
await browser.close();
