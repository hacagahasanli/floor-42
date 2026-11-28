// One "impatient newcomer" session, identical for OLD and NEW: fresh profile, cold load, read the menu ~2.5 s, click PLAY,
// mash-play match 1 (first match = easy bot in both builds), screenshots at fixed timestamps for the contact sheets,
// result, REMATCH (now the normal bot), pause + settings in match 2, match 2 to the result. Video of the whole session.
// Usage: GAME=http://127.0.0.1:8741 node session.mjs old 1280 720
import fs from 'node:fs';
const { launch, open, ftStats, ftTake } = await import('../../../release-qa/2026-11-28-crazygames-evidence/scripts/lib.mjs');
const [build, W, H] = [process.argv[2], +process.argv[3], +process.argv[4]];
const tag = `${build}-${W}`;
const ROOT = new URL('..', import.meta.url).pathname;
const SHOTS = ROOT + 'shots/';
const VID = ROOT + 'video/tmp-' + tag + '/';
fs.mkdirSync(VID, { recursive: true });
const browser = await launch();
const { ctx, page, frame, log, t0 } = await open(browser, { w: W, h: H, mode: 'top', ctxOpts: { recordVideo: { dir: VID, size: { width: W, height: H } } } });
const f = frame();
const T = () => +((Date.now() - t0) / 1000).toFixed(2);
const ev = [];
const mark = (e, extra) => { ev.push({ t: T(), e, ...(extra || {}) }); console.log(T(), e, extra ? JSON.stringify(extra) : ''); };
const SCHED = [1, 3, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60];
let si = 0;
const tick = async () => {
  while (si < SCHED.length && T() >= SCHED[si]) {
    await page.screenshot({ path: `${SHOTS}${tag}-t${String(SCHED[si]).padStart(2, '0')}.png` });
    si++;
  }
};
const sdkCount = (n) => f.evaluate((n) => (window.__sdk || []).filter((x) => x[0] === n).length, n).catch(() => 0);
const scores = () => f.evaluate(() => [...document.querySelectorAll('[data-testid="score-digit"]')].map((e) => e.textContent.trim()).join('-')).catch(() => '');
const resultUp = () =>
  f.evaluate(() => !!document.querySelector('[data-testid="result-screen"]') || [...document.querySelectorAll('button')].some((b) => b.offsetParent && /rematch|play again/i.test(b.innerText))).catch(() => false);
const clickText = async (re) => {
  const ok = await f.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const b = [...document.querySelectorAll('button')].find((b) => b.offsetParent && re.test(b.innerText.trim()));
    if (b) b.click();
    return !!b;
  }, re.source);
  return ok;
};

// Fight loop: same mashing player as release QA (A/D alternate, Space fire, W jump), plus timed screenshots and score watch.
const fight = async (label, { maxMs = 300000, until = null, onTick = null } = {}) => {
  const start = Date.now();
  let dir = 'KeyD';
  await page.keyboard.down(dir);
  let i = 0, last = '', firstChange = null;
  const timeline = [];
  while (Date.now() - start < maxMs) {
    await tick();
    if (until && until()) break;
    if (onTick) await onTick(Date.now() - start, dir);
    if (i % 4 === 0) {
      if (await resultUp()) break;
      const s = await scores();
      if (s && s !== last) { timeline.push({ t: T(), s }); if (last && !firstChange) firstChange = T(); last = s; }
    }
    await page.keyboard.press('Space');
    if (i % 3 === 0) await page.keyboard.press('KeyW');
    if (i % 8 === 0) { await page.keyboard.up(dir); dir = dir === 'KeyD' ? 'KeyA' : 'KeyD'; await page.keyboard.down(dir); }
    i++;
    await page.waitForTimeout(140);
  }
  await page.keyboard.up(dir);
  mark(label + ':end', { ms: Date.now() - start, scores: last, timeline });
  return { ms: Date.now() - start, timeline, last };
};

const out = { tag, build, W, H };
// 1. Load to a clickable menu.
await f.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.offsetParent && /play/i.test(b.innerText)), null, { timeout: 30000 });
mark('menu-clickable');
// 2. Newcomer reads for 2.5 s, screenshots tick meanwhile.
const readUntil = Date.now() + 2500;
while (Date.now() < readUntil) { await tick(); await page.waitForTimeout(100); }
out.menuText = (await f.evaluate(() => document.body.innerText)).slice(0, 800);
await clickText(/^PLAY/);
mark('click-play');
// 3. Wait for gameplayStart (whatever screens come in between), screenshots tick.
while (!(await sdkCount('gameplayStart'))) { await tick(); await page.waitForTimeout(100); if (T() > 60) break; }
mark('gameplayStart-1');
out.hudText = (await f.evaluate(() => document.body.innerText)).slice(0, 800);
await ftTake(f);
// 4. Match 1 (easy bot, first match).
out.m1 = await fight('match1');
out.ft1 = ftStats(await ftTake(f));
mark('result-1');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOTS}${tag}-result1.png` });
out.result1Text = (await f.evaluate(() => document.body.innerText)).slice(0, 800);
// Make sure the first-60 s shots exist even if match 1 was short.
while (si < SCHED.length && T() < 62) { await tick(); await page.waitForTimeout(200); }
// 5. Rematch (normal bot from now on).
const n1 = await sdkCount('gameplayStart');
const rem = (await clickText(/rematch|play again/)) || (await page.keyboard.press('Enter'), 'enter');
mark('click-rematch', { via: rem });
while ((await sdkCount('gameplayStart')) <= n1) { await page.waitForTimeout(100); }
mark('gameplayStart-2');
await page.waitForTimeout(1200);
// 6. Match 2 with a pause + settings visit at ~15 s.
let paused = false;
out.m2 = await fight('match2', {
  onTick: async (ms, dir) => {
    if (paused || ms < 15000) return;
    paused = true;
    await page.keyboard.up(dir);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}${tag}-pause.png` });
    out.pauseText = (await f.evaluate(() => document.body.innerText)).slice(0, 600);
    const s = await clickText(/settings/);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}${tag}-settings.png` });
    out.settingsOpened = s;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    if (s) { await page.screenshot({ path: `${SHOTS}${tag}-after-settings.png` }); await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
    out.resumedText = (await f.evaluate(() => document.body.innerText)).slice(0, 200);
    await page.keyboard.down(dir);
    mark('paused-and-resumed', { settings: s });
  },
});
out.ft2 = ftStats(await ftTake(f));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOTS}${tag}-result2.png` });
out.result2Text = (await f.evaluate(() => document.body.innerText)).slice(0, 800);
mark('done');
out.ev = ev;
out.sdk = await f.evaluate(() => window.__sdk || []);
out.errors = log.pageerrors.map((e) => e.msg);
out.console = log.console.filter((c) => !c.startsWith('log')).slice(0, 30);
const video = page.video();
await ctx.close();
const vp = await video.path();
fs.renameSync(vp, ROOT + 'video/' + tag + '-session.webm');
fs.rmSync(VID, { recursive: true, force: true });
fs.writeFileSync(ROOT + 'json/' + tag + '.json', JSON.stringify(out, null, 2));
await browser.close();
console.log(JSON.stringify({ ev, ft1: out.ft1, ft2: out.ft2, errors: out.errors }, null, 1));
