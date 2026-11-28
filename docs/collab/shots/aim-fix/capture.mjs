// aim-fix before/after frames: real GPU Chromium (ANGLE Metal), dev server (window.__mc handle).
// Usage: node capture.mjs <base-url> <tag>   e.g. node capture.mjs http://localhost:3417 after
// Stages each scene through window.__mc.state(): both fighters pinned every 5 ms, the player (P1, ZUZU) holds Space
// (and C to crouch) with auto-aim on; the bot (P2) is pinned on the floor below / on the boardwalk above.
import { createRequire } from 'node:module';

const require = createRequire(process.env.HOME + '/.npm/_npx/e41f203b7505f1fb/package.json');
const { chromium } = require('playwright-core');
const OUT = new URL('.', import.meta.url).pathname;
const [base, tag] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});

const scenes = [
  // Report 2: crouched on the boardwalk, shooting the rival under it. Before: rounds start below the planks and hit.
  { id: 'a-crouched-on-boardwalk-pistol', gun: 'pistol', me: { x: -7.6, y: 4 }, foe: { x: -7.2, y: 0 }, crouch: true },
  // Report 1: standing on the boardwalk, rival under it. Before: auto-aim points straight ahead.
  { id: 'b-standing-on-boardwalk-smg', gun: 'smg', me: { x: -7.6, y: 4 }, foe: { x: -7.2, y: 0 }, crouch: false },
  // Report 2: sniper rail from the floor up through the boardwalk. Before: it pierces the planks and hits.
  { id: 'c-rail-from-below', gun: 'railgun', me: { x: -7.2, y: 0 }, foe: { x: -7.6, y: 4 }, crouch: false },
];

for (const sc of scenes) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(`[${sc.id}] PAGE ERROR`, e.message));
  await p.addInitScript(() => {
    localStorage.setItem('floor42:settings', JSON.stringify({ quality: 'high', arena: 'offsite', aimMode: 'auto', showKeyHints: false }));
    localStorage.setItem('floor-42:finished-match', '1');
  });
  await p.goto(`${base}/#/arena?p1=standup&p2=legacy&bot=easy`);
  await p.waitForFunction(() => window.__mc && window.__mc.state().phase, null, { timeout: 120000 });
  await p.waitForTimeout(300); // stage during the countdown, before the bot can land a shot
  await p.evaluate((sc) => {
    const s = window.__mc.state();
    s.phase = 'fight';
    s.phaseTime = 99;
    s.dropTimer = 1e9;
    s.pickups.forEach((q) => { q.active = false; q.respawn = 1e9; });
    const [a, b] = s.fighters;
    a.weapon = { kind: sc.gun, mag: 99, reserve: Infinity, cooldown: 0, reload: 0 };
    a.weapon.mag = 99;
    a.stats.hits = 0;
    a.stats.shots = 0;
    window.__pin = setInterval(() => {
      const st = window.__mc.state();
      const [f, g] = st.fighters;
      Object.assign(f, { x: sc.me.x, y: sc.me.y, vx: 0, vy: 0, onGround: true, invulnerable: 0 });
      Object.assign(g, { x: sc.foe.x, y: sc.foe.y, vx: 0, vy: 0, onGround: true, respawn: 0 });
      g.hp = Math.max(g.hp, 60); // never KO'd: the frame keeps both fighters in place
      g.weapon.cooldown = 99; // the pinned bot does not shoot back
      g.bombs = 0;
    }, 5);
  }, sc);
  if (sc.crouch) await p.keyboard.down('KeyC');
  await p.keyboard.down('Space');
  await p.waitForTimeout(1600);
  const info = await p.evaluate(() => {
    const s = window.__mc.state();
    const f = s.fighters[0];
    return { aimDeg: Math.round((f.aim * 180) / Math.PI), crouch: f.crouch, shots: f.stats.shots, hitsOnRival: f.stats.hits, rivalHp: Math.round(s.fighters[1].hp), weapon: f.weapon.kind };
  });
  await p.screenshot({ path: `${OUT}${tag}-${sc.id}.png` });
  console.log(tag, sc.id, JSON.stringify(info));
  await ctx.close();
}
await browser.close();
