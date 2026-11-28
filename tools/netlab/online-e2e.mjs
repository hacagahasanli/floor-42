// online-bots E2E (2026-11-28): real-GPU Chromium, local game server (KOS_TO_WIN=1) + Next dev with NEXT_PUBLIC_ONLINE=1 on :3011.
// node e2e.mjs <scenario: pair|bot|invite|all> [outdir]
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const REPO = process.env.HOME + '/Desktop/projects/games-studio/floor-42-online';
const WEB = process.env.WEB || 'http://localhost:3011';
const OUT = process.argv[3] || new URL('.', import.meta.url).pathname + 'out';
fs.mkdirSync(OUT, { recursive: true });
const shim = fs.readFileSync(REPO + '/tools/netlab/netshim.js', 'utf8');
const which = process.argv[2] || 'all';

const browser = await chromium.launch({
  executablePath:
    process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const results = {};
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

const mkPage = async (name, cfg = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.addInitScript((c) => (window.__NETCFG = c), cfg);
  await page.addInitScript(shim);
  page.on('pageerror', (e) => log(`[${name} pageerror]`, String(e).slice(0, 200)));
  page.on('console', (m) => m.type() === 'error' && !/favicon|404/.test(m.text()) && log(`[${name} console]`, m.text().slice(0, 160)));
  page.__name = name;
  return page;
};
const lobby = async (p, q = process.env.LOBBYQ || '') => {
  await p.goto(`${WEB}/play${q}`);
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: /^PLAYER/ }).click({ timeout: 800 }).catch(() => {});
};
const clickQuick = (p) => p.getByRole('button', { name: /Quick match/ }).first().click({ timeout: 8000 });
const inMatch = (p, ms = 30000) => p.waitForFunction(() => !!window.__mc && window.__mc.net(), null, { timeout: ms });
const hudText = (p) => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600));
const tags = (p) => p.evaluate(() => (document.body.innerText.match(/BOT · [A-Z]+|\bRIVAL\b|\bYOU\b/g) || []).slice(0, 6));
const net = (p) => p.evaluate(() => {
  const n = window.__mc?.net();
  return n && { mode: n.mode, ping: n.ping, unstable: n.unstable, snapGapMs: n.snapGapMs, inputDelayMs: n.inputDelayMs, delayMs: n.delayMs, underruns: n.underruns };
});
const phase = (p) => p.evaluate(() => window.__mc?.state().phase);
const autopilot = (p, seed) => p.evaluate((s) => window.__autopilot(s), seed);
const waitOver = (p, ms) => p.waitForFunction(() => window.__mc?.state().phase === 'over', null, { timeout: ms, polling: 250 });
const shot = (p, f) => p.screenshot({ path: `${OUT}/${f}.png` });
/** RTT samples from the HUD's net status over `secs`. */
const pings = async (p, secs) => {
  const out = [];
  for (let i = 0; i < secs; i++) {
    await p.waitForTimeout(1000);
    const n = await net(p);
    if (n) out.push(n);
  }
  return out;
};
const rematch = async (p) => {
  // REMATCH takes focus when the buttons arrive (2.2 s after the result is up); press it.
  await p.waitForTimeout(3000);
  const b = p.getByRole('button', { name: /REMATCH/i }).first();
  await b.click({ timeout: 5000, force: true });
};

if (which === 'bot' || which === 'all') {
  log('--- (b) lone human -> bot');
  const p = await mkPage('solo');
  await lobby(p);
  const t0 = Date.now();
  await clickQuick(p);
  await p.waitForTimeout(1200);
  const searching = await hudText(p);
  await shot(p, 'b1-searching');
  await inMatch(p, 20000);
  const waited = Date.now() - t0;
  await p.waitForTimeout(800);
  const t = await tags(p);
  await shot(p, 'b2-bot-match');
  log('bot match after', waited, 'ms; tags', t);
  await autopilot(p, 11);
  const ps = await pings(p, 5);
  const tOver0 = Date.now();
  await waitOver(p, 240000);
  log('match over after', Date.now() - tOver0, 'ms more');
  await p.waitForTimeout(3000);
  await shot(p, 'b3-result');
  const resultText = await hudText(p);
  const winner = await p.evaluate(() => window.__mc.state().winner);
  // Rematch against the bot: starts at once.
  const r0 = Date.now();
  await rematch(p);
  await p.waitForFunction(() => window.__mc?.state().phase === 'countdown' || window.__mc?.state().phase === 'fight', null, { timeout: 10000 });
  const rematchMs = Date.now() - r0;
  await p.waitForTimeout(800);
  await shot(p, 'b4-rematch');
  results.bot = { waitedMs: waited, searching: searching.slice(0, 220), tags: t, pings: ps, winner, resultText: resultText.slice(0, 300), rematchMs, tagsAfterRematch: await tags(p), arena: await p.evaluate(() => window.__mc.arenaId) };
  await p.context().close();
}

if (which === 'pair' || which === 'all') {
  log('--- (a) two humans quick match + (d) rematch');
  const a = await mkPage('A');
  const b = await mkPage('B');
  await lobby(a);
  await lobby(b);
  const t0 = Date.now();
  await clickQuick(a);
  await a.waitForTimeout(1500);
  await clickQuick(b);
  await Promise.all([inMatch(a), inMatch(b)]);
  const waited = Date.now() - t0;
  await a.waitForTimeout(800);
  const ta = await tags(a);
  const tb = await tags(b);
  await shot(a, 'a1-pair-A');
  await shot(b, 'a1-pair-B');
  const roomA = await a.evaluate(() => window.location.href);
  log('pair matched after', waited, 'ms; tags', ta, tb);
  await autopilot(a, 11);
  await autopilot(b, 29);
  const [pa, pb] = await Promise.all([pings(a, 6), pings(b, 6)]);
  await Promise.all([waitOver(a, 300000), waitOver(b, 300000)]);
  await a.waitForTimeout(3000);
  await shot(a, 'a2-result-A');
  await shot(b, 'a2-result-B');
  const winners = [await a.evaluate(() => window.__mc.state().winner), await b.evaluate(() => window.__mc.state().winner)];
  const r0 = Date.now();
  await rematch(a);
  await a.waitForTimeout(1500);
  const aWaiting = await phase(a);
  await shot(a, 'a3-A-asked-rematch');
  await rematch(b);
  await Promise.all(
    [a, b].map((p) => p.waitForFunction(() => window.__mc?.state().phase !== 'over', null, { timeout: 15000 })),
  );
  const rematchMs = Date.now() - r0;
  await a.waitForTimeout(800);
  await shot(a, 'a4-rematch-A');
  results.pair = { waitedMs: waited, tags: [ta, tb], pingsA: pa, pingsB: pb, winners, phaseWhileOnlyAAsked: aWaiting, rematchMs, tagsAfter: [await tags(a), await tags(b)], url: roomA };
  await a.context().close();
  await b.context().close();
}

if (which === 'invite' || which === 'all') {
  log('--- (c) invite link');
  const h = await mkPage('host');
  await lobby(h);
  await h.getByRole('button', { name: /Invite a friend/ }).first().click({ timeout: 8000 });
  const linkEl = h.getByLabel('Invite link', { exact: true });
  await linkEl.waitFor({ timeout: 10000 });
  let link = '';
  for (let i = 0; i < 20 && !/room=\w/.test(link); i++) {
    link = await linkEl.inputValue();
    await h.waitForTimeout(300);
  }
  await shot(h, 'c1-invite');
  // Past the quick-match bot delay: an invite room must still be waiting for the friend.
  await h.waitForTimeout(10000);
  const stillWaiting = !(await h.evaluate(() => !!window.__mc));
  const g = await mkPage('guest');
  const t0 = Date.now();
  await g.goto(link.replace(/^https?:\/\/[^/]+/, WEB));
  log('link', link);
  await Promise.all([inMatch(h), inMatch(g)]).catch(async (e) => {
    log('host:', await hudText(h));
    log('guest:', await hudText(g), g.url());
    await shot(h, 'c-fail-host');
    await shot(g, 'c-fail-guest');
    throw e;
  });
  const joinMs = Date.now() - t0;
  await g.waitForTimeout(800);
  await shot(g, 'c2-invite-guest');
  results.invite = { link, stillWaitingAfter10s: stillWaiting, joinMs, tags: [await tags(h), await tags(g)], net: [await net(h), await net(g)] };
  log('invite', results.invite);
  await h.context().close();
  await g.context().close();
}

fs.writeFileSync(`${OUT}/results-${which}.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2).slice(0, 4000));
await browser.close();
