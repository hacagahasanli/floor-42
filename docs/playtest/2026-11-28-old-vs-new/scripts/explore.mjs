// Explore: cold load of each build (fresh profile, top-level page, CrazyGames SDK stubbed), dump home text/buttons + screenshot.
// Usage: node explore.mjs   (OLD on 127.0.0.1:8741, NEW on 127.0.0.1:8751)
import fs from 'node:fs';
const { launch, chromium } = await import('../../../release-qa/2026-11-28-crazygames-evidence/scripts/lib.mjs');
const OUT = new URL('../shots/', import.meta.url).pathname;
const builds = { old: 'http://127.0.0.1:8741', new: 'http://127.0.0.1:8751' };
const browser = await launch();
const res = {};
for (const [k, url] of Object.entries(builds)) {
  for (const [w, h] of [[1280, 720], [907, 510]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.route('https://sdk.crazygames.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.CrazyGames={SDK:{environment:"crazygames",init:()=>Promise.resolve(),game:{loadingStart(){},loadingStop(){},gameplayStart(){console.log("[SDK] gameplayStart")},gameplayStop(){console.log("[SDK] gameplayStop")},happytime(){},settings:{muteAudio:false},addSettingsChangeListener(){},removeSettingsChangeListener(){}},ad:{requestAd(){},hasAdblock:async()=>false},user:{isUserAccountAvailable:false}}};' }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    const t0 = Date.now();
    await page.goto(url + '/index.html');
    // time until a visible button appears
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.offsetParent), null, { timeout: 30000 });
    const tBtn = Date.now() - t0;
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}${k}-home-${w}.png` });
    const info = await page.evaluate(() => ({
      text: document.body.innerText.slice(0, 2000),
      buttons: [...document.querySelectorAll('button,a')].filter((b) => b.offsetParent).map((b) => {
        const r = b.getBoundingClientRect();
        return { t: (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40), id: b.dataset.testid || '', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      }),
      hash: location.hash,
    }));
    res[`${k}-${w}`] = { tBtn, ...info, errs };
    await ctx.close();
  }
}
fs.writeFileSync(new URL('../json/explore.json', import.meta.url).pathname, JSON.stringify(res, null, 2));
console.log(JSON.stringify(res, null, 1));
await browser.close();
