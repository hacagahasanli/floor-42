// S5: keyboard Enter from a cold click, 2P local full match + rematch, portal mute reflected in the UI.
import { launch, open, sdk, shot, save, fightUntilResult, ftStats, ftTake } from './lib.mjs';
const browser = await launch();
const res = {};
{
  const { ctx, page, frame } = await open(browser, { w: 1280, h: 720 });
  const f = frame();
  await f.waitForSelector('[data-testid="home"]');
  await page.waitForTimeout(1200);
  await page.mouse.click(700, 400);
  await page.keyboard.press('Enter');
  res.enterFromBody = await f.waitForFunction(() => (window.__sdk || []).some((x) => x[0] === 'gameplayStart'), null, { timeout: 12000 }).then(() => true, () => false);
  if (!res.enterFromBody) {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    res.arrowEnter = await f.waitForFunction(() => (window.__sdk || []).some((x) => x[0] === 'gameplayStart'), null, { timeout: 12000 }).then(() => true, () => false);
  }
  await ctx.close();
}
{
  const { ctx, page, frame, log } = await open(browser, { w: 1280, h: 720 });
  const f = frame();
  await f.waitForSelector('[data-testid="home"]');
  await page.waitForTimeout(1000);
  await f.click('[data-testid="open-2p"]', { force: true });
  await page.waitForTimeout(1200);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(300);
  await page.keyboard.press('Semicolon');
  await page.waitForTimeout(500);
  await shot(page, 's5-2p-ready');
  res.twoPStarted = await f.waitForFunction(() => (window.__sdk || []).some((x) => x[0] === 'gameplayStart'), null, { timeout: 20000 }).then(() => true, () => false);
  await page.waitForTimeout(1500);
  await shot(page, 's5-2p-fight');
  await ftTake(f);
  // P1 fights (A/D/W, F shoots); P2 jumps now and then with ArrowUp and shoots with ';'.
  const t = await fightUntilResult(page, f, { timeoutMs: 220000, keys: { l: 'KeyA', r: 'KeyD', up: 'KeyW', fire: 'KeyF' } });
  res.twoPMatchMs = t;
  res.twoPft = ftStats(await ftTake(f));
  await page.waitForTimeout(3500);
  await shot(page, 's5-2p-result');
  res.twoPResult = (await f.evaluate(() => document.body.innerText)).slice(0, 300);
  const n = (await sdk(f)).filter((x) => x[0] === 'gameplayStart').length;
  await page.keyboard.press('Enter');
  res.twoPRematch = await f.waitForFunction((n) => (window.__sdk || []).filter((x) => x[0] === 'gameplayStart').length > n, n, { timeout: 20000 }).then(() => true, () => false);
  await page.waitForTimeout(1500);
  await shot(page, 's5-2p-rematch');
  res.twoPsdk = await sdk(f);
  res.twoPerrors = log.pageerrors.map((e) => e.msg);
  res.twoPconsole = log.console;
  await ctx.close();
}
for (const muted of [true, false]) {
  const { ctx, page, frame } = await open(browser, { w: 1280, h: 720, muted });
  const f = frame();
  await f.waitForSelector('[data-testid="home"]');
  await page.waitForTimeout(1000);
  const btns = await f.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !b.textContent.trim()).map((b) => b.getAttribute('aria-label') + '|' + b.getAttribute('aria-pressed') + '|' + b.title));
  await shot(page, `s5-mute-${muted}`);
  res['muteButtons_' + muted] = btns;
  if (muted) {
    // Player presses the sound button: does it override the portal mute?
    const sb = f.locator('button[aria-label*="ound" i]').first();
    if (await sb.count()) { await sb.click({ force: true }); await page.waitForTimeout(300); res.afterPlayerToggle = await f.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !b.textContent.trim()).map((b) => b.getAttribute('aria-label') + '|' + b.getAttribute('aria-pressed'))); }
  }
  await ctx.close();
}
save('s5', res);
console.log(JSON.stringify(res, null, 1).slice(0, 6000));
await browser.close();
