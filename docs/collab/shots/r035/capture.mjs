// R-035 BEFORE captures (Creative Director). Portal dev server (needs window.__mc): npx vite --config vite.portal.config.ts --port 3361
// Usage: DEV=http://localhost:3361 node capture.mjs [guns|ko|first]
import fs from 'node:fs';
import { launch } from '../../../release-qa/2026-11-28-crazygames-evidence/scripts/lib.mjs';

const OUT = new URL('./before/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const DEV = process.env.DEV || 'http://localhost:3361';
const which = process.argv[2] || 'all';
const browser = await launch();
const log = {};

const newPage = async (w = 1280, h = 720) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route('https://sdk.crazygames.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.CrazyGames=undefined' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  return { ctx, page };
};
const fight = async (page, q = 'p1=hotfix&p2=standup&bot=easy&arena=offsite') => {
  await page.goto(`${DEV}/index.html#/arena?${q}`);
  await page.waitForFunction(() => window.__mc && window.__mc.state().phase === 'fight', null, { timeout: 90000 });
};
// Put both fighters on the floor 5 m apart, me (0) on the left facing right, bot frozen in place by re-setting each call.
const stage = (page, gun, gap = 5) =>
  page.evaluate(([gun, gap]) => {
    const s = window.__mc.state();
    const [a, b] = s.fighters;
    a.x = -gap / 2; a.y = 0; a.hp = 999; a.respawn = 0; a.vx = 0; a.vy = 0; a.facing = 1; a.aim = 0; a.invulnerable = 0;
    b.x = gap / 2; b.y = 0; b.vx = 0; b.vy = 0; b.facing = -1; b.hp = 999; b.invulnerable = 0;
    const G = { pistol: [8, Infinity], smg: [20, 40], uzi: [32, 32], shotgun: [4, 8], railgun: [3, 3], launcher: [2, 4], bomb: [1, 0] }[gun];
    a.weapon = { kind: gun, mag: G[0], reserve: G[1], cooldown: 0, reload: 0 };
  }, [gun, gap]);

if (which === 'all' || which === 'guns') {
  const { page, ctx } = await newPage();
  await fight(page);
  await page.waitForTimeout(1500);
  for (const gun of ['pistol', 'smg', 'uzi', 'shotgun', 'railgun', 'launcher']) {
    await stage(page, gun);
    await page.waitForTimeout(900);
    await stage(page, gun);
    await page.keyboard.down('Space');
    const t0 = Date.now();
    for (let i = 0; i < 10; i++) {
      await page.screenshot({ path: `${OUT}gun-${gun}-${String(i).padStart(2, '0')}.png` });
      log[`gun-${gun}-${i}`] = Date.now() - t0;
      await page.evaluate(() => { const [a, b] = window.__mc.state().fighters; a.hp = 999; a.x = -2.5; a.vx = 0; b.x = 2.5; b.y = 0; b.vx = 0; b.hp = 999; });
    }
    await page.keyboard.up('Space');
  }
  await ctx.close();
}

if (which === 'all' || which === 'ko') {
  const { page, ctx } = await newPage();
  await fight(page);
  await page.waitForTimeout(1500);
  await stage(page, 'pistol', 4);
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__mc.state().fighters[1].hp = 1; });
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__mc.state().fighters[1].respawn > 0, null, { timeout: 5000 });
  await page.keyboard.up('Space');
  const t0 = Date.now();
  for (let i = 0; i < 14; i++) {
    await page.screenshot({ path: `${OUT}ko-${String(i).padStart(2, '0')}.png` });
    log[`ko-${i}`] = Date.now() - t0;
    await page.waitForTimeout(60);
  }
  await ctx.close();
}

if (which === 'all' || which === 'first') {
  const { page, ctx } = await newPage();
  await page.goto(`${DEV}/index.html#/`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}first-home.png` });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__mc && window.__mc.state().phase === 'fight', null, { timeout: 90000 });
  for (const t of [300, 2000, 4500]) {
    await page.waitForTimeout(t === 300 ? 300 : t - (t === 2000 ? 300 : 2000));
    await page.screenshot({ path: `${OUT}first-fight-${t}ms.png` });
  }
  // Get KO'd once to see the respawn card.
  await page.evaluate(() => { const s = window.__mc.state(); s.fighters[0].hp = 1; s.fighters[0].invulnerable = 0; });
  await page.waitForFunction(() => window.__mc.state().fighters[0].respawn > 0, null, { timeout: 20000 }).catch(() => console.log('no ko on me'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}first-respawn-card.png` });
  await ctx.close();
}
fs.writeFileSync(`${OUT}log.json`, JSON.stringify(log, null, 1));
await browser.close();
