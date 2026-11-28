// 2P local: fresh profile, click 2 PLAYER, ready both sides (F and ;), both players mash (P1 A/D/W/F, P2 arrows/;),
// match to the result, rematch. Video of the first ~70 s, screenshots at fixed steps.
// Usage: GAME=http://127.0.0.1:8741 node twop.mjs old 1280 720
import fs from 'node:fs';
const { launch, open, ftStats, ftTake } = await import('../../../release-qa/2026-11-28-crazygames-evidence/scripts/lib.mjs');
const [build, W, H] = [process.argv[2], +process.argv[3], +process.argv[4]];
const tag = `${build}-2p-${W}`;
const ROOT = new URL('..', import.meta.url).pathname;
const VID = ROOT + 'video/tmp-' + tag + '/';
fs.mkdirSync(VID, { recursive: true });
const browser = await launch();
const { ctx, page, frame, log, t0 } = await open(browser, { w: W, h: H, mode: 'top', ctxOpts: { recordVideo: { dir: VID, size: { width: W, height: H } } } });
const f = frame();
const T = () => +((Date.now() - t0) / 1000).toFixed(2);
const ev = [];
const mark = (e, x) => { ev.push({ t: T(), e, ...(x || {}) }); console.log(T(), e, x ? JSON.stringify(x) : ''); };
const shot = (n) => page.screenshot({ path: `${ROOT}shots/${tag}-${n}.png` });
const sdkCount = (n) => f.evaluate((n) => (window.__sdk || []).filter((x) => x[0] === n).length, n).catch(() => 0);
const scores = () => f.evaluate(() => [...document.querySelectorAll('[data-testid="score-digit"]')].map((e) => e.textContent.trim()).join('-')).catch(() => '');
const resultUp = () => f.evaluate(() => !!document.querySelector('[data-testid="result-screen"]') || [...document.querySelectorAll('button')].some((b) => b.offsetParent && /rematch|play again/i.test(b.innerText))).catch(() => false);
const clickText = (re) => f.evaluate((src) => { const b = [...document.querySelectorAll('button')].find((b) => b.offsetParent && new RegExp(src, 'i').test(b.innerText.trim())); if (b) b.click(); return !!b; }, re.source);
const text = async () => (await f.evaluate(() => document.body.innerText)).slice(0, 900);
const out = { tag };
await f.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.offsetParent && /2 player/i.test(b.innerText)), null, { timeout: 30000 });
await page.waitForTimeout(1500);
await clickText(/^2 PLAYER/);
mark('click-2p');
await page.waitForTimeout(1500);
await shot('01-select');
out.selectText = await text();
// Ready attempts: the keys a newcomer would try, in order.
for (const k of ['KeyF', 'Semicolon']) { await page.keyboard.press(k); await page.waitForTimeout(400); }
await shot('02-after-ready-keys');
let started = await f.waitForFunction(() => (window.__sdk || []).some((x) => x[0] === 'gameplayStart'), null, { timeout: 8000 }).then(() => true, () => false);
if (!started) {
  out.readyFallback = [];
  for (const k of ['Enter', 'Space', 'KeyW', 'ArrowUp']) {
    await page.keyboard.press(k); out.readyFallback.push(k); await page.waitForTimeout(800);
    if (await sdkCount('gameplayStart')) { started = true; break; }
  }
  if (!started) { await clickText(/fight|start|ready|play/); out.readyFallback.push('click'); }
  await f.waitForFunction(() => (window.__sdk || []).some((x) => x[0] === 'gameplayStart'), null, { timeout: 15000 }).catch(() => {});
}
mark('gameplayStart', { readyFallback: out.readyFallback || null });
await page.waitForTimeout(1200);
await shot('03-fight');
out.hudText = await text();
await ftTake(f);
const fight = async (label) => {
  const start = Date.now();
  let d1 = 'KeyD', d2 = 'ArrowLeft', i = 0, last = '';
  const tl = [];
  await page.keyboard.down(d1); await page.keyboard.down(d2);
  while (Date.now() - start < 300000) {
    if (i % 4 === 0) {
      if (await resultUp()) break;
      const s = await scores();
      if (s && s !== last) { tl.push([T(), s]); last = s; }
    }
    if (i === 60) await shot(label + '-mid');
    await page.keyboard.press('KeyF');
    await page.keyboard.press('Semicolon');
    if (i % 3 === 0) await page.keyboard.press('KeyW');
    if (i % 4 === 1) await page.keyboard.press('ArrowUp');
    if (i % 8 === 0) { await page.keyboard.up(d1); d1 = d1 === 'KeyD' ? 'KeyA' : 'KeyD'; await page.keyboard.down(d1); }
    if (i % 7 === 0) { await page.keyboard.up(d2); d2 = d2 === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft'; await page.keyboard.down(d2); }
    i++;
    await page.waitForTimeout(140);
  }
  await page.keyboard.up(d1); await page.keyboard.up(d2);
  mark(label + ':end', { ms: Date.now() - start, final: last, tl });
};
await fight('m1');
out.ft = ftStats(await ftTake(f));
await page.waitForTimeout(3000);
await shot('04-result');
out.resultText = await text();
const n = await sdkCount('gameplayStart');
await page.keyboard.press('Enter');
mark('rematch-enter');
out.rematch = await f.waitForFunction((n) => (window.__sdk || []).filter((x) => x[0] === 'gameplayStart').length > n, n, { timeout: 15000 }).then(() => true, () => false);
if (!out.rematch) { await shot('05-rematch-wait'); out.rematchWaitText = await text(); for (const k of ['KeyF', 'Semicolon']) { await page.keyboard.press(k); await page.waitForTimeout(400); } out.rematch2 = await f.waitForFunction((n) => (window.__sdk || []).filter((x) => x[0] === 'gameplayStart').length > n, n, { timeout: 10000 }).then(() => true, () => false); }
mark('rematch-started', { ok: out.rematch || out.rematch2 });
await page.waitForTimeout(1500);
await shot('06-rematch');
out.ev = ev;
out.errors = log.pageerrors.map((e) => e.msg);
const video = page.video();
await ctx.close();
fs.renameSync(await video.path(), ROOT + 'video/' + tag + '-session.webm');
fs.rmSync(VID, { recursive: true, force: true });
fs.writeFileSync(ROOT + 'json/' + tag + '.json', JSON.stringify(out, null, 2));
await browser.close();
console.log(JSON.stringify({ ev, ft: out.ft, errors: out.errors, readyFallback: out.readyFallback }, null, 1));
