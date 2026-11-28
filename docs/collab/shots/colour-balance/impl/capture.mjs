// R-027 / F-056 implementation captures: the REAL build after the colour-balance pass (no injected CSS), 1280x720 @1x,
// Chromium 1255 ANGLE Metal (same setup as ../capture.mjs), plus the layout check from traits-menus/capture.mjs and a
// DASH/PUSH ready-flash probe. Needs `npx vite --config vite.portal.config.ts --port 3251` in floor-42 (portal-build).
// Usage: node capture.mjs            (A=http://localhost:3251)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const OUT = new URL('.', import.meta.url).pathname;
const A = process.env.A || 'http://localhost:3251';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
// Layout check: copied from traits-menus/capture.mjs (safe area, overflow / tight, clipped text, partial overlap).
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
// The result screen: the scoped check from fieldday-p2b/check.mjs (copied so this script stands alone).
// The layout check (safe area, text inside controls, clipped text, partial overlaps), scoped to the result screen. Runs in the page.
const checkResult = () => {
  const out = [];
  const W = innerWidth, H = innerHeight;
  const s = parseFloat(getComputedStyle(document.querySelector('[data-testid="result-screen"] .fd')).getPropertyValue('--s')) || 1;
  const safe = 12 * s;
  const name = (e) => `${e.getAttribute('data-testid') || e.className.toString().slice(0, 24)} "${(e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`;
  const UI = [...document.querySelectorAll('[data-testid="result-screen"] :is(.fd-btn,.fd-card,.fd-panel,.fd-pill,.fd-hints,.fd-ribbon,.fd-chip,h2,.fd-res-pod)')].filter((e) => getComputedStyle(e).visibility !== 'hidden' && !e.closest('[inert]') && !e.closest('.fd-sr'));
  // 1 safe area (a focused element counts with its 12 px ring)
  for (const e of UI) {
    const r = e.getBoundingClientRect();
    if (!r.width) continue;
    if (e.classList.contains('fd-res-pod')) continue; // podiums stand in the track and run to the screen bottom on purpose
    const ring = e === document.activeElement ? 12 * s : 0;
    if (r.left - ring < safe - 1 || r.top - ring < safe - 1 || r.right + ring > W - safe + 1 || r.bottom + ring > H - safe + 1) {
      if (e.closest('.fd-card') && e.closest('.fd-card') !== e) continue;
      out.push('SAFE-AREA ' + name(e) + ` [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
  }
  // 2 text and icons inside their control, with clear space in buttons
  for (const e of document.querySelectorAll('[data-testid="result-screen"] :is(.fd-btn,.fd-chip,.fd-kc,.fd-pill,.fd-hints,.fd-ribbon)')) {
    const b = e.getBoundingClientRect(), bw = (parseFloat(getComputedStyle(e).borderLeftWidth) || 0) * s;
    if (!b.width) continue;
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
  // 3 text clipped by an overflow:hidden ancestor
  const tw = document.createTreeWalker(document.querySelector('[data-testid="result-screen"] .fd-stage'), NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode());) {
    if (!n.textContent.trim()) continue;
    const r = document.createRange(); r.selectNodeContents(n); const t = r.getBoundingClientRect();
    for (let a = n.parentElement; a && !a.classList.contains('fd-stage'); a = a.parentElement) {
      if (getComputedStyle(a).overflow === 'hidden' && !a.classList.contains('fd-confetti') && !a.classList.contains('fd-sr') && getComputedStyle(a).visibility !== 'hidden') {
        const b = a.getBoundingClientRect();
        if (t.width && (t.left < b.left - 1 || t.right > b.right + 1 || t.top < b.top - 1 || t.bottom > b.bottom + 1)) out.push('CLIPPED "' + n.textContent.trim().slice(0, 24) + '" by ' + name(a));
      }
    }
  }
  // 4 partial overlap between unrelated UI boxes (full containment is intended: buttons on a panel, chips on a card)
  const boxes = UI.filter((e) => e.getBoundingClientRect().width && !e.classList.contains('fd-res-pod'));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.contains(b) || b.contains(a)) continue;
    if (a.closest('.fd-res-stats') || b.closest('.fd-res-stats')) continue; // the held stats card is an overlay on purpose
    const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
    const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left), oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
    if (ox > 3 * s && oy > 3 * s) out.push('OVERLAP ' + name(a) + ' x ' + name(b));
  }
  return out;
};
// In-match and modal screens: the scoped check from fieldday-p2a/capture.mjs (only the screen root; ribbons over the panel edge
// and full containment are intended).
const checkScoped = (scope) => {
  const out = [];
  const W = innerWidth, H = innerHeight;
  const root = document.querySelector(scope);
  if (!root) return ['NO-ROOT ' + scope];
  const fd = root.matches('.fd') ? root : root.querySelector('.fd') || root.closest('.fd');
  const s = parseFloat(getComputedStyle(fd).getPropertyValue('--s')) || 1;
  const safe = 12 * s;
  const name = (e) => `${e.getAttribute('data-testid') || e.className.toString().slice(0, 24)} "${(e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`;
  const UI = [...root.querySelectorAll('.fd-btn,.fd-card,.fd-panel,.fd-pill,.fd-hints,.fd-ribbon,.fd-chip,.fd-setcard,.fd-well,.fd-timer,.fd-tile,.fd-kfeed,.fd-segbar,h2')];
  // 1 safe area (a focused element counts with its 12 px ring); the VS doors are full-bleed by design
  if (!root.matches('[data-testid="vs-stage"]')) for (const e of UI) {
    const r = e.getBoundingClientRect();
    if (!r.width) continue;
    const ring = e === document.activeElement ? 12 * s : 0;
    if (r.left - ring < safe - 1 || r.top - ring < safe - 1 || r.right + ring > W - safe + 1 || r.bottom + ring > H - safe + 1) {
      if (e.closest('.fd-card') && e.closest('.fd-card') !== e) continue;
      if (e.closest('.fd-ribbon') && e.closest('.fd-ribbon') !== e) continue;
      out.push('SAFE-AREA ' + name(e) + ` [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
  }
  // 2 text and icons inside their control, with clear space in buttons
  for (const e of root.querySelectorAll('.fd-btn,.fd-chip,.fd-kc,.fd-pill,.fd-hints,.fd-ribbon,.fd-kfeed')) {
    const b = e.getBoundingClientRect(), bw = (parseFloat(getComputedStyle(e).borderLeftWidth) || 0) * s;
    if (!b.width) continue;
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
  // 3 text clipped by an overflow:hidden ancestor
  const stage = root.querySelector('.fd-stage') || root.closest('.fd-stage');
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode());) {
    if (!n.textContent.trim()) continue;
    const r = document.createRange(); r.selectNodeContents(n); const t = r.getBoundingClientRect();
    if (!t.width) continue;
    for (let a = n.parentElement; a && a !== stage; a = a.parentElement) {
      const o = getComputedStyle(a).overflow;
      if ((o === 'hidden' || o === 'clip') && !a.classList.contains('fd-confetti') && !a.classList.contains('fd-viewport')) {
        const b = a.getBoundingClientRect();
        if (t.left < b.left - 1 || t.right > b.right + 1 || t.top < b.top - 1 || t.bottom > b.bottom + 1) out.push('CLIPPED "' + n.textContent.trim().slice(0, 24) + '" by ' + name(a));
      }
    }
  }
  // 4 partial overlap between unrelated UI boxes (full containment is intended: buttons on a panel, chips on a card)
  const boxes = UI.filter((e) => e.getBoundingClientRect().width && getComputedStyle(e).opacity !== '0' && getComputedStyle(e).visibility !== 'hidden');
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.contains(b) || b.contains(a)) continue;
    // intended: the ribbon over the panel edge, tiles under the timer disc, the score chip under the disc, KO tag on the portrait
    if (a.closest('.fd-ribbon') || b.closest('.fd-ribbon')) continue;
    if (a.matches('.fd-timer,.fd-tile') && b.matches('.fd-timer,.fd-tile')) continue;
    const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
    const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left), oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
    const inside = (X, Y) => X.left >= Y.left - 2 && X.right <= Y.right + 2 && X.top >= Y.top - 2 && X.bottom <= Y.bottom + 2;
    if (inside(A, B) || inside(B, A)) continue; // full containment (a button on a panel, a card in a well) is intended
    if (ox > 3 * s && oy > 3 * s) out.push('OVERLAP ' + name(a) + ' x ' + name(b));
  }
  // 5 focus: something inside the screen has focus, and the double ring is drawn (data-kbd = 1) on a keyboard-reachable control
  if (root.matches('[data-testid="settings-panel"],[data-testid="pause-menu"],[data-testid="howto"],[data-testid="credits"]')) {
    const f = document.activeElement;
    if (!f || !root.contains(f)) out.push('FOCUS not inside the screen');
  }
  return out;
};
// Criterion 2: count sun-tone buttons that are visible.
const suns = () => [...document.querySelectorAll('.fd-btn.fd-t-sun')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && getComputedStyle(e).visibility !== 'hidden'; }).map((e) => (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20));
const report = [];
const shot = async (id, route, act = async () => {}, { wait = 3000, settings = {}, w = 1280, h = 720, layout = true, scope = null, result = false } = {}) => {
  if (ONLY && !ONLY.includes(id)) return;
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.addInitScript((extra) => {
    localStorage.setItem('floor42:settings', JSON.stringify({ quality: 'high', arena: 'offsite', showKeyHints: true, ...extra }));
    localStorage.setItem('floor-42:finished-match', '1');
  }, settings);
  await page.goto(A + route);
  await page.waitForTimeout(wait);
  const extra = (await act(page)) || '';
  if (layout) await page.screenshot({ path: `${OUT}${id}.png` }); // the flash probes only log
  let line = `${id} @${w}x${h}:`;
  if (layout) {
    const issues = [...new Set(result ? await page.evaluate(checkResult) : scope ? await page.evaluate(checkScoped, scope) : await page.evaluate(check))];
    line += ` [${result ? 'p2b result check' : scope ? 'p2a check, scope ' + scope : 'traits-menus check'}] ${issues.length ? issues.length + ' issue(s)\n  ' + issues.join('\n  ') : '0 issues'}`;
  }
  line += `\n  sun buttons: ${JSON.stringify(await page.evaluate(suns))}${extra ? '\n  ' + extra : ''}`;
  report.push(line);
  console.log(line);
  await ctx.close();
};
const press = (...k) => async (p) => { for (const x of k) { await p.keyboard.press(x); await p.waitForTimeout(250); } await p.waitForTimeout(700); };
const click = (tid, after) => async (p) => { await p.click(`[data-testid="${tid}"]`); await p.waitForTimeout(900); if (after) return after(p); };
const fight = async (p) => {
  await p.waitForSelector('[data-testid="fd-hud"]', { timeout: 90000 });
  await p.waitForFunction(() => window.__mc?.state()?.phase === 'fight', null, { timeout: 30000 });
};
// The HUD frame of ../capture.mjs, plus a Force Push (Q) 0.5 s before the shot so one chip is cooling next to a ready one.
const hud = async (p) => {
  await fight(p);
  await p.keyboard.down('KeyD'); await p.waitForTimeout(1200); await p.keyboard.up('KeyD');
  for (let i = 0; i < 20; i++) { await p.mouse.click(900, 400); await p.waitForTimeout(250); }
  await p.waitForTimeout(1000);
  // Not mid-respawn (a KO'd plate shows every chip ready): wait for the player to be back in.
  await p.waitForFunction(() => !document.querySelector('[data-testid="ko-tag-l"]') && !document.querySelector('[data-testid="respawn-card"]'), null, { timeout: 15000 }).catch(() => {});
  // Force Push until the player's PUSH chip is cooling (the push can be refused for a frame while stunned), then let 0.5 s pass.
  for (let i = 0; i < 6; i++) {
    await p.keyboard.press('KeyQ');
    if (await p.waitForSelector('[data-testid="push-l"][data-ready="false"]', { timeout: 400 }).then(() => true, () => false)) break;
  }
  await p.waitForTimeout(500);
  return 'chips: ' + JSON.stringify(await p.evaluate(() => ['dash-l', 'push-l', 'dash-r', 'push-r'].map((t) => { const e = document.querySelector(`[data-testid="${t}"]`); return e ? `${t} ready=${e.dataset.ready} bg=${getComputedStyle(e).backgroundColor}` : `${t} -`; })));
};
// Ready-flash probe: fire Q, watch push-l go data-ready false -> true and sample its fill for 400 ms.
const flashProbe = async (p) => {
  await fight(p);
  await p.waitForTimeout(800);
  await p.keyboard.press('KeyQ');
  return 'flash: ' + JSON.stringify(await p.evaluate(() => new Promise((res) => {
    const el = () => document.querySelector('[data-testid="push-l"]');
    const t0 = performance.now();
    let cooled = false;
    const wait = () => {
      if (el()?.dataset.ready === 'false') cooled = true;
      if (cooled && el()?.dataset.ready === 'true') {
        const start = performance.now(); const samples = [];
        const anims = el().getAnimations().length;
        const tick = () => { const t = performance.now() - start; samples.push(`${Math.round(t)}ms ${getComputedStyle(el()).backgroundColor}`); if (t < 400) requestAnimationFrame(tick); else res({ readyAfterMs: Math.round(start - t0), animations: anims, samples: samples.filter((_, i) => i % 3 === 0) }); };
        tick();
      } else if (performance.now() - t0 > 15000) res('push never became ready'); else requestAnimationFrame(wait);
    };
    wait();
  })));
};
const ARENA = (a) => `/#/arena?p1=standup&p2=hotfix&bot=normal&arena=${a}`;
await shot('home', '/#/');
await shot('select', '/#/characters', press('ArrowRight'));
await shot('select-2p', '/#/?2p', press('KeyF'));
await shot('hud-offsite', ARENA('offsite'), hud, { wait: 1000, scope: '[data-testid="fd-hud"]' });
await shot('hud-office', ARENA('office'), hud, { wait: 1000, scope: '[data-testid="fd-hud"]' });
await shot('result', '/zz_result.html?case=win', async (p) => { await p.waitForTimeout(3500); }, { wait: 1500, result: true });
await shot('result-loss', '/zz_result.html?case=loss', async (p) => { await p.waitForTimeout(3500); }, { wait: 1500, result: true });
await shot('result-2p', '/zz_result.html?case=2p', async (p) => { await p.waitForTimeout(3500); }, { wait: 1500, result: true });
await shot('result-online-rematch', '/zz_result.html?case=online-rematch', async (p) => { await p.waitForTimeout(3500); }, { wait: 1500, result: true });
await shot('pause', ARENA('offsite'), async (p) => { await fight(p); await p.waitForTimeout(1500); await p.keyboard.press('Escape'); await p.waitForTimeout(900); }, { wait: 1000, scope: '[data-testid="pause-menu"]' });
await shot('settings', '/#/', click('open-settings'));
await shot('settings-reset-confirm', '/#/', click('open-settings', async (p) => { await p.focus('[data-testid="tab-controls"]'); for (let i = 0; i < 4; i++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150); } await p.waitForTimeout(400); await p.click('[data-testid="reset-all"]'); await p.waitForTimeout(400); }));
await shot('howto', '/#/', click('open-howto'));
await shot('credits', '/#/', async (p) => { await p.click('[data-testid="credits-link"]'); await p.waitForTimeout(900); });
await shot('flash-probe', ARENA('offsite'), flashProbe, { wait: 1000, layout: false });
await shot('flash-probe-reduced', ARENA('offsite'), flashProbe, { wait: 1000, layout: false, settings: { reducedMotion: true } });
fs.writeFileSync(OUT + (ONLY ? 'layout-check-partial.txt' : 'layout-check.txt'), report.join('\n') + '\n');
await browser.close();
