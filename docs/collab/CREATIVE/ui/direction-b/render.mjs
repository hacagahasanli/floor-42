// Direction B "Field Day" renderer + layout checker (R-021).
// Run from this folder: node render.mjs
// Writes png/1280/<id>.png (1280x720), png/1920/<id>.png (1920x1080 = same layout at UI scale 1.5),
// layout-check.txt (overflow, clipped text, safe-area and overlap checks per screen) and home-idle.webm.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const npx = path.join(process.env.HOME, '.npm/_npx');
const pwDir = fs.readdirSync(npx).map(d => path.join(npx, d, 'node_modules/playwright')).find(p => fs.existsSync(p));
const { chromium } = require(pwDir);
const exe = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const here = path.dirname(new URL(import.meta.url).pathname);
const file = 'file://' + path.join(here, 'index.html');
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });

async function freeze(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const a of document.getAnimations()) {
      const sec = a.effect?.target?.closest?.('section');
      a.pause();
      a.currentTime = Number(sec?.dataset.t ?? 1) * 1000;
    }
  });
  await page.waitForTimeout(150);
}

const report = [];
for (const [dir, dsf] of [['1280', 1], ['1920', 1.5]]) {
  fs.mkdirSync(path.join(here, 'png', dir), { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: dsf });
  await page.goto(file);
  await freeze(page);
  const fontsOk = await page.evaluate(() => ['400 20px "Titan One"', '800 20px "Baloo 2"', '700 20px "Baloo 2"'].map(f => document.fonts.check(f)));
  if (dir === '1280') report.push(`fonts loaded (Titan One, Baloo 2 800, 700): ${fontsOk.join(', ')}`);
  const ids = await page.$$eval('section.screen', s => s.map(e => e.id));
  for (const id of ids) {
    await page.locator('#' + id).screenshot({ path: path.join(here, 'png', dir, `${id}.png`) });
    if (dir !== '1280') continue;
    const issues = await page.evaluate(sid => {
      const sec = document.getElementById(sid), S = sec.getBoundingClientRect(), out = [];
      const name = e => (e.id ? '#' + e.id : e.className?.baseVal ?? e.className ?? e.tagName).toString().slice(0, 28) + ' "' + (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 26) + '"';
      // 1 overflow inside sized components
      // text and icons must sit inside the component's padding box (decorations such as focus rings and ribbon tails excluded)
      for (const e of sec.querySelectorAll('.btn,.chip,.kc,.pill,.hints,.kfeed,.ribbon')) {
        const b = e.getBoundingClientRect(), cs = getComputedStyle(e), bw = parseFloat(cs.borderLeftWidth) || 0;
        const kids = [...e.querySelectorAll('*')].filter(k => !k.matches('.tail,.ptr,.shine,.ptr *,.tail *') && k.getBoundingClientRect().width && getComputedStyle(k).position !== 'absolute');
        const rects = kids.map(k => k.getBoundingClientRect());
        const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
        for (let n; (n = tw.nextNode());) { if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); rects.push(r.getBoundingClientRect()); }
        if (rects.some(r => r.left < b.left + bw - .5 || r.right > b.right - bw + .5)) out.push('OVERFLOW ' + name(e));
        const minPad = e.classList.contains('btn') ? 12 : 4;
        const L = Math.min(...rects.map(r => r.left)) - b.left - bw, R = b.right - bw - Math.max(...rects.map(r => r.right));
        if (rects.length && !e.classList.contains('icon') && !e.style.transform && (L < minPad || R < minPad)) out.push(`TIGHT ${name(e)} pad ${Math.round(L)}/${Math.round(R)}`);
      }
      // 2 text clipped by an overflow:hidden ancestor (or the screen edge)
      const walker = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode());) {
        if (!n.textContent.trim()) continue;
        const r = document.createRange(); r.selectNodeContents(n); const t = r.getBoundingClientRect();
        if (!t.width) continue;
        let a = n.parentElement;
        while (a && a !== sec.parentElement) {
          const cs = getComputedStyle(a);
          if (cs.overflow !== 'visible' || a === sec) {
            const b = a.getBoundingClientRect();
            if (t.left < b.left - 1 || t.right > b.right + 1 || t.top < b.top - 3 || t.bottom > b.bottom + 3) out.push('CLIPPED TEXT "' + n.textContent.trim().slice(0, 30) + '" in ' + name(a));
            break;
          }
          a = a.parentElement;
        }
      }
      // 3 safe area (12 px inset; focus ring counted)
      const boxes = [...sec.querySelectorAll('[data-ui],.btn')].filter(e => !e.closest('#b18-sheet-components,#b19-sheet-tokens'));
      for (const e of boxes) {
        if (e.hasAttribute('data-bleed')) continue;
        const b = e.getBoundingClientRect(), g = e.classList.contains('is-focus') ? 16 : 0;
        if (b.left - g < S.left + 12 || b.right + g > S.right - 12 || b.top - g < S.top + 12 || b.bottom + g > S.bottom - 12) out.push('SAFE-AREA ' + name(e) + ` [${Math.round(b.left - S.left)},${Math.round(b.top - S.top)},${Math.round(b.right - S.left)},${Math.round(b.bottom - S.top)}]`);
      }
      // 4 overlaps between unrelated boxes (skip intentional layers)
      const free = boxes.filter(e => !e.closest('[data-layer]'));
      for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
        const A = free[i], B = free[j];
        if (A.contains(B) || B.contains(A)) continue;
        const a = A.getBoundingClientRect(), b = B.getBoundingClientRect();
        const inside = (p, q) => p.left >= q.left && p.right <= q.right && p.top >= q.top && p.bottom <= q.bottom;
        if (inside(a, b) || inside(b, a)) continue; // placed on a panel: intended
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 2 && h > 2) out.push(`OVERLAP ${name(A)} x ${name(B)} (${Math.round(w)}x${Math.round(h)})`);
      }
      return out;
    }, id);
    report.push(`\n[${id}] ${issues.length ? issues.length + ' issue(s)' : 'clean'}`, ...issues.map(s => '  - ' + s));
  }
  await page.close();
}
fs.writeFileSync(path.join(here, 'layout-check.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));

// idle-motion clip of the home screen (liveliness proof), 6 s
if (!process.argv.includes('--no-video')) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: path.join(here, '_video'), size: { width: 1280, height: 720 } } });
  const p = await ctx.newPage();
  await p.goto(file + '#solo=b02-home');
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(6000);
  const v = p.video(); await ctx.close();
  fs.renameSync(await v.path(), path.join(here, 'home-idle.webm'));
  fs.rmSync(path.join(here, '_video'), { recursive: true, force: true });
}
await browser.close();
