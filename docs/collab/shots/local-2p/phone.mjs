// Touch-only device (phone landscape): 2 PLAYER needs two pads (F-012). With two emulated pads: pad hints on the
// select, pads ready both players, the match runs on pads, and unplugging one pauses with "Pad disconnected".
// node phone.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import fs from 'fs';

const [base, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const run = async (pads) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.addInitScript(() => {
    try {
      if (!localStorage.getItem('floor42:settings')) localStorage.setItem('floor42:settings', JSON.stringify({ audience: 'regular' }));
    } catch {}
  });
  await page.addInitScript((n) => {
    const mk = (i) => ({ index: i, id: `Emulated pad ${i + 1} (standard)`, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
    window.__pads = Array.from({ length: n }, (_, i) => mk(i));
    navigator.getGamepads = () => [...window.__pads, null, null, null, null].slice(0, 4);
  }, pads);
  const press = async (pad, btn, ms = 120) => {
    await page.evaluate(([p, b]) => (window.__pads[p].buttons[b] = { pressed: true, touched: true, value: 1 }), [pad, btn]);
    await page.waitForTimeout(ms);
    await page.evaluate(([p, b]) => (window.__pads[p].buttons[b] = { pressed: false, touched: false, value: 0 }), [pad, btn]);
    await page.waitForTimeout(80);
  };
  await page.goto(`${base}/`);
  await page.waitForSelector('nav[aria-label="Main menu"]');
  await page.waitForTimeout(2500);
  const items = await page.$$eval('nav[aria-label="Main menu"] [data-nav]', (els) => els.map((e) => e.textContent.trim()));
  console.log(`touch + ${pads} pad(s) menu:`, JSON.stringify(items));
  const tag = `p844x390-${pads}pad`;
  await page.screenshot({ path: `${out}/${tag}-01-menu.png` });
  if (pads === 2) {
    await page.getByRole('button', { name: /2 PLAYER/ }).click();
    await page.waitForSelector('[data-testid="select-2p"]');
    await page.waitForTimeout(500);
    console.log('pad hints:', await page.textContent('[data-testid="pad-hint-p1"]'), '|', await page.textContent('[data-testid="pad-hint-p2"]'));
    await press(0, 15); // P1 right
    await press(0, 0); // P1 A ready
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/${tag}-02-select-p1-ready.png` });
    await press(1, 0); // P2 A ready
    await page.waitForURL(/arena/, { timeout: 15000 });
    await page.waitForSelector('[data-testid="key-card"]', { timeout: 30000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${tag}-03-keycard-pads.png` });
    await press(0, 2);
    await press(1, 7);
    await page.waitForSelector('[data-testid="key-card"]', { state: 'detached' });
    await page.waitForFunction(() => window.__mc?.state().phase === 'fight', null, { timeout: 15000 });
    const x0 = await page.evaluate(() => window.__mc.state().fighters.map((f) => f.x));
    await page.evaluate(() => {
      window.__pads[0].axes = [1, 0, 0, 0];
      window.__pads[1].axes = [-1, 0, 0, 0];
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.__pads[0].axes = [0, 0, 0, 0];
      window.__pads[1].axes = [0, 0, 0, 0];
    });
    const x1 = await page.evaluate(() => window.__mc.state().fighters.map((f) => f.x));
    console.log('pads move: P1 start x', x0[0].toFixed(2), '(left of P2:', x0[0] < x0[1], ') dx P1', (x1[0] - x0[0]).toFixed(2), 'dx P2', (x1[1] - x0[1]).toFixed(2));
    await page.screenshot({ path: `${out}/${tag}-04-match.png` });
    await page.evaluate(() => window.__pads.pop());
    await page.waitForSelector('[data-testid="paused-by"]', { timeout: 3000 });
    console.log('after unplugging pad 2:', await page.textContent('[data-testid="paused-by"]'), 'paused:', await page.evaluate(() => window.__mc.state().paused));
    await page.screenshot({ path: `${out}/${tag}-05-pad-disconnected.png` });
  }
  await ctx.close();
};
await run(0);
await run(1);
await run(2);
await browser.close();
