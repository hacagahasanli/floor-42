// S1: fresh profile, cold load -> home -> PLAY -> full 1P match -> result -> REMATCH -> Esc pause -> settings -> resume -> menu.
import { launch, open, sdk, shot, ftStats, ftTake, fightUntilResult, save, visibleText } from './lib.mjs';
const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720);
const tag = `s1-${W}`;
const browser = await launch();
const { ctx, page, frame, log } = await open(browser, { w: W, h: H });
const f = frame();
const out = { tag, marks: {} };
const mark = async (k) => (out.marks[k] = await f.evaluate(() => Math.round(performance.now())));
await f.waitForSelector('[data-testid="home"]', { timeout: 30000 });
await mark('homeVisible');
await page.waitForTimeout(1500);
await shot(page, `${tag}-01-home`);
out.homeText = (await visibleText(f)).slice(0, 1500);
out.audioBeforeClick = await f.evaluate(() => window.__audio.slice());
await f.click('[data-testid="play"]', { force: true });
await mark('playClick');
out.focusAfterPlay = await f.evaluate(() => ({ has: document.hasFocus(), el: document.activeElement?.tagName }));
await f.waitForFunction(() => (window.__sdk || []).some((x) => x[0] === 'gameplayStart'), null, { timeout: 30000 });
await mark('gameplayStart');
await page.waitForTimeout(800);
await shot(page, `${tag}-02-fight-start`);
await ftTake(f);
// Fight
const dur = await fightUntilResult(page, f);
out.match1Ms = dur;
out.ftFight1 = ftStats(await ftTake(f));
await mark('result1');
await page.waitForTimeout(3500);
await shot(page, `${tag}-03-result`);
out.resultText = (await visibleText(f)).slice(0, 1200);
out.heap1 = await f.evaluate(() => performance.memory && Math.round(performance.memory.usedJSHeapSize / 1e6));
// Rematch by clicking
await f.click('[data-testid="rematch"]', { force: true });
await mark('rematchClick');
const nStart = (await sdk(f)).filter((x) => x[0] === 'gameplayStart').length;
await f.waitForFunction((n) => (window.__sdk || []).filter((x) => x[0] === 'gameplayStart').length > n, nStart, { timeout: 30000 });
await mark('rematchStart');
await page.waitForTimeout(2500);
// Pause with Esc
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
await shot(page, `${tag}-04-pause`);
out.pauseText = (await visibleText(f)).slice(0, 800);
// Open settings from pause: find a button with SETTINGS text
const settingsBtn = f.getByRole('button', { name: /settings/i }).first();
if (await settingsBtn.count()) {
  await settingsBtn.click({ force: true });
  await page.waitForTimeout(800);
  await shot(page, `${tag}-05-settings`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}
await shot(page, `${tag}-06-after-settings`);
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
await shot(page, `${tag}-07-resumed`);
// Play match 2 to the result too
const dur2 = await fightUntilResult(page, f);
out.match2Ms = dur2;
out.ftFight2 = ftStats(await ftTake(f));
await page.waitForTimeout(3000);
out.heap2 = await f.evaluate(() => performance.memory && Math.round(performance.memory.usedJSHeapSize / 1e6));
// Back to menu with Esc
await page.keyboard.press('Escape');
await page.waitForTimeout(1500);
await shot(page, `${tag}-08-menu-after`);
out.backHome = await f.locator('[data-testid="home"]').count();
// Blur: click host input, check no SDK calls
const before = (await sdk(f)).length;
await page.click('#hostinput');
await page.keyboard.press('Space');
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(800);
out.blurSdkCalls = (await sdk(f)).length - before;
out.hostScrollY = await page.evaluate(() => scrollY);
out.sdk = await sdk(f);
out.audio = await f.evaluate(() => window.__audio);
out.tier = await f.evaluate(() => { const c = document.querySelector('canvas'); return c && { w: c.width, cw: c.clientWidth, dpr: devicePixelRatio }; });
out.log = log;
save(tag, out);
console.log(JSON.stringify({ marks: out.marks, match1Ms: dur, match2Ms: dur2, ft1: out.ftFight1, ft2: out.ftFight2, heap: [out.heap1, out.heap2], sdk: out.sdk, blur: out.blurSdkCalls, scroll: out.hostScrollY, backHome: out.backHome, errors: log.pageerrors, console: log.console.slice(0, 20), failed: log.failed, ext: [...new Set(log.req.map((r) => new URL(r.url).origin))] }, null, 1));
await ctx.close();
await browser.close();
