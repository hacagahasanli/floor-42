// S2: CrazyGames QA sizes (home + fight), live resize during a fight, phone landscape with touch.
import { launch, open, sdk, shot, save } from './lib.mjs';
const browser = await launch();
const sizes = [[907, 510], [1216, 684], [1077, 606], [821, 462], [1366, 768], [1920, 1080], [1536, 864], [800, 450], [1080, 607]];
const res = {};
// Text smaller than this many CSS px at the given size is noted.
const smallText = (f) =>
  f.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      // effective size includes CSS transforms of the Stage
      let scale = 1, p = el;
      const fs = parseFloat(cs.fontSize);
      const eff = fs * (r.height / (el.offsetHeight || r.height));
      const off = r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight || r.right > innerWidth + 1 || r.bottom > innerHeight + 1;
      if (eff < 10 || off) out.push({ t: el.textContent.trim().slice(0, 30), px: +eff.toFixed(1), off });
    }
    return out.slice(0, 15);
  });
for (const [w, h] of sizes) {
  const { ctx, page, frame, log } = await open(browser, { w, h, mode: 'top' });
  const f = frame();
  await f.waitForSelector('[data-testid="home"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot(page, `s2-${w}x${h}-home`);
  const homeSmall = await smallText(f);
  await f.click('[data-testid="play"]', { force: true });
  await f.waitForFunction(() => (window.__sdk || []).some((x) => x[0] === 'gameplayStart'), null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await shot(page, `s2-${w}x${h}-fight`);
  const fightSmall = await smallText(f);
  res[`${w}x${h}`] = { homeSmall, fightSmall, errors: log.pageerrors, console: log.console };
  await ctx.close();
}
// Live resize during a fight, iframe-free top level, 1280x720 -> 16:9 sizes and an odd ratio.
{
  const { ctx, page, frame, log } = await open(browser, { w: 1280, h: 720, mode: 'top' });
  const f = frame();
  await f.waitForSelector('[data-testid="home"]', { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.waitForTimeout(500);
  const errAfterHomeResize = log.pageerrors.length;
  await f.click('[data-testid="play"]', { force: true });
  await f.waitForFunction(() => (window.__sdk || []).some((x) => x[0] === 'gameplayStart'), null, { timeout: 30000 });
  const seq = [[1920, 1080], [1600, 900], [960, 540], [1440, 600], [1000, 1000], [1280, 720]];
  for (const [w, h] of seq) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(900);
    await shot(page, `s2-resize-${w}x${h}`);
  }
  const canvas = await f.evaluate(() => { const c = document.querySelector('canvas'); return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight }; });
  res.resize = { errAfterHomeResize, errors: log.pageerrors, canvas };
  await ctx.close();
}
// Phone landscape (touch, DPR 3, iPhone-like UA) and phone portrait.
for (const [w, h, name] of [[844, 390, 'phone-land'], [390, 844, 'phone-port']]) {
  const { ctx, page, frame, log } = await open(browser, {
    w, h, mode: 'top',
    ctxOpts: { isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
  });
  const f = frame();
  await page.waitForTimeout(3500);
  await shot(page, `s2-${name}-home`);
  const home = await f.locator('[data-testid="play"]').count();
  if (home) {
    await f.locator('[data-testid="play"]').tap({ force: true });
    await page.waitForTimeout(5000);
    await shot(page, `s2-${name}-fight`);
  }
  res[name] = { home, errors: log.pageerrors, console: log.console, sdk: await sdk(f), text: (await f.evaluate(() => document.body.innerText)).slice(0, 400) };
  await ctx.close();
}
save('s2', res);
console.log(JSON.stringify(res, null, 1).slice(0, 9000));
await browser.close();
