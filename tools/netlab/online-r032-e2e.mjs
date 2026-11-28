// R-032 implementation E2E (2026-11-28): real-GPU Chromium against a local game server (KOS_TO_WIN=1 for short human
// matches) and Next dev (NEXT_PUBLIC_ONLINE=1) on WEB. Scenarios and captures:
//   lone    lone player -> search frame -> "A BOT STEPS IN" (o08) -> doors YOU vs BOT · NORMAL -> match -> result BOT chip (o17)
//   down    server unreachable -> honest bot-offline frame (F-078), held 1600 ms, then the bot match
//   pair    two humans -> RIVAL FOUND! (o07) with the rival's fighter -> doors YOU vs RIVAL -> HUD ping pill -> result -> rematch
//   shaky   two humans in server mode, one with stalls -> SHAKY CONNECTION chip (no ms)
//   invite  room code (5 chars) -> friend types it in lower case in JOIN WITH A CODE -> match
//   standby A on the bot's result screen, B searches -> A sees A PLAYER IS FREE! (o18), REMATCH white, F takes it
// node tools/netlab/online-r032-e2e.mjs <outdir> [scenario,...]
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const WEB = process.env.WEB || 'http://localhost:3011';
const OUT = process.argv[2] || 'r032-e2e';
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const run = (s) => !ONLY || ONLY.includes(s);
fs.mkdirSync(OUT, { recursive: true });
const shim = fs.readFileSync(new URL('./netshim.js', import.meta.url), 'utf8');
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = {};
const mk = async (name, cfg = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  await p.addInitScript((c) => (window.__NETCFG = c), cfg);
  await p.addInitScript(shim);
  p.on('pageerror', (e) => log(`[${name} pageerror]`, String(e).slice(0, 200)));
  p.on('console', (m) => m.type() === 'error' && !/favicon|404|WebSocket|ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text()) && log(`[${name} console]`, m.text().slice(0, 160)));
  return p;
};
const shot = (p, f) => p.screenshot({ path: `${OUT}/${f}.png` });
const lobby = async (p, q = '') => {
  await p.goto(`${WEB}/play${q}`);
  await p.waitForSelector('[data-testid="quick"]', { timeout: 30000 });
  await p.waitForTimeout(600);
};
const state = (p) => p.evaluate(() => document.querySelector('[data-testid="online-lobby"]')?.getAttribute('data-state') ?? (window.__mc ? 'match' : 'none'));
const waitState = (p, s, ms = 20000) => p.waitForFunction((x) => document.querySelector('[data-testid="online-lobby"]')?.getAttribute('data-state') === x, s, { timeout: ms, polling: 50 });
const inMatch = (p, ms = 30000) => p.waitForFunction(() => !!window.__mc, null, { timeout: ms, polling: 100 });
const vsTags = (p) => p.evaluate(() => [...document.querySelectorAll('[data-testid^="vs-tag-"]')].map((e) => e.textContent));
const hudTags = (p) => p.evaluate(() => (document.body.innerText.match(/BOT · [A-Z]+|\bRIVAL\b|\bYOU\b/g) || []).slice(0, 6));
const waitPhase = (p, ph, ms) => p.waitForFunction((x) => window.__mc?.state().phase === x, ph, { timeout: ms, polling: 200 });
const text = (p) => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400));

if (run('lone')) {
  log('--- lone -> browser bot');
  const p = await mk('lone');
  await lobby(p);
  const t0 = Date.now();
  await p.getByTestId('quick').click({ force: true });
  await waitState(p, 'search', 15000);
  await p.waitForTimeout(1500);
  await shot(p, 'e2e-lone-1-search');
  const searchLine = await p.getByTestId('search-line').textContent();
  await waitState(p, 'bot', 15000);
  const botAt = Date.now() - t0;
  await p.waitForTimeout(250);
  await shot(p, 'e2e-lone-2-bot-steps-in');
  const botLine = await p.getByTestId('bot-line').textContent();
  const botChip = await p.getByTestId('bot-chip').textContent();
  // the frame is held >= 900 ms, then the doors
  await p.waitForSelector('[data-testid="vs-tag-r"]', { timeout: 5000 });
  const doorsAt = Date.now() - t0;
  const tags = await vsTags(p);
  await shot(p, 'e2e-lone-3-doors');
  await inMatch(p);
  await waitPhase(p, 'countdown', 10000).catch(() => {});
  await p.waitForTimeout(2500);
  const hud = await hudTags(p);
  const netPill = await p.evaluate(() => !!document.querySelector('[data-testid="net-pill"]'));
  await shot(p, 'e2e-lone-4-hud');
  await p.evaluate(() => (window.__mc.state().kosToWin = 1));
  await p.evaluate(() => window.__autopilot(7));
  await waitPhase(p, 'over', 120000);
  await p.waitForTimeout(3200);
  const botTag = await p.getByTestId('bot-tag').textContent().catch(() => null);
  await shot(p, 'e2e-lone-5-result-bot-chip');
  results.lone = { botAt, doorsAt, holdMs: doorsAt - botAt, searchLine, botLine, botChip, doorTags: tags, hud, netPillInBotMatch: netPill, resultBotTag: botTag };
  log('lone', JSON.stringify(results.lone));
  await p.context().close();
}

if (run('down')) {
  log('--- server down -> honest bot');
  const p = await mk('down');
  await lobby(p, '?server=ws://localhost:2599');
  const t0 = Date.now();
  await p.getByTestId('quick').click({ force: true });
  await waitState(p, 'bot', 20000);
  const at = Date.now() - t0;
  await p.waitForTimeout(250);
  await shot(p, 'e2e-down-1-bot-offline');
  const line = await p.getByTestId('bot-line').textContent();
  const offline = await p.getByTestId('bot-panel').getAttribute('data-offline');
  await p.waitForSelector('[data-testid="vs-tag-r"]', { timeout: 6000 });
  const held = Date.now() - t0 - at;
  const tags = await vsTags(p);
  await inMatch(p);
  results.down = { botFrameAfterMs: at, heldMs: held, line, offline, doorTags: tags };
  log('down', JSON.stringify(results.down));
  await p.context().close();
}

if (run('pair')) {
  log('--- two humans');
  const a = await mk('A');
  const b = await mk('B');
  await lobby(a);
  await lobby(b);
  await a.getByTestId('quick').click({ force: true });
  await a.waitForTimeout(1200);
  const t0 = Date.now();
  await b.getByTestId('quick').click({ force: true });
  await waitState(a, 'found', 15000);
  await a.waitForTimeout(150);
  await shot(a, 'e2e-pair-1-found');
  const foundText = await text(a);
  await a.waitForSelector('[data-testid="vs-tag-r"]', { timeout: 10000 });
  const tags = await vsTags(a);
  await shot(a, 'e2e-pair-2-doors');
  await Promise.all([inMatch(a), inMatch(b)]);
  const matchedMs = Date.now() - t0;
  await a.waitForTimeout(4500);
  const hud = [await hudTags(a), await hudTags(b)];
  const pill = await a.evaluate(() => document.querySelector('[data-testid="net-pill"]')?.textContent);
  const pillTitle = await a.evaluate(() => document.querySelector('[data-testid="net-pill"]')?.getAttribute('title'));
  await shot(a, 'e2e-pair-3-hud-pill');
  await a.evaluate(() => window.__autopilot(11));
  await b.evaluate(() => window.__autopilot(29));
  await Promise.all([waitPhase(a, 'over', 240000), waitPhase(b, 'over', 240000)]);
  await a.waitForTimeout(3200);
  const botTagOnHuman = await a.evaluate(() => !!document.querySelector('[data-testid="bot-tag"]'));
  await shot(a, 'e2e-pair-4-result');
  await a.getByTestId('rematch').click({ force: true });
  await b.waitForTimeout(800);
  await b.getByTestId('rematch').click({ force: true });
  const r0 = Date.now();
  await Promise.all([a, b].map((p) => p.waitForFunction(() => window.__mc?.state().phase !== 'over', null, { timeout: 15000 })));
  results.pair = { matchedMs, foundText: foundText.slice(0, 160), doorTags: tags, hud, pill, pillTitle, botTagOnHuman, rematchMs: Date.now() - r0 };
  log('pair', JSON.stringify(results.pair));
  await a.context().close();
  await b.context().close();
}

if (run('shaky')) {
  log('--- shaky connection chip (server mode, stalls)');
  const cfg = { ws: true, blockIce: true, rtt: 60, jitter: 10, seed: 5, stallEvery: [2500, 3500], stallMs: [500, 700] };
  const a = await mk('A', cfg);
  const b = await mk('B', { ws: true, blockIce: true, rtt: 40 });
  await lobby(a);
  await lobby(b);
  await a.getByTestId('quick').click({ force: true });
  await a.waitForTimeout(1200);
  await b.getByTestId('quick').click({ force: true });
  await Promise.all([inMatch(a, 40000), inMatch(b, 40000)]);
  let seen = null;
  for (let i = 0; i < 80 && !seen; i++) {
    await a.waitForTimeout(150);
    seen = await a.evaluate(() => document.querySelector('[data-testid="shaky-chip"]')?.textContent ?? null);
  }
  if (seen) await shot(a, 'e2e-shaky-chip');
  const pill = await a.evaluate(() => document.querySelector('[data-testid="net-pill"]')?.textContent);
  results.shaky = { chip: seen, pill, mode: await a.evaluate(() => window.__mc.net()?.mode) };
  log('shaky', JSON.stringify(results.shaky));
  await a.context().close();
  await b.context().close();
}

if (run('invite')) {
  log('--- invite by code, typed lower case');
  const h = await mk('host');
  await lobby(h);
  await h.getByTestId('invite').click({ force: true });
  await waitState(h, 'invite', 15000);
  const code = await h.getByTestId('room-code').textContent();
  await h.waitForTimeout(500);
  await shot(h, 'e2e-invite-1-room');
  const g = await mk('guest');
  await lobby(g);
  await g.getByTestId('join-code').click({ force: true });
  await g.getByTestId('code-input').fill(code.toLowerCase());
  await shot(g, 'e2e-invite-2-code-typed');
  const t0 = Date.now();
  await g.keyboard.press('Enter');
  await waitState(g, 'found', 15000);
  await shot(g, 'e2e-invite-3-found');
  await Promise.all([inMatch(h), inMatch(g)]);
  results.invite = { code, typed: code.toLowerCase(), joinMs: Date.now() - t0, hud: [await hudTags(h), await hudTags(g)] };
  log('invite', JSON.stringify(results.invite));
  await h.context().close();
  await g.context().close();
}

if (run('standby')) {
  log('--- standby offer');
  const a = await mk('A');
  await lobby(a);
  await a.getByTestId('quick').click({ force: true });
  await inMatch(a, 30000);
  await waitPhase(a, 'countdown', 15000).catch(() => {});
  await a.evaluate(() => (window.__mc.state().kosToWin = 1));
  await a.evaluate(() => window.__autopilot(5));
  await waitPhase(a, 'over', 120000);
  await a.waitForTimeout(3200);
  const b = await mk('B');
  await lobby(b);
  const t0 = Date.now();
  await b.getByTestId('quick').click({ force: true });
  await a.getByTestId('offer-card').waitFor({ timeout: 10000 });
  const offeredMs = Date.now() - t0;
  await a.waitForTimeout(600);
  await shot(a, 'e2e-standby-1-offer');
  const rematchTone = await a.getByTestId('rematch').getAttribute('class');
  const focused = await a.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  await a.keyboard.press('KeyF');
  await a.waitForTimeout(150);
  await shot(a, 'e2e-standby-2-connecting');
  const ok = await Promise.all([a, b].map((p) => p.waitForFunction(() => window.__mc && window.__mc.net(), null, { timeout: 20000 }).then(() => true, () => false)));
  results.standby = { offeredMs, rematchWhite: /fd-t-white/.test(rematchTone ?? ''), focusStaysOn: focused, bothInHumanMatch: ok, matchedMs: Date.now() - t0, hud: [await hudTags(a), await hudTags(b)] };
  log('standby', JSON.stringify(results.standby));
  await a.context().close();
  await b.context().close();
}

fs.writeFileSync(`${OUT}/results-${ONLY ? ONLY.join('-') : 'all'}.json`, JSON.stringify(results, null, 2));
await browser.close();
