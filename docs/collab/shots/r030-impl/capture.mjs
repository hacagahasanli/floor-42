// R-030 implementation captures (F-070 key card, F-071 2P result lock, F-072 HUD pills). Chromium 1255, ANGLE Metal (real GPU),
// the QA lib (CrazyGames SDK stub + probes). Two servers:
//   BUILT = the built portal (dist/portal, e.g. python3 -m http.server 8731)  -> key card, pills
//   DEV   = the portal dev server (npx vite --config vite.portal.config.ts --port 3261) -> the 2P result (needs window.__mc to set
//           up a match point, the production build has no debug handle)
// Usage: BUILT=http://127.0.0.1:8731 DEV=http://localhost:3261 node capture.mjs
import fs from 'node:fs';

import { checkScoped, issuesOf } from '../colour-balance/layout-check.mjs';
import { launch, open } from '../../../release-qa/2026-11-28-crazygames-evidence/scripts/lib.mjs';

const OUT = new URL('.', import.meta.url).pathname;
const BUILT = process.env.BUILT || 'http://127.0.0.1:8731';
const DEV = process.env.DEV || 'http://localhost:3261';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const browser = await launch();
const res = { errors: {} };
const TWO_P = '#/arena?mode=2p&p1=standup&p2=hotfix&arena=offsite&n=3';

const ctxAt = async (base, w, h) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route('https://sdk.crazygames.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.CrazyGames=undefined' }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  return { ctx, page, errs, base };
};
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png` });
const cardCheck = (page) => page.evaluate(`(${checkScoped.toString()})('[data-testid="key-card"]')`);
const cardInfo = (page) =>
  page.evaluate(() => {
    const r = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); };
    const s = parseFloat(getComputedStyle(document.querySelector('[data-testid="key-card"] .fd')).getPropertyValue('--s'));
    return {
      s,
      title: document.querySelector('[data-testid="key-card"] .fd-titan')?.textContent,
      halves: [...document.querySelectorAll('[data-testid^="key-half-"]')].map((e) => ({ id: e.dataset.testid, box: r(e) })),
      ready: [...document.querySelectorAll('[data-testid^="ready-"][data-ready]')].map((e) => `${e.dataset.testid}=${e.dataset.ready} "${e.textContent.trim()}"`),
      lit: [...document.querySelectorAll('[data-testid="key-card"] .fd-kc2[data-lit]')].map((e) => e.textContent.trim()),
      outside: [...document.querySelectorAll('[data-testid="key-card"] *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.left < 0 || b.top < 0 || b.right > innerWidth || b.bottom > innerHeight); }).length,
    };
  });
const want = (id) => !ONLY || ONLY.includes(id);

// ---------- F-070 key card (built) ----------
const openCard = async (w, h) => {
  const c = await ctxAt(BUILT, w, h);
  await c.page.goto(`${BUILT}/index.html${TWO_P}`);
  await c.page.waitForSelector('[data-testid="key-card"]', { timeout: 90000 });
  // The VS doors play over the card first: wait until they are gone.
  await c.page.waitForFunction(() => !document.querySelector('[data-testid="vs-doors"], .vs-doors'), null, { timeout: 15000 }).catch(() => {});
  await c.page.waitForTimeout(3500);
  return c;
};
if (want('card')) {
  for (const [w, h] of [[1280, 720], [821, 462], [800, 450]]) {
    const c = await openCard(w, h);
    const tag = `keycard-start-none-${w}x${h}`;
    await shot(c.page, tag);
    res[tag] = { info: await cardInfo(c.page), issues: issuesOf(await cardCheck(c.page)) };
    if (w === 1280) {
      // One ready + a key held: P1 presses F (ready) and keeps it down (lit), the mockup state.
      await c.page.keyboard.down('KeyF');
      await c.page.waitForTimeout(500);
      await shot(c.page, 'keycard-start-p1ready-held-1280x720');
      res['keycard-start-p1ready-held-1280x720'] = { info: await cardInfo(c.page), issues: issuesOf(await cardCheck(c.page)) };
      await c.page.keyboard.up('KeyF');
      // Both ready: the match must not start before the 250 ms hold.
      const t0 = Date.now();
      await c.page.keyboard.press('Semicolon');
      await c.page.waitForTimeout(120);
      const at120 = await c.page.locator('[data-testid="key-card"]').count();
      await c.page.waitForSelector('[data-testid="key-card"]', { state: 'detached', timeout: 3000 });
      res.bothReadyHold = { cardStillUpAt120ms: at120 === 1, closedAfterMs: Date.now() - t0 };
      // View mode: Pause > Controls.
      await c.page.waitForTimeout(1500);
      await c.page.keyboard.press('Escape');
      await c.page.waitForSelector('[data-testid="pause-controls"]', { timeout: 5000 });
      await c.page.click('[data-testid="pause-controls"]');
      await c.page.waitForSelector('[data-testid="key-card"][data-mode="view"]', { timeout: 5000 });
      await c.page.waitForTimeout(600);
      await shot(c.page, 'keycard-view-1280x720');
      res['keycard-view-1280x720'] = { info: await cardInfo(c.page), issues: issuesOf(await cardCheck(c.page)) };
      await c.page.keyboard.press('Escape');
      await c.page.waitForTimeout(400);
      res.viewEscCloses = (await c.page.locator('[data-testid="key-card"]').count()) === 0;
    }
    res.errors[tag] = c.errs;
    await c.ctx.close();
  }
  // Pad half: one pad connected -> P2 is the pad player (padPlayers(1) = [1]).
  const { ctx, page, frame, log } = await open(browser, { w: 1280, h: 720, mode: 'top', query: TWO_P });
  await frame().waitForSelector('[data-testid="key-card"]', { timeout: 90000 });
  await page.evaluate(() => window.__padOn());
  await page.waitForTimeout(800);
  await shot(page, 'keycard-pad-1280x720');
  res['keycard-pad-1280x720'] = { info: await cardInfo(page), issues: issuesOf(await cardCheck(page)) };
  await page.evaluate(() => window.__padSet(2, true));
  await page.waitForTimeout(400);
  await shot(page, 'keycard-pad-x-held-1280x720');
  res['keycard-pad-x-held-1280x720'] = { info: await cardInfo(page) };
  res.errors.pad = log.pageerrors.map((e) => e.msg);
  await ctx.close();
}

// ---------- F-072 pills (built, 1P first match, key strip up) ----------
if (want('pills')) {
  for (const [w, h] of [[907, 510], [821, 462], [800, 450], [1280, 720]]) {
    const { ctx, page, frame, log } = await open(browser, { w, h, mode: 'top' });
    const f = frame();
    await f.waitForSelector('[data-testid="home"]', { timeout: 30000 });
    await page.waitForTimeout(800);
    await f.click('[data-testid="play"]', { force: true });
    await f.waitForFunction(() => (window.__sdk || []).some((x) => x[0] === 'gameplayStart'), null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    const m = await f.evaluate(() => {
      const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); };
      const c = document.querySelector('[data-testid="corner-pills"]');
      const strip = document.querySelector('[data-testid="key-strip"]:not([aria-hidden="true"])');
      const hint = document.querySelector('[data-testid="hud-hint"]');
      const kids = [...c.children].map(r);
      const clash = (a, b, g = 0) => a && b && a[0] < b[2] + g && b[0] < a[2] + g && a[1] < b[3] + g && b[1] < a[3] + g;
      return {
        layout: c.dataset.layout, hidden: c.dataset.hidden ?? null, visibility: getComputedStyle(c).visibility,
        strip: r(strip), hint: r(hint), pills: r(c), kids, texts: [...c.children].map((k) => k.textContent.trim()),
        overlaps: kids.filter((k) => clash(k, r(strip)) || clash(k, r(hint))).length,
        gapToStrip: strip ? r(c)[0] - r(strip)[2] : null,
      };
    });
    const tag = `pills-${w}x${h}`;
    await page.screenshot({ path: `${OUT}${tag}.png` });
    res[tag] = m;
    res.errors[tag] = log.pageerrors.map((e) => e.msg);
    await ctx.close();
  }
}

// ---------- F-072 back to a row after 2 KOs + F-071 2P result (dev server, window.__mc) ----------
if (want('dev')) {
  // Pills after 2 KOs at 821x462 (strip gone): the dev handle sets the KO count, the HUD hides the strip.
  {
    const c = await ctxAt(DEV, 821, 462);
    await c.page.goto(`${DEV}/index.html#/`);
    await c.page.waitForSelector('[data-testid="home"]', { timeout: 60000 });
    await c.page.waitForTimeout(800);
    await c.page.click('[data-testid="play"]', { force: true });
    await c.page.waitForFunction(() => window.__mc?.state()?.phase === 'fight', null, { timeout: 60000 });
    await c.page.waitForTimeout(1200);
    const before = await c.page.evaluate(() => document.querySelector('[data-testid="corner-pills"]').dataset.layout);
    await c.page.evaluate(() => { const s = window.__mc.state(); s.fighters[0].kos = 1; s.fighters[1].kos = 1; });
    await c.page.waitForTimeout(1200);
    const after = await c.page.evaluate(() => ({ layout: document.querySelector('[data-testid="corner-pills"]').dataset.layout, strip: document.querySelector('[data-testid="key-strip"]')?.getAttribute('aria-hidden') }));
    await shot(c.page, 'pills-821x462-after-2kos');
    res.pillsAfter2Kos = { before, after };
    res.errors.pillsAfter2Kos = c.errs;
    await c.ctx.close();
  }
  // 2P result with Shoot mashed through the final KO by both players.
  {
    const c = await ctxAt(DEV, 1280, 720);
    const p = c.page;
    await p.goto(`${DEV}/index.html${TWO_P}`);
    await p.waitForSelector('[data-testid="key-card"]', { timeout: 90000 });
    await p.waitForTimeout(600);
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => window.__mc?.state()?.phase === 'fight', null, { timeout: 60000 });
    await p.waitForTimeout(800);
    let mashing = true;
    const mashLoop = (async () => {
      let i = 0;
      while (mashing) {
        await p.keyboard.down(i % 2 ? 'Semicolon' : 'KeyF').catch(() => {});
        await p.waitForTimeout(35);
        await p.keyboard.up(i % 2 ? 'Semicolon' : 'KeyF').catch(() => {});
        i++;
        await p.waitForTimeout(15);
      }
    })();
    // In-page clock: when the result screen mounts (the cut) and when it goes (the rematch fired).
    await p.evaluate(() => {
      window.__res = {};
      new MutationObserver(() => {
        const on = !!document.querySelector('[data-testid="result-screen"]');
        if (on && window.__res.up === undefined) window.__res.up = performance.now();
        if (!on && window.__res.up !== undefined && window.__res.down === undefined) window.__res.down = performance.now();
      }).observe(document.body, { childList: true, subtree: true });
    });
    // Match point for P1, P2 on 1 hp right in front of P1's gun: the next hit is the final KO.
    let tCut = null;
    for (let tries = 0; tries < 60 && tCut === null; tries++) {
      await p.evaluate(() => {
        const s = window.__mc.state();
        if (s.phase !== 'fight') return;
        const [a, b] = s.fighters;
        a.kos = (s.kosToWin ?? 3) - 1;
        if (b.respawn > 0) return;
        b.hp = 1; b.invulnerable = 0; b.x = a.x + 1.6 * a.facing; b.y = a.y; b.vx = 0; b.vy = 0;
      });
      const up = await p.waitForSelector('[data-testid="result-screen"]', { timeout: 500 }).then(() => true, () => false);
      if (up) tCut = Date.now();
    }
    const gs = () => p.evaluate(() => window.__mc.state().phase);
    res.result2p = { cut: tCut !== null };
    if (tCut !== null) {
      const at = async (ms, name) => {
        // Timed on the page's clock from the result screen's mount (the cut), not from when the script noticed it.
        await p.waitForFunction((ms) => performance.now() - window.__res.up >= ms, ms, { polling: 'raf', timeout: 10000 });
        const t0 = await p.evaluate(() => Math.round(performance.now() - window.__res.up));
        await shot(p, name);
        const t1 = await p.evaluate(() => Math.round(performance.now() - window.__res.up));
        return {
          shotBetweenMs: [t0, t1],
          resultUp: (await p.locator('[data-testid="result-screen"]').count()) === 1,
          phase: await gs(),
          step: await p.evaluate(() => document.querySelector('[data-step]')?.getAttribute('data-step')),
          medals: await p.evaluate(() => [...document.querySelectorAll('.fd-res-disc')].filter((d) => { const b = d.getBoundingClientRect(); return b.width > 0 && +getComputedStyle(d).opacity > 0.5; }).length),
        };
      };
      res.result2p.at0900 = await at(900, 'result-2p-0.9s-mashed');
      res.result2p.at2150 = await at(2150, 'result-2p-2.17s-mashed');
      res.result2p.at2300 = await at(2300, 'result-2p-2.3s-mashed');
      // When did the rematch fire (the result screen goes)?
      const gone = await p.waitForSelector('[data-testid="result-screen"]', { state: 'detached', timeout: 6000 }).then(() => Date.now() - tCut, () => null);
      res.result2p.rematchFiredAtMs = gone;
      res.result2p.inPage = await p.evaluate(() => ({ rematchAfterCutMs: window.__res.down !== undefined ? Math.round(window.__res.down - window.__res.up) : null }));
    }
    mashing = false;
    await mashLoop;
    res.errors.result2p = c.errs;
    await c.ctx.close();
  }
}

// ---------- F-074 / F-075 result screens (dev server, zz_result harness with forced scores) ----------
if (want('results')) {
  for (const [kase, sizes] of [['w53', [[1280, 720], [907, 510]]], ['l15', [[1280, 720], [907, 510]]], ['l45', [[1280, 720], [907, 510]]], ['2p54', [[1280, 720], [907, 510]]]]) {
    for (const [w, h] of sizes) {
      const c = await ctxAt(DEV, w, h);
      await c.page.goto(`${DEV}/zz_result.html?case=${kase}`);
      await c.page.waitForSelector('[data-testid="result-screen"]', { timeout: 60000, state: 'attached' });
      await c.page.waitForTimeout(3800);
      const tag = `result-${kase}-${w}x${h}`;
      await shot(c.page, tag);
      res[tag] = await c.page.evaluate(() => {
        const s = parseFloat(getComputedStyle(document.querySelector('.fd')).getPropertyValue('--s')) || 1;
        const pill = document.querySelector('[data-testid="result-pill"]');
        const lh = parseFloat(getComputedStyle(pill).lineHeight) || 0;
        const range = document.createRange();
        range.selectNodeContents(pill);
        const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
        return {
          title: document.querySelector('.fd-res-root h1, .fd-res-title, [data-testid="result-title"]')?.textContent?.trim() ?? null,
          pill: pill.textContent.trim(),
          pillLines: lines,
          pillBox: (() => { const b = pill.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); })(),
          pillLineHeight: lh,
          awards: [...document.querySelectorAll('.fd-res-label')].map((l) => {
            const b = l.querySelector('b');
            const card = l.getBoundingClientRect().width / s;
            return { title: b?.textContent, line: l.textContent.replace(b?.textContent ?? '', '').trim(), cardW: Math.round(card), titleW: Math.round(b.getBoundingClientRect().width / s), titleOverflow: b.scrollWidth > b.clientWidth + 1 };
          }),
          sr: document.querySelector('[data-testid="result-sr"]')?.textContent,
        };
      });
      res.errors[tag] = c.errs;
      await c.ctx.close();
    }
  }
}

fs.writeFileSync(`${OUT}capture.json`, JSON.stringify(res, null, 2));
console.log(JSON.stringify(res, null, 1));
await browser.close();
