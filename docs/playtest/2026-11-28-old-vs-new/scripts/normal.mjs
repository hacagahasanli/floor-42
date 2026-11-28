// Normal-bot fairness: returning player (finished-match flag set, so the menu's default 'normal' bot is used), same mashing
// player as session.mjs, N matches back to back via REMATCH. Records score timeline and match length.
// Usage: GAME=http://127.0.0.1:8741 node normal.mjs old 3
import fs from 'node:fs';
const { launch, open } = await import('../../../release-qa/2026-11-28-crazygames-evidence/scripts/lib.mjs');
const [build, N] = [process.argv[2], +(process.argv[3] || 2)];
const ROOT = new URL('..', import.meta.url).pathname;
const browser = await launch();
const { ctx, page, frame, log, t0 } = await open(browser, { w: 1280, h: 720, mode: 'top' });
await ctx.addInitScript(() => localStorage.setItem('floor-42:finished-match', '1'));
await page.reload();
const f = page.mainFrame();
const T = () => +((Date.now() - t0) / 1000).toFixed(2);
const sdkCount = (n) => f.evaluate((n) => (window.__sdk || []).filter((x) => x[0] === n).length, n).catch(() => 0);
const scores = () => f.evaluate(() => [...document.querySelectorAll('[data-testid="score-digit"]')].map((e) => e.textContent.trim()).join('-')).catch(() => '');
const resultUp = () => f.evaluate(() => !!document.querySelector('[data-testid="result-screen"]') || [...document.querySelectorAll('button')].some((b) => b.offsetParent && /rematch|play again/i.test(b.innerText))).catch(() => false);
const clickText = (re) => f.evaluate((src) => { const b = [...document.querySelectorAll('button')].find((b) => b.offsetParent && new RegExp(src, 'i').test(b.innerText.trim())); if (b) b.click(); return !!b; }, re.source);
await f.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.offsetParent && /play/i.test(b.innerText)), null, { timeout: 30000 });
await page.waitForTimeout(1500);
await clickText(/^PLAY/);
const matches = [];
for (let m = 0; m < N; m++) {
  const n0 = m === 0 ? 0 : await sdkCount('gameplayStart');
  while ((await sdkCount('gameplayStart')) <= n0) await page.waitForTimeout(100);
  const start = Date.now();
  const hud = (await f.evaluate(() => document.body.innerText)).match(/BOT\s*·\s*\w+/i)?.[0];
  let dir = 'KeyD', i = 0, last = '';
  const tl = [];
  await page.keyboard.down(dir);
  while (Date.now() - start < 300000) {
    if (i % 4 === 0) {
      if (await resultUp()) break;
      const s = await scores();
      if (s && s !== last) { tl.push([+((Date.now() - start) / 1000).toFixed(1), s]); last = s; }
    }
    await page.keyboard.press('Space');
    if (i % 3 === 0) await page.keyboard.press('KeyW');
    if (i % 8 === 0) { await page.keyboard.up(dir); dir = dir === 'KeyD' ? 'KeyA' : 'KeyD'; await page.keyboard.down(dir); }
    i++;
    await page.waitForTimeout(140);
  }
  await page.keyboard.up(dir);
  const ms = Date.now() - start;
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${ROOT}shots/${build}-normal-result${m + 1}.png` });
  const res = (await f.evaluate(() => document.body.innerText)).match(/[A-Z]+ WINS|DRAW|TIME/i)?.[0] || (await f.evaluate(() => document.body.innerText)).slice(0, 120);
  matches.push({ m: m + 1, bot: hud, ms, final: last, result: res, tl });
  console.log(JSON.stringify(matches.at(-1)));
  if (m < N - 1) { (await clickText(/rematch|play again/)) || (await page.keyboard.press('Enter')); }
}
fs.writeFileSync(`${ROOT}json/${build}-normal.json`, JSON.stringify({ matches, errors: log.pageerrors.map((e) => e.msg) }, null, 2));
await ctx.close();
await browser.close();
