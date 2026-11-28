// R-028 / F-058..F-064 implementation captures: the REAL build (no injected CSS), Chromium 1255 with ANGLE Metal (real GPU),
// same setup as ../impl/capture.mjs, with the shared layout check (../layout-check.mjs, includes the F-060 lock-up whitelist),
// a sun-mark count per screen, the reset-confirm clear space and the cooling-chip text contrast measured from pixels.
// Needs `npx vite --config vite.portal.config.ts --port 3251` in floor-42 (portal-build).
// Usage: node capture.mjs            (A=http://localhost:3251, ONLY=id,id to run a subset)
import { createRequire } from 'node:module';
import fs from 'node:fs';

import { check, checkResult, checkScoped, issuesOf, notesOf, sunMarks, suns } from '../layout-check.mjs';

const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const OUT = new URL('.', import.meta.url).pathname;
const A = process.env.A || 'http://localhost:3251';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});

// A blank page that decodes PNGs for pixel work (greyscale copy, contrast from pixels).
const pix = await (await browser.newContext()).newPage();
const withImage = (png, fn, arg) =>
  pix.evaluate(
    async ({ b64, src, arg }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      return new Function('c', 'g', 'arg', src)(c, g, arg);
    },
    { b64: png.toString('base64'), src: fn, arg },
  );
// Greyscale with the CD's luma (0.299 / 0.587 / 0.114).
const GREY = `const d = g.getImageData(0, 0, c.width, c.height); const p = d.data;
  for (let i = 0; i < p.length; i += 4) { const y = Math.round(0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]); p[i] = p[i + 1] = p[i + 2] = y; }
  g.putImageData(d, 0, 0); return c.toDataURL('image/png').split(',')[1];`;
// Chip text contrast from pixels: inside the border, the fill is the most common colour and the text core is the darkest
// 3 % of the pixels that differ from the fill (anti-aliased edges are lighter than the core). WCAG 2.x ratio.
const CONTRAST = `const { inset } = arg; const d = g.getImageData(inset, inset, c.width - 2 * inset, c.height - 2 * inset).data;
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
  const count = new Map();
  for (let i = 0; i < d.length; i += 4) { const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2]; count.set(k, (count.get(k) || 0) + 1); }
  const fill = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
  const Lf = L(...fill);
  const px = [];
  for (let i = 0; i < d.length; i += 4) { const l = L(d[i], d[i + 1], d[i + 2]); if (Math.abs(l - Lf) > 0.05) px.push([l, d[i], d[i + 1], d[i + 2]]); }
  px.sort((a, b) => a[0] - b[0]);
  const core = px.slice(0, Math.max(1, Math.round(px.length * 0.03)));
  const avg = [1, 2, 3].map((j) => Math.round(core.reduce((s, q) => s + q[j], 0) / core.length));
  const Lt = L(...avg);
  const ratio = (Math.max(Lt, Lf) + 0.05) / (Math.min(Lt, Lf) + 0.05);
  const hex = (a) => '#' + a.map((v) => v.toString(16).padStart(2, '0')).join('');
  return { fill: hex(fill), text: hex(avg), ratio: Math.round(ratio * 100) / 100, textPixels: px.length };`;

const report = [];
const shot = async (id, route, act = async () => {}, { wait = 3000, settings = {}, w = 1280, h = 720, scope = null, result = false, grey = false } = {}) => {
  if (ONLY && !ONLY.includes(id)) return;
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${id}] PAGE ERROR`, e.message));
  await page.addInitScript((extra) => {
    localStorage.setItem('floor42:settings', JSON.stringify({ quality: 'high', arena: 'offsite', showKeyHints: true, ...extra }));
    localStorage.setItem('floor-42:finished-match', '1');
  }, settings);
  await page.goto(A + route);
  await page.waitForTimeout(wait);
  const extra = (await act(page)) || '';
  const png = await page.screenshot({ path: `${OUT}${id}.png` });
  if (grey) fs.writeFileSync(`${OUT}${id}-grey.png`, Buffer.from(await withImage(png, GREY), 'base64'));
  const all = [...new Set(result ? await page.evaluate(checkResult) : scope ? await page.evaluate(checkScoped, scope) : await page.evaluate(check))];
  const issues = issuesOf(all), notes = notesOf(all);
  let line = `${id} @${w}x${h}: [${result ? 'p2b result check' : scope ? 'p2a check, scope ' + scope : 'traits-menus check'}] ${issues.length ? issues.length + ' issue(s)\n  ' + issues.join('\n  ') : '0 issues'}`;
  if (notes.length) line += '\n  ' + notes.join('\n  ');
  const sm = await page.evaluate(sunMarks);
  line += `\n  sun buttons: ${JSON.stringify(await page.evaluate(suns))}`;
  line += `\n  sun marks (own sun fill): ${sm.count} ${JSON.stringify(sm.fills)}; sun text: ${JSON.stringify(sm.text)}; sun in icons: ${JSON.stringify(sm.icons)}`;
  if (extra) line += '\n  ' + extra;
  report.push(line);
  console.log(line);
  await ctx.close();
};
const rest = async (p) => { await p.mouse.move(2, 2); await p.waitForTimeout(500); };
const openSettings = async (p) => { await p.click('[data-testid="open-settings"]'); await p.waitForTimeout(900); };
const tab = (t, after) => async (p) => {
  await openSettings(p);
  if (t !== 'controls') { await p.click(`[data-testid="tab-${t}"]`); await p.waitForTimeout(600); }
  await rest(p);
  const info = await p.evaluate(() => ({
    tab: [...document.querySelectorAll('[role="tab"]')].map((e) => `${e.textContent.trim()} ${e.getAttribute('aria-selected') === 'true' ? 'SELECTED' : ''} bg=${getComputedStyle(e).backgroundColor} fg=${getComputedStyle(e).color}`).filter((x) => x.includes('SELECTED')),
    segOn: [...document.querySelectorAll(".fd-seg button[aria-checked='true']")].map((e) => `${e.textContent.trim()} bg=${getComputedStyle(e).backgroundColor} fg=${getComputedStyle(e).color}`),
    togglesOn: [...document.querySelectorAll(".fd-toggle[aria-checked='true']")].map((e) => getComputedStyle(e).backgroundColor),
    togglesOff: [...document.querySelectorAll(".fd-toggle[aria-checked='false']")].map((e) => getComputedStyle(e).backgroundColor),
    sliderFills: [...document.querySelectorAll('.fd-slider b')].map((e) => getComputedStyle(e).backgroundColor),
  }));
  const more = after ? await after(p) : '';
  return 'controls: ' + JSON.stringify(info) + (more ? '\n  ' + more : '');
};
const fight = async (p) => {
  await p.waitForSelector('[data-testid="fd-hud"]', { timeout: 90000 });
  await p.waitForFunction(() => window.__mc?.state()?.phase === 'fight', null, { timeout: 30000 });
};
// The HUD frame of ../impl/capture.mjs: a Force Push (Q) 0.5 s before the shot so one chip is cooling next to a ready one, plus
// the cooling chip's text contrast measured from the pixels of the frame.
const hud = async (p) => {
  await fight(p);
  await p.keyboard.down('KeyD'); await p.waitForTimeout(1200); await p.keyboard.up('KeyD');
  for (let i = 0; i < 20; i++) { await p.mouse.click(900, 400); await p.waitForTimeout(250); }
  await p.waitForTimeout(1000);
  await p.waitForFunction(() => !document.querySelector('[data-testid="ko-tag-l"]') && !document.querySelector('[data-testid="respawn-card"]'), null, { timeout: 15000 }).catch(() => {});
  for (let i = 0; i < 6; i++) {
    await p.keyboard.press('KeyQ');
    if (await p.waitForSelector('[data-testid="push-l"][data-ready="false"]', { timeout: 400 }).then(() => true, () => false)) break;
  }
  await p.waitForTimeout(500);
  const chips = await p.evaluate(() => ['dash-l', 'push-l', 'dash-r', 'push-r'].map((t) => { const e = document.querySelector(`[data-testid="${t}"]`); return e ? `${t} ready=${e.dataset.ready} bg=${getComputedStyle(e).backgroundColor} fg=${getComputedStyle(e).color} border=${getComputedStyle(e).borderTopColor}` : `${t} -`; }));
  let measured = 'cooling chip not found';
  const cool = await p.$('[data-testid="push-l"][data-ready="false"]');
  if (cool) {
    const s = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.fd')).getPropertyValue('--s')) || 1);
    const png = await cool.screenshot();
    measured = JSON.stringify(await withImage(png, CONTRAST, { inset: Math.ceil(5 * s) }));
  }
  return 'chips: ' + JSON.stringify(chips) + '\n  cooling chip text from pixels: ' + measured;
};
const twoP = '/#/arena?mode=2p&p1=standup&p2=hotfix&arena=offsite&n=5';
const tags = () => [...document.querySelectorAll('.fd-ptag, .fd-tp-tag, .fd-rtick, [data-testid^="player-chip-"], [data-testid^="ready-"]')].map((e) => `${(e.textContent || '').trim()} bg=${getComputedStyle(e).backgroundColor} fg=${getComputedStyle(e).color} border=${getComputedStyle(e).borderTopWidth} ${getComputedStyle(e).borderTopColor}`);
const resultWait = async (p) => { await p.waitForTimeout(3500); return 'tags: ' + JSON.stringify(await p.evaluate(tags)); };
const medal = async (p) => {
  await p.waitForTimeout(3500);
  return 'medals: ' + JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.fd-res-disc')].map((d) => { const i = d.querySelector('svg'); const r = i.getBoundingClientRect(), b = d.getBoundingClientRect(); return `${i.getAttribute('viewBox')} ${Math.round(r.width)}x${Math.round(r.height)} centre offset ${Math.round(r.left + r.width / 2 - b.left - b.width / 2)},${Math.round(r.top + r.height / 2 - b.top - b.height / 2)} disc ${Math.round(b.width)}`; })));
};

// 1280x720
await shot('home', '/#/', async (p) => 'pennants: ' + JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('[data-testid="arena-ribbon"] svg.fd-ic')].map((s) => `${Math.round(s.getBoundingClientRect().width)}x${Math.round(s.getBoundingClientRect().height)}`))));
await shot('select', '/#/characters', async (p) => { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900); });
await shot('select-2p', '/#/?2p', async (p) => { await p.keyboard.press('KeyF'); await p.waitForTimeout(900); return 'tags: ' + JSON.stringify(await p.evaluate(tags)); });
await shot('settings-controls', '/#/', tab('controls'));
await shot('settings-camera', '/#/', tab('camera'));
await shot('settings-graphics', '/#/', tab('graphics'));
await shot('settings-audio', '/#/', tab('audio'));
await shot('settings-access', '/#/', tab('access'));
await shot('settings-2p-keys', '/#/', tab('controls', async (p) => { await p.click('[data-testid="edit-2p"]'); await p.waitForTimeout(600); await rest(p); return 'tags: ' + JSON.stringify(await p.evaluate(tags)); }));
await shot('settings-reset-confirm', '/#/', tab('access', async (p) => {
  await p.click('[data-testid="reset-all"]'); await p.waitForTimeout(500); await rest(p);
  return 'reset label: ' + JSON.stringify(await p.evaluate(() => {
    const b = document.querySelector('[data-testid="reset-all"]'); const s = parseFloat(getComputedStyle(document.querySelector('.fd')).getPropertyValue('--s')) || 1;
    const bw = parseFloat(getComputedStyle(b).borderLeftWidth) * s; const r = b.getBoundingClientRect(); const t = b.querySelector('.fd-label').getBoundingClientRect();
    const rg = document.createRange(); rg.selectNodeContents(b.querySelector('.fd-label')); const tr = rg.getBoundingClientRect();
    return { text: b.textContent.trim(), button: Math.round(r.width / s), clearLeft: Math.round((tr.left - r.left - bw) / s * 10) / 10, clearRight: Math.round((r.right - bw - tr.right) / s * 10) / 10, labelBox: Math.round(t.width / s) };
  }));
}));
await shot('credits', '/#/', async (p) => { await p.click('[data-testid="credits-link"]'); await p.waitForTimeout(900); return 'pennant: ' + JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('[data-testid="credits"] .fd-ribbon svg.fd-ic')].map((s) => `${Math.round(s.getBoundingClientRect().width)}x${Math.round(s.getBoundingClientRect().height)}`))); });
await shot('keycard-2p', twoP, async (p) => { await p.waitForSelector('[data-testid="key-card"]', { timeout: 90000 }); await p.waitForTimeout(1200); return 'tags: ' + JSON.stringify(await p.evaluate(tags)); }, { wait: 1000 });
await shot('hud-2p', twoP, async (p) => {
  await p.waitForSelector('[data-testid="key-card"]', { timeout: 90000 }); await p.waitForTimeout(800);
  await p.keyboard.down('KeyF'); await p.keyboard.down('Semicolon'); await p.waitForTimeout(150); await p.keyboard.up('KeyF'); await p.keyboard.up('Semicolon');
  await p.waitForSelector('[data-testid="key-card"]', { state: 'detached', timeout: 10000 });
  await fight(p); await p.waitForTimeout(1500);
  return 'tags: ' + JSON.stringify(await p.evaluate(tags)) + '\n  strips: ' + JSON.stringify(await p.evaluate(() => ['strip-p1', 'strip-p2'].map((t) => `${t} opacity=${getComputedStyle(document.querySelector(`[data-testid="${t}"]`)).opacity}`)));
}, { wait: 1000, scope: '[data-testid="fd-hud"]' });
await shot('hud-offsite', '/#/arena?p1=standup&p2=hotfix&bot=normal&arena=offsite', hud, { wait: 1000, scope: '[data-testid="fd-hud"]', grey: true });
await shot('result', '/zz_result.html?case=win', resultWait, { wait: 1500, result: true });
await shot('result-sharpshooter', '/zz_result.html?case=win-sharp', medal, { wait: 1500, result: true });
await shot('result-2p', '/zz_result.html?case=2p', resultWait, { wait: 1500, result: true });
// 1920x1080
await shot('home-1920', '/#/', undefined, { w: 1920, h: 1080 });
await shot('select-1920', '/#/characters', async (p) => { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900); }, { w: 1920, h: 1080 });
await shot('hud-offsite-1920', '/#/arena?p1=standup&p2=hotfix&bot=normal&arena=offsite', hud, { wait: 1000, scope: '[data-testid="fd-hud"]', w: 1920, h: 1080 });
await shot('result-1920', '/zz_result.html?case=win-sharp', medal, { wait: 1500, result: true, w: 1920, h: 1080 });

fs.writeFileSync(OUT + (ONLY ? 'layout-check-partial.txt' : 'layout-check.txt'), report.join('\n') + '\n');
await browser.close();
