// usage: OUTDIR=<dir>/ GAME=http://localhost:3298 TAG=dev-1 [MATCHES=2] node run.mjs
// -> <OUTDIR><TAG>-m{1,2}.trace.json (CDP trace of each match) + <OUTDIR><TAG>.json (frame log, LoAF, longtasks)
import fs from 'node:fs';
const { launch, open, ftStats } = await import('./lib.mjs');
const TAG = process.env.TAG || 'run';
const OUT = process.env.OUTDIR;
const browser = await launch();
const { ctx, page, frame, log } = await open(browser, { w: 1280, h: 720, mode: 'top' });
const f = frame();
await page.evaluate(() => {
  window.__loaf = [];
  window.__lt = [];
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        window.__loaf.push({ start: e.startTime, dur: e.duration, block: e.blockingDuration, rs: e.renderStart, scripts: e.scripts.map((s) => ({ d: s.duration, inv: s.invoker, type: s.invokerType, src: s.sourceURL, fn: s.sourceFunctionName, pos: s.sourceCharPosition, fs: s.forcedStyleAndLayoutDuration, pause: s.pauseDuration })) });
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ start: e.startTime, dur: e.duration }); }).observe({ type: 'longtask', buffered: true });
  } catch (e) {}
  window.__fts = [];
  let last = 0;
  const loop = (t) => { if (last) window.__fts.push([Math.round(t * 10) / 10, Math.round((t - last) * 10) / 10]); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
const sdkCount = (n) => f.evaluate((n) => (window.__sdk || []).filter((x) => x[0] === n).length, n).catch(() => 0);
const sdkT = (n) => f.evaluate((n) => (window.__sdk || []).filter((x) => x[0] === n).map((x) => x[1]), n);
const resultUp = () => f.evaluate(() => !!document.querySelector('[data-testid="result-screen"]') || [...document.querySelectorAll('button')].some((b) => b.offsetParent && /rematch|play again/i.test(b.innerText))).catch(() => false);
const clickText = (re) => f.evaluate((src) => { const b = [...document.querySelectorAll('button')].find((b) => b.offsetParent && new RegExp(src, 'i').test(b.innerText.trim())); if (b) b.click(); return !!b; }, re.source);
const CATS = process.env.CATS || 'devtools.timeline,disabled-by-default-devtools.timeline,v8,v8.execute,blink.user_timing,disabled-by-default-v8.cpu_profiler,gpu,cc,loading,blink';
const fight = async (maxMs = 120000) => {
  const start = Date.now();
  let dir = 'KeyD';
  await page.keyboard.down(dir);
  let i = 0;
  while (Date.now() - start < maxMs) {
    if (i % 4 === 0 && (await resultUp())) break;
    await page.keyboard.press('Space');
    if (i % 3 === 0) await page.keyboard.press('KeyW');
    if (i % 8 === 0) { await page.keyboard.up(dir); dir = dir === 'KeyD' ? 'KeyA' : 'KeyD'; await page.keyboard.down(dir); }
    i++;
    await page.waitForTimeout(140);
  }
  await page.keyboard.up(dir);
};
const res = { tag: TAG, matches: [] };
await f.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.offsetParent && /play/i.test(b.innerText)), null, { timeout: 60000 });
await page.waitForTimeout(2500);
for (let m = 1; m <= (+process.env.MATCHES || 2); m++) {
  const n0 = await sdkCount('gameplayStart');
  if (!process.env.NOTRACE) await browser.startTracing(page, { categories: CATS.split(',') });
  const tStartNow = await f.evaluate(() => performance.now());
  if (m === 1) await clickText(/^PLAY/);
  else (await clickText(/rematch|play again/)) || (await page.keyboard.press('Enter'));
  const w0 = Date.now();
  while ((await sdkCount('gameplayStart')) <= n0 && Date.now() - w0 < 60000) await page.waitForTimeout(50);
  const gs = (await sdkT('gameplayStart')).pop();
  await page.waitForTimeout(300);
  await fight();
  const tEnd = await f.evaluate(() => performance.now());
  if (!process.env.NOTRACE) fs.writeFileSync(`${OUT}${TAG}-m${m}.trace.json`, await browser.stopTracing());
  const fts = await f.evaluate(() => window.__fts.splice(0));
  const loaf = await f.evaluate(() => window.__loaf.splice(0));
  const lt = await f.evaluate(() => window.__lt.splice(0));
  const ftsW = fts.filter(([t]) => t >= tStartNow && t <= tEnd);
  res.matches.push({ m, tStartNow, gameplayStart: gs, tEnd, frames: ftsW, loaf: loaf.filter((l) => l.start >= tStartNow), longtasks: lt.filter((l) => l.start >= tStartNow), stats: ftStats(ftsW.map((x) => x[1])) });
  console.log(TAG, 'm' + m, 'gameplayStart', gs, JSON.stringify(res.matches.at(-1).stats));
  await page.waitForTimeout(2500);
}
res.sdk = await f.evaluate(() => window.__sdk);
res.audio = await f.evaluate(() => window.__audio);
res.errors = log.pageerrors.map((e) => e.msg);
fs.writeFileSync(`${OUT}${TAG}.json`, JSON.stringify(res));
await ctx.close();
await browser.close();
