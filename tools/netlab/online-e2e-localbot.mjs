// online-bots E2E, browser-bot mode (2026-11-28): real-GPU Chromium against a local game server and Next dev
// (NEXT_PUBLIC_ONLINE=1) on :3011. Proves: (1) a lone player gets a zero-network bot match in <= 10 s, labelled
// BOT · NORMAL, plays a full match (first to 5) to the result, rematch; (2) standby: a human who arrives while the
// first player is on the bot's result screen is offered ("Fight them"), and accepting starts a human match.
// node tools/netlab/online-e2e-localbot.mjs <outdir>
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const WEB = process.env.WEB || 'http://localhost:3011';
const OUT = process.argv[2] || 'out-localbot';
fs.mkdirSync(OUT, { recursive: true });
const shim = fs.readFileSync(new URL('./netshim.js', import.meta.url), 'utf8');
const browser = await chromium.launch({
  executablePath:
    process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = {};
const mkPage = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => (window.__NETCFG = {}));
  await page.addInitScript(shim);
  page.on('pageerror', (e) => log(`[${name} pageerror]`, String(e).slice(0, 200)));
  page.on('console', (m) => m.type() === 'error' && !/favicon|404/.test(m.text()) && log(`[${name} console]`, m.text().slice(0, 160)));
  const ws = [];
  page.on('websocket', (w) => ws.push(w.url()));
  page.__ws = ws;
  return page;
};
const lobby = async (p) => {
  await p.goto(`${WEB}/play`);
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: /^PLAYER/ }).click({ timeout: 800 }).catch(() => {});
};
const quick = (p) => p.getByRole('button', { name: /Quick match/ }).first().click({ timeout: 8000 });
const tags = (p) => p.evaluate(() => (document.body.innerText.match(/BOT · [A-Z]+|\bRIVAL\b|\bYOU\b/g) || []).slice(0, 6));
const shot = (p, f) => p.screenshot({ path: `${OUT}/${f}.png` });
const phase = (p) => p.evaluate(() => window.__mc?.state().phase);
const waitPhase = (p, ph, ms) => p.waitForFunction((x) => window.__mc?.state().phase === x, ph, { timeout: ms, polling: 200 });

// (1) Lone player -> browser bot, full match, rematch.
{
  const p = await mkPage('solo');
  await lobby(p);
  const t0 = Date.now();
  await quick(p);
  await p.waitForFunction(() => !!window.__mc, null, { timeout: 20000 });
  const waited = Date.now() - t0;
  await waitPhase(p, 'countdown', 15000).catch(() => {});
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => ({ net: !!window.__mc.net(), arena: window.__mc.arenaId, traits: !!window.__mc.state().traits, kosToWin: window.__mc.state().kosToWin ?? null }));
  const t = await tags(p);
  await shot(p, 'l1-browser-bot');
  log('browser bot after', waited, 'ms', t, info, 'sockets', p.__ws);
  await p.evaluate((s) => window.__autopilot(s), 11);
  const f0 = Date.now();
  await waitPhase(p, 'over', 300000);
  const fightMs = Date.now() - f0;
  await p.waitForTimeout(3000);
  await shot(p, 'l2-result');
  const result = await p.evaluate(() => ({ winner: window.__mc.state().winner, kos: window.__mc.state().fighters.map((f) => f.kos), text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 120) }));
  await p.getByRole('button', { name: /REMATCH/i }).first().click({ timeout: 5000, force: true });
  const r0 = Date.now();
  await p.waitForFunction(() => window.__mc && window.__mc.state().phase !== 'over', null, { timeout: 20000 });
  const rematchMs = Date.now() - r0;
  await p.waitForTimeout(2500);
  await shot(p, 'l3-rematch');
  results.lone = { waitedMs: waited, tags: t, ...info, fightMs, result, rematchMs, tagsAfterRematch: await tags(p), sockets: p.__ws };
  log('lone', JSON.stringify(results.lone));
  await p.context().close();
}

// (2) Standby offer: A plays the browser bot to the result; B searches, lands in A's room; A is offered and accepts.
{
  const a = await mkPage('A');
  await lobby(a);
  await quick(a);
  await a.waitForFunction(() => !!window.__mc, null, { timeout: 20000 });
  // Test hook: a short bot match (first to 1) so the result screen comes quickly.
  await waitPhase(a, 'countdown', 15000).catch(() => {});
  await a.evaluate(() => (window.__mc.state().kosToWin = 1));
  await a.evaluate((s) => window.__autopilot(s), 5);
  await waitPhase(a, 'over', 120000);
  await a.waitForTimeout(3000);
  const b = await mkPage('B');
  await lobby(b);
  const t0 = Date.now();
  await quick(b);
  const offered = await a.getByTestId('fight-player').waitFor({ timeout: 10000 }).then(() => Date.now() - t0, () => null);
  await shot(a, 's1-offer');
  const bBefore = await b.evaluate(() => !!window.__mc);
  if (offered !== null) await a.getByTestId('fight-player').click({ force: true });
  const ok = await Promise.all(
    [a, b].map((p) => p.waitForFunction(() => window.__mc && window.__mc.net(), null, { timeout: 20000 }).then(() => true, () => false)),
  );
  const matchedMs = Date.now() - t0;
  await a.waitForTimeout(1200);
  await shot(a, 's2-human-A');
  await shot(b, 's2-human-B');
  results.standby = { offeredAfterMs: offered, bInMatchBeforeAccept: bBefore, bothInHumanMatch: ok, matchedMs, tags: [await tags(a), await tags(b)], modes: [await a.evaluate(() => window.__mc.net()?.mode), await b.evaluate(() => window.__mc.net()?.mode)] };
  log('standby', JSON.stringify(results.standby));
  await a.context().close();
  await b.context().close();
}

fs.writeFileSync(`${OUT}/results-localbot.json`, JSON.stringify(results, null, 2));
await browser.close();
