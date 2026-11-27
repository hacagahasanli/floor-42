// Drives the local 2-player flow in headless Chromium and saves screenshots.
// node shots.mjs <baseUrl> <outDir> <width> <height> [--azerty]
import { chromium } from 'playwright';
import fs from 'fs';

const [base, out, w, h] = process.argv.slice(2);
const azerty = process.argv.includes('--azerty');
const W = Number(w);
const H = Number(h);
const tag = `d${W}x${H}${azerty ? '-azerty' : ''}`;
fs.mkdirSync(out, { recursive: true });
const log = (...a) => console.log(`[${tag}]`, ...a);

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
page.on('pageerror', (e) => log('PAGE ERROR', e.message));
await page.addInitScript(() => {
  try {
    // Skip the first-entry audience question, keep defaults otherwise.
    if (!localStorage.getItem('floor42:settings')) localStorage.setItem('floor42:settings', JSON.stringify({ audience: 'regular' }));
  } catch {}
});
if (azerty) {
  await page.addInitScript(() => {
    const map = new Map(Object.entries({ KeyQ: 'a', KeyW: 'z', KeyA: 'q', KeyS: 's', KeyD: 'd', KeyF: 'f', KeyG: 'g', KeyH: 'h', KeyK: 'k', KeyL: 'l', Semicolon: 'm', KeyM: ',' }));
    Object.defineProperty(navigator, 'keyboard', { value: { getLayoutMap: () => Promise.resolve(map) } });
  });
}
const shot = async (name) => {
  const file = `${out}/${tag}-${name}.png`;
  await page.screenshot({ path: file });
  log('shot', file);
};
const wait = (ms) => page.waitForTimeout(ms);
const st = () => page.evaluate(() => {
  const s = window.__mc?.state();
  return s && { phase: s.phase, winner: s.winner, f: s.fighters.map((f) => ({ x: +f.x.toFixed(2), y: +f.y.toFixed(2), shots: f.stats.shots, kos: f.kos, vx: +f.vx.toFixed(2) })) };
});

await page.goto(`${base}/`);
await page.waitForSelector('nav[aria-label="Main menu"]');
await wait(2500);
await shot('01-menu');
const items = await page.$$eval('nav[aria-label="Main menu"] [data-nav]', (els) => els.map((e) => e.textContent.trim().split(/\s{2,}|(?<=[A-Z])(?=[A-Z][a-z])/)[0]));
log('menu items', JSON.stringify(items));

// Cold start to fighting, by keyboard only: ↓ to 2 PLAYER, Enter, both lock, both start.
const t0 = Date.now();
await page.keyboard.press('ArrowDown');
await wait(200);
await shot('02-menu-2p-focused');
await page.keyboard.press('Enter');
await page.waitForSelector('[data-testid="select-2p"]');
await wait(600);
await shot('03-select-unlocked');
await page.keyboard.press('KeyF');
await wait(250);
await shot('04-select-p1-ready');
// Mirror: P2 moves onto P1's fighter (both on card 0), then P1 still ready.
await page.keyboard.press('ArrowLeft');
await wait(250);
await shot('05-select-mirror');
await page.keyboard.press('ArrowRight');
await wait(150);
await page.keyboard.press('Semicolon');
await wait(200);
await shot('06-select-both-ready');
await page.waitForURL(/arena/, { timeout: 15000 });
await page.waitForSelector('[data-testid="key-card"]', { timeout: 30000 });
await wait(1200);
// Key tester: one key per player held.
await page.keyboard.down('KeyA');
await page.keyboard.down('ArrowRight');
await wait(250);
await shot('07-keycard-lit');
await page.keyboard.up('KeyA');
await page.keyboard.up('ArrowRight');
await page.keyboard.press('KeyF');
await wait(150);
await shot('08-keycard-p1-ready');
await page.keyboard.press('Semicolon');
await page.waitForSelector('[data-testid="key-card"]', { state: 'detached' });
await page.waitForFunction(() => window.__mc?.state().phase === 'fight', null, { timeout: 15000 });
log('cold start to fight (s, incl. headless lift and countdown):', ((Date.now() - t0) / 1000).toFixed(1));

{
  const s0 = await st();
  log('start sides: P1 x', s0.f[0].x, 'P2 x', s0.f[1].x, 'P1 left:', s0.f[0].x < s0.f[1].x);
  await wait(400);
  log('floor pill opacity in fight:', await page.$eval('[data-testid="floor-pill"]', (e) => getComputedStyle(e).opacity));
}
// Both players at once: P1 holds D (right), P2 holds ← (left). Both must move in the same ticks.
const before = await st();
await page.keyboard.down('KeyD');
await page.keyboard.down('ArrowLeft');
await wait(500);
const mid = await st();
await page.keyboard.up('KeyD');
await page.keyboard.up('ArrowLeft');
log('move: before', JSON.stringify(before.f), 'after', JSON.stringify(mid.f));
const moved = [mid.f[0].x - before.f[0].x, mid.f[1].x - before.f[1].x];
log('dx P1 (D, expect > 0):', moved[0].toFixed(2), ' dx P2 (←, expect < 0):', moved[1].toFixed(2));
// Both shoot at once (and jump): F + ; + W + ↑ held together.
await page.keyboard.down('KeyF');
await page.keyboard.down('Semicolon');
await page.keyboard.down('KeyW');
await page.keyboard.down('ArrowUp');
await wait(120);
await shot('09-match-both-firing');
await wait(500);
const fired = await st();
for (const k of ['KeyF', 'Semicolon', 'KeyW', 'ArrowUp']) await page.keyboard.up(k);
log('shots P1, P2 after both held Shoot:', fired.f[0].shots, fired.f[1].shots, ' y', fired.f[0].y, fired.f[1].y);
const scrolled = await page.evaluate(() => [window.scrollX, window.scrollY, document.scrollingElement.scrollTop]);
log('page scroll after arrows/space:', JSON.stringify(scrolled));
// Dash both
await page.keyboard.down('KeyH');
await page.keyboard.down('KeyK');
await wait(60);
const dashed = await page.evaluate(() => window.__mc.state().fighters.map((f) => +f.dashCooldown.toFixed(2)));
await page.keyboard.up('KeyH');
await page.keyboard.up('KeyK');
log('dash cooldowns after H + K:', JSON.stringify(dashed));
await wait(1200);
await shot('10-match-hud');

// Pause by Esc, Controls (key card view), back, resume.
await page.keyboard.press('Escape');
await wait(400);
log('floor pill opacity in pause:', await page.$eval('[data-testid="floor-pill"]', (e) => getComputedStyle(e).opacity));
await shot('11-pause');
await page.getByRole('button', { name: 'CONTROLS' }).click();
await wait(300);
await shot('12-pause-controls');
await page.keyboard.press('Escape');
await wait(200);
await page.keyboard.press('Escape');
await wait(300);

// Results: end the match as a P1 win, then rematch by both pressing Shoot, P2 win, rematch, P1 win -> tally 2 - 1.
const finish = (who) =>
  page.evaluate((who) => {
    const s = window.__mc.state();
    s.fighters[who].kos = s.kosToWin;
    s.phase = 'over';
    s.winner = who;
    s.endReason = 'kos';
  }, who);
await finish(0);
await page.waitForSelector('[data-testid="tally"]');
await wait(1200);
await shot('13-results-first');
const bw = () => page.$eval('[data-testid="rematch-ticks"]', (e) => e.closest('button').getBoundingClientRect().width);
const w0 = await bw();
await page.keyboard.press('KeyF');
await wait(150);
log('rematch button width idle / one tick:', w0, await bw());
await shot('14-results-rematch-p1-tick');
await page.keyboard.press('Semicolon');
await page.waitForFunction(() => window.__mc.state().phase === 'countdown', null, { timeout: 5000 });
log('rematch started by both Shoot presses');
await page.waitForFunction(() => window.__mc.state().phase === 'fight', null, { timeout: 10000 });
await finish(1);
await wait(800);
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__mc.state().phase === 'countdown', null, { timeout: 5000 });
await page.waitForFunction(() => window.__mc.state().phase === 'fight', null, { timeout: 10000 });
await finish(0);
await page.waitForSelector('[data-testid="tally"]');
await wait(1400);
await shot('15-results-tally');
log('tally text:', await page.textContent('[data-testid="tally"]'));

// Main menu -> Settings -> Controls -> 2 Player, then Credits from Settings and from the footer.
await page.getByRole('button', { name: 'Main menu' }).click();
await page.waitForSelector('nav[aria-label="Main menu"]');
await wait(1500);
await page.getByRole('button', { name: /SETTINGS/ }).first().click();
await wait(400);
await page.getByRole('radio', { name: '2 Player' }).click();
await wait(300);
await shot('16-settings-2p');
// Rebind check: P1 Dash -> K swaps with P2 Dash.
await page.getByRole('button', { name: /^P1 Dash/ }).click();
await page.keyboard.press('KeyK');
await wait(200);
await shot('17-settings-2p-swap');
await page.getByRole('button', { name: 'Reset 2 player keys' }).click();
await page.getByRole('tab', { name: 'Accessibility' }).click();
await wait(300);
await page.getByTestId('settings-credits').scrollIntoViewIfNeeded();
await shot('18-settings-credits-row');
await page.getByTestId('settings-credits').click();
await wait(500);
await shot('19-settings-credits-open');
await page.keyboard.press('Escape');
await wait(200);
await page.keyboard.press('Escape');
await wait(400);
await page.getByTestId('credits-link').focus();
await wait(200);
await shot('20-footer-credits-link');
await page.getByTestId('credits-link').click();
await wait(500);
await shot('21-footer-credits-open');
await page.keyboard.press('Escape');
await wait(300);
await page.getByRole('button', { name: /HOW TO PLAY/ }).click();
await wait(500);
await page.getByTestId('howto-2p').scrollIntoViewIfNeeded();
await shot('22-howto-2p');
await browser.close();
