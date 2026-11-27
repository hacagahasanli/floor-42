// R-013 TODAY T5-T7 shots. Usage: node shots.mjs <base> <outdir>. Needs a dev server (window.__mc handle).
import { chromium } from '/Users/hacaghahasanli/Desktop/projects/games-studio/playable-lcs/node_modules/playwright-core/index.mjs';
const [base, out] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

const run = async (w, h, audience = 'regular', tag = '') => {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await p.addInitScript((aud) => {
    if (!localStorage.getItem('floor42:settings')) localStorage.setItem('floor42:settings', JSON.stringify({ audience: aud }));
  }, audience);
  const st = (fn, arg) => p.evaluate(fn, arg);
  const shot = async (name) => { await p.screenshot({ path: `${out}/${w}x${h}${tag}-${name}.png` }); console.log('shot', w, h, name); };
  const open = async (q) => {
    await p.goto(`${base}/arena?${q}`);
    await p.waitForFunction(() => window.__mc && window.__mc.state().phase, null, { timeout: 90000 });
    await p.waitForTimeout(2500);
  };

  // --- 1P first match: READY, FIGHT!, key strip, KO stamp, KNOCKOUT band, loss result
  await open('p1=hotfix&p2=legacy&bot=normal');
  await st(() => { const s = window.__mc.state(); s.phase = 'countdown'; s.phaseTime = 1.5; });
  await p.waitForTimeout(450);
  await shot('1-ready-stamp');
  await st(() => { window.__mc.state().phaseTime = 0.5; });
  await p.waitForTimeout(350);
  await shot('2-fight-stamp');
  await p.waitForTimeout(1500);
  await shot('3-key-strip-fight');
  await p.keyboard.down('KeyD'); await p.waitForTimeout(150); await p.keyboard.up('KeyD');
  await p.keyboard.down('Space'); await p.waitForTimeout(100);
  await shot('3b-key-strip-pressed');
  await p.keyboard.up('Space');
  // Normal KO: bot at 1 hp right in front of the player, then shoot.
  const kill = async (kos) => {
    for (let i = 0; i < 40; i++) {
      await st((k) => {
        const s = window.__mc.state(); const a = s.fighters[0], c = s.fighters[1];
        a.kos = k; c.hp = 1; c.x = a.x + 2.5; c.y = a.y; c.vx = 0; c.vy = 0; a.hp = 100;
      }, kos);
      await p.keyboard.down('Space'); await p.waitForTimeout(120); await p.keyboard.up('Space');
      if (await p.locator(kos === 4 ? '[data-testid="knockout-band"]' : '[data-testid="ko-stamp"]').count()) return true;
    }
    return false;
  };
  console.log('normal KO reached', await kill(0));
  await p.waitForTimeout(260);
  await shot('4-ko-stamp');
  await p.waitForTimeout(1500);
  // Final KO.
  await st(() => { const s = window.__mc.state(); const a = s.fighters[0], c = s.fighters[1]; c.respawn = 0; c.hp = 100; });
  console.log('final KO reached', await kill(4));
  await p.waitForSelector('[data-testid="knockout-band"] [data-stamp="xl"]', { timeout: 20000 }).catch(() => console.log('no xl stamp in band'));
  await p.waitForTimeout(250);
  await shot('5-knockout-band');
  await p.waitForSelector('[data-testid="knockout-band"]', { state: 'detached', timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1400);
  await shot('6-result-after-final-ko');
  await ctx.close();

  // --- forced results: win, loss, demo
  const forced = async (q, winner, name) => {
    const c2 = await b.newContext({ viewport: { width: w, height: h } });
    const p2 = await c2.newPage();
    await p2.addInitScript((aud) => localStorage.setItem('floor42:settings', JSON.stringify({ audience: aud })), audience);
    await p2.goto(`${base}/arena?${q}`);
    await p2.waitForFunction(() => window.__mc && window.__mc.state().phase, null, { timeout: 90000 });
    await p2.waitForTimeout(2000);
    await p2.evaluate((win) => {
      const s = window.__mc.state();
      s.fighters[0].kos = win === 0 ? 5 : 2; s.fighters[1].kos = win === 1 ? 5 : 2;
      s.fighters[0].stats.damage = 640; s.fighters[1].stats.damage = 410; s.fighters[0].stats.accuracy = 47; s.fighters[1].stats.accuracy = 31;
      s.phase = 'over'; s.winner = win; s.endReason = 'kos'; s.hitstop = 0;
    }, winner);
    await p2.waitForSelector('text=Rematch', { timeout: 20000 }).catch(() => console.log('no rematch btn'));
    await p2.waitForTimeout(250);
    await p2.screenshot({ path: `${out}/${w}x${h}${tag}-${name}-mid.png` });
    await p2.waitForTimeout(1400);
    await p2.screenshot({ path: `${out}/${w}x${h}${tag}-${name}.png` });
    console.log('shot', w, h, name);
    await c2.close();
  };
  await forced('p1=hotfix&p2=legacy&bot=normal', 0, '7-result-win');
  await forced('p1=hotfix&p2=legacy&bot=normal', 1, '8-result-loss');
  await forced('p1=legacy&p2=standup&bot=hard&demo', 1, '9-result-demo');
};

await run(1280, 720);
await run(1920, 1080);
await run(1280, 720, 'developer', '-dev');
await b.close();
