// Smart bot visual check: real-GPU Chromium videos of a human-scripted keyboard player vs the bot (normal, hard) on
// both arenas, plus a per-second state log (positions, guns, HP, trait events) to read the contact sheets against.
// Same browser as docs/collab/shots/colour-balance/impl2/capture.mjs (Chromium 1255, ANGLE Metal).
// Needs the portal dev server: `npx vite --config vite.portal.config.ts --port 3471 --strictPort` (dev mode: the
// game exposes window.__mc for automated checks). Usage: node capture.mjs   (A=http://localhost:3471, ONLY=id,id)
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const OUT = new URL('.', import.meta.url).pathname;
const A = process.env.A || 'http://localhost:3471';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SECONDS = Number(process.env.SECONDS || 50);

const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});

// The human: TAVO on the keyboard with auto-aim (the default). Keeps 6-11 m, strafes, hops now and then, holds
// Space while the bot shows, walks onto guns, pushes when the bot is in reach, dashes away from rockets. Decides every
// 150 ms, like a person, with a fixed pseudo-random sequence so a rerun plays the same inputs.
const RUNS = [
  { id: 'offsite-normal', arena: 'offsite', level: 'normal', bot: 'hotfix' },
  { id: 'offsite-hard', arena: 'offsite', level: 'hard', bot: 'standup' },
  { id: 'office-normal', arena: 'office', level: 'normal', bot: 'legacy' },
  { id: 'office-hard', arena: 'office', level: 'hard', bot: 'hotfix' },
];

const KEYS = { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', fire: 'Space', dash: 'ShiftLeft', push: 'KeyQ', pickup: 'KeyF' };

for (const run of RUNS) {
  if (ONLY && !ONLY.includes(run.id)) continue;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT + 'video-tmp', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${run.id}] PAGE ERROR`, e.message));
  await page.addInitScript((arena) => {
    localStorage.setItem('floor42:settings', JSON.stringify({ quality: 'high', arena, showKeyHints: false }));
    localStorage.setItem('floor-42:finished-match', '1');
  }, run.arena);
  await page.goto(`${A}/#/arena?p1=intern&p2=${run.bot}&bot=${run.level}&arena=${run.arena}`);
  await page.waitForFunction(() => !!window.__mc, null, { timeout: 30000 });
  await page.mouse.click(640, 360);

  const held = new Set();
  const set = async (key, on) => {
    const code = KEYS[key];
    if (on && !held.has(code)) {
      held.add(code);
      await page.keyboard.down(code);
    } else if (!on && held.has(code)) {
      held.delete(code);
      await page.keyboard.up(code);
    }
  };
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const log = [];
  let strafe = 1;
  let strafeUntil = 0;
  const t0 = Date.now();
  let lastLog = -1;
  while (Date.now() - t0 < SECONDS * 1000) {
    const s = await page.evaluate(() => {
      const st = window.__mc.state();
      const f = (x) => ({ x: x.x, y: x.y, hp: x.hp, gun: x.weapon.kind, resp: x.respawn, kos: x.kos, ground: x.onGround, dashCd: x.dashCooldown });
      return { tick: st.tick, phase: st.phase, me: f(st.fighters[0]), bot: f(st.fighters[1]), ev: st.events.filter((e) => e.type === 'trait' || e.type === 'ko' || e.type === 'pickup' || e.type === 'dash' || e.type === 'push' || e.type === 'wallSplat').map((e) => `${e.type}${e.trait ? ':' + e.trait : ''}${e.gun ? ':' + e.gun : ''}@${e.fighter}`), rockets: st.projectiles.filter((p) => p.owner === 1 && (p.kind === 'grenade' || p.kind === 'bomb')).map((p) => [p.x, p.y]), pickups: st.pickups.filter((p) => p.active).map((p) => [p.kind, p.x, p.y]) };
    });
    const sec = Math.floor((Date.now() - t0) / 1000);
    if (sec !== lastLog || s.ev.length) {
      lastLog = sec;
      log.push(`${((Date.now() - t0) / 1000).toFixed(1)}s tick ${s.tick} ${s.phase} | me ${s.me.x.toFixed(1)},${s.me.y.toFixed(1)} ${s.me.gun} hp ${s.me.hp.toFixed(0)} kos ${s.me.kos} | bot ${s.bot.x.toFixed(1)},${s.bot.y.toFixed(1)} ${s.bot.gun} hp ${s.bot.hp.toFixed(0)} kos ${s.bot.kos}${s.bot.resp > 0 ? ' DOWN' : ''} | ${s.ev.join(' ')}`);
    }
    if (s.phase === 'over') break;
    const dx = s.bot.x - s.me.x;
    const dist = Math.abs(dx);
    const toBot = dx > 0 ? 'right' : 'left';
    const away = dx > 0 ? 'left' : 'right';
    let move = null;
    // A better gun close by: walk onto it.
    const gun = s.pickups.filter(([k, x, y]) => k !== 'bomb' && Math.abs(y - s.me.y) < 1.5 && Math.abs(x - s.me.x) < 6 && s.me.gun === 'pistol').sort((a, b) => Math.abs(a[1] - s.me.x) - Math.abs(b[1] - s.me.x))[0];
    if (gun) move = gun[1] < s.me.x ? 'left' : 'right';
    else if (s.bot.resp > 0) move = null;
    else if (dist > 11) move = toBot;
    else if (dist < 6) move = away;
    else {
      if (Date.now() > strafeUntil) {
        strafe = rnd() < 0.5 ? -1 : 1;
        strafeUntil = Date.now() + 500 + rnd() * 900;
      }
      move = strafe < 0 ? 'left' : 'right';
    }
    if (Math.abs(s.me.x) > 16.5) move = s.me.x > 0 ? 'left' : 'right';
    await set('left', move === 'left');
    await set('right', move === 'right');
    await set('fire', s.bot.resp <= 0);
    // Hop now and then, and after a rival who is higher up.
    const hop = rnd() < 0.12 || (s.bot.y > s.me.y + 2 && rnd() < 0.3);
    await set('up', hop);
    const rocket = s.rockets.some(([x, y]) => Math.hypot(x - s.me.x, y - s.me.y) < 5);
    await set('dash', rocket && s.me.dashCd <= 0);
    await set('push', dist < 2.4 && Math.abs(s.bot.y - s.me.y) < 1.2);
    await page.waitForTimeout(150);
  }
  for (const k of [...held]) await page.keyboard.up(k);
  await page.screenshot({ path: `${OUT}${run.id}-end.png` });
  const video = page.video();
  await ctx.close();
  const tmp = await video.path();
  fs.renameSync(tmp, `${OUT}${run.id}.webm`);
  fs.writeFileSync(`${OUT}${run.id}-log.txt`, log.join('\n') + '\n');
  console.log(`${run.id}: ${log.length} log lines, video ${run.id}.webm`);
}
await browser.close();
fs.rmSync(OUT + 'video-tmp', { recursive: true, force: true });
