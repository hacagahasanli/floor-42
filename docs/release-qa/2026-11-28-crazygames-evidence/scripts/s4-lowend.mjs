// S4: low-end emulation. CPU throttled (CDP), 4 cores / 4 GB reported, 1366x768 (common low-end laptop), quality Auto (fresh profile).
import { launch, open, sdk, shot, ftStats, ftTake, save } from './lib.mjs';
const rate = +(process.argv[2] || 4);
const browser = await launch();
const { ctx, page, frame, log } = await open(browser, { w: 1366, h: 768, mode: 'top' });
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
  Object.defineProperty(navigator, 'deviceMemory', { get: () => 4 });
});
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate });
const t0 = Date.now();
await page.reload();
const f = frame();
await f.waitForSelector('[data-testid="home"]', { timeout: 60000 });
const loadMs = Date.now() - t0;
await page.waitForTimeout(2000);
const homeFt = ftStats(await ftTake(f));
await f.click('[data-testid="play"]', { force: true });
const tPlay = Date.now();
await f.waitForFunction(() => (window.__sdk || []).some((x) => x[0] === 'gameplayStart'), null, { timeout: 60000 });
const playToStart = Date.now() - tPlay;
await ftTake(f);
const pr = () => f.evaluate(() => { const c = document.querySelector('canvas'); return +(c.width / c.clientWidth).toFixed(2); });
const windows = [];
let dir = 'KeyD';
await page.keyboard.down(dir);
for (let w = 0; w < 8; w++) {
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Space');
    if (i % 4 === 0) await page.keyboard.press('KeyW');
    if (i % 10 === 0) { await page.keyboard.up(dir); dir = dir === 'KeyD' ? 'KeyA' : 'KeyD'; await page.keyboard.down(dir); }
    await page.waitForTimeout(160);
  }
  windows.push({ w, ...ftStats(await ftTake(f)), pixelRatio: await pr() });
  if (await f.locator('[data-testid="result-screen"]').count()) break;
}
await page.keyboard.up(dir);
await shot(page, `s4-lowend-x${rate}`);
const out = { rate, loadMs, homeFt, playToStart, windows, sdk: await sdk(f), errors: log.pageerrors.map((e) => e.msg), console: log.console, heap: await f.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e6)) };
save(`s4-x${rate}`, out);
console.log(JSON.stringify(out, null, 1));
await browser.close();
