// R-030 item 3: the real build (portal-build dev server), 1P fight at the three small CrazyGames sizes, key strip up.
// Measures the strip and the AIM/SHAKE pills as built (row) and with the CD's stacked layout injected (column,
// right-aligned, 6 px gap), and saves a frame of each. Needs GAME=http://localhost:3281 and the QA lib.
import { launch, open } from '../../../release-qa/2026-11-28-crazygames-evidence/scripts/lib.mjs';
const OUT = new URL('.', import.meta.url).pathname;
const browser = await launch();
const res = {};
for (const [w, h] of [[907, 510], [821, 462], [800, 450], [1280, 720]]) {
  const { ctx, page, frame } = await open(browser, { w, h, mode: 'top' });
  const f = frame();
  await f.waitForSelector('[data-testid="home"]', { timeout: 30000 });
  await page.waitForTimeout(800);
  await f.click('[data-testid="play"]', { force: true });
  await f.waitForFunction(() => (window.__sdk || []).some((x) => x[0] === 'gameplayStart'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const measure = () => f.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); };
    const c = document.querySelector('[data-testid="corner-pills"]');
    return { strip: r('[data-testid="key-strip"]:not([aria-hidden="true"])'), hint: r('[data-testid="hud-hint"]'), pills: r('[data-testid="corner-pills"]'),
      pillKids: c ? [...c.children].map((k) => { const b = k.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); }) : null,
      hidden: c?.dataset.hidden ?? null };
  });
  const built = await measure();
  await page.screenshot({ path: `${OUT}pills-${w}x${h}-built.png` });
  await f.addStyleTag({ content: '[data-testid="corner-pills"]{flex-direction:column!important;align-items:flex-end!important;gap:6px!important;visibility:visible!important}' });
  await page.waitForTimeout(100);
  const stacked = await measure();
  await page.screenshot({ path: `${OUT}pills-${w}x${h}-stacked.png` });
  const clash = (a, b, g = 6) => a && b && a[0] < b[2] + g && b[0] < a[2] + g && a[1] < b[3] + g && b[1] < a[3] + g;
  stacked.clashStrip = clash(stacked.pills, stacked.strip);
  stacked.gapToStrip = stacked.strip ? stacked.pills[0] - stacked.strip[2] : null;
  res[`${w}x${h}`] = { built, stacked };
  await ctx.close();
}
console.log(JSON.stringify(res, null, 1));
await browser.close();
