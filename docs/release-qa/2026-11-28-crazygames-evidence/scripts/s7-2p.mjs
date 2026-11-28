import { launch, open, sdk, shot, save } from './lib.mjs';
const browser = await launch();
const res = { obs: [] };
const { ctx, page, frame, log } = await open(browser, { w: 1280, h: 720 });
const f = frame();
await f.waitForSelector('[data-testid="home"]');
await page.waitForTimeout(1000);
await f.click('[data-testid="open-2p"]', { force: true });
await page.waitForTimeout(1000);
await page.keyboard.press('KeyF'); await page.waitForTimeout(200); await page.keyboard.press('Semicolon');
await page.waitForTimeout(4000);
await page.keyboard.press('KeyF'); await page.waitForTimeout(200); await page.keyboard.press('Semicolon');
await f.waitForFunction(() => (window.__sdk || []).some((x) => x[0] === 'gameplayStart'), null, { timeout: 20000 });
const stopped = () => f.evaluate(() => (window.__sdk || []).some((x) => x[0] === 'gameplayStop'));
let dir = 'KeyD', i = 0; await page.keyboard.down(dir);
const t0 = Date.now();
while (!(await stopped()) && Date.now() - t0 < 240000) {
  await page.keyboard.press('KeyF');
  if (i % 3 === 0) await page.keyboard.press('KeyW');
  if (i % 8 === 0) { await page.keyboard.up(dir); dir = dir === 'KeyD' ? 'KeyA' : 'KeyD'; await page.keyboard.down(dir); }
  if (i % 3 === 1) await page.keyboard.press('Semicolon');
  i++; await page.waitForTimeout(120);
}
await page.keyboard.up(dir);
res.matchMs = Date.now() - t0;
for (let k = 0; k < 8; k++) {
  res.obs.push({ ms: k * 500, result: await f.locator('[data-testid="result-screen"]').count(), text: (await f.evaluate(() => document.body.innerText)).replace(/\n/g, ' ').slice(0, 120) });
  if (k === 6) await shot(page, 's7-2p-result');
  await page.waitForTimeout(500);
}
// Press both shoot keys once (what mashers do)
const n = (await sdk(f)).filter((x) => x[0] === 'gameplayStart').length;
await page.keyboard.press('KeyF'); await page.waitForTimeout(150); await page.keyboard.press('Semicolon');
await page.waitForTimeout(1500);
res.afterShootKeys = { result: await f.locator('[data-testid="result-screen"]').count(), text: (await f.evaluate(() => document.body.innerText)).replace(/\n/g, ' ').slice(0, 200) };
await shot(page, 's7-2p-after-shoot');
res.rematchByShoot = await f.waitForFunction((n) => (window.__sdk || []).filter((x) => x[0] === 'gameplayStart').length > n, n, { timeout: 6000 }).then(() => true, () => false);
res.sdk = await sdk(f); res.errors = log.pageerrors.map((e) => e.msg);
save('s7', res);
console.log(JSON.stringify(res, null, 1));
await browser.close();
